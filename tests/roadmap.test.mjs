import test from 'node:test';
import assert from 'node:assert/strict';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {hash,randomToken} from '../server/security.mjs';
import {roadmapSeeds,validateBrief} from '../src/roadmap-data.js';
import {roadmapView,demoBuses} from '../src/roadmap-ui.js';
test('roadmap validation and demo access',()=>{
 assert.equal(roadmapSeeds.length,10);assert.throws(()=>validateBrief({...roadmapSeeds[0],status:'bogus'}));
 for(const role of ['organisation_admin','garage_manager','supervisor','mechanic'])assert.match(roadmapView({me:{role},page:'garage-today'}),/access required/);
 assert.equal(demoBuses.length,6);assert.match(roadmapView({me:{role:'platform_admin'},page:'garage-today'}),/no live garage records/);
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
 assert.equal((await (await call()).json()).features.length,10);
 const b={action:'brief',id:'garage-today',version:0,values:{...roadmapSeeds[0],title:'Meeting brief'}};
 assert.equal((await call(b,'organisation_admin')).status,403);assert.equal((await call(b,'platform_admin','https://foreign.test')).status,403);
 const race=await Promise.all([call(b),call(b)]);assert.deepEqual(race.map(x=>x.status).sort(),[200,409]);
 assert.equal((await call({action:'feedback',id:b.id,version:1,note:'Dublin Bus would like shift filtering.',author:'forged'})).status,200);
 let f=(await (await call()).json()).features[0];assert.equal(f.title,'Meeting brief');assert.equal(f.feedback.length,1);assert.equal(f.feedback[0].author,'Test platform_admin');
 assert.equal((await call({...b,version:2,values:{...b.values,title:'Amended brief'}})).status,200);
 f=(await (await call()).json()).features[0];assert.equal(f.feedback.length,1);assert.equal(f.version,3);
 }finally{await (await import('../netlify/functions/roadmap.mjs')).closeRoadmapDatabase();await client.pool.end();await (await import('../server/runtime.mjs')).closeDatabase();await local.stop();}
});
