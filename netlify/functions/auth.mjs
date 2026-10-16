import {db,env,body,actor,cookie,json,setCookie,rateLimit,safeUser,endpoint,fail} from '../../server/runtime.mjs';
import {hash,randomToken,hashPassword,verifyPassword,validPassword} from '../../server/security.mjs';
export default endpoint(async(req,context)=>{
 if(req.method==='GET'){const u=await actor(req);return json({user:safeUser(u)});}
 const b=await body(req),sql=db();
 if(b.action==='logout'){const token=cookie(req);if(token)await sql`DELETE FROM sessions WHERE token_hash=${hash(token)}`;return json({ok:true},200,{'Set-Cookie':setCookie('',0)});}
 await rateLimit('ip:'+(context.ip||'unknown'),60);
 if(b.action==='login'){
  const identifier=String(b.identifier||b.email||'').trim().toLowerCase(),password=String(b.password||''),orgCode=String(b.organisation_code||'').trim().toUpperCase();if(!identifier||identifier.length>254||password.length>128)fail('Invalid login details.',401);
  await rateLimit('login:'+identifier,12);
  const candidates=await sql`SELECT u.*,o.role_names,o.login_code FROM users u LEFT JOIN organisations o ON o.id=u.organisation_id WHERE (u.email=${identifier} OR (lower(u.employee_id)=${identifier} AND (${!orgCode} OR o.login_code=${orgCode}))) AND (u.organisation_id IS NULL OR o.active) LIMIT 2`;
  const u=candidates.length===1?candidates[0]:null;
  const valid=await verifyPassword(password,u?.password_hash);if(!valid||!u?.active)fail('Invalid login details. If using an employee ID, include your organisation code.',401);
  const token=randomToken();const [session]=await sql`INSERT INTO sessions(token_hash,user_id,credential_version,expires_at) SELECT ${hash(token)},id,credential_version,now()+interval '8 hours' FROM users WHERE id=${u.id} AND active AND credential_version=${u.credential_version} RETURNING user_id`;
  if(!session)fail('Account changed. Please sign in again.',401);
  await sql`UPDATE users SET last_login=now() WHERE id=${u.id}`;
  return json({user:safeUser(u)},200,{'Set-Cookie':setCookie(token)});
 }
 if(b.action==='registration_garage'){
  const code=String(b.code||'').replace(/[ -]/g,'').trim().toUpperCase();
  if(!/^[A-F0-9]{16}$/.test(code))fail('Enter the garage registration code from your manager.');
  await rateLimit('registration:'+hash(code),30);
  const [g]=await sql`SELECT g.name AS garage,o.name AS organisation FROM registration_codes c JOIN garages g ON g.id=c.garage_id JOIN organisations o ON o.id=g.organisation_id WHERE c.code_hash=${hash(code)} AND c.enabled AND o.active`;
  if(!g)fail('This garage code is unavailable. Ask your manager for the current code.');
  return json(g);
 }
 if(b.action==='register'){
  const code=String(b.code||'').replace(/[ -]/g,'').trim().toUpperCase(),email=String(b.email||'').trim().toLowerCase()||null,employee=String(b.employee_id||'').trim()||null,name=String(b.name||'').trim();
  if(!/^[A-F0-9]{16}$/.test(code))fail('Enter a valid garage registration code.');
  await rateLimit('registration:'+hash(code),30);
  if(!name||name.length>120||(!email&&!employee))fail('Enter your name and an employee ID or email.');
  if(email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254))fail('Enter a valid email.');
  if(employee&&!/^[a-zA-Z0-9._-]{1,40}$/.test(employee))fail('Enter a valid employee ID (up to 40 characters).');
  if(!validPassword(b.password))fail('Use a password of 12–128 characters.');
  const encoded=await hashPassword(b.password);
  const [created]=await sql`WITH registered AS (INSERT INTO users(name,email,employee_id,role,organisation_id,garage_id,password_hash) SELECT ${name},${email},${employee},'mechanic',g.organisation_id,g.id,${encoded} FROM registration_codes c JOIN garages g ON g.id=c.garage_id JOIN organisations o ON o.id=g.organisation_id WHERE c.code_hash=${hash(code)} AND c.enabled AND o.active ON CONFLICT DO NOTHING RETURNING id,organisation_id), audit AS (INSERT INTO audit_events(actor_id,action,target) SELECT id,'staff_registered',id::text FROM registered) SELECT r.id,o.login_code FROM registered r JOIN organisations o ON o.id=r.organisation_id`;
  if(!created)fail('Unable to register. Check the garage code or ask your manager whether you already have an account.',409);
  return json({ok:true,organisation_code:created.login_code},201);
 }
 if(b.action==='change_password'){
  const u=await actor(req);if(!validPassword(b.password)||typeof b.current_password!=='string'||b.current_password.length>128)fail('Use a new password of 12–128 characters.');
  await rateLimit('password-change:'+u.id,10);if(!await verifyPassword(b.current_password,u.password_hash))fail('Current password is incorrect.',400);
  const encoded=await hashPassword(b.password);const [changed]=await sql`WITH updated AS (UPDATE users SET password_hash=${encoded},credential_version=credential_version+1 WHERE id=${u.id} AND active AND credential_version=${u.credential_version} RETURNING id) INSERT INTO audit_events(actor_id,action,target) SELECT id,'password_changed',id::text FROM updated RETURNING actor_id`;
  if(!changed)fail('Account changed. Sign in again.',401);return json({ok:true},200,{'Set-Cookie':setCookie('',0)});
 }
 if(b.action==='activate'){
  if(!/^[a-f0-9]{64}$/.test(b.token||''))fail('This setup link is invalid or expired.');if(!validPassword(b.password))fail('Use a password of 12–128 characters.');
  await rateLimit('activation:'+hash(b.token),10);const encoded=await hashPassword(b.password);
  const [u]=await sql`WITH consumed AS (UPDATE activation_tokens t SET used_at=now() FROM users u WHERE t.token_hash=${hash(b.token)} AND t.used_at IS NULL AND t.expires_at>now() AND u.id=t.user_id AND u.active AND u.credential_version=t.credential_version AND (NOT u.bootstrap OR u.email=${env('FLEETTAP_PLATFORM_ADMIN_EMAIL')?.trim().toLowerCase()||''}) RETURNING t.user_id,t.credential_version), updated AS (UPDATE users u SET password_hash=${encoded},credential_version=u.credential_version+1 FROM consumed c WHERE u.id=c.user_id AND u.credential_version=c.credential_version RETURNING u.id) INSERT INTO audit_events(actor_id,action,target) SELECT id,'password_activated',id::text FROM updated RETURNING actor_id`;
  if(!u)fail('This setup link is invalid or expired. Ask your administrator for a new link.');
  return json({ok:true},200,{'Set-Cookie':setCookie('',0)});
 }
 fail('Unknown authentication request.');
});
