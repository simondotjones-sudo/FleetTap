import {publicLearning} from '../src/instruction-learning.js';
import {publishedBulletins,publicBulletin} from '../src/bulletins.js';
import {manager} from '../src/roles.js';

export async function instructionData(sql,organisation,u,garage){
 const rows=await sql`SELECT l.data FROM instruction_learning l JOIN users p ON p.id=l.user_id WHERE l.organisation_id=${organisation} AND (l.user_id=${u.id} OR (${manager(u)} AND p.organisation_id=${organisation} AND (${['organisation_admin','platform_admin'].includes(u.role)} OR p.garage_id=${garage} OR p.role='organisation_admin')))`;
 // Legacy declarations remain valid when a person changes garage in the same organisation.
 const legacy=await sql`SELECT r.data->'instructionAcks' AS acks FROM garage_records r JOIN garages g ON g.id=r.garage_id WHERE g.organisation_id=${organisation}`;
 const people=manager(u)?await sql`SELECT id,name,role,garage_id FROM users WHERE organisation_id=${organisation} AND active AND (${['organisation_admin','platform_admin'].includes(u.role)} OR garage_id=${garage} OR role='organisation_admin') ORDER BY name,id`:[];
 const allowed=new Set([u.id,...people.map(p=>p.id)]);
 return {instructionLearning:rows.map(r=>publicLearning(r.data,r.data.userId===u.id)),organisationAcks:legacy.flatMap(r=>r.acks||[]).filter(a=>allowed.has(a.userId)).map(a=>({...a,organisationWide:true})),instructionTeam:people};
}
export function withInstructions(state,content,learning={}){
 return {...state,...learning,activeRecalls:publishedBulletins(content).filter(x=>x.type==='recall').map(x=>publicBulletin(x)),activeBulletins:publishedBulletins(content).map(x=>publicBulletin(x))};
}
export function persistedWorkspace(state){const {instructionLearning,organisationAcks,instructionTeam,activeRecalls,activeBulletins,...saved}=state;return saved;}
