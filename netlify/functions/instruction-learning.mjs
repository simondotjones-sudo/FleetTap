import {db,actor,body,json,garageFor,endpoint,fail,withActorTransaction,rateLimit} from '../../server/runtime.mjs';
import {learningCommand,publicLearning} from '../../src/instruction-learning.js';
import {publishedBulletins,targetMatches} from '../../src/bulletins.js';

export default endpoint(async req=>{
 const u=await actor(req),b=await body(req),g=await garageFor(u,b.garage);
 if(!['video_begin','video_progress','quiz','acknowledge'].includes(b.action))fail('Unknown learning request.');
 if(b.action==='quiz')await rateLimit('tsb-quiz:'+u.id,40);
 return withActorTransaction(u,async()=>{
  const sql=db(),[org]=await sql`SELECT id FROM organisations WHERE id=${g.organisation_id} AND active FOR SHARE`;
  if(!org)fail('Organisation unavailable.',403);
  const [row]=await sql`SELECT data FROM organisation_content WHERE organisation_id=${g.organisation_id} FOR SHARE`;
  const x=publishedBulletins(row?.data).find(x=>x.id===b.instructionId);if(!x)fail('Published TSB unavailable.',404);
  const [garage]=await sql`SELECT data FROM garage_records WHERE garage_id=${g.id}`;
  if(!garage?.data.vehicles.some(bus=>bus.garage===g.id&&targetMatches(x,bus,garage.data.recallCases)))fail('TSB does not apply to this garage fleet.',403);
  await sql`INSERT INTO instruction_learning(organisation_id,user_id,instruction_id,version,data) VALUES(${g.organisation_id},${u.id},${x.id},${x.version},'{}'::jsonb) ON CONFLICT DO NOTHING`;
  const [prior]=await sql`SELECT data FROM instruction_learning WHERE organisation_id=${g.organisation_id} AND user_id=${u.id} AND instruction_id=${x.id} AND version=${x.version} FOR UPDATE`;
  let changed;try{changed=learningCommand(prior.data.userId?prior.data:null,x,u,b.action,b.values||{});}catch(e){fail(e.message);}
  await sql`UPDATE instruction_learning SET data=${JSON.stringify(changed.record)}::jsonb,updated_at=now() WHERE organisation_id=${g.organisation_id} AND user_id=${u.id} AND instruction_id=${x.id} AND version=${x.version}`;
  if(b.action==='acknowledge'||b.action==='quiz')await sql`INSERT INTO audit_events(actor_id,action,target,garage_id) VALUES(${u.id},${'tsb_'+b.action},${x.id},${g.id})`;
  return json({record:publicLearning(changed.record,true),result:changed.result});
 });
});
