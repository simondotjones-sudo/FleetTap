import test from 'node:test';
import assert from 'node:assert/strict';
import {NetlifyDB} from '@netlify/database-dev';
import {copyDatabase} from '../scripts/copy-database.mjs';
import {hashPassword} from '../server/security.mjs';

test('data copy preserves account hashes, garage records and audit IDs; refuses a nonempty target',async()=>{
 const source=new NetlifyDB({logger:()=>{}}),target=new NetlifyDB({logger:()=>{}});
 const sourceUrl=await source.start(),targetUrl=await target.start();
 try{
  await source.applyMigrations('./netlify/database/migrations');await target.applyMigrations('./netlify/database/migrations');
  const {rows:[org]}=await source.query("INSERT INTO organisations(name) VALUES('Test organisation') RETURNING id");
  const {rows:[garage]}=await source.query("INSERT INTO garages(name,organisation_id) VALUES('Test garage',$1) RETURNING id",[org.id]);
  const hash=await hashPassword('Synthetic migration password');
  const {rows:[user]}=await source.query("INSERT INTO users(email,name,role,password_hash,bootstrap) VALUES('copy@test.invalid','Test admin','platform_admin',$1,true) RETURNING id",[hash]);
  await source.query('INSERT INTO garage_records(garage_id,version,data) VALUES($1,7,$2::jsonb)',[garage.id,JSON.stringify({schema:1,vehicles:[{id:'TEST-1',garage:garage.id}],inspections:[],faults:[],reports:[],actions:[]})]);
  await source.query("INSERT INTO audit_events(id,actor_id,action) OVERRIDING SYSTEM VALUE VALUES(30,$1,'test_import')",[user.id]);
  const counts=await copyDatabase({sourceUrl,targetUrl,targetKind:'preview'});assert.equal(counts.users,1);
  const {rows:[copied]}=await target.query('SELECT password_hash,bootstrap FROM users');assert.equal(copied.password_hash,hash);assert.equal(copied.bootstrap,true);
  const {rows:[records]}=await target.query('SELECT version,data FROM garage_records');assert.equal(records.version,7);assert.equal(records.data.vehicles[0].id,'TEST-1');
  const {rows:[event]}=await target.query("INSERT INTO audit_events(action) VALUES('after_import') RETURNING id");assert.equal(Number(event.id),31);
  await assert.rejects(copyDatabase({sourceUrl,targetUrl,targetKind:'preview'}),/not empty/);
  await assert.rejects(copyDatabase({sourceUrl,targetUrl,targetKind:'production'}),/explicitly confirm/);
 }finally{await source.stop();await target.stop();}
});
