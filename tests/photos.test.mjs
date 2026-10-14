import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePhoto,validateAttachments} from '../server/photos.mjs';
test('photo upload rejects unsupported content and oversize data',()=>{
 const jpeg=new Uint8Array(20);jpeg.set([255,216,255]);assert.doesNotThrow(()=>validatePhoto(jpeg,'image/jpeg'));
 assert.throws(()=>validatePhoto(jpeg,'image/svg+xml'));assert.throws(()=>validatePhoto(new Uint8Array(20),'image/jpeg'));assert.throws(()=>validatePhoto(new Uint8Array(2*1024*1024+1),'image/jpeg'));
});
test('photo attachment requires valid IDs, matching garage and uploader',async()=>{
 const id='11111111-1111-4111-8111-111111111111',user={id:'user-a'};let metadata={garage:'garage-a',uploader:'user-a'},keys=[];
 const store={getMetadata:async key=>{keys.push(key);return {metadata};}};
 assert.deepEqual(await validateAttachments([id],'garage-a',user,store),[id]);assert.equal(keys[0],'garage-a/'+id);
 metadata={garage:'garage-b',uploader:'user-a'};await assert.rejects(validateAttachments([id],'garage-a',user,store));
 metadata={garage:'garage-a',uploader:'user-b'};await assert.rejects(validateAttachments([id],'garage-a',user,store));
 await assert.rejects(validateAttachments(['../other'],'garage-a',user,store));await assert.rejects(validateAttachments(Array(4).fill(id),'garage-a',user,store));
 await assert.rejects(validateAttachments([id],'garage-a',user,{getMetadata:async()=>null}));
});
