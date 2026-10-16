import {db,actor,garageFor,endpoint,fail,json,appOrigin,rateLimit,withActorTransaction} from '../../server/runtime.mjs';
import {canAuthor} from '../../server/security.mjs';
import {sopPublished} from '../../src/content-model.js';
import {workerName} from '../../src/roles.js';

// Source files stay private. The SOP's publication status controls staff access.
export default endpoint(async req=>{
 const u=await actor(req),p=new URL(req.url).searchParams,g=await garageFor(u,p.get('garage'));
 if(req.method==='GET'){
  const id=p.get('id');if(!/^[a-f0-9-]{36}$/.test(id||''))fail('Document unavailable.',404);
  const sql=db(),[row]=await sql`SELECT data FROM organisation_content WHERE organisation_id=${g.organisation_id}`;
  const sop=row?.data.sops?.find(x=>x.sourceId===id||(canAuthor(u)&&x.draftRevision?.sourceId===id));
  if(!sop||(!canAuthor(u)&&!sopPublished(sop)))fail('Document unavailable.',404);
  const [doc]=await sql`SELECT content FROM sop_documents WHERE id=${id} AND organisation_id=${g.organisation_id} AND sop_id=${sop.id}`;
  if(!doc)fail('Document unavailable.',404);
  return new Response(Buffer.from(doc.content,'base64'),{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="sop-source.pdf"','Content-Security-Policy':"sandbox; default-src 'none'"}});
 }
 if(!canAuthor(u))fail('Organisation Admin access required.',403);
 if(req.method!=='POST')fail('Method not allowed.',405);
 if(!appOrigin()||req.headers.get('origin')!==appOrigin())fail('Request origin not allowed.',403);
 await rateLimit('sop-document:'+u.id,20);
 const expected=Number(p.get('version'));
 if(!p.has('version')||!Number.isInteger(expected)||expected<0)fail('Refresh the SOP first.',409);
 if(req.headers.get('content-type')!=='application/pdf')fail('Choose a PDF document.',415);
 if(Number(req.headers.get('content-length'))>4*1024*1024)fail('Choose a PDF under 4 MB.',413);
 const bytes=Buffer.from(await req.arrayBuffer());
 if(bytes.length>4*1024*1024||bytes.length<8)fail('Choose a PDF under 4 MB.',413);
 if(bytes.subarray(0,5).toString()!=='%PDF-')fail('Choose a valid PDF document.',415);
 return withActorTransaction(u,async()=>{
  const sql=db(),[org]=await sql`SELECT id FROM organisations WHERE id=${g.organisation_id} AND active FOR SHARE`;
  if(!org)fail('Organisation unavailable.',403);
  const [row]=await sql`SELECT data,version FROM organisation_content WHERE organisation_id=${g.organisation_id} FOR UPDATE`;
  if(!row||row.version!==expected)fail('Content changed. Reload and retry.',409);
  const sop=row.data.sops?.find(x=>x.id===p.get('sop'));
  if(!sop)fail('SOP unavailable.',404);
  if(sopPublished(sop)&&!sop.draftRevision)fail('Save a draft revision before changing its source PDF.',409);
  const target=sop.draftRevision||sop;
  const id=crypto.randomUUID(),name=String(p.get('name')||'SOP source.pdf').slice(0,180),{audit,...previous}=target;
  (target.audit??=[]).push({action:'Replace source PDF',actor:workerName(u),at:new Date().toISOString(),previous});
  Object.assign(target,{sourceId:id,sourceName:name,version:target.version+1,updated:new Date().toISOString(),updatedBy:workerName(u)});
  await sql`INSERT INTO sop_documents(id,organisation_id,sop_id,name,content,uploaded_by) VALUES(${id},${g.organisation_id},${sop.id},${name},${bytes.toString('base64')},${u.id})`;
  const [saved]=await sql`UPDATE organisation_content SET data=${JSON.stringify(row.data)}::jsonb,version=version+1 WHERE organisation_id=${g.organisation_id} AND version=${expected} RETURNING version`;
  if(!saved)fail('Content changed. Reload and retry.',409);
  await sql`INSERT INTO audit_events(actor_id,action,target,garage_id) VALUES(${u.id},'sop_source_uploaded',${sop.id},${g.id})`;
  return json({id,name,version:saved.version},201);
 });
});
