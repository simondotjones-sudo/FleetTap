import test from 'node:test';
import assert from 'node:assert/strict';
import {endpoint,appOrigin,databaseProvider,body,json} from '../server/runtime.mjs';

test('hosted deployment context selects preview database and isolates concurrent origins without build env vars',async()=>{
 delete process.env.CONTEXT;delete process.env.DEPLOY_PRIME_URL;delete process.env.FLEETTAP_DATABASE_PROVIDER;
 process.env.NETLIFY_DB_URL='postgres://local-test-only';process.env.FLEETTAP_APP_ORIGIN='https://fleet-tap.com';
 const handler=endpoint(async req=>{await Promise.resolve();await body(req);return json({origin:appOrigin(),provider:databaseProvider()});});
 const request=(url,origin=url)=>new Request(url+'/.netlify/functions/test',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});
 const preview={deploy:{context:'deploy-preview'}};
 const responses=await Promise.all(['https://deploy-preview-2--fleettap.netlify.app','https://deploy-preview-3--fleettap.netlify.app'].map(async url=>{
  const response=await handler(request(url),preview);assert.equal(response.status,200);return response.json();
 }));
 assert.deepEqual(responses,[{origin:'https://deploy-preview-2--fleettap.netlify.app',provider:'netlify'},{origin:'https://deploy-preview-3--fleettap.netlify.app',provider:'netlify'}]);
 assert.equal((await handler(request('https://deploy-preview-2--fleettap.netlify.app','https://foreign.example'),preview)).status,403);
 const production={deploy:{context:'production'}};
 assert.deepEqual(await (await handler(request('https://fleet-tap.com'),production)).json(),{origin:'https://fleet-tap.com',provider:'neon'});
 assert.equal((await handler(request('https://fleettap.netlify.app'),production)).status,403);
 delete process.env.NETLIFY_DB_URL;
 assert.equal((await handler(request('https://deploy-preview-2--fleettap.netlify.app'),preview)).status,503);
});
