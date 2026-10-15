import {db,actor,garageFor,endpoint,fail,json,appOrigin,rateLimit} from '../../server/runtime.mjs';
import {canManage,canAuthor} from '../../server/security.mjs';
import {templateFor} from '../../src/templates.js';

// Original documents are private database objects, never files in the public web build/repository.
export default endpoint(async req=>{
 const u=await actor(req);
 const p=new URL(req.url).searchParams,garage=p.get('garage');await garageFor(u,garage);const sql=db();
 if(req.method==='GET'){
  const id=p.get('id');if(!/^[a-f0-9-]{36}$/.test(id||''))fail('Document unavailable.',404);
  if(!canManage(u)){
   const [row]=await sql`SELECT data FROM garage_records WHERE garage_id=${garage}`;
   if(!row||templateFor(row.data).sourceId!==id)fail('Document unavailable.',404);
  }
  const [doc]=await sql`SELECT content FROM inspection_documents WHERE id=${id} AND garage_id=${garage}`;
  if(!doc)fail('Document unavailable.',404);
  return new Response(Buffer.from(doc.content,'base64'),{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="inspection-source.pdf"','Content-Security-Policy':"sandbox; default-src 'none'"}});
 }
 if(!canAuthor(u))fail('Organisation Admin access required.',403);
 if(req.method!=='POST')fail('Method not allowed.',405);
 if(!appOrigin()||req.headers.get('origin')!==appOrigin())fail('Request origin not allowed.',403);
 await rateLimit('document:'+u.id,20);
 const expected=Number(p.get('version'));if(!Number.isInteger(expected)||expected<0)fail('Refresh the template first.',409);
 if(req.headers.get('content-type')!=='application/pdf')fail('Choose a PDF document.',415);
 const bytes=Buffer.from(await req.arrayBuffer());
 if(bytes.length>4*1024*1024||bytes.length<8)fail('Choose a PDF under 4 MB.',413);
 if(bytes.subarray(0,5).toString()!=='%PDF-')fail('Choose a valid PDF document.',415);
 const name=String(p.get('name')||'Inspection source.pdf').slice(0,180),id=crypto.randomUUID();
 const [row]=await sql`SELECT data,version FROM garage_records WHERE garage_id=${garage}`;
 if(!row||row.version!==expected)fail('Another person saved changes. Refresh and retry.',409);
 const template=structuredClone(templateFor(row.data));
 (template.audit??=[]).push({action:'Replace source PDF',actor:u.name+' ('+u.email+')',at:new Date().toISOString(),previous:{sourceId:template.sourceId||null,sourceName:template.sourceName||null}});
 template.version++;template.sourceId=id;template.sourceName=name;row.data.inspectionTemplate=template;
 const [saved]=await sql`WITH changed AS (UPDATE garage_records SET data=${JSON.stringify(row.data)}::jsonb,version=version+1,updated_at=now() WHERE garage_id=${garage} AND version=${expected} AND EXISTS(SELECT 1 FROM users WHERE id=${u.id} AND active AND credential_version=${u.credential_version}) RETURNING version), document AS (INSERT INTO inspection_documents(id,garage_id,name,content,uploaded_by) SELECT ${id},${garage},${name},${bytes.toString('base64')},${u.id} FROM changed), audit AS (INSERT INTO audit_events(actor_id,action,target,garage_id) SELECT ${u.id},'inspection_source_uploaded',${id},${garage} FROM changed) SELECT version FROM changed`;
 if(!saved)fail('The record or your access changed. Refresh and try again.',409);
 return json({id,name,version:saved.version},201);
});
