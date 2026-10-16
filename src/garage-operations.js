import {manager,reviewer,workerName} from './roles.js';
import {today,validDate,scheduleStatus} from './scheduling.js';
import {startInspection} from './inspections.js';
export const jobStatuses=['Unassigned','Assigned','In progress','Waiting','Awaiting sign-off','Completed','Cancelled'];
export const jobTypes=['Scheduled inspection','Drive-in repair','Repair','Other'];
export const jobOpen=j=>!['Completed','Cancelled'].includes(j.status);
export const garageJobs=(s,g)=>(s.jobs||[]).filter(j=>j.garage===g);
export const dayShift=(s,g,u,date=today())=>(s.shifts||[]).find(x=>x.garage===g&&x.userId===u&&x.date===date&&!x.endedAt);
export const jobsForDay=(s,g,date=today())=>garageJobs(s,g).filter(j=>j.date===date||(j.date<date&&jobOpen(j)));
export function visibleOperations(s,u){return reviewer(u)?s:{...s,jobs:(s.jobs||[]).filter(j=>j.assigneeId===u.id),shifts:(s.shifts||[]).filter(x=>x.userId===u.id)};}
const text=(v,max=2000)=>String(v||'').trim().slice(0,max);
function requireThat(ok,message){if(!ok)throw Error(message);}
export function operationsCommand(s,g,u,action,v={},id='',assignee=null,now=new Date()){
 const at=now.toISOString(),date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),actor=workerName(u);
 s.jobs??=[];s.shifts??=[];s.briefings??=[];
 const audit=(j,event,details={})=>{(j.audit??=[]).push({at,actorId:u.id,actor,event,...details});j.updatedAt=at;};
 if(action==='shift_start'){
  const active=dayShift(s,g,u.id,date);if(active)return active;
  const shift={id:crypto.randomUUID(),garage:g,userId:u.id,name:u.name,date,startedAt:at,endedAt:null,handover:''};s.shifts.push(shift);return shift;
 }
 if(action==='shift_end'){
  const active=dayShift(s,g,u.id,date);
  const running=garageJobs(s,g).filter(j=>j.assigneeId===u.id&&j.status==='In progress');
  const note=text(v.note);requireThat(!running.length||note,'Add a handover for your unfinished work.');
  for(const j of running){j.status='Waiting';j.waitingReason='End of day';j.handover=note;audit(j,'Day ended',{note});}
  if(active){active.endedAt=at;active.handover=note;}
  return {id:active?.id||null};
 }
 if(action==='briefing_save'){
  requireThat(manager(u),'Manager access required.');requireThat(validDate(v.date),'Choose a valid date.');
  let b=s.briefings.find(b=>b.garage===g&&b.date===v.date);if(!b){b={id:crypto.randomUUID(),garage:g,date:v.date,audit:[]};s.briefings.push(b);}
  const note=text(v.note,4000);requireThat(note,'Enter the daily briefing.');audit(b,'Briefing updated',{previous:b.note||'',note});b.note=note;b.author=u.name;return b;
 }
 if(action==='job_create'){
  requireThat(manager(u),'Manager access required.');
  if(v.requestId){requireThat(/^[a-f0-9-]{36}$/i.test(v.requestId),'Invalid job request.');const prior=s.jobs.find(j=>j.garage===g&&j.createdBy===u.id&&j.requestId===v.requestId);if(prior)return prior;}
  requireThat(validDate(v.date),'Choose a valid job date.');
  requireThat(s.vehicles.some(b=>b.garage===g&&b.id===v.vehicle),'Choose a bus in this garage.');
  requireThat(jobTypes.includes(v.type),'Choose a job type.');requireThat(['Normal','High','Urgent'].includes(v.priority),'Choose a priority.');
  requireThat(!v.time||/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time),'Choose a valid start time.');
  const title=text(v.title,160);requireThat(title,'Enter the work required.');
  let due='',fault=null;
  if(v.type==='Scheduled inspection'){
   due=scheduleStatus(s,g,v.vehicle,date).due;requireThat(due,'Set the bus inspection schedule first.');
   requireThat(!garageJobs(s,g).some(j=>j.vehicle===v.vehicle&&j.type===v.type&&j.status!=='Cancelled'&&(jobOpen(j)||j.sourceDue===due)),'This scheduled inspection already has a job.');
  }
  if(v.faultId){fault=(s.faults||[]).find(f=>f.garage===g&&f.id===v.faultId&&f.vehicle===v.vehicle&&!f.deletedAt&&f.status!=='Closed');requireThat(fault,'Choose an open fault for this bus.');requireThat(!garageJobs(s,g).some(j=>j.faultId===fault.id&&jobOpen(j)),'This fault already has an open job.');}
  const j={id:crypto.randomUUID(),garage:g,vehicle:v.vehicle,type:v.type,title,description:text(v.description,4000),date:v.date,time:v.time||'',priority:v.priority,sourceDue:due,faultId:fault?.id||null,assigneeId:assignee?.id||null,assigneeName:assignee?.name||'',status:assignee?'Assigned':'Unassigned',createdAt:at,createdBy:u.id,requestId:v.requestId||null,audit:[]};
  s.jobs.push(j);audit(j,'Created');return j;
 }
 const j=s.jobs.find(j=>j.id===id&&j.garage===g);requireThat(j,'Job unavailable in this garage.');
 if(action==='job_plan'){
  requireThat(manager(u),'Manager access required.');requireThat(['Assigned','Unassigned','Waiting'].includes(j.status),'Pause work before changing its assignment or schedule.');requireThat(validDate(v.date),'Choose a valid date.');requireThat(!v.time||/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time),'Choose a valid time.');
  audit(j,'Plan changed',{previous:{assigneeId:j.assigneeId,date:j.date,time:j.time},assigneeId:assignee?.id||null,date:v.date,time:v.time||''});
  j.assigneeId=assignee?.id||null;j.assigneeName=assignee?.name||'';j.date=v.date;j.time=v.time||'';j.status=assignee?'Assigned':'Unassigned';j.waitingReason='';return j;
 }
 if(action==='job_cancel'){
  requireThat(manager(u)&&['Assigned','Unassigned','Waiting'].includes(j.status),'Only a manager can cancel work that is not underway.');requireThat(text(v.note),'Give a reason for cancellation.');j.status='Cancelled';audit(j,'Cancelled',{note:text(v.note)});return j;
 }
 if(['job_signoff','job_return'].includes(action)){
  requireThat(reviewer(u),'Supervisor access required.');requireThat(j.status==='Awaiting sign-off','This job is not awaiting sign-off.');requireThat(text(v.note),'Add your review notes.');
  if(action==='job_signoff'){
   if(j.type==='Scheduled inspection')requireThat(s.inspections.some(i=>i.id===j.inspectionId&&i.garage===g&&!i.deletedAt&&i.status==='Completed'),'Complete the linked inspection review first.');
   if(j.faultId)requireThat(s.faults.some(f=>f.id===j.faultId&&f.garage===g&&!f.deletedAt&&f.status==='Closed'),'Review and close the linked fault first.');
   j.status='Completed';j.completedAt=at;
  }else{j.status=j.assigneeId?'Assigned':'Unassigned';j.handover=text(v.note);}
  audit(j,action==='job_signoff'?'Signed off':'Returned for work',{note:text(v.note)});return j;
 }
 requireThat(j.assigneeId===u.id,'This job is not assigned to you.');
 requireThat(dayShift(s,g,u.id,date),'Start your day before working on a job.');
 if(action==='job_start'){
  requireThat(['Assigned','Waiting'].includes(j.status),'This job cannot be started.');requireThat(j.date<=date,'This job is planned for a future day.');
  requireThat(!garageJobs(s,g).some(x=>x.id!==id&&x.assigneeId===u.id&&x.status==='In progress'),'Pause your current job before starting another.');
  j.status='In progress';j.startedAt??=at;j.waitingReason='';audit(j,'Started');return j;
 }
 if(action==='job_checks'){
  requireThat(j.type==='Scheduled inspection'&&j.status==='In progress','Start the inspection job first.');
  let inspection=s.inspections.find(i=>i.id===j.inspectionId&&i.garage===g&&!i.deletedAt);
  if(!inspection){inspection=startInspection(s,j.vehicle,g,actor);j.inspectionId=inspection.id;audit(j,'Inspection linked',{inspectionId:inspection.id});}return {id:inspection.id};
 }
 if(action==='job_wait'){
  requireThat(j.status==='In progress','Only work in progress can be paused.');
  requireThat(['Awaiting parts','Awaiting manufacturer','Paused','Other'].includes(v.reason),'Choose a waiting reason.');requireThat(text(v.note),'Add a handover or next action.');
  j.status='Waiting';j.waitingReason=v.reason;j.handover=text(v.note);audit(j,'Waiting',{reason:v.reason,note:j.handover});return j;
 }
 if(action==='job_submit'){
  requireThat(j.status==='In progress','Start or resume the job before submitting it.');requireThat(text(v.note),'Record the work completed.');
  if(j.type==='Scheduled inspection')requireThat(s.inspections.some(i=>i.id===j.inspectionId&&i.garage===g&&!i.deletedAt&&['Awaiting review','Completed'].includes(i.status)),'Submit the linked inspection before submitting this job.');
  j.status='Awaiting sign-off';j.workDone=text(v.note);j.submittedAt=at;audit(j,'Submitted for sign-off',{note:j.workDone});return j;
 }
 throw Error('Unknown garage operation.');
}
