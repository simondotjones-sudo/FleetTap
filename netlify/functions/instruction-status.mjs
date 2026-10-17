import {db,actor,garageFor,endpoint,fail,json} from '../../server/runtime.mjs';
import {manager} from '../../src/roles.js';
import {publicBulletin,publishedBulletins} from '../../src/bulletins.js';
import {instructionData} from '../../server/instruction-data.mjs';

export default endpoint(async req=>{
 if(req.method!=='GET')fail('Method not allowed.',405);
 const u=await actor(req);if(!manager(u))fail('Manager access required.',403);
 const g=await garageFor(u,new URL(req.url).searchParams.get('garage')),sql=db(),all=['organisation_admin','platform_admin'].includes(u.role);
 const garages=await sql`SELECT id,name FROM garages WHERE organisation_id=${g.organisation_id} AND (${all} OR id=${g.id}) ORDER BY name`;
 const records=await sql`SELECT r.garage_id,r.data->'vehicles' AS vehicles,r.data->'recallCases' AS recall_cases FROM garage_records r JOIN garages g ON g.id=r.garage_id WHERE g.organisation_id=${g.organisation_id} AND (${all} OR g.id=${g.id})`;
 const [content]=await sql`SELECT data FROM organisation_content WHERE organisation_id=${g.organisation_id}`;
 const learning=await instructionData(sql,g.organisation_id,u,g.id);
 return json({garages,recallCases:records.flatMap(r=>(r.recall_cases||[]).map(({garage,vehicle,bulletinId,version})=>({garage,vehicle,bulletinId,version}))),people:learning.instructionTeam,buses:records.flatMap(r=>(r.vehicles||[]).map(({id,garage,model,modelType,audit})=>({id,garage,model,modelType,audit:(audit||[]).map(a=>({previous:a.previous?.id?{id:a.previous.id}:undefined}))}))),bulletins:publishedBulletins(content?.data).map(x=>publicBulletin(x)),learning:learning.instructionLearning.map(({userId,instructionId,version,watchedSeconds,passedAt,completion})=>({userId,instructionId,version,watchedSeconds,passedAt,completion:completion?{at:completion.at}:null}))});
});
