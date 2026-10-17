import test from 'node:test';
import assert from 'node:assert/strict';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {randomToken,hash} from '../server/security.mjs';
test('critical safety API persists classifications and verification, rejects role bypasses and stale writes',async()=>{
 const local=new NetlifyDB({logger:()=>{}}),url=await local.start();
 process.env.NETLIFY_DB_URL=url;process.env.NETLIFY_DB_DRIVER='server';
 const client=getDatabase({connectionString:url}),sql=client.sql,origin='https://critical-safety.test',ctx={deploy:{context:'deploy-preview'}};
 try{
  await local.applyMigrations('./netlify/database/migrations');
  const workspace=(await import('../netlify/functions/workspace.mjs')).default;
  const [org]=await sql`INSERT INTO organisations(name) VALUES('Safety validation') RETURNING id`;
  const [garage]=await sql`INSERT INTO garages(name,organisation_id) VALUES('Validation garage',${org.id}) RETURNING id`;
  const [foreign]=await sql`INSERT INTO garages(name,organisation_id) VALUES('Other garage',${org.id}) RETURNING id`;
  const cookies={};
  for(const role of ['organisation_admin','garage_manager','supervisor','mechanic']){
   const [u]=await sql`INSERT INTO users(name,email,role,organisation_id,garage_id) VALUES(${role},${role+'@safety.invalid'},${role},${org.id},${role==='organisation_admin'?null:garage.id}) RETURNING id`;
   const token=randomToken();await sql`INSERT INTO sessions(token_hash,user_id,credential_version,expires_at) VALUES(${hash(token)},${u.id},1,now()+interval '1 hour')`;cookies[role]='__Host-fleettap_session='+token;
  }
  const state={schema:1,vehicles:[{id:'SG1',model:'SG',garage:garage.id}],faults:[],actions:[],reports:[],inspections:[],inspectionTemplate:{id:'pm3',title:'Synthetic safety validation',version:1,tasks:[{id:'q',section:'Test',number:'1',page:1,text:'Synthetic safety check',criticalSafety:true,fields:[]}]}};
  await sql`INSERT INTO garage_records(garage_id,data) VALUES(${garage.id},${JSON.stringify(state)}::jsonb),(${foreign.id},${JSON.stringify({...state,vehicles:[]})}::jsonb)`;
  const call=async(role,b,query='')=>{const r=await workspace(new Request(origin+'/.netlify/functions/workspace'+query,{method:b?'POST':'GET',headers:{origin,'content-type':'application/json',cookie:cookies[role]},body:b?JSON.stringify(b):undefined}),ctx);return {status:r.status,data:await r.json()};};
  const read=async(role='organisation_admin')=>(await call(role,null,'?garage='+garage.id)).data;
  const write=async(role,action,values={},extra={})=>{const current=await read(role);return call(role,{action,garage:garage.id,version:current.version,values,...extra});};
  const edit={operation:'question',id:'q',section:'Test',question:'Safety check',instruction:'Check safely',page:1,criticalSafety:false};
  for(const role of ['mechanic','supervisor','garage_manager'])assert.equal((await write(role,'template_edit',edit)).status,403);
  const start=await write('mechanic','start',{vehicle:'SG1'});assert.equal(start.status,200);const id=start.data.result.id;
  const answer=await write('mechanic','answer',{result:'Defect',notes:'Unsafe condition',criticalSafety:false,readings:[]},{id,item:'q'});assert.equal(answer.status,200);const f=answer.data.state.faults[0],a=(await read()).state.actions[0];assert.equal(f.criticalSafety,true);assert.equal(answer.data.state.releaseStatuses.SG1.criticalSafetyFaults,1);
  const stale=answer.data.version;assert.equal((await write('organisation_admin','template_edit',edit)).status,200);assert.equal((await read()).state.faults[0].criticalSafety,true);
  assert.equal((await call('supervisor',{action:'close_record',kind:'faults',id:f.id,garage:garage.id,version:stale,values:{notes:'Stale closure'}})).status,409);
  for(const role of ['mechanic'])assert.equal((await write(role,'close_record',{notes:'Bypass'},{kind:'faults',id:f.id})).status,403);
  // Use the real action workflow; no direct record replacement commands.
  assert.equal((await write('garage_manager','action',{evidence:'Repaired failed component'},{id:a.id})).status,200);
  assert.equal((await write('supervisor','close_record',{notes:'Repair work checked'},{kind:'actions',id:a.id})).status,200);
  assert.equal((await write('supervisor','close_record',{notes:'Defer until later'},{kind:'faults',id:f.id})).status,400);
  assert.equal((await write('supervisor','close_record',{notes:'Verified repair',repairEvidence:'Replaced damaged component',recheckEvidence:'Functional test passed',safetyVerified:'yes'},{kind:'faults',id:f.id})).status,200);
  const saved=await read();assert.equal(saved.state.faults[0].safetyResolution.verified,true);assert.match(saved.state.faults[0].safetyResolution.actor,/supervisor/);assert.equal(saved.state.releaseStatuses.SG1.criticalSafetyFaults,0);
  assert.equal((await call('mechanic',null,'?garage='+foreign.id)).status,403);
 }finally{const {closeDatabase}=await import('../server/runtime.mjs');await closeDatabase();await client.pool.end();await local.stop();}
});
