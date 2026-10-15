import {db,env,body,actor,json,endpoint,fail,garageFor,appOrigin} from '../../server/runtime.mjs';
import {canManage,canManageUser,permittedAssignment,randomToken,hash} from '../../server/security.mjs';
const uuid=v=>/^[a-f0-9-]{36}$/.test(v||'');
export default endpoint(async(req)=>{
 const u=await actor(req);if(!canManage(u))fail('Administrator access required.',403);const sql=db();
 if(req.method==='GET'){
  const users=await sql`SELECT id,email,name,role,organisation_id,garage_id,active,bootstrap,password_hash IS NOT NULL AS activated,created_at,last_login FROM users WHERE ${u.role==='platform_admin'} OR (organisation_id=${u.organisation_id} AND (${u.role==='organisation_admin'} OR (garage_id=${u.garage_id} AND role='mechanic'))) ORDER BY created_at DESC LIMIT 500`;
  const organisations=await sql`SELECT * FROM organisations WHERE ${u.role==='platform_admin'} OR id=${u.organisation_id} ORDER BY name`;
  const garages=await sql`SELECT * FROM garages WHERE ${u.role==='platform_admin'} OR (organisation_id=${u.organisation_id} AND (${u.role==='organisation_admin'} OR id=${u.garage_id})) ORDER BY name`;
  return json({users,organisations,garages});
 }
 const b=await body(req);
 if(b.action==='organisation'){
  if(u.role!=='platform_admin')fail('Platform Admin access required.',403);const name=String(b.name||'').trim();if(!name||name.length>120)fail('Enter an organisation name.');
  const [r]=await sql`WITH created AS (INSERT INTO organisations(name) VALUES(${name}) RETURNING id) INSERT INTO audit_events(actor_id,action,target) SELECT ${u.id},'organisation_created',id::text FROM created RETURNING target`;return json({ok:true,id:r.target});
 }
 if(b.action==='garage'){
  if(!['platform_admin','organisation_admin'].includes(u.role)||!uuid(b.organisation_id))fail('Organisation access required.',403);
  if(u.role!=='platform_admin'&&b.organisation_id!==u.organisation_id)fail('Organisation unavailable.',403);
  const name=String(b.name||'').trim();if(!name||name.length>120)fail('Enter a garage name.');
  const [org]=await sql`SELECT id FROM organisations WHERE id=${b.organisation_id}`;if(!org)fail('Organisation unavailable.');
  await sql`WITH created AS (INSERT INTO garages(name,organisation_id) VALUES(${name},${org.id}) RETURNING id), records AS (INSERT INTO garage_records(garage_id) SELECT id FROM created) INSERT INTO audit_events(actor_id,action,target) SELECT ${u.id},'garage_created',id::text FROM created`;return json({ok:true});
 }
 if(b.action==='create_user'){
  const role=String(b.role||''),email=String(b.email||'').trim().toLowerCase(),name=String(b.name||'').trim();
  if(!['platform_admin','organisation_admin','garage_manager','mechanic'].includes(role))fail('Choose a role.');
  const org=role==='platform_admin'?null:b.organisation_id,garage=['garage_manager','mechanic'].includes(role)?b.garage_id:null;
  if(!permittedAssignment(u,role,org,garage))fail('You cannot grant this access.',403);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!name||name.length>120)fail('Enter a name and valid email.');
  if(role!=='platform_admin'){if(!uuid(org))fail('Choose an organisation.');const [o]=await sql`SELECT id FROM organisations WHERE id=${org}`;if(!o)fail('Organisation unavailable.');}
  if(garage){const g=await garageFor(u,garage);if(g.organisation_id!==org)fail('Garage must belong to this organisation.');}else if(['garage_manager','mechanic'].includes(role))fail('Choose a garage.');
  const token=randomToken();
  const [r]=await sql`WITH created AS (INSERT INTO users(email,name,role,organisation_id,garage_id) VALUES(${email},${name},${role},${org},${garage}) ON CONFLICT(email) DO NOTHING RETURNING id,credential_version), invitation AS (INSERT INTO activation_tokens(token_hash,user_id,credential_version,expires_at) SELECT ${hash(token)},id,credential_version,now()+interval '24 hours' FROM created) INSERT INTO audit_events(actor_id,action,target) SELECT ${u.id},'user_created',id::text FROM created RETURNING target`;
  if(!r)fail('An account with that email already exists.',409);
  return json({ok:true,link:appOrigin()+'/#activate/'+token,expires:'24 hours'});
 }
 if(['reset_user','set_active'].includes(b.action)){
  if(!uuid(b.user_id))fail('Choose a user.');const [target]=await sql`SELECT * FROM users WHERE id=${b.user_id}`;
  if(!target||!canManageUser(u,target))fail('You cannot manage this account.',403);
  if(b.action==='set_active'){
   if(typeof b.active!=='boolean')fail('Choose an account status.');
   await sql`WITH changed AS (UPDATE users SET active=${b.active},credential_version=credential_version+1 WHERE id=${target.id} RETURNING id) INSERT INTO audit_events(actor_id,action,target) SELECT ${u.id},${b.active?'user_enabled':'user_disabled'},id::text FROM changed`;return json({ok:true});
  }
  if(!target.active)fail('Enable the account before creating a reset link.');
  const token=randomToken();
  await sql`WITH changed AS (UPDATE users SET credential_version=credential_version+1 WHERE id=${target.id} RETURNING id,credential_version), link AS (INSERT INTO activation_tokens(token_hash,user_id,credential_version,expires_at) SELECT ${hash(token)},id,credential_version,now()+interval '24 hours' FROM changed) INSERT INTO audit_events(actor_id,action,target) SELECT ${u.id},'password_reset_issued',id::text FROM changed`;
  return json({ok:true,link:appOrigin()+'/#activate/'+token,expires:'24 hours'});
 }
 fail('Unknown administration request.');
});
