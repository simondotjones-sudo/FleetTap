import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {randomToken,hash} from '../server/security.mjs';
import {today} from '../src/scheduling.js';
const NativePool=pg.Pool;pg.Pool=class extends NativePool{constructor(options){super({...options,max:1});}};

test('TSB database workflow: publication, personal learning, recall holds, action gates, garage transfer and tenant boundaries',async()=>{
 const local=new NetlifyDB({logger:()=>{}}),url=await local.start();process.env.NETLIFY_DB_URL=url;process.env.NETLIFY_DB_DRIVER='server';delete process.env.CONTEXT;
 const client=getDatabase({connectionString:url}),sql=client.sql,ctx={deploy:{context:'deploy-preview'}},origin='https://tsb.test';
 try{
  await local.applyMigrations('./netlify/database/migrations');
  const content=(await import('../netlify/functions/content.mjs')).default,workspace=(await import('../netlify/functions/workspace.mjs')).default,learning=(await import('../netlify/functions/instruction-learning.mjs')).default,status=(await import('../netlify/functions/instruction-status.mjs')).default;
  const [org]=await sql`INSERT INTO organisations(name) VALUES('TSB tenant') RETURNING id`,[other]=await sql`INSERT INTO organisations(name) VALUES('Other tenant') RETURNING id`;
  const [north]=await sql`INSERT INTO garages(name,organisation_id) VALUES('North',${org.id}) RETURNING *`,[south]=await sql`INSERT INTO garages(name,organisation_id) VALUES('South',${org.id}) RETURNING *`,[foreign]=await sql`INSERT INTO garages(name,organisation_id) VALUES('Foreign',${other.id}) RETURNING *`;
  const baseState=g=>({schema:1,vehicles:[{id:g===north.id?'SG1':g===south.id?'SG2':'SG3',garage:g,modelType:'SG',model:'Synthetic',due:'2099-01-01'}],inspections:[],faults:[],reports:[],actions:[],jobs:[],checklistRuns:[],releaseEvents:[]});
  for(const g of [north,south,foreign])await sql`INSERT INTO garage_records(garage_id,data) VALUES(${g.id},${JSON.stringify(baseState(g.id))}::jsonb)`;
  const users={},cookies={};
  for(const [key,role,organisation,garage] of [['admin','organisation_admin',org.id,null],['manager','garage_manager',org.id,north.id],['worker','mechanic',org.id,north.id],['supervisor','supervisor',org.id,north.id],['south','mechanic',org.id,south.id],['foreign','organisation_admin',other.id,null]]){
   const token=randomToken(),[u]=await sql`INSERT INTO users(name,email,role,organisation_id,garage_id,password_hash) VALUES(${key},${key+'@tsb.test'},${role},${organisation},${garage},'synthetic-nonlogin-hash') RETURNING id`;users[key]=u.id;
   await sql`INSERT INTO sessions(token_hash,user_id,credential_version,expires_at) VALUES(${hash(token)},${u.id},1,now()+interval '1 hour')`;cookies[key]='__Host-fleettap_session='+token;
  }
  const call=async(fn,body,role='admin',query='',requestOrigin=origin)=>{const r=await fn(new Request(origin+'/.netlify/functions/test'+query,{method:body===null?'GET':'POST',headers:{origin:requestOrigin,'content-type':'application/json',cookie:cookies[role]||''},body:body===null?undefined:JSON.stringify(body)}),ctx);return {status:r.status,data:await r.json()};};
  const boot=async(role='admin',g=north.id)=>{const r=await call(workspace,null,role,'?garage='+g);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
  const save=async(values,kind='tsbs',role='admin')=>{const b=await boot();return call(content,{organisation_id:org.id,version:b.contentVersion,kind,values},role);};
  const write=async(action,values={},id,role='admin',g=north.id)=>{const b=await boot(role,g);return call(workspace,{garage:g,version:b.version,action,values,id},role);};
  const notice={title:'Part change',reference:'TSB-P1',sourceReference:'Maker P1',issuer:'Maker',type:'parts',parts:[{old:'OLD',replacement:'NEW',manufacturer:'Maker',description:'Actuator',stock:'quarantine'}],summary:'Updated component',action:'Use source-specified replacement',target:'model',targetModels:['SG'],effectiveDate:today(),status:'Published',approved:'yes'};
  for(const role of ['manager','worker','foreign'])assert.equal((await save(notice,'tsbs',role)).status,403);
  const published=await save(notice);assert.equal(published.status,200,JSON.stringify(published.data));const p=(await boot()).content.tsbs.find(x=>x.id===published.data.id);
  const forged={garage:north.id,instructionId:p.id,action:'acknowledge',values:{version:p.version,understood:'yes',userId:users.supervisor}};
  assert.equal((await call(learning,forged,'worker','','https://wrong.test')).status,403);
  assert.equal((await call(learning,{...forged,garage:foreign.id},'worker')).status,403);
  assert.equal((await write('start',{vehicle:'SG1'},null,'worker')).status,400);
  // Fault reporting is always available, but direct repair actions require the same completion as jobs.
  const faultBoot=await boot('worker');const fault=await call(workspace,{garage:north.id,version:faultBoot.version,action:'record',kind:'faults',values:{vehicle:'SG1',title:'Reported fault',description:'Evidence',type:'Mechanical'}},'worker');assert.equal(fault.status,200,JSON.stringify(fault.data));
  const initial=await boot();const state=initial.state;state.actions=[{id:'action-1',garage:north.id,vehicle:'SG1',status:'Open',assignedTo:users.worker,title:'Repair'}];await sql`UPDATE garage_records SET data=${JSON.stringify(state)}::jsonb WHERE garage_id=${north.id}`;
  assert.equal((await write('action',{evidence:'Repair complete'},'action-1','worker')).status,400);
  assert.equal((await write('action',{kind:'handover',evidence:'Waiting for instruction completion'},'action-1','worker')).status,200);assert.equal((await boot('worker')).state.actions.find(a=>a.id==='action-1').status,'Open');
  const ack=await call(learning,forged,'worker');assert.equal(ack.status,200,JSON.stringify(ack.data));assert.equal(ack.data.record.userId,users.worker);
  assert.equal((await write('action',{evidence:'Repair complete'},'action-1','worker')).status,200);
  assert.equal((await boot('supervisor')).state.instructionLearning.length,0);
  assert.equal((await call(status,null,'worker','?garage='+north.id)).status,403);
  const manager=await call(status,null,'manager','?garage='+north.id);assert.equal(manager.status,200);assert.deepEqual(manager.data.garages.map(g=>g.id),[north.id]);assert.ok(!manager.data.people.some(p=>p.id===users.south));
  const adminStatus=await call(status,null,'admin','?garage='+north.id);assert.equal(adminStatus.data.garages.length,2);assert.ok(adminStatus.data.people.some(p=>p.id===users.south));assert.ok(!JSON.stringify(adminStatus.data).includes('synthetic-nonlogin-hash'));
  // A moved person retains their organisation-wide completion but cannot access their old garage.
  await sql`UPDATE users SET garage_id=${south.id} WHERE id=${users.worker}`;
  assert.equal((await call(workspace,null,'worker','?garage='+north.id)).status,403);
  assert.equal((await write('start',{vehicle:'SG2'},null,'worker',south.id)).status,200);
  assert.equal((await boot('worker',south.id)).state.instructionLearning[0].completion.instructionId,p.id);
  await sql`UPDATE users SET garage_id=${north.id} WHERE id=${users.worker}`;
  // Full video lifecycle, using server-side fixture time only to avoid waiting in this isolated test.
  const training=await save({...notice,reference:'TSB-V1',parts:[{...notice.parts[0],old:'VOLD',replacement:'VNEW'}],completion:'video_quiz',video:'https://example.com/clip.mp4',videoSeconds:5,videoReviewed:'yes',quiz:[1,2,3].map(n=>({question:'Question '+n,options:['Unsafe','Approved'],correct:1,explanation:'Follow the approved method.'}))});assert.equal(training.status,200,JSON.stringify(training.data));
  const video=(await boot()).content.tsbs.find(x=>x.id===training.data.id),learn=async(action,values={})=>call(learning,{garage:north.id,instructionId:video.id,action,values:{version:video.version,...values}},'worker');
  assert.equal((await learn('acknowledge',{understood:'yes'})).status,400);assert.equal((await learn('quiz',{answers:[1,1,1]})).status,400);
  const start=await learn('video_begin');assert.equal(start.status,200);assert.equal((await learn('video_progress',{session:start.data.result.session,position:5})).status,400);
  const [raw]=await sql`SELECT data FROM instruction_learning WHERE user_id=${users.worker} AND instruction_id=${video.id}`;raw.data.session.at=new Date(Date.now()-6000).toISOString();await sql`UPDATE instruction_learning SET data=${JSON.stringify(raw.data)}::jsonb WHERE user_id=${users.worker} AND instruction_id=${video.id}`;
  assert.equal((await learn('video_progress',{session:start.data.result.session,position:5})).status,200);
  const failed=await learn('quiz',{answers:[0,0,0]});assert.equal(failed.data.result.passed,false);assert.equal((await learn('acknowledge',{understood:'yes'})).status,400);
  assert.equal((await learn('quiz',{answers:[1,1,1]})).data.result.passed,true);assert.equal((await learn('acknowledge',{understood:'yes'})).status,200);
  const safe=await boot('worker');assert.equal(safe.content.tsbs.find(x=>x.id===video.id).quiz[0].correct,undefined);assert.equal(safe.state.instructionLearning.find(x=>x.instructionId===video.id).completion.snapshot.quiz[0].correct,undefined);
  // Publication atomically seeds every affected garage; no acknowledgement removes the service hold.
  const before=await boot(),recall=await save({...notice,reference:'TSB-R1',type:'recall',recallMode:'stop',recallScope:'Manufacturer source identifies selected SG buses',remedy:'Replace and verify the affected component'});assert.equal(recall.status,200,JSON.stringify(recall.data));
  const current=await boot(),r=current.content.tsbs.find(x=>x.id===recall.data.id);assert.ok(current.version>before.version);assert.equal(current.state.recallCases.length,1);assert.equal((await boot('admin',south.id)).state.recallCases.length,1);assert.equal((await boot('foreign',foreign.id)).state.recallCases?.length||0,0);assert.ok(current.state.releaseStatuses.SG1.blockers.some(t=>t.includes('Safety recall')));const recallStatus=await call(status,null,'manager','?garage='+north.id);assert.equal(recallStatus.data.recallCases.length,1);assert.equal(recallStatus.data.recallCases[0].vehicle,'SG1');assert.equal(recallStatus.data.recallCases[0].snapshot,undefined);
  const rv={vehicle:'SG1',bulletinId:r.id,version:r.version,notes:'Manufacturer repair record checked',completedDate:today(),reference:'Repair 88'};
  assert.equal((await write('recall_report',rv,null,'worker')).status,400);assert.equal((await call(learning,{garage:north.id,instructionId:r.id,action:'acknowledge',values:{version:r.version,understood:'yes'}},'worker')).status,200);
  assert.equal((await write('recall_report',rv,null,'worker')).status,200);assert.equal((await write('recall_verify',{...rv,confirm:'yes'},null,'worker')).status,400);
  for(const x of [p,video,r]){if(x.id===video.id)continue;await call(learning,{garage:north.id,instructionId:x.id,action:'acknowledge',values:{version:x.version,understood:'yes'}},'supervisor');}
  // Supervisor must complete the training as well; seed a valid server-completion fixture for the unrelated quiz requirement.
  const workerTraining=(await sql`SELECT data FROM instruction_learning WHERE user_id=${users.worker} AND instruction_id=${video.id}`)[0].data;workerTraining.userId=users.supervisor;workerTraining.completion.userId=users.supervisor;
  await sql`INSERT INTO instruction_learning(organisation_id,user_id,instruction_id,version,data) VALUES(${org.id},${users.supervisor},${video.id},${video.version},${JSON.stringify(workerTraining)}::jsonb)`;
  assert.equal((await write('recall_verify',{...rv,confirm:'yes'},null,'supervisor')).status,200);
  const verified=await boot();assert.equal(verified.state.recallCases[0].status,'Verified');assert.ok(!verified.state.releaseStatuses.SG1.blockers.some(t=>t.includes('Safety recall')));assert.notEqual(verified.state.releaseStatuses.SG1.status,'Released for service');
  assert.equal((await write('recall_reopen',rv,null,'supervisor')).status,200);assert.ok((await boot('worker')).state.releaseStatuses.SG1.blockers.some(t=>t.includes('Safety recall')));
  const transfer=await write('vehicle_transfer',{garage:south.id,reason:'Route transfer',confirm:'yes'},'SG1');assert.equal(transfer.status,200,JSON.stringify(transfer.data));assert.ok((await boot('admin',south.id)).state.recallCases.some(c=>c.vehicle==='SG1'&&c.status==='Work required'));
  await sql`UPDATE users SET active=false,credential_version=credential_version+1 WHERE id=${users.worker}`;assert.equal((await learn('acknowledge',{understood:'yes'})).status,401);
 }finally{await (await import('../server/runtime.mjs')).closeDatabase();await client.pool.end();await local.stop();}
});
