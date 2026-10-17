import {criticalCheckBlocked} from './critical-safety.js';
import {tasksFor,isPM3,templateFor} from './templates.js';
import {validDate,today} from './scheduling.js';
import {modelTypeForSave,vehicleModelType} from './fleet-models.js';
const reason=v=>{const r=String(v||'').trim();if(r.length<5||r.length>2000)throw Error('Enter a reason (5–2000 characters).');return r;};
const audit=(i,action,actor,why,previous)=>{(i.audit??=[]).push({action,actor,reason:why,at:new Date().toISOString(),previous});};
export function editVehicle(state,garage,id,v,actor){
 const bus=state.vehicles.find(b=>b.id===id&&b.garage===garage);if(!bus)throw Error('Bus unavailable in this garage.');
 const next=String(v.id||'').trim().toUpperCase().replace(/\s+/g,'-'),name=String(v.name||'').trim(),model=String(v.model||'').trim(),registration=String(v.registration||'').trim();
 if(!/^[A-Z0-9 -]{1,40}$/.test(next)||!model||model.length>120||name.length>120||registration.length>30)throw Error('Enter a fleet number and model within the allowed lengths.');
 if(state.vehicles.some(b=>b!==bus&&b.garage===garage&&b.id===next))throw Error('This fleet number already exists.');
 const modelType=modelTypeForSave({...v,id:next,...(v.modelType===undefined?{modelType:vehicleModelType(bus)}:{})});
 const previous={id:bus.id,name:bus.name||'',model:bus.model,modelType:vehicleModelType(bus),registration:bus.registration};
 (bus.audit??=[]).push({action:'Edit bus',actor,at:new Date().toISOString(),previous});
 Object.assign(bus,{id:next,name,model,modelType,registration});
 // Keep every existing link when correcting a fleet number. Audit snapshots retain the old identity.
 if(next!==id)for(const key of ['inspections','faults','reports','actions','schedules','jobs','downtime','checklistRuns','releaseEvents','serviceHistory'])for(const r of state[key]||[])if(r.garage===garage&&r.vehicle===id)r.vehicle=next;
 return {id:next};
}
export function manageInspection(state,garage,id,values,actor){
 const i=state.inspections.find(x=>x.id===id&&x.garage===garage&&isPM3(x));if(!i)throw Error('Inspection unavailable in this garage.');
 const why=reason(values.reason),op=values.operation;
 if(op==='restore'){
  if(!i.deletedAt)throw Error('This inspection is not deleted.');
  if(i.previousStatus==='In progress'&&state.inspections.some(x=>x!==i&&x.garage===garage&&x.vehicle===i.vehicle&&isPM3(x)&&!x.deletedAt&&x.status==='In progress'))throw Error('Finish the other open inspection for this bus before restoring this one.');
  audit(i,'Restore',actor,why,{deletedAt:i.deletedAt,status:i.status});i.status=i.previousStatus||'In progress';delete i.deletedAt;delete i.previousStatus;return {id};
 }
 if(i.deletedAt)throw Error('Restore this inspection before editing it.');
 if(op==='delete'){
  audit(i,'Delete',actor,why,{status:i.status,submitted:i.submitted,completedDate:i.completedDate,completedAt:i.completedAt});i.previousStatus=i.status;i.status='Deleted';i.deletedAt=new Date().toISOString();
  // Faults and repair actions are independent safety records; deleting a check never closes them.
  return {id};
 }
 if(op==='amend'){
  if(i.status==='In progress')throw Error('This inspection is already open for editing.');
  if(state.inspections.some(x=>x!==i&&x.garage===garage&&x.vehicle===i.vehicle&&isPM3(x)&&!x.deletedAt&&x.status==='In progress'))throw Error('Finish the other open inspection for this bus first.');
  audit(i,'Reopen for amendment',actor,why,{status:i.status,answers:structuredClone(i.answers),notes:i.notes,submitted:i.submitted,completedDate:i.completedDate,completedAt:i.completedAt});
  // Legacy inspections always retain their original source mapping, never today's edited template.
  i.templateSnapshot??=structuredClone(templateFor({}));i.templateId??='pm3';i.status='In progress';i.amendment={actor,reason:why,at:new Date().toISOString()};delete i.completedDate;delete i.completedAt;return {id};
 }
 if(op==='notes'){
  audit(i,'Amend notes',actor,why,{notes:i.notes||''});i.notes=String(values.notes||'').trim().slice(0,4000);return {id};
 }
 if(op==='complete'){
  if(Object.values(i.rechecks||{}).some(x=>!x.resolvedAt))throw Error('Resolve all measurement rechecks first.');
  if(i.status!=='Awaiting review')throw Error('Submit the inspection for review first.');
  if(tasksFor(i).some(t=>t.blocked||!i.answers[t.id]||i.answers[t.id].result==='Not completed'))throw Error('Resolve all blocked and unfinished tasks before recording completion.');
  if(criticalCheckBlocked(state,i))throw Error('Repair and verify all Critical Safety Faults before signing off this inspection.');
  if(!validDate(values.date)||values.date>today()||values.date<i.created.slice(0,10))throw Error('Choose a completion date between the inspection start and today.');
  audit(i,'Complete review',actor,why,{status:i.status});i.status='Completed';i.completedDate=values.date;i.completedAt=new Date().toISOString();i.completedBy=actor;return {id};
 }
 throw Error('Unknown inspection change.');
}
