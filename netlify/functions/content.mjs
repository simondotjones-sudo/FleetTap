import {seedRecallCases} from '../../src/recalls.js';
import {saveBulletin,stageDocumentBulletin} from '../../src/bulletins.js';
import {saveWarrantyModel} from '../../src/performance-model.js';
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
 const [row]=await sql`SELECT data,version FROM organisation_content WHERE organisation_id=${org} FOR UPDATE`;
 if(b.version!==row.version)fail('Content changed. Reload and retry.',409);
 let result;try{const values=b.values||{},who=workerName(u);
 if(b.kind==='tsbs')result=saveBulletin(row.data,values,who);
 else if(b.kind==='sops'&&values.status==='Published'&&values.operation!=='withdraw'){
  if(values.approved!=='yes')throw Error('Review the document against its source before preparing its TSB.');
  const doc=saveContent(row.data,'sops',{...values,status:'Draft'},who),bulletin=stageDocumentBulletin(row.data,doc,who);result={...doc,bulletinId:bulletin.id};
 }else if(b.kind==='sops'&&values.operation==='withdraw'&&(row.data.tsbs||[]).some(x=>x.status==='Published'&&x.documents?.some(d=>d.id===values.id&&d.version===row.data.sops.find(s=>s.id===values.id)?.version)))throw Error('This revision is linked to a published TSB. Publish its replacement before withdrawing it.');
 else result=b.kind==='warrantyModels'?saveWarrantyModel(row.data,values,who):saveContent(row.data,b.kind,values,who);}catch(e){fail(e.message);}
 const [saved]=await sql`WITH changed AS (UPDATE organisation_content SET data=${JSON.stringify(row.data)}::jsonb,version=version+1 WHERE organisation_id=${org} AND version=${b.version} AND EXISTS(SELECT 1 FROM users WHERE id=${u.id} AND active AND credential_version=${u.credential_version}) RETURNING version), audit AS (INSERT INTO audit_events(actor_id,action,target) SELECT ${u.id},${'content_'+b.kind},${result.id} FROM changed) SELECT version FROM changed`;
 if(!saved)fail('Content or your access changed. Reload and retry.',409);
 if(b.kind==='tsbs'&&result.status==='Published'&&result.type==='recall'){
  const records=await sql`SELECT r.garage_id,r.data,r.version FROM garage_records r JOIN garages g ON g.id=r.garage_id WHERE g.organisation_id=${org} ORDER BY r.garage_id FOR UPDATE OF r`;
  for(const r of records){const before=r.data.recallCases?.length||0;seedRecallCases(r.data,r.garage_id,row.data);if((r.data.recallCases?.length||0)!==before)await sql`UPDATE garage_records SET data=${JSON.stringify(r.data)}::jsonb,version=version+1,updated_at=now() WHERE garage_id=${r.garage_id}`;}
 }
 return json({ok:true,id:result.id,bulletinId:result.bulletinId||null,version:saved.version});
 });
});
