import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import pg from 'pg';
// The local emulator has one PostgreSQL session; serialise transactions as in
// fleet-management-database.test.mjs so a losing request cannot roll back another.
const NativePool=pg.Pool;pg.Pool=class extends NativePool{constructor(options){super({...options,max:1});}};
import {hash,randomToken} from '../server/security.mjs';
import {roadmapSeeds,validateBrief,statuses} from '../src/roadmap-data.js';
import {roadmapView,demoBuses} from '../src/roadmap-ui.js';
test('roadmap validation and demo access',()=>{
 assert.equal(roadmapSeeds.length,13);assert.throws(()=>validateBrief({...roadmapSeeds[0],status:'bogus'}));
 assert.deepEqual(statuses,['Available','Idea','In dev']);
 assert.deepEqual(statuses.map(status=>roadmapSeeds.filter(f=>f.status===status).length),[10,1,2]);
 for(const role of ['supervisor','mechanic'])assert.match(roadmapView({me:{role},page:'garage-today'}),/access required/);
 for(const role of ['organisation_admin','garage_manager']){assert.match(roadmapView({me:{role},page:'garage-today'}),/Sample data/);assert.match(roadmapView({me:{role},page:'roadmap'}),/Platform Admin access required/);}
 assert.equal(demoBuses.length,6);assert.match(roadmapView({me:{role:'platform_admin'},page:'garage-today'}),/DEMO-101/);
});
test('roadmap persists edits and feedback, rejects unauthorised and stale writes',async()=>{
 const local=new NetlifyDB({logger:()=>{}}),url=await local.start();process.env.NETLIFY_DB_URL=url;process.env.NETLIFY_DB_DRIVER='server';
 const client=getDatabase({connectionString:url}),sql=client.sql,origin='https://roadmap.test',ctx={deploy:{context:'deploy-preview'}};
 try{
 await local.applyMigrations('./netlify/database/migrations');
 const endpoint=(await import('../netlify/functions/roadmap.mjs')).default;
 const [org]=await sql`INSERT INTO organisations(name) VALUES('Example') RETURNING id`;
 const cookies={};for(const role of ['platform_admin','organisation_admin']){const token=randomToken();const [u]=await sql`INSERT INTO users(email,name,role,organisation_id) VALUES(${role+'@test.invalid'},${'Test '+role},${role},${role==='platform_admin'?null:org.id}) RETURNING id`;await sql`INSERT INTO sessions(token_hash,user_id,credential_version,expires_at) VALUES(${hash(token)},${u.id},1,now()+interval '1 hour')`;cookies[role]='__Host-fleettap_session='+token;}
 const call=(body,role='platform_admin',requestOrigin=origin)=>endpoint(new Request(origin+'/.netlify/functions/roadmap',{method:body?'POST':'GET',headers:{cookie:cookies[role]||'',origin:requestOrigin,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),ctx);
 assert.equal((await call(null,'none')).status,401);assert.equal((await call(null,'organisation_admin')).status,403);
 assert.equal((await (await call()).json()).features.length,13);
 const b={action:'brief',id:'garage-today',version:0,values:{...roadmapSeeds.find(f=>f.id==='garage-today'),title:'Meeting brief'}};
 assert.equal((await call(b,'organisation_admin')).status,403);assert.equal((await call(b,'platform_admin','https://foreign.test')).status,403);
 const race=await Promise.all([call(b),call(b)]);assert.deepEqual(race.map(x=>x.status).sort(),[200,409]);
 assert.equal((await call({action:'feedback',id:b.id,version:1,note:'Dublin Bus would like shift filtering.',author:'forged'})).status,200);
 let f=(await (await call()).json()).features.find(f=>f.id==='garage-today');assert.equal(f.title,'Meeting brief');assert.equal(f.feedback.length,1);assert.equal(f.feedback[0].author,'Test platform_admin');
 assert.equal((await call({...b,version:2,values:{...b.values,title:'Amended brief'}})).status,200);
 f=(await (await call()).json()).features.find(f=>f.id==='garage-today');assert.equal(f.feedback.length,1);assert.equal(f.version,3);assert.match(f.additionalScope,/mechanics see assigned work/);assert.match(f.deliveryStandards,/Preserve drafts/);
 const [legacy]=await sql`SELECT data FROM product_roadmap WHERE id=${b.id}`;delete legacy.data.additionalScope;delete legacy.data.deliveryStandards;await sql`UPDATE product_roadmap SET data=${JSON.stringify(legacy.data)}::jsonb WHERE id=${b.id}`;
 f=(await (await call()).json()).features.find(f=>f.id===b.id);assert.equal(f.title,'Amended brief');assert.equal(f.feedback.length,1);assert.match(f.additionalScope,/mechanics see assigned work/);assert.match(f.deliveryStandards,/Preserve drafts/);
 // Existing stored briefs must receive the review too, without losing custom text
 // or discussion notes. Seed-only fixes would leave these records incorrectly tagged.
 for(const seed of roadmapSeeds)await sql`INSERT INTO product_roadmap(id,data) VALUES(${seed.id},${JSON.stringify(seed)}::jsonb) ON CONFLICT DO NOTHING`;
 await sql`UPDATE product_roadmap SET data=jsonb_set(data,'{status}','"Idea"'::jsonb)`;
 await sql`UPDATE product_roadmap SET data=jsonb_set(data,'{status}','"Available — initial version"'::jsonb) WHERE id='bus-work-pack'`;
 const before=await sql`SELECT id,data,version FROM product_roadmap`;
 const reviewSQL=await readFile(new URL('../netlify/database/migrations/20261017100000_roadmap_status_review.sql',import.meta.url),'utf8');
 await client.pool.query(reviewSQL);
 const reviewed=(await (await call()).json()).features;
 for(const seed of roadmapSeeds){
  const prior=before.find(f=>f.id===seed.id),current=reviewed.find(f=>f.id===seed.id);
  const reviewedStatus=['voice-updates','workshop-knowledge','workshop-planner'].includes(seed.id)?'In dev':seed.status;
  assert.equal(current.status,reviewedStatus,seed.id);
  assert.equal(current.title,prior.data.title);assert.deepEqual(current.feedback,prior.data.feedback);
  assert.equal(current.version,prior.version+(prior.data.status===reviewedStatus?0:1));
 }
 assert.equal((await call({...b,version:3})).status,409);
 await client.pool.query(reviewSQL);
 assert.deepEqual((await (await call()).json()).features,reviewed,'Review does not change versions a second time');
 f=reviewed.find(f=>f.id===b.id);
 assert.equal((await call({...b,version:f.version,values:{...f,status:'In dev'}})).status,200);
 assert.equal((await (await call()).json()).features.find(f=>f.id===b.id).status,'In dev','Admin status edits remain authoritative after the review');
 const beforeVoice=(await (await call()).json()).features;
 const availableSQL=await readFile(new URL('../netlify/database/migrations/20261017120000_voice_updates_available.sql',import.meta.url),'utf8');
 await client.pool.query(availableSQL);
 const afterVoice=(await (await call()).json()).features;
 for(const current of afterVoice){
  const prior=beforeVoice.find(x=>x.id===current.id);
  if(current.id==='voice-updates'){assert.equal(current.status,'Available');assert.equal(current.version,prior.version+1);const {status,version,updatedAt,...rest}=current;const {status:oldStatus,version:oldVersion,updatedAt:oldTime,...oldRest}=prior;assert.deepEqual(rest,oldRest);}
  else assert.deepEqual(current,prior,'Only Voice Updates changes');
 }
 await client.pool.query(availableSQL);assert.deepEqual((await (await call()).json()).features,afterVoice,'Availability update is idempotent');
 const acceptedSQL=await readFile(new URL('../netlify/database/migrations/20261017123000_knowledge_planner_available.sql',import.meta.url),'utf8');
 await client.pool.query(acceptedSQL);
 const accepted=(await (await call()).json()).features;
 for(const current of accepted){
  const prior=afterVoice.find(x=>x.id===current.id);
  if(['workshop-knowledge','workshop-planner'].includes(current.id)){assert.equal(current.status,'Available');assert.equal(current.version,prior.version+1);const {status,version,updatedAt,...rest}=current;const {status:oldStatus,version:oldVersion,updatedAt:oldTime,...oldRest}=prior;assert.deepEqual(rest,oldRest);}
  else assert.deepEqual(current,prior,'Only Knowledge and Planner change');
 }
 await client.pool.query(acceptedSQL);assert.deepEqual((await (await call()).json()).features,accepted,'Acceptance update is idempotent');
 }finally{await (await import('../netlify/functions/roadmap.mjs')).closeRoadmapDatabase();await client.pool.end();await (await import('../server/runtime.mjs')).closeDatabase();await local.stop();}
});
