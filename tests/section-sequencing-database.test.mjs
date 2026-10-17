import test from 'node:test';
import assert from 'node:assert/strict';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {randomToken,hash} from '../server/security.mjs';
import {inspectionSequence} from '../src/section-sequencing.js';
test('authenticated API enforces sequence, role scope and stale evidence using mechanic-visible records',async()=>{
 const local=new NetlifyDB({logger:()=>{}}),url=await local.start();process.env.NETLIFY_DB_URL=url;process.env.NETLIFY_DB_DRIVER='server';
 const client=getDatabase({connectionString:url}),sql=client.sql,origin='https://sequence.test',ctx={deploy:{context:'deploy-preview'}};
 try{
  await local.applyMigrations('./netlify/database/migrations');const workspace=(await import('../netlify/functions/workspace.mjs')).default;
  const [org]=await sql`INSERT INTO organisations(name) VALUES('Sequence validation') RETURNING id`;
  const [garage]=await sql`INSERT INTO garages(name,organisation_id) VALUES('Test garage',${org.id}) RETURNING id`;
  const [foreign]=await sql`INSERT INTO garages(name,organisation_id) VALUES('Other garage',${org.id}) RETURNING id`;
  const cookies={};
  for(const role of ['organisation_admin','supervisor','mechanic']){const [u]=await sql`INSERT INTO users(name,email,role,organisation_id,garage_id) VALUES(${role},${role+'@sequence.invalid'},${role},${org.id},${role==='organisation_admin'?null:garage.id}) RETURNING id`;const token=randomToken();await sql`INSERT INTO sessions(token_hash,user_id,credential_version,expires_at) VALUES(${hash(token)},${u.id},1,now()+interval '1 hour')`;cookies[role]='__Host-fleettap_session='+token;}
  const state={schema:1,vehicles:[{id:'BUS',model:'Synthetic',garage:garage.id}],faults:[],actions:[],reports:[],inspections:[],inspectionTemplate:{id:'pm3',version:1,tasks:[{id:'q',section:'Prerequisite',text:'Check fitting',fields:[]},{id:'17-1',section:'Test Drive',text:'Synthetic test drive',fields:[],criticalSafety:true}]}};
  await sql`INSERT INTO garage_records(garage_id,data) VALUES(${garage.id},${JSON.stringify(state)}::jsonb),(${foreign.id},${JSON.stringify({...state,vehicles:[]})}::jsonb)`;
  const call=async(role,body,query='')=>{const r=await workspace(new Request(origin+'/.netlify/functions/workspace'+query,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json',cookie:cookies[role]},body:body?JSON.stringify(body):undefined}),ctx);return {status:r.status,data:await r.json()};};
  const read=async(role='mechanic')=>(await call(role,null,'?garage='+garage.id)).data;
  const write=async(role,action,values={},extra={})=>call(role,{garage:garage.id,version:(await read(role)).version,action,values,...extra});
  const started=await write('mechanic','start',{vehicle:'BUS'});assert.equal(started.status,200);const id=started.data.result.id,finalRule=started.data.result.templateSnapshot.sectionRules.find(r=>r.final);
  const edit={operation:'section_rule',sectionId:finalRule.id,category:'final',mode:'all',requirement:'passed',prerequisites:[]};
  for(const role of ['mechanic','supervisor'])assert.equal((await write(role,'template_edit',edit)).status,403);
  assert.equal((await call('mechanic',null,'?garage='+foreign.id)).status,403);
  const locked=await write('mechanic','answer',{result:'OK',readings:[],prerequisiteEvidence:'forged'},{id,item:'17-1'});assert.equal(locked.status,400);assert.match(locked.data.error,/locked/);
  assert.equal((await write('organisation_admin','template_edit',edit)).status,200);
  const fixed=await write('mechanic','answer',{result:'Fixed',notes:'Loose fitting',readings:[],repair:{defect:'Loose fitting',work:'Replaced',recheck:'Recheck passed',confirmed:true}},{id,item:'q'});assert.equal(fixed.status,200);const fault=fixed.data.result.fault;
  assert.equal((await write('mechanic','answer',{result:'OK',readings:[]},{id,item:'17-1'})).status,400);
  const action=(await read('supervisor')).state.actions.find(a=>a.source===fault);assert.equal((await write('supervisor','close_record',{notes:'Repair verified'},{kind:'actions',id:action.id})).status,200);
  assert.equal((await write('supervisor','close_record',{notes:'Fitting checked and secure'},{kind:'faults',id:fault})).status,200);
  const visible=await read(),i=visible.state.inspections.find(i=>i.id===id),proof=inspectionSequence(visible.state,i).evidence('Test Drive');assert.equal(visible.state.actions.length,0);
  const passed=await write('mechanic','answer',{result:'OK',readings:[],prerequisiteEvidence:proof},{id,item:'17-1'});assert.equal(passed.status,200,JSON.stringify(passed.data));
  const oldVersion=passed.data.version;
  // A prerequisite rerecording changes its revision without relying on clock precision.
  const [row]=await sql`SELECT data FROM garage_records WHERE garage_id=${garage.id}`;row.data.inspections.find(i=>i.id===id).answers.q.revision='changed-by-another-worker';
  await sql`UPDATE garage_records SET data=${JSON.stringify(row.data)}::jsonb,version=version+1 WHERE garage_id=${garage.id}`;
  assert.equal((await call('mechanic',{garage:garage.id,version:oldVersion,action:'answer',id,item:'17-1',values:{result:'OK',readings:[],prerequisiteEvidence:proof}})).status,409);
  const stale=await write('mechanic','answer',{result:'OK',readings:[],prerequisiteEvidence:proof},{id,item:'17-1'});assert.equal(stale.status,400);assert.match(stale.data.error,/fresh check/);
  assert.equal((await write('mechanic','submit',{notes:'Attempt stale submission'},{id})).status,400);
 }finally{await (await import('../server/runtime.mjs')).closeDatabase();await client.pool.end();await local.stop();}
});
