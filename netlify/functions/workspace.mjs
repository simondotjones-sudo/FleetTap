import {db,actor,body,json,garageFor,endpoint,fail,safeUser} from '../../server/runtime.mjs';
import {canManage} from '../../server/security.mjs';
import {addRecord,submitAction} from '../../src/model.js';
import {startInspection,saveAnswer,submitInspection,saveVehicle} from '../../src/inspections.js';
export default endpoint(async(req)=>{
 const u=await actor(req),sql=db();
 if(req.method==='GET'){
  const garages=await sql`SELECT g.*,o.name AS organisation_name FROM garages g JOIN organisations o ON o.id=g.organisation_id WHERE ${u.role==='platform_admin'} OR (g.organisation_id=${u.organisation_id} AND (${u.role==='organisation_admin'} OR g.id=${u.garage_id})) ORDER BY o.name,g.name`;
  const requested=new URL(req.url).searchParams.get('garage');const garage=requested||garages[0]?.id;
  if(!garage)return json({user:safeUser(u),garages,state:null,version:0});
  await garageFor(u,garage);const [record]=await sql`SELECT data,version FROM garage_records WHERE garage_id=${garage}`;
  if(!record)fail('Garage records are not ready.',503);return json({user:safeUser(u),garages,state:record.data,version:record.version,garage});
 }
 const b=await body(req);await garageFor(u,b.garage);
 if(!Number.isInteger(b.version)||b.version<0)fail('Reload the garage before saving.',409);
 const [r]=await sql`SELECT data,version FROM garage_records WHERE garage_id=${b.garage}`;
 if(!r||r.version!==b.version)fail('Another person saved changes. Refresh the garage and retry your entry.',409);
 const state=r.data;let result=null;const v=b.values||{};
 const worker=u.name+' ('+u.email+')';
 try{
 switch(b.action){
  case 'vehicle':if(!canManage(u))fail('A manager must add vehicles.',403);result=saveVehicle(state,b.garage,v);break;
  case 'record':if(!['reports','faults'].includes(b.kind))fail('Unknown record type.');result=addRecord(state,b.kind,{garage:b.garage,vehicle:String(v.vehicle||''),title:String(v.title||'').slice(0,160),description:String(v.description||'').slice(0,4000),immediate:String(v.immediate||'').slice(0,2000),type:String(v.type||'').slice(0,80),createdBy:u.id});break;
  case 'start':result=startInspection(state,v.vehicle,b.garage,worker);break;
  case 'answer':result=saveAnswer(state,b.id,b.garage,b.item,{result:v.result,notes:String(v.notes||'').slice(0,4000),worker,readings:Array.isArray(v.readings)?v.readings.map(x=>String(x).slice(0,300)):[]});break;
  case 'submit':submitInspection(state,b.id,b.garage,String(v.notes||'').slice(0,4000));break;
  case 'action':{const a=state.actions.find(a=>a.id===b.id&&a.garage===b.garage);if(!a)fail('Action unavailable.');if(a.status!=='Open')fail('This action is already awaiting review.');submitAction(state,b.id,String(v.evidence||'').slice(0,4000));break;}
  default:fail('Unknown workspace request.');
 }
 }catch(e){if(e.status)throw e;fail(e.message);}
 // Compare-and-swap prevents stale clients from overwriting another user's work.
 // Recheck the authenticated account version at commit time to reject revoked sessions.
 const [updated]=await sql`WITH changed AS (UPDATE garage_records SET data=${JSON.stringify(state)}::jsonb,version=version+1,updated_at=now() WHERE garage_id=${b.garage} AND version=${b.version} AND EXISTS(SELECT 1 FROM users WHERE id=${u.id} AND active AND credential_version=${u.credential_version}) RETURNING version), audit AS (INSERT INTO audit_events(actor_id,action,target,garage_id) SELECT ${u.id},${'workspace_'+b.action},${b.id||result?.id||null},${b.garage} FROM changed) SELECT version FROM changed`;
 if(!updated)fail('The record or your access changed. Refresh and try again.',409);
 return json({state,version:updated.version,result});
});
