import {getDatabase} from '@netlify/database';
import {env,actor,body,json,endpoint,fail,withActorTransaction} from '../../server/runtime.mjs';
import {roadmapSeeds,validateBrief} from '../../src/roadmap-data.js';
// New platform planning data uses managed Netlify Database independently of the legacy fleet-data cutover.
let managed;
const roadmapSQL=()=> (managed??=getDatabase(env('NETLIFY_DB_URL')?{connectionString:env('NETLIFY_DB_URL')}:undefined)).sql;
export async function closeRoadmapDatabase(){if(managed){await managed.pool.end();managed=undefined;}}
export default endpoint(async req=>{
 const u=await actor(req);if(u.role!=='platform_admin')fail('Platform Admin access required.',403);
 if(req.method==='GET'){
 const rows=await roadmapSQL()`SELECT id,data,version,updated_at FROM product_roadmap`;
 return json({features:roadmapSeeds.map(seed=>{const row=rows.find(r=>r.id===seed.id);return row?{...seed,...row.data,version:row.version,updatedAt:row.updated_at}:seed;})});
 }
 const b=await body(req),seed=roadmapSeeds.find(f=>f.id===b.id);
 if(!seed||!Number.isSafeInteger(b.version)||b.version<0)fail('Invalid feature or version.');
 if(!['brief','feedback'].includes(b.action))fail('Invalid roadmap action.');
 let values;if(b.action==='brief'){try{values=validateBrief(b.values);}catch(e){fail(e.message);}}
 else if(typeof b.note!=='string'||!b.note.trim()||b.note.length>4000)fail('Enter feedback (maximum 4000 characters).');
 return withActorTransaction(u,async()=>{
 const sql=roadmapSQL();await sql`INSERT INTO product_roadmap(id,data) VALUES(${seed.id},${JSON.stringify(seed)}::jsonb) ON CONFLICT DO NOTHING`;
 const [row]=await sql`SELECT data,version FROM product_roadmap WHERE id=${seed.id}`;
 if(row.version!==b.version)fail('This feature changed in another session. Copy your unsaved text, then reload the page before saving.',409);
 const data={...row.data,updatedBy:u.name};if(values)Object.assign(data,values);else data.feedback=[...(data.feedback||[]),{note:b.note.trim(),author:u.name,at:new Date().toISOString()}];
 const [saved]=await sql`UPDATE product_roadmap SET data=${JSON.stringify(data)}::jsonb,version=version+1,updated_at=now() WHERE id=${seed.id} AND version=${b.version} RETURNING version,updated_at`;
 if(!saved)fail('This feature changed in another session. Copy your unsaved text, then reload the page before saving.',409);
 return json({feature:{...seed,...data,version:saved.version,updatedAt:saved.updated_at}});
 });
});
