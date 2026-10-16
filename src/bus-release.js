import {reviewer,manager,workerName} from './roles.js';
import {today,validDate,scheduleStatus} from './scheduling.js';
import {isPM3,tasksFor} from './templates.js';
const rows=(s,g,b,k)=>(s[k]||[]).filter(x=>x.garage===g&&x.vehicle===b);
const busFor=(s,g,id)=>{const b=s.vehicles.find(b=>b.id===id&&b.garage===g);if(!b)throw Error('Bus unavailable in this garage.');return b;};
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
// Explicit fields only: financial details and staff-only assignments are not release evidence.
export function releaseAssessment(s,g,id,date=today()){
 const b=busFor(s,g,id),blockers=[],unknown=[];
 const live=k=>rows(s,g,id,k).filter(x=>!x.deletedAt&&!x.voidedAt);
 const faults=live('faults'),jobs=live('jobs'),ins=live('inspections').filter(isPM3),checks=live('checklistRuns'),actions=live('actions'),down=live('downtime');
 if(faults.some(x=>x.status!=='Closed'))blockers.push('Open vehicle faults must be reviewed and closed.');
 if(actions.some(x=>x.status!=='Closed'))blockers.push('Vehicle corrective actions remain open or awaiting review.');
 if(jobs.some(x=>!['Completed','Cancelled'].includes(x.status)&&(x.date<=date||['In progress','Waiting','Awaiting sign-off'].includes(x.status))))blockers.push('Vehicle jobs remain unfinished or awaiting sign-off.');
 if(ins.some(x=>x.status!=='Completed'))blockers.push('Inspection work remains unfinished or awaiting review.');
 if(ins.some(x=>x.status!=='Completed'&&tasksFor(x).some(t=>t.blocked)))blockers.push('PM3 technical instruction conflict remains blocked.');
 if(ins.some(x=>Object.values(x.rechecks||{}).some(r=>!r.resolvedAt)))blockers.push('Outstanding measurement rechecks.');
 if(checks.some(x=>x.status!=='Completed'))blockers.push('Bus checklists remain unfinished or awaiting sign-off.');
 if(down.some(x=>!x.endedAt))blockers.push('An off-road period is still open. Record actual return from repair before release.');
 const docs=b.roadDocuments||{};
 for(const [key,label] of [['cvrt','CVRT'],['tax','Tax']]){const d=docs[key];if(!d||!validDate(d.expires)||!d.reference)unknown.push(label+' expiry and evidence are not recorded.');else if(d.expires<date)blockers.push(label+' expired on '+d.expires+'.');}
 const completed=ins.slice().sort((a,b)=>(b.created||'').localeCompare(a.created||'')).slice(0,1).filter(x=>x.status==='Completed'&&validDate(x.completedDate)&&x.completedDate<=date&&x.completedBy&&tasksFor(x).length&&tasksFor(x).every(t=>!t.blocked&&x.answers?.[t.id]&&['OK','Defect','Not due'].includes(x.answers[t.id].result)&&(x.answers[t.id].result!=='Defect'||faults.some(f=>f.id===x.answers[t.id].fault&&f.status==='Closed')))&&!Object.values(x.rechecks||{}).some(r=>!r.resolvedAt)).sort((a,b)=>b.completedDate.localeCompare(a.completedDate))[0];
 if(!completed)unknown.push('No signed-off, complete inspection is recorded. A planning date or historical note is not inspection evidence.');
 const schedule=scheduleStatus(s,g,id,date);
 if(!schedule.due||schedule.status==='Paused')unknown.push('An active inspection due date is required.');else if(schedule.due<=date)blockers.push('Inspection is due '+schedule.due+'; complete the required inspection before release.');
 const latest=rows(s,g,id,'releaseEvents').at(-1);
 if(latest?.type==='hold')blockers.push('Supervisor hold: '+latest.notes);
 const compact=k=>rows(s,g,id,k).map(x=>({id:x.id,status:x.status,deletedAt:x.deletedAt||null,voidedAt:x.voidedAt||null,updated:x.updatedAt||x.updated||null,audit:(x.audit||[]).map(a=>({at:a.at,action:a.action,event:a.event,actor:a.actor,reason:a.reason})),answers:k==='inspections'||k==='checklistRuns'?x.answers:undefined,rechecks:x.rechecks,startedAt:x.startedAt,endedAt:x.endedAt,closedAt:x.closedAt,completedAt:x.completedAt}));
 const evidence={bus:{id:b.id,registration:b.registration||'',modelType:b.modelType||'',model:b.model},documents:docs,inspection:completed?.id||null,due:schedule.due,schedule:schedule.schedule||null,records:Object.fromEntries(['faults','actions','jobs','inspections','checklistRuns','downtime'].map(k=>[k,compact(k)]))};
 const fingerprint=canonical(evidence);
 const eligible=!blockers.length&&!unknown.length;
 const released=eligible&&latest?.type==='release'&&latest.fingerprint===fingerprint;
 return {assessedDate:date,status:blockers.length?'Off road':unknown.length?'Status unconfirmed':released?'Released for service':'Awaiting release',eligible,blockers,unknown,evidence,fingerprint,lastDecision:latest?{type:latest.type,actor:latest.actor,at:latest.at,notes:latest.notes}:null};
}
export function releaseCommand(s,g,u,action,v,id){
 const b=busFor(s,g,id),at=new Date().toISOString(),actor=workerName(u),notes=String(v.notes||'').trim();
 if(!reviewer(u))throw Error('Supervisor access required.');
 if(notes.length<5||notes.length>2000)throw Error('Record supporting evidence or a reason (5–2000 characters).');
 if(action==='road_documents'){
  if(!manager(u))throw Error('Manager access required.');
  const next={};for(const key of ['cvrt','tax']){const expires=String(v[key+'Expires']||''),reference=String(v[key+'Reference']||'').trim();if(!validDate(expires)||reference.length<3||reference.length>500)throw Error('Enter valid CVRT and tax expiry dates with evidence references.');next[key]={expires,reference};}
  (b.audit??=[]).push({action:'Road documents updated',at,actor,reason:notes,previous:structuredClone(b.roadDocuments||{}),value:next});b.roadDocuments=next;return {id};
 }
 s.releaseEvents??=[];
 if(action==='bus_clear_hold'){
  if(rows(s,g,id,'releaseEvents').at(-1)?.type!=='hold')throw Error('No active supervisor hold.');
 }else if(action==='bus_release'){
  const a=releaseAssessment(s,g,id);if(!a.eligible)throw Error('Release blocked: '+[...a.blockers,...a.unknown].join(' '));
  if(v.confirm!=='yes')throw Error('Confirm you have reviewed the evidence and authorise release.');
  if(a.status==='Released for service')throw Error('Bus already released against these records.');
  const e={id:crypto.randomUUID(),garage:g,vehicle:id,type:'release',at,actor,actorId:u.id,notes,evidence:structuredClone(a.evidence),fingerprint:a.fingerprint};s.releaseEvents.push(e);return {id:e.id};
 }else if(action!=='bus_hold')throw Error('Unknown release command.');
 const e={id:crypto.randomUUID(),garage:g,vehicle:id,type:action==='bus_hold'?'hold':'hold_cleared',at,actor,actorId:u.id,notes};s.releaseEvents.push(e);return {id:e.id};
}
export function refreshReleaseHolds(s,g,u){
 for(const b of s.vehicles.filter(b=>b.garage===g)){
  const last=rows(s,g,b.id,'releaseEvents').at(-1);if(last?.type!=='release')continue;
  const a=releaseAssessment(s,g,b.id);if(a.status==='Released for service')continue;
  s.releaseEvents.push({id:crypto.randomUUID(),garage:g,vehicle:b.id,type:'invalidated',at:new Date().toISOString(),actor:workerName(u),actorId:u.id,notes:'Previous release invalidated: '+([...a.blockers,...a.unknown].join(' ')||'Supporting vehicle records changed. Fresh supervisor release required.'),releaseId:last.id});
 }
}
export function withReleaseStatus(s,g){
 return {...s,releaseStatuses:Object.fromEntries(s.vehicles.filter(b=>b.garage===g).map(b=>{const {evidence,fingerprint,...a}=releaseAssessment(s,g,b.id);return [b.id,a];}))};
}
export function visibleRelease(s,u){return manager(u)?s:{...s,releaseEvents:(s.releaseEvents||[]).map(({evidence,fingerprint,...e})=>e)};}
export function serviceHistoryCommand(s,g,u,action,v,id){
 if(!reviewer(u))throw Error('Supervisor access required.');
 const notes=String(v.notes||'').trim(),at=new Date().toISOString(),actor=workerName(u);if(notes.length<5||notes.length>4000)throw Error('Add service details / correction reason (5–4000 characters).');
 s.serviceHistory??=[];
 if(action==='service_void'){const r=s.serviceHistory.find(x=>x.id===id&&x.garage===g&&!x.voidedAt);if(!r)throw Error('Service entry unavailable.');r.voidedAt=at;r.voidedBy=actor;r.voidReason=notes;return {id};}
 busFor(s,g,v.vehicle);if(!validDate(v.date)||v.date>today())throw Error('Choose a service date no later than today.');
 const reference=String(v.reference||'').trim(),performedBy=String(v.performedBy||'').trim();if(reference.length<3||reference.length>500||!performedBy||performedBy.length>200)throw Error('Record the original evidence reference and who performed the service.');
 const r={id:crypto.randomUUID(),garage:g,vehicle:v.vehicle,date:v.date,reference,performedBy,notes,at,actor};s.serviceHistory.push(r);return {id:r.id};
}
