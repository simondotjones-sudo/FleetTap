import {db,env,body,actor,cookie,json,setCookie,rateLimit,safeUser,endpoint,fail} from '../../server/runtime.mjs';
import {hash,randomToken,hashPassword,verifyPassword,validPassword} from '../../server/security.mjs';
export default endpoint(async(req,context)=>{
 if(req.method==='GET'){const u=await actor(req);return json({user:safeUser(u)});}
 const b=await body(req),sql=db();
 if(b.action==='logout'){const token=cookie(req);if(token)await sql`DELETE FROM sessions WHERE token_hash=${hash(token)}`;return json({ok:true},200,{'Set-Cookie':setCookie('',0)});}
 await rateLimit('ip:'+(context.ip||'unknown'),60);
 if(b.action==='login'){
  const email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');if(email.length>254||password.length>128)fail('Invalid email or password.',401);
  await rateLimit('email:'+email,12);const [u]=await sql`SELECT * FROM users WHERE email=${email}`;
  const valid=await verifyPassword(password,u?.password_hash);if(!valid||!u?.active)fail('Invalid email or password.',401);
  const token=randomToken();const [session]=await sql`INSERT INTO sessions(token_hash,user_id,credential_version,expires_at) SELECT ${hash(token)},id,credential_version,now()+interval '8 hours' FROM users WHERE id=${u.id} AND active AND credential_version=${u.credential_version} RETURNING user_id`;
  if(!session)fail('Account changed. Please sign in again.',401);
  await sql`UPDATE users SET last_login=now() WHERE id=${u.id}`;
  return json({user:safeUser(u)},200,{'Set-Cookie':setCookie(token)});
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
