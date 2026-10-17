import {seedRecallCases} from '../src/recalls.js';
import {withInstructions,persistedWorkspace} from './instruction-data.mjs';
import {db,fail,garageFor,withActorTransaction} from './runtime.mjs';
import {saveSchedule} from '../src/scheduling.js';
import {transferBus} from '../src/fleet-transfer.js';
import {refreshReleaseHolds} from '../src/bus-release.js';
import {workerName} from '../src/roles.js';

export async function manageFleet(u,b){
 if(u.role!=='organisation_admin')fail('Organisation Admin access required.',403);
 return withActorTransaction(u,async()=>{
  const sql=db(),from=await garageFor(u,b.garage);
  const [org]=await sql`SELECT id FROM organisations WHERE id=${u.organisation_id} AND active FOR UPDATE`;if(!org)fail('Organisation unavailable.',403);
  if(b.action==='vehicle_transfer'){
   const to=await garageFor(u,b.values?.garage);
   const [content]=await sql`SELECT data FROM organisation_content WHERE organisation_id=${org.id} FOR SHARE`;
   const records=await sql`SELECT garage_id,data,version FROM garage_records WHERE garage_id IN (${from.id},${to.id}) ORDER BY garage_id FOR UPDATE`;
   const source=records.find(r=>r.garage_id===from.id),destination=records.find(r=>r.garage_id===to.id);
   if(!source||!destination)fail('Garage records are not ready.',409);
   if(source.version!==b.version)fail('The bus records changed. Refresh and review the transfer again.',409);
   source.data=withInstructions(source.data,content?.data);destination.data=withInstructions(destination.data,content?.data);seedRecallCases(source.data,from.id,content?.data||{});
   let result;try{result=transferBus(source.data,destination.data,from,to,u,b.id,b.values);}catch(e){fail(e.message);}
   refreshReleaseHolds(destination.data,to.id,u);
   for(const row of records){
    const [saved]=await sql`UPDATE garage_records SET data=${JSON.stringify(persistedWorkspace(row.data))}::jsonb,version=version+1,updated_at=now() WHERE garage_id=${row.garage_id} AND version=${row.version} RETURNING version`;
    if(!saved)fail('Garage records changed. Retry the transfer.',409);
    await sql`INSERT INTO audit_events(actor_id,action,target,garage_id) VALUES(${u.id},'vehicle_transfer',${result.transferId},${row.garage_id})`;
   }
   return {state:source.data,version:source.version+1,result};
  }
  await sql`INSERT INTO organisation_content(organisation_id) VALUES(${org.id}) ON CONFLICT DO NOTHING`;
  const [content]=await sql`SELECT data,version FROM organisation_content WHERE organisation_id=${org.id} FOR UPDATE`;
  if(b.contentVersion!==content.version)fail('Organisation schedules changed. Reload before saving.',409);
  const records=await sql`SELECT r.garage_id,r.data,r.version FROM garage_records r JOIN garages g ON g.id=r.garage_id WHERE g.organisation_id=${org.id} ORDER BY r.garage_id FOR UPDATE OF r`;
  const selected=records.find(r=>r.garage_id===from.id);if(!selected||selected.version!==b.version)fail('The garage changed. Refresh and retry.',409);
  const v=b.values||{},actor=workerName(u);let count=0;
  try{
   const policyState={vehicles:[],schedules:[],modelSchedules:content.data.modelSchedules||[]};
   saveSchedule(policyState,org.id,v,actor);content.data.modelSchedules=policyState.modelSchedules;
   for(const row of records){row.data=withInstructions(row.data,content.data);count+=saveSchedule(row.data,row.garage_id,v,actor).count;const rule=row.data.modelSchedules.find(s=>s.modelType===v.modelType);rule.organisationId=org.id;refreshReleaseHolds(row.data,row.garage_id,u);}
  }catch(e){fail(e.message);}
  await sql`UPDATE organisation_content SET data=${JSON.stringify(content.data)}::jsonb,version=version+1 WHERE organisation_id=${org.id} AND version=${content.version}`;
  for(const row of records){
   const [saved]=await sql`UPDATE garage_records SET data=${JSON.stringify(persistedWorkspace(row.data))}::jsonb,version=version+1,updated_at=now() WHERE garage_id=${row.garage_id} AND version=${row.version} RETURNING version`;if(!saved)fail('A garage changed. Reload and retry.',409);
   await sql`INSERT INTO audit_events(actor_id,action,target,garage_id) VALUES(${u.id},'organisation_model_schedule',${v.modelType},${row.garage_id})`;
  }
  return {state:selected.data,version:selected.version+1,contentVersion:content.version+1,result:{count,scope:'organisation',garages:records.length}};
 });
}
