import {publishedBulletins,targetMatches,publicBulletin} from './bulletins.js';
import {today,validDate,scheduleStatus} from './scheduling.js';
import {manager,reviewer,workerName} from './roles.js';
import {operationsCommand} from './garage-operations.js';

export function seedRecallCases(s,g,content){
 s.recallCases??=[];
 for(const x of publishedBulletins(content).filter(x=>x.type==='recall'))for(const bus of s.vehicles.filter(b=>b.garage===g&&targetMatches(x,b)))if(!s.recallCases.some(c=>c.garage===g&&c.vehicle===bus.id&&c.bulletinId===x.id&&c.version===x.version)){s.recallCases.push({id:crypto.randomUUID(),garage:g,vehicle:bus.id,bulletinId:x.id,version:x.version,status:x.recall.needsAssessment?'Assess applicability':'Work required',snapshot:publicBulletin(x),createdAt:x.publishedAt,audit:[]});}
}
export function recallsFor(state,garage,busId,date=today()){
 const bus=state.vehicles.find(b=>b.garage===garage&&b.id===busId);if(!bus)return [];
 // Retain an existing recall case even if the model is subsequently corrected.
 return (state.activeRecalls||[]).filter(x=>x.status==='Published'&&x.effectiveDate<=date&&(targetMatches(x,bus)||(state.recallCases||[]).some(c=>c.garage===garage&&c.vehicle===busId&&c.bulletinId===x.id))).map(x=>{
  const record=(state.recallCases||[]).find(c=>c.garage===garage&&c.vehicle===busId&&c.bulletinId===x.id&&c.version===x.version);
  const status=record?.status||(x.recall.needsAssessment?'Assess applicability':'Work required');
  const complete=['Verified','Not affected'].includes(status);
  const next=scheduleStatus(state,garage,busId,date).due;
  const serviceStarted=(state.jobs||[]).some(j=>j.garage===garage&&j.vehicle===busId&&j.type==='Scheduled inspection'&&j.status!=='Cancelled'&&j.startedAt&&j.startedAt>=x.publishedAt&&new Date(j.startedAt).toLocaleDateString('en-CA',{timeZone:'Europe/Dublin'})>=x.effectiveDate)||(state.inspections||[]).some(i=>i.garage===garage&&i.vehicle===busId&&!i.deletedAt&&i.created>=x.publishedAt&&new Date(i.created).toLocaleDateString('en-CA',{timeZone:'Europe/Dublin'})>=x.effectiveDate);
  const due=x.recall.mode==='stop'||x.recall.mode==='date'&&x.recall.dueDate<=date||x.recall.mode==='service'&&(!next||next<=date||serviceStarted);
  return {bulletin:x,record,status,complete,held:!complete&&due};
 });
}
export function recallReleaseEvidence(s,g,id,date=today()){
 const cases=recallsFor(s,g,id,date);
 return {blockers:cases.filter(c=>c.held).map(c=>'Safety recall '+c.bulletin.reference+': '+(c.status==='Assess applicability'?'applicability must be assessed.':'remedial work requires verification.')),evidence:cases.map(c=>({id:c.bulletin.id,version:c.bulletin.version,status:c.status,record:c.record||null,requirement:c.bulletin.recall}))};
}
export function recallCommand(s,g,u,content,action,v){
 const bus=s.vehicles.find(b=>b.garage===g&&b.id===v.vehicle),x=publishedBulletins(content).find(x=>x.id===v.bulletinId&&x.type==='recall');
 if(!bus||!x||x.version!==Number(v.version)||x.effectiveDate>today())throw Error('Choose an active recall and bus in this garage.');
 let c=(s.recallCases||[]).find(c=>c.garage===g&&c.vehicle===bus.id&&c.bulletinId===x.id&&c.version===x.version);
 if(!targetMatches(x,bus)&&!c)throw Error('This recall does not apply to the selected bus.');
 const at=new Date().toISOString(),actor=workerName(u),note=String(v.notes||'').trim();if(note.length<5||note.length>4000)throw Error('Record supporting evidence (5–4000 characters).');
 const next=structuredClone(c||{id:crypto.randomUUID(),garage:g,vehicle:bus.id,bulletinId:x.id,version:x.version,status:x.recall.needsAssessment?'Assess applicability':'Work required',snapshot:publicBulletin(x),audit:[]});
 const previous=structuredClone(next);delete previous.audit;
 if(action==='recall_assess'){
  if(!['organisation_admin','platform_admin'].includes(u.role))throw Error('Organisation Admin access required to assess applicability.');
  if(!['affected','unaffected'].includes(v.applicability))throw Error('Confirm whether the bus is affected.');
  if(['Verified','Awaiting verification'].includes(next.status))throw Error('Reopen the recall before changing its assessment.');
  next.status=v.applicability==='affected'?'Work required':'Not affected';next.assessment={at,actor,notes:note};
 }else if(action==='recall_plan'){
  if(!manager(u))throw Error('Manager access required.');
  if(['Not affected','Verified','Assess applicability'].includes(next.status))throw Error('Confirm that the bus is affected before planning remedial work.');
  const existing=(s.jobs||[]).find(j=>j.id===next.jobId&&j.garage===g&&j.vehicle===bus.id&&j.status!=='Cancelled');if(existing)return {id:next.id,jobId:existing.id};
  const job=operationsCommand(s,g,u,'job_create',{vehicle:bus.id,type:'Repair',title:x.reference+' — '+x.title,description:x.recall.remedy+'\n'+note,date:v.date||today(),priority:x.recall.mode==='stop'?'Urgent':'High'});
  job.bulletinId=x.id;job.bulletinVersion=x.version;job.recallId=next.id;next.jobId=job.id;
 }else if(action==='recall_report'){
  if(['Not affected','Verified','Assess applicability','Awaiting verification'].includes(next.status))throw Error('This recall is not ready for a repair report.');
  const job=next.jobId&&(s.jobs||[]).find(j=>j.id===next.jobId&&j.garage===g&&j.vehicle===bus.id);
  if(job&&job.status!=='Cancelled'&&job.assigneeId!==u.id&&!reviewer(u))throw Error('This recall job is assigned to another person.');
  if(!validDate(v.completedDate)||v.completedDate>today())throw Error('Record a valid repair date no later than today.');
  const reference=String(v.reference||'').trim();if(reference.length<3||reference.length>500)throw Error('Add the repair or manufacturer evidence reference.');
  next.status='Awaiting verification';next.report={at,actor,actorId:u.id,notes:note,reference,completedDate:v.completedDate};delete next.verification;
 }else if(action==='recall_verify'){
  if(!reviewer(u))throw Error('Supervisor access required.');
  if(next.status!=='Awaiting verification'||!next.report)throw Error('Record the remedy before verifying it.');
  const job=next.jobId&&(s.jobs||[]).find(j=>j.id===next.jobId&&j.garage===g&&j.vehicle===bus.id);
  if(job&&job.status!=='Completed')throw Error('Complete and sign off the linked recall job first.');
  if(v.confirm!=='yes')throw Error('Confirm the manufacturer’s remedy and required evidence have been checked.');
  next.status='Verified';next.verification={at,actor,actorId:u.id,notes:note};
 }else if(action==='recall_reopen'){
  if(!reviewer(u))throw Error('Supervisor access required.');
  next.status='Work required';delete next.verification;
 }else throw Error('Unknown recall action.');
 next.updatedAt=at;next.audit.push({at,actor,actorId:u.id,action,notes:note,previous});
 s.recallCases??=[];if(c)s.recallCases[s.recallCases.indexOf(c)]=next;else s.recallCases.push(next);
 return {id:next.id,jobId:next.jobId||null};
}
