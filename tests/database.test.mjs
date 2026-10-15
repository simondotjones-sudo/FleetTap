import test from 'node:test';
import assert from 'node:assert/strict';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {randomToken,hashPassword} from '../server/security.mjs';

test('isolated Netlify Database: migrations, login, role/garage checks, CAS, protected PDF and all new commands',async()=>{
 const local=new NetlifyDB({logger:()=>{}}),url=await local.start();
 // This test never reads or connects to a hosted database.
 process.env.NETLIFY_DB_URL=url;process.env.FLEETTAP_DATABASE_PROVIDER='netlify';process.env.NETLIFY_DB_DRIVER='server';
 delete process.env.CONTEXT;delete process.env.DEPLOY_PRIME_URL;delete process.env.FLEETTAP_DATABASE_PROVIDER;
 const functionContext={ip:'local',deploy:{context:'deploy-preview'}};
 const client=getDatabase({connectionString:url});
 try{
  await local.applyMigrations('./netlify/database/migrations');
  const sql=client.sql,auth=(await import('../netlify/functions/auth.mjs')).default,workspace=(await import('../netlify/functions/workspace.mjs')).default,docs=(await import('../netlify/functions/documents.mjs')).default;
  const [org]=await sql`INSERT INTO organisations(name) VALUES('Isolated test') RETURNING id`;
  const [g]=await sql`INSERT INTO garages(name,organisation_id) VALUES('North',${org.id}) RETURNING id`;
  const [other]=await sql`INSERT INTO garages(name,organisation_id) VALUES('South',${org.id}) RETURNING id`;
  await sql`INSERT INTO garage_records(garage_id) VALUES(${g.id})`;
  const password=randomToken(),hash=await hashPassword(password);
  await sql`INSERT INTO users(email,name,role,organisation_id,garage_id,password_hash) VALUES('admin@test.invalid','Test admin','garage_manager',${org.id},${g.id},${hash}),('staff@test.invalid','Test staff','mechanic',${org.id},${g.id},${hash})`;
  await sql`INSERT INTO users(email,name,role,organisation_id,password_hash) VALUES('org@test.invalid','Org admin','organisation_admin',${org.id},${hash})`;
  const origin='https://isolated.fleettap.test';
  async function call(fn,body,cookie='',query='',extra={}){const r=await fn(new Request(origin+'/.netlify/functions/test'+query,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json',cookie,...extra},body:body?JSON.stringify(body):undefined}),functionContext);return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  const admin=await call(auth,{action:'login',email:'admin@test.invalid',password});assert.equal(admin.status,200);const staff=await call(auth,{action:'login',email:'staff@test.invalid',password});assert.equal(staff.status,200);
  const orgAdmin=await call(auth,{action:'login',email:'org@test.invalid',password});assert.equal(orgAdmin.status,200);
  let version=0;
  const write=async(action,values={},extra={},cookie=admin.cookie)=>{const r=await call(workspace,{action,garage:g.id,version,values,...extra},cookie);if(r.status===200)version=r.data.version;return r;};
  assert.equal((await call(workspace)).status,401);
  assert.equal((await call(workspace,null,staff.cookie,'?garage='+other.id)).status,403);
  assert.equal((await write('vehicle',{id:'BUS-1',model:'SG271+'})).status,200);
  for(const action of ['vehicle_edit','inspection_manage','template_edit','schedule'])assert.equal((await write(action,{}, {},staff.cookie)).status,403);
  assert.equal((await write('vehicle_edit',{id:'BUS-2',name:'Test bus',model:'SG271+',registration:'TEST'},{id:'BUS-1'})).status,200);
  assert.equal((await write('schedule',{vehicle:'BUS-2',interval:1,unit:'months',firstDue:'2026-10-31'})).status,200);
  assert.equal((await write('schedule',{scope:'model',modelType:'SG',interval:1,unit:'months',basis:'history',firstDue:'2026-10-31',replaceOverrides:true})).status,200);
  const modelRead=await call(workspace,null,admin.cookie);
  assert.equal(modelRead.data.state.modelSchedules[0].modelType,'SG');
  assert.ok(modelRead.data.state.schedules[0].supersededAt);
  assert.equal((await write('schedule',{scope:'model',modelType:'SG',interval:1,unit:'months',firstDue:'2026-10-31'},{},staff.cookie)).status,403);
  assert.equal((await write('vehicle',{id:'SG900',model:'Bus',modelType:'SG'})).status,200);
  assert.equal((await write('vehicle',{id:'BAD',model:'Bus',modelType:'BAD'})).status,400);
  const started=await write('start',{vehicle:'BUS-2'},{},staff.cookie);assert.equal(started.status,200);const id=started.data.result.id;assert.match(started.data.result.craftworker,/Test staff/);
  assert.equal((await write('template_edit',{operation:'question',id:'1-2',question:'New wording',instruction:'Full source instruction',section:'Brake Test',page:1},{},orgAdmin.cookie)).status,200);
  const stale=await call(workspace,{action:'vehicle',garage:g.id,version:version-1,values:{id:'STALE',model:'Bus'}},admin.cookie);assert.equal(stale.status,409);
  assert.equal((await write('inspection_manage',{operation:'notes',notes:'Corrected',reason:'Correcting the notes'},{id})).status,200);
  const before=await call(workspace,null,admin.cookie);
  const race=await Promise.all([call(workspace,{action:'vehicle',garage:g.id,version,values:{id:'RACE-1',model:'Bus'}},admin.cookie),call(workspace,{action:'vehicle',garage:g.id,version,values:{id:'RACE-2',model:'Bus'}},admin.cookie)]);
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);version=race.find(r=>r.status===200).data.version;
  const pdf=Buffer.from('%PDF-1.4\nTest document\n%%EOF');
  async function upload(cookie,ver=version,requestOrigin=origin){return docs(new Request(origin+'/.netlify/functions/documents?'+new URLSearchParams({garage:g.id,version:String(ver),name:'Original.pdf'}),{method:'POST',headers:{origin:requestOrigin,'content-type':'application/pdf',cookie},body:pdf}),functionContext);}
  assert.equal((await upload(staff.cookie)).status,403);assert.equal((await upload(orgAdmin.cookie,version,'https://foreign.invalid')).status,403);
  assert.equal((await upload(admin.cookie)).status,403);
  const uploaded=await upload(orgAdmin.cookie);assert.equal(uploaded.status,201);const document=await uploaded.json();version=document.version;
  const getDoc=(cookie,garage=g.id)=>docs(new Request(origin+'/.netlify/functions/documents?'+new URLSearchParams({garage,id:document.id}),{headers:{cookie}}),functionContext);
  assert.equal((await getDoc(staff.cookie)).status,200);assert.equal((await getDoc(admin.cookie,other.id)).status,403);
  const downloaded=await getDoc(admin.cookie);assert.equal(downloaded.status,200);assert.equal(await downloaded.text(),pdf.toString());assert.match(downloaded.headers.get('cache-control'),/no-store/);
  assert.equal((await upload(orgAdmin.cookie,version-1)).status,409);
  assert.equal((await write('inspection_manage',{operation:'delete',reason:'Duplicate test record'},{id})).status,200);
  assert.equal((await write('answer',{result:'OK',notes:'',readings:[]},{id,item:'1-2'},staff.cookie)).status,400);
  assert.equal((await write('inspection_manage',{operation:'restore',reason:'Restore test record'},{id})).status,200);
  const read=await call(workspace,null,admin.cookie);assert.equal(read.data.state.inspections[0].templateSnapshot.tasks.find(t=>t.id==='1-2').question,undefined);
  assert.ok(read.data.state.inspectionTemplate.sourceId);assert.equal(read.data.state.inspections[0].templateSnapshot.sourceId,null);
  const [audits]=await sql`SELECT count(*)::integer AS count FROM audit_events WHERE garage_id=${g.id}`;assert.ok(audits.count>=9);
 }finally{await (await import('../server/runtime.mjs')).closeDatabase();await client.pool.end();await local.stop();}
});
