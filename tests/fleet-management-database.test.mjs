import test from 'node:test';
import assert from 'node:assert/strict';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {randomToken,hashPassword} from '../server/security.mjs';
import pg from 'pg';
// NetlifyDB emulates one PostgreSQL session. Keep its application pool on one
// connection so concurrent requests cannot interleave BEGIN/ROLLBACK on that session.
const NativePool=pg.Pool;pg.Pool=class extends NativePool{constructor(options){super({...options,max:1});}};
import {roleKeys} from '../src/roles.js';
import {scheduleStatus} from '../src/scheduling.js';

test('organisation fleet controls: role fences, shared cadence, future garages and atomic transfers',async()=>{
 const local=new NetlifyDB({logger:()=>{}}),url=await local.start();process.env.NETLIFY_DB_URL=url;process.env.NETLIFY_DB_DRIVER='server';delete process.env.CONTEXT;
 const client=getDatabase({connectionString:url}),sql=client.sql,ctx={ip:'fleet-test',deploy:{context:'deploy-preview'}},origin='https://fleet-controls.test';
 try{
  await local.applyMigrations('./netlify/database/migrations');
  const auth=(await import('../netlify/functions/auth.mjs')).default,workspace=(await import('../netlify/functions/workspace.mjs')).default,admin=(await import('../netlify/functions/admin.mjs')).default,docs=(await import('../netlify/functions/documents.mjs')).default;
  const [org]=await sql`INSERT INTO organisations(name) VALUES('Fleet controls') RETURNING *`,[other]=await sql`INSERT INTO organisations(name) VALUES('Other tenant') RETURNING *`;
  const [north]=await sql`INSERT INTO garages(name,organisation_id) VALUES('North',${org.id}) RETURNING *`,[south]=await sql`INSERT INTO garages(name,organisation_id) VALUES('South',${org.id}) RETURNING *`,[foreign]=await sql`INSERT INTO garages(name,organisation_id) VALUES('Foreign',${other.id}) RETURNING *`;
  await sql`INSERT INTO garage_records(garage_id) VALUES(${north.id}),(${south.id}),(${foreign.id})`;
  const call=async(fn,b,cookie='',query='')=>{const r=await fn(new Request(origin+'/.netlify/functions/test'+query,{method:b?'POST':'GET',headers:{origin,'content-type':'application/json',cookie},body:b?JSON.stringify(b):undefined}),ctx);return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const password=randomToken(),encoded=await hashPassword(password),cookies={},users={};
  for(const role of roleKeys){const [u]=await sql`INSERT INTO users(name,email,role,organisation_id,garage_id,password_hash) VALUES(${role},${role+'@fleet.test'},${role},${role==='platform_admin'?null:org.id},${['platform_admin','organisation_admin'].includes(role)?null:north.id},${encoded}) RETURNING id`;users[role]=u.id;const login=await call(auth,{action:'login',identifier:role+'@fleet.test',password});assert.equal(login.status,200);cookies[role]=login.cookie;}
  const read=async(g=north.id,role='organisation_admin')=>(await call(workspace,null,cookies[role],'?garage='+g)).data;
  const write=async(action,values={},extra={},role='organisation_admin',g=north.id)=>{const r=await read(g,role);return call(workspace,{action,garage:g,version:r.version,contentVersion:r.contentVersion,values,...extra},cookies[role]);};
  const rule={scope:'model',modelType:'SG',interval:4,unit:'weeks',basis:'first',firstDue:'2026-11-01',enabled:true};
  for(const role of roleKeys.filter(r=>r!=='organisation_admin'))for(const values of [rule,{...rule,scope:'bus',vehicle:'SG1'},{...rule,scope:'all'},{operation:'inherit',vehicle:'SG1'}])assert.equal((await write('schedule',values,{},role)).status,403,role+':'+values.scope);
  for(const g of [north.id,south.id])assert.equal((await write('vehicle',{id:g===north.id?'SG1':'SG2',model:'Bus',modelType:'SG'},{},'organisation_admin',g)).status,200);
  assert.equal((await write('vehicle',{id:'SG3',model:'Bus',modelType:'SG',due:'2028-01-01'},{},'garage_manager')).status,403);
  assert.equal((await write('vehicle_edit',{id:'SG1',model:'Bus',modelType:'PA'},{id:'SG1'},'garage_manager')).status,403);
  assert.equal((await write('vehicle_edit',{id:'SG1',model:'Corrected name',registration:'REG'},{id:'SG1'},'garage_manager')).status,200);
  assert.equal((await write('schedule',{...rule,scope:'bus',vehicle:'SG2',interval:2},{},'organisation_admin',south.id)).status,200);
  const ruleSave=await write('schedule',rule);assert.equal(ruleSave.status,200,JSON.stringify(ruleSave.data));assert.equal(ruleSave.data.result.garages,2);
  assert.equal((await read(south.id)).state.modelSchedules[0].interval,4);assert.equal(scheduleStatus((await read(south.id)).state,south.id,'SG2').schedule.interval,2);assert.equal((await read(foreign.id,'platform_admin')).state.modelSchedules?.length||0,0);
  const before=await read();assert.equal((await write('schedule',{...rule,interval:6},{contentVersion:before.contentVersion-1})).status,409);
  const created=await call(admin,{action:'garage',organisation_id:org.id,name:'New garage'},cookies.organisation_admin);assert.equal(created.status,200,JSON.stringify(created.data));
  const [newGarage]=await sql`SELECT id FROM garages WHERE name='New garage' AND organisation_id=${org.id}`;
  assert.equal((await read(newGarage.id)).state.modelSchedules[0].interval,4);
  assert.equal((await write('schedule',{...rule,interval:5,replaceOverrides:true})).status,200);assert.equal(scheduleStatus((await read(south.id)).state,south.id,'SG2').schedule.interval,5);
  // Seed full linked evidence in this isolated database, including a private source PDF.
  const source=await read(),photo=crypto.randomUUID(),doc=crypto.randomUUID(),at='2026-10-17T10:00:00Z',s=source.state;
  s.vehicles[0].warrantyStart='2024-01-01';s.vehicles[0].warrantyExtendedUntil='2028-01-01';
  s.inspections=[{id:'inspection',garage:north.id,vehicle:'SG1',templateId:'pm3',template:'PM3',status:'In progress',created:at,answers:{},audit:[],templateSnapshot:{version:1,tasks:[],sourceId:doc}}];
  s.faults=[{id:'fault',garage:north.id,vehicle:'SG1',title:'Door fault',status:'Open',photos:[photo],audit:[]}];s.reports=[{id:'report',garage:north.id,vehicle:'SG1',title:'Report',status:'Closed',audit:[]}];
  s.actions=[{id:'action',garage:north.id,source:'fault',title:'Repair door',status:'Open',assignedTo:users.mechanic,owner:'Mechanic',audit:[]}];
  s.jobs=[{id:'job',garage:north.id,vehicle:'SG1',title:'Repair door',type:'Repair',status:'In progress',assigneeId:users.mechanic,assigneeName:'Mechanic',date:'2026-10-16',time:'10:00',faultId:'fault',audit:[]}];
  s.downtime=[{id:'downtime',garage:north.id,vehicle:'SG1',startedAt:at,reason:'Door repair',audit:[]}];s.checklistRuns=[];
  await sql`UPDATE garage_records SET data=${JSON.stringify(s)}::jsonb WHERE garage_id=${north.id}`;
  await sql`INSERT INTO inspection_documents(id,garage_id,name,content,uploaded_by) VALUES(${doc},${north.id},'Source.pdf',${Buffer.from('%PDF-1.4 test').toString('base64')},${users.organisation_admin})`;
  const values={garage:south.id,reason:'Route allocation changed',confirm:'yes'},extra={id:'SG1'};
  for(const role of roleKeys.filter(r=>r!=='organisation_admin'))assert.equal((await write('vehicle_transfer',values,extra,role)).status,403);
  assert.equal((await write('vehicle_transfer',{...values,garage:foreign.id},extra)).status,403);
  assert.equal((await write('vehicle_transfer',{...values,garage:north.id},extra)).status,400);
  assert.equal((await write('vehicle_transfer',{...values,confirm:''},extra)).status,400);
  // Force a failure on the second garage write: the first write must roll back too.
  const beforeRollback=[await read(),await read(south.id)];
  await sql`CREATE TABLE fleet_test_failure(garage_id uuid PRIMARY KEY)`;
  await sql`INSERT INTO fleet_test_failure VALUES(${[north.id,south.id].sort().at(-1)})`;
  await sql`CREATE FUNCTION reject_test_transfer() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN IF NEW.data ? ''vehicleTransfers'' AND NEW.garage_id IN (SELECT garage_id FROM fleet_test_failure) THEN RAISE EXCEPTION ''test transfer rollback''; END IF; RETURN NEW; END'`;
  await sql`CREATE TRIGGER reject_test_transfer BEFORE UPDATE ON garage_records FOR EACH ROW EXECUTE FUNCTION reject_test_transfer()`;
  const failed=await write('vehicle_transfer',values,extra);assert.equal(failed.status,500);
  assert.deepEqual([await read(),await read(south.id)],beforeRollback);
  await sql`DROP TRIGGER reject_test_transfer ON garage_records`;await sql`DROP FUNCTION reject_test_transfer()`;await sql`DROP TABLE fleet_test_failure`;
  const src=await read(),dst=await read(south.id),due=scheduleStatus(src.state,north.id,'SG1').due;
  const request={action:'vehicle_transfer',garage:north.id,version:src.version,values,...extra};
  const race=await Promise.all([call(workspace,request,cookies.organisation_admin),call(workspace,request,cookies.organisation_admin)]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  const departure=await read(),arrival=await read(south.id);assert.equal(departure.version,src.version+1,'source transfer version');assert.equal(arrival.version,dst.version+1,'destination transfer version');assert.equal(departure.state.vehicles.length,0);assert.equal(arrival.state.vehicles.length,2);assert.equal(arrival.state.vehicles.find(v=>v.id==='SG1').warrantyExtendedUntil,'2028-01-01');
  assert.equal(scheduleStatus(arrival.state,south.id,'SG1').due,due);assert.equal(arrival.state.jobs[0].status,'Unassigned');assert.equal(arrival.state.jobs[0].assigneeId,null);assert.equal(arrival.state.actions[0].assignedTo,null);assert.equal(arrival.state.attachmentOrigins.photos[photo],north.id);assert.equal(arrival.state.attachmentOrigins.documents[doc],north.id);assert.equal(departure.state.vehicleTransferArchive[0].state.jobs[0].status,'In progress');assert.equal((await read(north.id,'mechanic')).state.vehicleTransferArchive.length,0);
  assert.equal((await write('vehicle_edit',{id:'SG1',model:'Stale'},{id:'SG1'},'garage_manager')).status,400);
  const getDoc=(g,role)=>docs(new Request(origin+'/.netlify/functions/documents?'+new URLSearchParams({garage:g,id:doc}),{headers:{cookie:cookies[role]}}),ctx);
  const movedDoc=await getDoc(south.id,'organisation_admin');assert.equal(movedDoc.status,200);assert.equal(await movedDoc.text(),'%PDF-1.4 test');assert.equal((await getDoc(south.id,'garage_manager')).status,403);assert.equal((await getDoc(foreign.id,'platform_admin')).status,404);
  // A stale destination write cannot overwrite the transferred records.
  assert.equal((await call(workspace,{action:'vehicle',garage:south.id,version:dst.version,values:{id:'STALE',model:'Bus'}},cookies.organisation_admin)).status,409);
  const [audits]=await sql`SELECT count(*)::integer AS count FROM audit_events WHERE action='vehicle_transfer'`;assert.equal(audits.count,2);
  // Reassignment is constrained to the destination garage and clears the handover flag.
  assert.equal((await write('job_plan',{date:'2026-10-17',assigneeId:users.mechanic},{id:'job'},'organisation_admin',south.id)).status,403);
  const planned=await write('job_plan',{date:'2026-10-17',assigneeId:''},{id:'job'},'organisation_admin',south.id);assert.equal(planned.status,200);assert.equal(planned.data.state.jobs[0].transferReview,undefined);
 }finally{await (await import('../server/runtime.mjs')).closeDatabase();await client.pool.end();await local.stop();}
});
