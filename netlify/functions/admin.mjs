import {db,body,actor,json,endpoint,fail,garageFor,appOrigin,withActorTransaction} from '../../server/runtime.mjs';
import {canManage,canManageUser,permittedAssignment,randomToken,hash,hashPassword} from '../../server/security.mjs';
import {roleKeys,roleNames} from '../../src/roles.js';
const uuid=v=>/^[a-f0-9-]{36}$/.test(v||'');
const clean=v=>String(v||'').trim();
const validIdentity=(email,employee)=>{if(email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254))fail('Enter a valid email.');if(employee&&!/^[a-zA-Z0-9._-]{1,40}$/.test(employee))fail('Use letters, numbers, dots, dashes or underscores for the employee ID.');if(!email&&!employee)fail('Enter an employee ID or email.');};
export default endpoint(async(req)=>{
 const u=await actor(req);if(!canManage(u))fail('Administrator access required.',403);const sql=(strings,...values)=>db()(strings,...values);
 const orgFor=async id=>{if(!uuid(id)||(u.role!=='platform_admin'&&id!==u.organisation_id))fail('Organisation unavailable.',403);const [o]=await sql`SELECT * FROM organisations WHERE id=${id} FOR SHARE`;if(!o)fail('Organisation unavailable.',403);return o;};
 if(req.method==='GET'){
  const users=await sql`SELECT id,email,employee_id,name,role,organisation_id,garage_id,active,bootstrap,demo,password_hash IS NOT NULL AS activated,created_at,last_login FROM users WHERE ${u.role==='platform_admin'} OR (organisation_id=${u.organisation_id} AND (${u.role==='organisation_admin'} OR (garage_id=${u.garage_id} AND role IN ('supervisor','mechanic')))) ORDER BY created_at DESC LIMIT 500`;
  const organisations=await sql`SELECT id,name,active,role_names,login_code FROM organisations WHERE ${u.role==='platform_admin'} OR id=${u.organisation_id} ORDER BY name`;
  const garages=await sql`SELECT g.*,coalesce(c.enabled,false) AS registration_enabled FROM garages g LEFT JOIN registration_codes c ON c.garage_id=g.id WHERE ${u.role==='platform_admin'} OR (g.organisation_id=${u.organisation_id} AND (${u.role==='organisation_admin'} OR g.id=${u.garage_id})) ORDER BY g.name`;
  return json({users,organisations,garages});
 }
 const b=await body(req);
 return withActorTransaction(u,async()=>{
 if(b.action==='organisation'){
  if(u.role!=='platform_admin')fail('Platform Admin access required.',403);const name=clean(b.name);if(!name||name.length>120)fail('Enter an organisation name.');
  const [r]=await sql`WITH created AS (INSERT INTO organisations(name) VALUES(${name}) RETURNING id) INSERT INTO audit_events(actor_id,action,target) SELECT ${u.id},'organisation_created',id::text FROM created RETURNING target`;return json({ok:true,id:r.target});
 }
 if(b.action==='organisation_status'){
  if(u.role!=='platform_admin')fail('Platform Admin access required.',403);const o=await orgFor(b.organisation_id);
  if(typeof b.active!=='boolean'||b.confirm!==o.name)fail('Confirm the organisation name.');
  await sql`WITH changed AS (UPDATE organisations SET active=${b.active} WHERE id=${o.id} RETURNING id), revoked AS (UPDATE users SET credential_version=credential_version+1 WHERE organisation_id IN (SELECT id FROM changed)) INSERT INTO audit_events(actor_id,action,target) SELECT ${u.id},${b.active?'organisation_restored':'organisation_archived'},id::text FROM changed`;
  return json({ok:true});
 }
 if(b.action==='role_names'){
  if(!['platform_admin','organisation_admin'].includes(u.role))fail('Organisation Admin access required.',403);const o=await orgFor(b.organisation_id),names={};
  for(const key of roleKeys){const label=clean(b.names?.[key]);if(!label||label.length>60)fail('Enter each role name (up to 60 characters).');names[key]=label;}
  if(new Set(Object.values(names).map(s=>s.toLowerCase())).size!==roleKeys.length)fail('Use a different name for each role.');
  await sql`WITH changed AS (UPDATE organisations SET role_names=${JSON.stringify(names)}::jsonb WHERE id=${o.id} RETURNING id) INSERT INTO audit_events(actor_id,action,target) SELECT ${u.id},'role_names_updated',id::text FROM changed`;return json({ok:true});
 }
 if(b.action==='garage'){
  if(!['platform_admin','organisation_admin'].includes(u.role))fail('Organisation Admin access required.',403);const o=await orgFor(b.organisation_id);if(!o.active)fail('Restore this organisation first.');
  const name=clean(b.name);if(!name||name.length>120)fail('Enter a garage name.');
  const [garage]=await sql`INSERT INTO garages(name,organisation_id) VALUES(${name},${o.id}) RETURNING id`;
  const [content]=await sql`SELECT data FROM organisation_content WHERE organisation_id=${o.id}`;
  const state={schema:1,vehicles:[],reports:[],faults:[],actions:[],inspections:[],modelSchedules:(content?.data?.modelSchedules||[]).map(s=>({...s,garage:garage.id,organisationId:o.id}))};
  await sql`INSERT INTO garage_records(garage_id,data) VALUES(${garage.id},${JSON.stringify(state)}::jsonb)`;
  await sql`INSERT INTO audit_events(actor_id,action,target) VALUES(${u.id},'garage_created',${garage.id})`;return json({ok:true});
 }
 if(b.action==='registration_code'){
  const g=await garageFor(u,b.garage_id);
  if(b.operation==='disable'){await sql`WITH changed AS (UPDATE registration_codes SET enabled=false WHERE garage_id=${g.id} RETURNING garage_id) INSERT INTO audit_events(actor_id,action,target) SELECT ${u.id},'registration_disabled',garage_id::text FROM changed`;return json({ok:true});}
  if(b.operation!=='rotate')fail('Choose a registration operation.');
  const code=randomToken().slice(0,16).toUpperCase();
  await sql`WITH changed AS (INSERT INTO registration_codes(garage_id,code_hash,created_by) VALUES(${g.id},${hash(code)},${u.id}) ON CONFLICT(garage_id) DO UPDATE SET code_hash=excluded.code_hash,enabled=true,created_by=excluded.created_by,created_at=now() RETURNING garage_id) INSERT INTO audit_events(actor_id,action,target) SELECT ${u.id},'registration_code_rotated',garage_id::text FROM changed`;
  return json({ok:true,code,garage:g.name});
 }
 if(b.action==='create_user'){
  const role=clean(b.role),email=clean(b.email).toLowerCase()||null,employee=clean(b.employee_id)||null,name=clean(b.name);
  if(!roleKeys.includes(role))fail('Choose a role.');
  const org=role==='platform_admin'?null:b.organisation_id,garage=['garage_manager','supervisor','mechanic'].includes(role)?b.garage_id:null;
  if(!permittedAssignment(u,role,org,garage))fail('You cannot grant this access.',403);
  validIdentity(email,employee);if(!name||name.length>120||(!org&&!email))fail('Enter a name and an email for platform accounts.');
  if(org){const o=await orgFor(org);if(!o.active)fail('Restore this organisation first.');}
  if(garage){const g=await garageFor(u,garage);if(g.organisation_id!==org)fail('Garage must belong to this organisation.');}else if(['garage_manager','supervisor','mechanic'].includes(role))fail('Choose a garage.');
  const token=randomToken();
  const [r]=await sql`WITH created AS (INSERT INTO users(email,employee_id,name,role,organisation_id,garage_id) VALUES(${email},${employee},${name},${role},${org},${garage}) ON CONFLICT DO NOTHING RETURNING id,credential_version), invitation AS (INSERT INTO activation_tokens(token_hash,user_id,credential_version,expires_at) SELECT ${hash(token)},id,credential_version,now()+interval '24 hours' FROM created) INSERT INTO audit_events(actor_id,action,target) SELECT ${u.id},'user_created',id::text FROM created RETURNING target`;
  if(!r)fail('That email or employee ID already has an account.',409);
  return json({ok:true,link:appOrigin()+'/#activate/'+token,expires:'24 hours'});
 }
 if(['reset_user','set_active','set_role'].includes(b.action)){
  if(!uuid(b.user_id))fail('Choose a user.');const [target]=await sql`SELECT * FROM users WHERE id=${b.user_id} FOR UPDATE`;
  if(!target||!canManageUser(u,target))fail('You cannot manage this account.',403);
  if(b.action==='set_role'){
   // Promotion keeps the existing scope; no caller-supplied organisation or garage.
   if(!permittedAssignment(u,b.role,target.organisation_id,target.garage_id)||!['garage_manager','supervisor','mechanic'].includes(b.role)||!target.garage_id)fail('You cannot grant this role.',403);
   await sql`WITH changed AS (UPDATE users SET role=${b.role},credential_version=credential_version+1 WHERE id=${target.id} AND credential_version=${target.credential_version} RETURNING id) INSERT INTO audit_events(actor_id,action,target) SELECT ${u.id},${'role_changed:'+target.role+':'+b.role},id::text FROM changed`;return json({ok:true});
  }
  if(b.action==='set_active'){
   if(typeof b.active!=='boolean')fail('Choose an account status.');
   await sql`WITH changed AS (UPDATE users SET active=${b.active},credential_version=credential_version+1 WHERE id=${target.id} RETURNING id) INSERT INTO audit_events(actor_id,action,target) SELECT ${u.id},${b.active?'user_enabled':'user_disabled'},id::text FROM changed`;return json({ok:true});
  }
  if(!target.active)fail('Enable the account before creating a reset link.');
  const token=randomToken();
  await sql`WITH changed AS (UPDATE users SET credential_version=credential_version+1 WHERE id=${target.id} RETURNING id,credential_version), link AS (INSERT INTO activation_tokens(token_hash,user_id,credential_version,expires_at) SELECT ${hash(token)},id,credential_version,now()+interval '24 hours' FROM changed) INSERT INTO audit_events(actor_id,action,target) SELECT ${u.id},'password_reset_issued',id::text FROM changed`;
  return json({ok:true,link:appOrigin()+'/#activate/'+token,expires:'24 hours'});
 }
 if(b.action==='demo_accounts'){
  if(u.role!=='platform_admin'||u.demo)fail('Only the main Platform Admin can create the demo set.',403);
  const g=await garageFor(u,b.garage_id),credentials=[];
  // Random private credentials. These accounts are never available through a public role switcher.
  for(const role of roleKeys){
   const email='demo-'+role+'-'+randomToken().slice(0,10)+'@fleettap.invalid',password=randomToken().slice(0,24),encoded=await hashPassword(password);
   const org=role==='platform_admin'?null:g.organisation_id,garage=['platform_admin','organisation_admin'].includes(role)?null:g.id;
   await sql`WITH created AS (INSERT INTO users(email,name,role,organisation_id,garage_id,password_hash,demo) VALUES(${email},${'Demo '+roleNames[role]},${role},${org},${garage},${encoded},true) RETURNING id) INSERT INTO audit_events(actor_id,action,target) SELECT ${u.id},'demo_user_created',id::text FROM created`;
   credentials.push({role,email,password});
  }
  return json({ok:true,credentials});
 }
 fail('Unknown administration request.');
 });
});
