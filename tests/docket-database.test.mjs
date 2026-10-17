import test from 'node:test';
import assert from 'node:assert/strict';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {hash,randomToken} from '../server/security.mjs';
import {endpoint,closeDatabase} from '../server/runtime.mjs';
import {makeDocketHandler} from '../netlify/functions/driver-docket.mjs';

test('docket endpoint enforces sessions, garage scope, origin, method and revoked access before retaining AI output',async()=>{
 const local=new NetlifyDB({logger:()=>{}}),url=await local.start();process.env.NETLIFY_DB_URL=url;process.env.NETLIFY_DB_DRIVER='server';delete process.env.CONTEXT;
 const client=getDatabase({connectionString:url}),sql=client.sql,origin='https://docket.test',ctx={deploy:{context:'deploy-preview'}};
 try{
  await local.applyMigrations('./netlify/database/migrations');
  const [org]=await sql`INSERT INTO organisations(name) VALUES('Docket test') RETURNING id`,[g]=await sql`INSERT INTO garages(name,organisation_id) VALUES('North',${org.id}) RETURNING id`,[other]=await sql`INSERT INTO garages(name,organisation_id) VALUES('South',${org.id}) RETURNING id`;
  const [user]=await sql`INSERT INTO users(email,name,role,organisation_id,garage_id) VALUES('worker@test.invalid','Docket worker','mechanic',${org.id},${g.id}) RETURNING id`;
  const token=randomToken();await sql`INSERT INTO sessions(token_hash,user_id,credential_version,expires_at) VALUES(${hash(token)},${user.id},1,now()+interval '1 hour')`;
  await sql`INSERT INTO garage_records(garage_id,data) VALUES(${g.id},${JSON.stringify({vehicles:[{id:'SG271',garage:g.id}],faults:[],actions:[]})}::jsonb)`;
  const photo=crypto.randomUUID(),saved=new Map();let calls=0,revoke=false;
  const photos={getMetadata:async()=>({metadata:{garage:g.id,uploader:user.id}}),getWithMetadata:async()=>({metadata:{garage:g.id,uploader:user.id},data:Uint8Array.from([255,216,255,224,0,0,0,0,0,0,0,0]).buffer})};
  const scan=endpoint(makeDocketHandler({apiKey:'synthetic-test-key',photoStore:()=>photos,docketStore:()=>({setJSON:async(k,v)=>saved.set(k,v)}),fetchImpl:async()=>{
   calls++;if(revoke)await sql`UPDATE users SET credential_version=credential_version+1 WHERE id=${user.id}`;
   return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({isDocket:true,multipleDockets:false,vehicleUnclear:false,fleetNumber:'SG271',registration:'',reference:'TEST-1',reportedDate:'17/10/26',driver:'',route:'',type:'Lights & electrics',description:'Offside indicator does not illuminate.',immediate:'',warnings:[]})}]}]});
  }}));
  const call=({garage=g.id,cookie='__Host-fleettap_session='+token,requestOrigin=origin,method='POST',ids=[photo]}={})=>scan(new Request(origin+'/.netlify/functions/driver-docket',{method,headers:{origin:requestOrigin,'content-type':'application/json',cookie},body:method==='POST'?JSON.stringify({garage,photos:ids}):undefined}),ctx);
  assert.equal((await call({cookie:''})).status,401);assert.equal((await call({garage:other.id})).status,403);assert.equal((await call({requestOrigin:'https://foreign.test'})).status,403);assert.equal((await call({method:'GET'})).status,405);assert.equal((await call({ids:Array(4).fill(photo)})).status,400);assert.equal(calls,0);
  const result=await call();assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/private, no-store/);const body=await result.json();assert.equal(body.vehicle,'SG271');assert.equal(saved.size,1);assert.equal(saved.get(g.id+'/'+body.id).uploader,user.id);
  const [row]=await sql`SELECT data FROM garage_records WHERE garage_id=${g.id}`;assert.equal(row.data.faults.length,0);assert.equal(row.data.actions.length,0);
  revoke=true;assert.equal((await call()).status,401);assert.equal(saved.size,1);
 }finally{await closeDatabase();await client.pool.end();await local.stop();}
});
