import {db,actor,body,json,endpoint,fail,withActorTransaction} from '../../server/runtime.mjs';
import {canAuthor} from '../../server/security.mjs';
import {saveContent} from '../../src/content-model.js';
import {workerName} from '../../src/roles.js';
export default endpoint(async req=>{
 const u=await actor(req);if(!canAuthor(u))fail('Organisation Admin access required.',403);
 const b=await body(req),org=b.organisation_id;
 if(!/^[a-f0-9-]{36}$/.test(org||'')||(u.role!=='platform_admin'&&org!==u.organisation_id))fail('Organisation unavailable.',403);
 return withActorTransaction(u,async()=>{
 const sql=db();
 const [o]=await sql`SELECT id FROM organisations WHERE id=${org} AND active FOR SHARE`;if(!o)fail('Organisation unavailable.',403);
 await sql`INSERT INTO organisation_content(organisation_id) VALUES(${org}) ON CONFLICT DO NOTHING`;
 const [row]=await sql`SELECT data,version FROM organisation_content WHERE organisation_id=${org}`;
 if(b.version!==row.version)fail('Content changed. Reload and retry.',409);
 let result;try{result=saveContent(row.data,b.kind,b.values||{},workerName(u));}catch(e){fail(e.message);}
 const [saved]=await sql`WITH changed AS (UPDATE organisation_content SET data=${JSON.stringify(row.data)}::jsonb,version=version+1 WHERE organisation_id=${org} AND version=${b.version} AND EXISTS(SELECT 1 FROM users WHERE id=${u.id} AND active AND credential_version=${u.credential_version}) RETURNING version), audit AS (INSERT INTO audit_events(actor_id,action,target) SELECT ${u.id},${'content_'+b.kind},${result.id} FROM changed) SELECT version FROM changed`;
 if(!saved)fail('Content or your access changed. Reload and retry.',409);
 return json({ok:true,id:result.id,version:saved.version});
 });
});
