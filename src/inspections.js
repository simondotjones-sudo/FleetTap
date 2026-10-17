import {criticalTask} from './critical-safety.js';
import {verifiedInspectionFault,inspectionSequence,requireSectionReady,requireCurrentSequence} from './section-sequencing.js';
import {pm3} from './pm3.js';
import {modelTypeForSave} from './fleet-models.js';
import {templateFor,tasksFor,isPM3} from './templates.js';
import {validDate} from './scheduling.js';
import {addRecord,submitAction} from './model.js';
export const revision='TO-PMS 035 · Revision 8 · demo mapping 1';
export const sections=[...new Set(pm3.map(i=>i.section))];
export const readings={
 '1-1':[['Side slip','m/km',-14,14]],'2-11':[['Coolant concentration','%',40,40]],
 '3-4':[['Build-up time','seconds',0,330]],'4-1':[['Nearside > 4 mm','Yes/No'],['Offside > 4 mm','Yes/No']],
 '4-6':[['Nearside end-float','mm',0,.2],['Offside end-float','mm',0,.2]],
 '4-8':[['Lift / findings','text']],'4-9':[['End-float or no play detected','text']],
 '4-10':[['Nearside axial clearance','mm',0,.1],['Offside axial clearance','mm',0,.1]],
 '4-11':[['Nearside radial clearance','mm',0,5.3],['Offside radial clearance','mm',0,5.3]],
 '4-12':[['Nearside findings','text'],['Offside findings','text']],
 '4-13':[['Total toe in','mm',0,1.5],['Printed result reference','text']],
 '5-1':[['Nearside > 4 mm','Yes/No'],['Offside > 4 mm','Yes/No']],
 '5-7':[['Nearside end-float','mm',0,.05],['Offside end-float','mm',0,.05]],
 '6-5':[['Front ride height','mm',233,241],['Rear ride height','mm',232,240]],
 '7-1':[['Fault-code printout reference','text']],'7-2':[['Speed setting','km/h',65,65]],
 '2-20':[['Belts changed','Yes/No'],['Condition check / history reference','text']],
 '2-21':[['Injection pipe task','choice']], '16-5':[['Extinguisher mass','kg',0,100]]
};
export const taskReadings=t=>t.fields||readings[t.id]||[];
export function startInspection(state,vehicle,garage,craftworker){
 if(!state.vehicles.some(v=>v.id===vehicle&&v.garage===garage))throw Error('Choose a vehicle in this garage.');
 if(!craftworker?.trim())throw Error('Enter the demo craftworker name.');
 const existing=state.inspections.find(i=>i.vehicle===vehicle&&i.garage===garage&&isPM3(i)&&!i.deletedAt&&i.status==='In progress');
 if(existing)return existing;
 const snapshot=structuredClone(templateFor(state));
 snapshot.tasks=snapshot.tasks.map(t=>({...t,fields:structuredClone(taskReadings(t))}));delete snapshot.audit;
 const item={templateId:'pm3',templateSnapshot:snapshot,id:'FT-I-'+crypto.randomUUID().slice(0,8),vehicle,garage,template:revision,craftworker:craftworker.trim(),status:'In progress',created:new Date().toISOString(),answers:{},notes:'',audit:[]};
 state.inspections.unshift(item);return item;
}
export function inspectionFor(state,id,garage){const i=state.inspections.find(i=>i.id===id&&i.garage===garage&&isPM3(i)&&!i.deletedAt);if(!i)throw Error('Inspection unavailable in this garage.');return i;}
export function outOfRange(task,answer){return taskReadings(task).some((r,n)=>{const raw=answer.readings?.[n];if(raw==null||raw==='')return false;if(r[1]==='Yes/No')return raw==='No';return r.length===4&&(Number(raw)<r[2]||Number(raw)>r[3]);});}
export function recordRecheck(state,id,garage,taskId,readings,worker){
 const i=inspectionFor(state,id,garage),task=tasksFor(i).find(t=>t.id===taskId);
 if(i.status!=='In progress'||!task||task.blocked)throw Error('Check unavailable for readings.');
 requireSectionReady(state,i,task);
 const fields=taskReadings(task);
 if(!Array.isArray(readings)||readings.length!==fields.length||fields.some((r,n)=>!String(readings[n]??'').trim()||r.length===4&&!Number.isFinite(Number(readings[n]))||r[1]==='Yes/No'&&!['Yes','No'].includes(readings[n])))throw Error('Complete valid readings before requesting a recheck.');
 if(!outOfRange(task,{readings}))return {required:false};
 const pending=i.rechecks?.[taskId];if(pending&&!pending.resolvedAt)return {required:true,...pending};
 const entry={readings:readings.map(x=>String(x).slice(0,300)),worker,at:new Date().toISOString()};
 (i.rechecks??={})[taskId]=entry;i.audit.push({action:'Out-of-tolerance reading — recheck required',item:taskId,...structuredClone(entry)});return {required:true,...entry};
}
export function saveAnswer(state,id,garage,taskId,answer){
 const i=inspectionFor(state,id,garage),task=tasksFor(i).find(t=>t.id===taskId);
 if(i.status!=='In progress')throw Error('Submitted inspections are locked.');
 if(!task||task.blocked)throw Error('This item is blocked pending technical review.');
 const sequence=requireSectionReady(state,i,task);
 if(sequence.evidence(task.section)!==null&&answer.prerequisiteEvidence!==sequence.evidence(task.section))throw Error('Prerequisites changed. Reopen this question and perform a fresh check.');
 if(!['OK','Defect','Fixed','Not completed','Not due'].includes(answer.result))throw Error('Select a result.');
 if(answer.result==='Not due'&&(!task.conditional||task.id==='2-20'))throw Error('This task cannot be marked not due.');
 if(!answer.worker?.trim())throw Error('Enter the craftworker for this item.');
 if(answer.result!=='OK'&&!answer.notes?.trim())throw Error('Add a reason, defect details or maintenance-history reference.');
 const fields=taskReadings(task);
 if(['OK','Defect','Fixed'].includes(answer.result))fields.forEach((r,n)=>{const val=answer.readings?.[n];if(val==null||String(val).trim()==='')throw Error('Complete the required readings.');if(r.length===4&&!Number.isFinite(Number(val)))throw Error('Enter a valid numeric reading.');if(r[1]==='Yes/No'&&!['Yes','No'].includes(val))throw Error('Choose Yes or No.');if(r[1]==='choice'&&!['Remove clip (leaving one clip), refit pipe','Remove last clip, refit pipe','No clip present, fit new pipe'].includes(val))throw Error('Choose a valid task.');});
 const pending=i.rechecks?.[taskId];
 if(outOfRange(task,answer)&&(!pending||pending.resolvedAt)&&JSON.stringify(i.answers[taskId]?.readings)!==JSON.stringify(answer.readings))throw Error('Record the first out-of-tolerance reading and perform a recheck.');
 if(pending&&!pending.resolvedAt&&(!['OK','Defect','Fixed'].includes(answer.result)||!answer.recheckConfirmed||String(answer.recheckNote||'').trim().length<5))throw Error('Recheck required: take fresh readings and explain the outcome (at least 5 characters).');
 if(outOfRange(task,answer)&&['OK','Fixed'].includes(answer.result))throw Error('Reading outside the source tolerance. Record a defect and details for review.');
 const previous=i.answers[taskId];
 if(previous?.fault&&!['Defect','Fixed'].includes(answer.result)&&!(answer.result==='OK'&&sequence.ruleFor(task.section)?.mode!=='any'&&!sequence.current(task)&&verifiedInspectionFault(state,i,previous.fault)))throw Error('A linked defect exists. Keep the defect result; repair and review are tracked separately.');
 const failed=['Defect','Fixed'].includes(answer.result),fixed=answer.result==='Fixed';
 const toleranceEvidence=outOfRange(task,answer)||outOfRange(task,{readings:pending?.readings})||outOfRange(task,previous||{});
 const failureType=failed?(answer.failureType==='tolerance'&&toleranceEvidence?'tolerance':'visual'):null;
 const existingFault=state.faults.find(f=>f.id===previous?.fault&&f.garage===garage&&f.vehicle===i.vehicle&&f.status!=='Closed');
 const photos=Array.isArray(answer.photos)?answer.photos:[];
 if(failed&&task.visualDefectPhotoRequired===true&&failureType==='visual'&&!photos.length&&!existingFault?.photos?.length)throw Error('A photo is required for a visual fault on this question.');
 let repair=null;
 if(fixed){
  const value=answer.repair||{};
  for(const key of ['defect','work','recheck'])if(typeof value[key]!=='string'||value[key].trim().length<5||value[key].trim().length>4000)throw Error('Record the fault, repair completed and successful recheck (5–4000 characters each).');
  if(value.confirmed!==true)throw Error('Confirm you completed the repair and successful recheck.');
  repair={defect:value.defect.trim(),work:value.work.trim(),recheck:value.recheck.trim(),actor:answer.worker.trim(),at:new Date().toISOString(),readings:[...(answer.readings||[])],beforeReadings:[...(pending?.readings||previous?.readings||[])]};
 }
 const saved={...answer,...(previous?.recheck?{recheck:previous.recheck}:{}),failureType,repair,worker:answer.worker.trim(),updated:new Date().toISOString(),fault:previous?.fault||null};
 if(failed&&saved.fault&&!existingFault)saved.fault=null;
 const newFault=failed&&!saved.fault;
 if(newFault){const f=addRecord(state,'faults',{garage,vehicle:i.vehicle,title:`${task.section} · item ${task.number}`,description:repair?.defect||answer.notes,inspection:i.id,item:task.id,criticalSafety:criticalTask(task),safetySource:{kind:'PM3',templateVersion:i.templateSnapshot?.version||1,question:task.question||task.text,item:task.id},photos});saved.fault=f.id;}
 if(saved.fault){
  const f=state.faults.find(f=>f.id===saved.fault&&f.garage===garage);
  const combined=[...new Set([...(f.photos||[]),...photos])];if(combined.length>12)throw Error('This fault already has enough photos.');f.photos=combined;
  if(repair){
   const previousRepair=f.repairReported;
   const duplicate=previousRepair&&['defect','work','recheck','actor'].every(k=>previousRepair[k]===repair[k])&&JSON.stringify(previousRepair.readings)===JSON.stringify(repair.readings);
   let action=newFault?state.actions.find(a=>a.source===f.id&&a.garage===garage&&a.status==='Open'):null;
   if(!newFault&&!duplicate){action={id:'FT-A-'+crypto.randomUUID().slice(0,8),garage,vehicle:i.vehicle,title:'Review repair · '+f.title,source:f.id,owner:'Unassigned',status:'Open',evidence:'',created:repair.at};state.actions.unshift(action);}
   repair.actionId=action?.id||previousRepair?.actionId;f.repairReported=structuredClone(repair);
   (f.audit??=[]).push({action:'Repair reported during check',actor:repair.actor,at:repair.at,notes:'Fault: '+repair.defect+' · Repair: '+repair.work+' · Recheck: '+repair.recheck});
   if(action)submitAction(state,action.id,'Fault: '+repair.defect+'\nRepair: '+repair.work+'\nRecheck: '+repair.recheck+(repair.readings.length?'\nReadings: '+repair.readings.join(' · '):''),'work',answer.worker);
  }
 }
 if(pending&&!pending.resolvedAt){saved.recheck={first:structuredClone(pending),readings:[...answer.readings],note:answer.recheckNote,worker:answer.worker,at:saved.updated};pending.resolvedAt=saved.updated;}
 delete saved.prerequisiteEvidence;
 saved.revision=crypto.randomUUID();
 // Evidence is derived on the server; clients cannot certify their own prerequisites.
 saved.sequenceEvidence=inspectionSequence(state,i).evidence(task.section);
 i.answers[taskId]=saved;i.audit.push({item:taskId,previous:previous||null,value:structuredClone(saved),at:saved.updated});return saved;
}
export function submitInspection(state,id,garage,notes){
 const i=inspectionFor(state,id,garage);if(i.status!=='In progress')throw Error('Inspection already submitted.');
 if(Object.values(i.rechecks||{}).some(x=>!x.resolvedAt))throw Error('Resolve every outstanding recheck before submitting.');
 if(tasksFor(i).some(t=>!t.blocked&&!i.answers[t.id]))throw Error('Record a result for every available item before submitting.');
 requireCurrentSequence(state,i);
 i.notes=notes.trim();delete i.returnNotes;i.status='Awaiting review';i.submitted=new Date().toISOString();
 i.audit.push({action:'Submit for review',at:i.submitted,actor:i.amendment?.actor||i.craftworker});
 if(state.actions.some(a=>a.source===i.id&&a.garage===garage&&a.status==='Open'))return;
 state.actions.unshift({id:'FT-A-'+crypto.randomUUID().slice(0,8),garage,vehicle:i.vehicle,title:'Review PM3 demonstration — blocked regeneration item',source:i.id,owner:'Demo supervisor',status:'Open',evidence:''});
}
export function saveVehicle(state,garage,values){
 const id=values.id?.trim().toUpperCase().replace(/\s+/g,'-');if(!id||!values.model?.trim())throw Error('Enter a fleet number and vehicle model.');
 if(!/^[A-Z0-9 -]{1,40}$/.test(id))throw Error('Use letters, numbers, spaces or hyphens for the fleet number.');
 if(state.vehicles.some(v=>v.id===id&&v.garage===garage))throw Error('This fleet number already exists.');
 if(values.due&&!validDate(values.due))throw Error('Choose a valid inspection date.');
 const v={id,garage,name:String(values.name||'').trim().slice(0,120),model:values.model.trim(),modelType:modelTypeForSave({...values,id}),registration:values.registration?.trim()||'',status:'Awaiting inspection',warranty:'Unknown',history:[],due:values.due||'',created:new Date().toISOString()};state.vehicles.push(v);return v;
}

export function returnInspection(state,id,garage,values,actor){
 const i=inspectionFor(state,id,garage);if(i.status!=='Awaiting review')throw Error('Choose an inspection awaiting review.');
 const notes=String(values.notes||'').trim();if(notes.length<5||notes.length>4000)throw Error('Explain the corrections needed (5–4000 characters).');
 i.audit.push({action:'Returned for work',actor,at:new Date().toISOString(),reason:notes,previous:{status:i.status}});i.status='In progress';i.returnNotes=notes;return {id};
}
