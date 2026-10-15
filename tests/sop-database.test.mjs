import test from 'node:test';
import assert from 'node:assert/strict';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {randomToken,hash} from '../server/security.mjs';

test('SOP lifecycle and private PDFs: publication, roles, organisation scope, stale writes and revocation',async()=>{
 const local=new NetlifyDB({logger:()=>{}}),url=await local.start();
 process.env.NETLIFY_DB_URL=url;process.env.NETLIFY_DB_DRIVER='server';delete process.env.CONTEXT;
 const client=getDatabase({connectionString:url}),sql=client.sql,ctx={deploy:{context:'deploy-preview'}},origin='https://sop.test';
 try{
  await local.applyMigrations('./netlify/database/migrations');
  const content=(await import('../netlify/functions/content.mjs')).default,docs=(await import('../netlify/functions/sop-documents.mjs')).default,workspace=(await import('../netlify/functions/workspace.mjs')).default;
  const [org]=await sql`INSERT INTO organisations(name) VALUES('SOP tenant') RETURNING id`,[foreign]=await sql`INSERT INTO organisations(name) VALUES('Other tenant') RETURNING id`;
  const [g]=await sql`INSERT INTO garages(name,organisation_id) VALUES('North',${org.id}) RETURNING id`,[south]=await sql`INSERT INTO garages(name,organisation_id) VALUES('South',${org.id}) RETURNING id`,[other]=await sql`INSERT INTO garages(name,organisation_id) VALUES('Foreign',${foreign.id}) RETURNING id`;
  await sql`INSERT INTO garage_records(garage_id) VALUES(${g.id}),(${south.id}),(${other.id})`;
  const cookies={},users={};
  for(const [key,role,organisation,garage] of [['admin','organisation_admin',org.id,null],['staff','mechanic',org.id,g.id],['manager','garage_manager',org.id,g.id],['south','mechanic',org.id,south.id],['foreign','organisation_admin',foreign.id,null]]){
   const token=randomToken(),[u]=await sql`INSERT INTO users(email,name,role,organisation_id,garage_id) VALUES(${key+'@test.invalid'},${key},${role},${organisation},${garage}) RETURNING id`;users[key]=u.id;
   await sql`INSERT INTO sessions(token_hash,user_id,credential_version,expires_at) VALUES(${hash(token)},${u.id},1,now()+interval '1 hour')`;cookies[key]='__Host-fleettap_session='+token;
  }
  const call=(fn,{role='admin',body,query='',type='application/json',requestOrigin=origin}={})=>fn(new Request(origin+'/.netlify/functions/test'+query,{method:body===undefined?'GET':'POST',headers:{origin:requestOrigin,'content-type':type,cookie:cookies[role]||''},body:body===undefined?undefined:type==='application/json'?JSON.stringify(body):body}),ctx);
  let version=0;
  const save=async(values,role='admin',v=version)=>{const r=await call(content,{role,body:{kind:'sops',organisation_id:org.id,version:v,values}}),data=await r.json();if(r.ok)version=data.version;return {status:r.status,...data};};
  const draft=await save({title:'Safe handover'});assert.equal(draft.status,200);const id=draft.id;
  const values={id,title:'Safe handover',summary:'Source summary',instructions:'Full instruction',steps:'Check area\nHand over',status:'Published',approved:'yes'};
  const read=async(role='staff',garage=g.id)=>(await call(workspace,{role,query:'?garage='+garage})).json();
  assert.equal((await read()).content.sops.length,0);
  assert.equal((await read('admin')).content.sops.length,1);
  for(const role of ['staff','manager','foreign'])assert.equal((await save(values,role)).status,403);
  const pdf=Buffer.from('%PDF-1.4\nSynthetic SOP\n%%EOF');
  const upload=(role='admin',v=version,extra={})=>call(docs,{role,query:'?'+new URLSearchParams({garage:g.id,sop:id,version:v,name:'source.pdf'}),body:pdf,type:'application/pdf',...extra});
  for(const role of ['staff','manager','foreign'])assert.equal((await upload(role)).status,403);
  assert.equal((await upload('admin',version,{requestOrigin:'https://foreign.invalid'})).status,403);
  assert.equal((await upload('admin',version,{body:Buffer.from('not a PDF file')})).status,415);
  let r=await upload();assert.equal(r.status,201);const doc=await r.json();version=doc.version;
  const get=(role='staff',garage=g.id,docId=doc.id)=>call(docs,{role,query:'?'+new URLSearchParams({garage,id:docId})});
  assert.equal((await get()).status,404);assert.equal((await get('admin')).status,200);assert.equal((await get('foreign',other.id)).status,404);assert.equal((await get('foreign')).status,403);assert.equal((await get('none')).status,401);
  assert.equal((await save({...values,approved:''})).status,400);
  const race=await Promise.all([save(values,'admin',version),save(values,'admin',version)]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  const visible=(await read()).content.sops[0];assert.equal(visible.title,'Safe handover');assert.equal(visible.audit,undefined);assert.equal(visible.sourceId,doc.id);
  for(const [role,garage] of [['staff',g.id],['south',south.id]]){r=await get(role,garage);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/private, no-store/);assert.equal(await r.text(),pdf.toString());}
  assert.equal((await upload()).status,409); // Source cannot change while published.
  assert.equal((await save({...values,status:'Draft'})).status,200);assert.equal((await get()).status,404);assert.equal((await read()).content.sops.length,0);
  const [old]=await sql`SELECT data FROM organisation_content WHERE organisation_id=${org.id}`;assert.ok(old.data.sops[0].audit.some(a=>a.previous.sourceId===doc.id));
  await sql`UPDATE users SET active=false,credential_version=credential_version+1 WHERE id=${users.admin}`;
  assert.equal((await upload()).status,401);assert.equal((await save(values)).status,401);
 }finally{await (await import('../server/runtime.mjs')).closeDatabase();await client.pool.end();await local.stop();}
});
