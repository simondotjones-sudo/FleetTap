import {instructionData,withInstructions,persistedWorkspace} from '../../server/instruction-data.mjs';
import {recallCommand,seedRecallCases} from '../../src/recalls.js';
import {manageFleet} from '../../server/fleet-management.mjs';
import {docketRecordSource} from '../../server/docket.mjs';
import {vehicleModelType,modelTypeForSave} from '../../src/fleet-models.js';
import {releaseCommand,serviceHistoryCommand,refreshReleaseHolds,withReleaseStatus,visibleRelease} from '../../src/bus-release.js';
import {acknowledgeControl,requireControls,visibleControls} from '../../src/active-controls.js';
import {performanceCommand,visiblePerformance} from '../../src/performance-model.js';
import {operationsCommand,visibleOperations} from '../../src/garage-operations.js';
import {visibleActionState,canWorkAction} from '../../src/action-assignment.js';
import {closeRecord,returnAction} from '../../src/reviews.js';
import {checklistCommand,visibleContent} from '../../src/content-model.js';
import {workerName} from '../../src/roles.js';
import {validateAttachments} from '../../server/photos.mjs';
import {db,actor,body,json,garageFor,endpoint,fail,safeUser,withActorTransaction} from '../../server/runtime.mjs';
import {canManage,canAuthor,canReview} from '../../server/security.mjs';
import {addRecord,submitAction,savedRecordRequest} from '../../src/model.js';
import {returnInspection,startInspection,recordRecheck,saveAnswer,submitInspection,saveVehicle} from '../../src/inspections.js';
import {editTemplate} from '../../src/templates.js';
import {editVehicle,manageInspection} from '../../src/inspection-admin.js';
import {saveSchedule} from '../../src/scheduling.js';
const visible=(raw,u,g)=>{const s=canManage(u)?raw:{...raw,vehicleTransferArchive:[],attachmentOrigins:undefined};return visibleRelease(visibleControls(visiblePerformance(visibleOperations(visibleActionState(withReleaseStatus(s,g),u),u),u),u),u);};
export default endpoint(async(req)=>{
 const u=await actor(req),sql=db();
 if(req.method==='GET'){
  const garages=await sql`SELECT g.*,o.name AS organisation_name FROM garages g JOIN organisations o ON o.id=g.organisation_id WHERE o.active AND (${u.role==='platform_admin'} OR (g.organisation_id=${u.organisation_id} AND (${u.role==='organisation_admin'} OR g.id=${u.garage_id}))) ORDER BY o.name,g.name`;
  const requested=new URL(req.url).searchParams.get('garage');const garage=requested||garages[0]?.id;
  if(!garage)return json({user:safeUser(u),garages,state:null,version:0});
  const g=await garageFor(u,garage);const [content]=await sql`SELECT data,version FROM organisation_content WHERE organisation_id=${g.organisation_id}`;const [org]=await sql`SELECT role_names,login_code FROM organisations WHERE id=${g.organisation_id}`;const [record]=await sql`SELECT data,version FROM garage_records WHERE garage_id=${garage}`;
  const assignees=canManage(u)?await sql`SELECT id,name,email,employee_id,role,garage_id FROM users WHERE active AND password_hash IS NOT NULL AND (id=${u.id} OR (organisation_id=${g.organisation_id} AND (role='organisation_admin' OR garage_id=${garage}))) ORDER BY name,id`:[];
  if(!record)fail('Garage records are not ready.',503);const learning=await instructionData(sql,g.organisation_id,u,garage);return json({user:safeUser({...u,role_names:org.role_names,login_code:org.login_code}),garages,assignees,state:visible(withInstructions(record.data,content?.data,learning),u,garage),version:record.version,garage,content:visibleContent(content?.data,canAuthor(u)),contentVersion:content?.version||0,organisation:g.organisation_id});
 }
 const b=await body(req);const g=await garageFor(u,b.garage);
 if(!Number.isInteger(b.version)||b.version<0)fail('Reload the garage before saving.',409);
 if(b.action==='vehicle_transfer'||(b.action==='schedule'&&b.values?.scope==='model')){const changed=await manageFleet(u,b);return json({...changed,state:visible(changed.state,u,b.garage)});}
 return withActorTransaction(u,async()=>{
 const sql=db();await garageFor(u,b.garage);
 await sql`SELECT id FROM organisations WHERE id=${g.organisation_id} AND active FOR SHARE`;
 const [instructionContent]=await sql`SELECT data,version FROM organisation_content WHERE organisation_id=${g.organisation_id} FOR SHARE`;
 const [r]=await sql`SELECT data,version FROM garage_records WHERE garage_id=${b.garage} FOR UPDATE`;
 const learning=await instructionData(sql,g.organisation_id,u,b.garage);
 if(r)r.data=withInstructions(r.data,instructionContent?.data,learning);
 if(b.action==='record'&&b.values?.requestId){if(!/^[a-f0-9-]{36}$/.test(b.values.requestId))fail('Invalid report request.');const prior=r&&savedRecordRequest(r.data,b.kind,b.garage,u.id,b.values.requestId);if(prior)return json({state:visible(r.data,u,b.garage),version:r.version,result:prior});}
 if(!r||r.version!==b.version)fail('Another person saved changes. Refresh the garage and retry your entry.',409);
 const state=r.data;seedRecallCases(state,b.garage,instructionContent?.data||{});let result=null;const v=b.values||{};
 const photos=v.photos===undefined?[]:await validateAttachments(v.photos,b.garage,u);
 const worker=workerName(u);let controlContent=instructionContent||null;
 try{
 const controlled=['start','answer','reading_check','submit','job_start','job_checks','job_submit','checklist_start','checklist_answer','checklist_submit','action','recall_report','recall_verify'];
 if(controlled.includes(b.action)&&!(b.action==='action'&&v.kind==='handover')||b.action==='instruction_ack'){
  const row=instructionContent;
  controlContent=row;
  const vehicle=b.action.startsWith('recall_')?v.vehicle:b.action==='action'?(()=>{const a=state.actions.find(a=>a.id===b.id&&a.garage===b.garage);return a?.vehicle||[...state.faults,...state.reports].find(r=>r.garage===b.garage&&r.id===a?.source)?.vehicle;})():['start','checklist_start'].includes(b.action)?v.vehicle:b.action.startsWith('job_')?state.jobs?.find(j=>j.id===b.id&&j.garage===b.garage)?.vehicle:b.action.startsWith('checklist_')?state.checklistRuns?.find(j=>j.id===b.id&&j.garage===b.garage)?.vehicle:state.inspections?.find(j=>j.id===b.id&&j.garage===b.garage&&!j.deletedAt)?.vehicle;
  if(b.action!=='instruction_ack')requireControls(state,b.garage,u,row?.data||{},vehicle);
 }
 switch(b.action){
  case 'recall_assess':case 'recall_plan':case 'recall_report':case 'recall_verify':case 'recall_reopen':result=recallCommand(state,b.garage,u,instructionContent?.data||{},b.action,v);break;
  case 'road_documents':case 'bus_release':case 'bus_hold':case 'bus_clear_hold':if(!canReview(u))fail('Supervisor access required.',403);if(b.action==='road_documents'&&!canManage(u))fail('Manager access required.',403);result=releaseCommand(state,b.garage,u,b.action,v,b.id);break;
  case 'service_add':case 'service_void':if(!canReview(u))fail('Supervisor access required.',403);result=serviceHistoryCommand(state,b.garage,u,b.action,v,b.id);break;
  case 'instruction_ack':result=acknowledgeControl(state,b.garage,u,controlContent?.data||{},v);break;
  case 'reading_check':result=recordRecheck(state,b.id,b.garage,b.item,v.readings,worker);break;
  case 'bus_warranty':case 'downtime_rates':case 'downtime_save':case 'downtime_void':case 'downtime_reassess':case 'downtime_workday':case 'downtime_workday_remove':case 'downtime_manufacturer':case 'downtime_manufacturer_clear':{
   if(!canManage(u))fail('Manager access required.',403);
   const [content]=await sql`SELECT data FROM organisation_content WHERE organisation_id=${g.organisation_id}`;
   result=performanceCommand(state,b.garage,u,b.action,v,b.id,content?.data||{});break;
  }
  case 'shift_start':case 'shift_end':case 'briefing_save':case 'job_create':case 'job_plan':case 'job_start':case 'job_checks':case 'job_wait':case 'job_submit':case 'job_signoff':case 'job_return':case 'job_cancel':{
   let assignee=null;
   if(['job_create','job_plan'].includes(b.action)){
    if(!canManage(u))fail('Manager access required.',403);
    if(v.assigneeId){
     if(typeof v.assigneeId!=='string'||!/^[a-f0-9-]{36}$/i.test(v.assigneeId))fail('Choose a mechanic in this garage.');
     [assignee]=await sql`SELECT id,name FROM users WHERE id=${v.assigneeId} AND active AND password_hash IS NOT NULL AND organisation_id=${g.organisation_id} AND garage_id=${b.garage} AND role IN ('mechanic','supervisor','garage_manager')`;
     if(!assignee)fail('Choose an active staff account in this garage.',403);
    }
   }
   result=operationsCommand(state,b.garage,u,b.action,v,b.id,assignee);break;
  }
  case 'inspection_return':if(!canReview(u))fail('Supervisor access required.',403);result=returnInspection(state,b.id,b.garage,v,worker);break;
  case 'action_return':if(!canReview(u))fail('Supervisor access required.',403);result=returnAction(state,b.garage,b.id,v,worker);break;
  case 'close_record':if(!canReview(u))fail('Supervisor access required.',403);result=closeRecord(state,b.garage,b.kind,b.id,v,worker);break;
  case 'checklist_start':case 'checklist_answer':case 'checklist_submit':case 'checklist_signoff':case 'checklist_return':{if(['checklist_signoff','checklist_return'].includes(b.action)&&!canReview(u))fail('Supervisor access required.',403);const [content]=await sql`SELECT data FROM organisation_content WHERE organisation_id=${g.organisation_id}`;result=checklistCommand(state,b.garage,b.action,v,b.id,content?.data||{},worker);break;}
  case 'vehicle_edit':if(!canManage(u))fail('Administrator access required.',403);if(u.role!=='organisation_admin'){const bus=state.vehicles.find(x=>x.id===b.id&&x.garage===b.garage);if(bus&&modelTypeForSave({...v,id:v.id||b.id,modelType:v.modelType===undefined?vehicleModelType(bus):v.modelType})!==vehicleModelType(bus))fail('Only an Organisation Admin can change the bus model.',403);}result=editVehicle(state,b.garage,b.id,v,worker);break;
  case 'inspection_manage':if(!(v.operation==='complete'?canReview(u):canManage(u)))fail('Administrator access required.',403);result=manageInspection(state,b.garage,b.id,v,worker);break;
  case 'template_edit':if(!canAuthor(u))fail('Administrator access required.',403);result=editTemplate(state,v,worker);break;
  case 'schedule':if(u.role!=='organisation_admin')fail('Organisation Admin access required.',403);result=saveSchedule(state,b.garage,v,worker);break;
  case 'vehicle':if(!canManage(u))fail('A manager must add vehicles.',403);if(u.role!=='organisation_admin'&&v.due)fail('Only an Organisation Admin can set an inspection due date.',403);result=saveVehicle(state,b.garage,v);break;
  case 'record':{if(!['reports','faults'].includes(b.kind))fail('Unknown record type.');if(v.docketAnalysisId&&b.kind!=='faults')fail('A driver docket must create a fault.');const source=v.docketAnalysisId?await docketRecordSource(v,photos,b.garage,u):{};result=addRecord(state,b.kind,{garage:b.garage,vehicle:String(v.vehicle||''),title:String(v.title||'').slice(0,160),description:String(v.description||'').slice(0,4000),immediate:String(v.immediate||'').slice(0,2000),type:String(v.type||'').slice(0,80),createdBy:u.id,photos,requestId:v.requestId||null,...source});break;}
  case 'start':result=startInspection(state,v.vehicle,b.garage,worker);break;
  case 'answer':result=saveAnswer(state,b.id,b.garage,b.item,{prerequisiteEvidence:v.prerequisiteEvidence,result:v.result,notes:String(v.notes||'').slice(0,4000),worker,photos,failureType:v.failureType,repair:v.repair?{defect:v.repair.defect,work:v.repair.work,recheck:v.repair.recheck,confirmed:v.repair.confirmed===true}:null,recheckConfirmed:v.recheckConfirmed===true,recheckNote:String(v.recheckNote||'').slice(0,2000),readings:Array.isArray(v.readings)?v.readings.map(x=>String(x).slice(0,300)):[]});break;
  case 'submit':submitInspection(state,b.id,b.garage,String(v.notes||'').slice(0,4000));break;
  case 'assign_action':{
   if(!canManage(u))fail('Manager access required.',403);
   const a=state.actions.find(a=>a.id===b.id&&a.garage===b.garage&&!a.deletedAt);if(!a)fail('Action unavailable.');if(a.status!=='Open')fail('Only open actions can be reassigned.');
   const id=v.assigneeId;if(typeof id!=='string'||(id&&!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)))fail('Choose a person in this garage.');
   let assignee=null;if(id){[assignee]=await sql`SELECT id,name,email,employee_id FROM users WHERE id=${id} AND active AND password_hash IS NOT NULL AND (id=${u.id} OR (organisation_id=${g.organisation_id} AND (role='organisation_admin' OR garage_id=${b.garage})))`;if(!assignee)fail('Choose an active person with access to this garage.',403);}
   const assignedTo=assignee?.id||null,owner=assignee?workerName(assignee):'Unassigned';
   (a.audit??=[]).push({action:'Assignment',at:new Date().toISOString(),actor:worker,previous:{assignedTo:a.assignedTo||null,owner:a.owner||''},assignedTo,owner});
   a.assignedTo=assignedTo;a.owner=owner;result={id:a.id};break;
  }
  case 'action':{const a=state.actions.find(a=>a.id===b.id&&a.garage===b.garage&&!a.deletedAt);if(!a)fail('Action unavailable.');if(!canWorkAction(a,u))fail('This action is not assigned to you.',403);if(a.status!=='Open')fail('This action is already awaiting review.');result=submitAction(state,b.id,String(v.evidence||'').slice(0,4000),v.kind||'work',worker);break;}
  default:fail('Unknown workspace request.');
 }
 }catch(e){if(e.status)throw e;fail(e.message);}
 seedRecallCases(state,b.garage,instructionContent?.data||{});
 refreshReleaseHolds(state,b.garage,u);
 // Compare-and-swap prevents stale clients from overwriting another user's work.
 // Recheck the authenticated account version at commit time to reject revoked sessions.
 const [updated]=await sql`WITH changed AS (UPDATE garage_records SET data=${JSON.stringify(persistedWorkspace(state))}::jsonb,version=version+1,updated_at=now() WHERE garage_id=${b.garage} AND version=${b.version} AND (${controlContent===null} OR COALESCE((SELECT version FROM organisation_content WHERE organisation_id=${g.organisation_id}),0)=${controlContent?.version||0}) AND EXISTS(SELECT 1 FROM users WHERE id=${u.id} AND active AND credential_version=${u.credential_version}) RETURNING version), audit AS (INSERT INTO audit_events(actor_id,action,target,garage_id) SELECT ${u.id},${'workspace_'+b.action},${b.id||result?.id||null},${b.garage} FROM changed) SELECT version FROM changed`;
 if(!updated)fail('The record or your access changed. Refresh and try again.',409);
 return json({state:visible(state,u,b.garage),version:updated.version,result});
 });
});
