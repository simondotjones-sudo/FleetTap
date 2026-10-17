import {workerName} from './roles.js';
import {individualSchedule,modelSchedule,scheduleStatus} from './scheduling.js';
import {vehicleModelType} from './fleet-models.js';
import {templateFor} from './templates.js';

export const busRecordKeys=['inspections','faults','reports','actions','schedules','jobs','downtime','checklistRuns','releaseEvents','serviceHistory'];
export function busBundle(state,garage,id){
 const vehicle=state.vehicles.find(b=>b.garage===garage&&b.id===id);
 if(!vehicle)throw Error('Bus unavailable in this garage.');
 const bundle={vehicles:[vehicle]};
 for(const key of busRecordKeys)bundle[key]=(state[key]||[]).filter(r=>r.garage===garage&&r.vehicle===id);
 // Include corrective actions linked to the bus's reports, even in older records without a vehicle field.
 const sources=new Set([...bundle.faults,...bundle.reports].map(r=>r.id));
 bundle.actions=(state.actions||[]).filter(r=>r.garage===garage&&(r.vehicle===id||sources.has(r.source)));
 return structuredClone(bundle);
}
export function transferBus(source,destination,from,to,u,id,values,now=new Date()){
 if(u.role!=='organisation_admin'||u.organisation_id!==from.organisation_id||u.organisation_id!==to.organisation_id)throw Error('Organisation Admin access required within this organisation.');
 if(from.id===to.id)throw Error('Choose a different garage.');
 const reason=String(values.reason||'').trim();if(reason.length<5||reason.length>2000)throw Error('Enter a transfer reason (5–2000 characters).');
 if(values.confirm!=='yes')throw Error('Confirm the transfer and outstanding work handover.');
 if(destination.vehicles.some(b=>b.garage===to.id&&b.id===id))throw Error('This fleet number already exists in the receiving garage.');
 const bundle=busBundle(source,from.id,id);
 for(const i of bundle.inspections)i.templateSnapshot??=structuredClone(templateFor(source));
 const original=structuredClone(bundle),bus=bundle.vehicles[0],at=now.toISOString(),actor=workerName(u);
 for(const key of busRecordKeys)for(const row of bundle[key])if((destination[key]||[]).some(r=>r.id===row.id))throw Error('A linked record already exists in the receiving garage. Resolve the duplicate before moving this bus.');
 const oldSchedule=scheduleStatus(source,from.id,id),parent=modelSchedule(destination,to.id,vehicleModelType(bus));
 // A legacy garage rule must not silently disappear or change when a bus moves.
 if(!individualSchedule(source,from.id,id)&&oldSchedule.schedule&&JSON.stringify([oldSchedule.schedule.interval,oldSchedule.schedule.unit,oldSchedule.schedule.basis,oldSchedule.schedule.firstDue,oldSchedule.schedule.lastDate,oldSchedule.schedule.enabled])!==JSON.stringify(parent&&[parent.interval,parent.unit,parent.basis,parent.firstDue,parent.lastDate,parent.enabled])){
  bundle.schedules.push({...structuredClone(oldSchedule.schedule),id:crypto.randomUUID(),vehicle:id,modelType:undefined,garage:from.id,audit:[...(oldSchedule.schedule.audit||[]),{at,actor,action:'Preserved schedule on garage transfer',reason}]});
 }
 const event={id:crypto.randomUUID(),vehicle:id,from:from.id,fromName:from.name,to:to.id,toName:to.name,at,actor,actorId:u.id,reason};
 event.openJobs=bundle.jobs.filter(j=>!['Completed','Cancelled'].includes(j.status)).length;
 event.openActions=bundle.actions.filter(a=>a.status!=='Closed'&&!a.deletedAt).length;
 for(const i of bundle.inspections)i.templateSnapshot??=structuredClone(templateFor(source));
 for(const key of ['vehicles',...busRecordKeys])for(const row of bundle[key]){row.originGarage??=from.id;row.garage=to.id;}
 for(const j of bundle.jobs)if(!['Completed','Cancelled'].includes(j.status)){
  (j.audit??=[]).push({at,actor,actorId:u.id,event:'Garage transfer',note:reason,previous:{status:j.status,assigneeId:j.assigneeId,assigneeName:j.assigneeName,date:j.date,time:j.time}});
  j.assigneeId=null;j.assigneeName='';j.transferReview={from:from.name,at};j.updatedAt=at;
  if(j.status!=='Awaiting sign-off'){j.status='Unassigned';j.waitingReason='Garage transfer';j.date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);j.time='';}
 }
 for(const a of bundle.actions)a.vehicle=id;
 for(const a of bundle.actions)if(a.status!=='Closed'&&!a.deletedAt){
  (a.audit??=[]).push({at,actor,action:'Garage transfer',reason,previous:{assignedTo:a.assignedTo,owner:a.owner}});a.assignedTo=null;a.owner='Unassigned';
 }
 (bus.audit??=[]).push({action:'Garage transfer',at,actor,reason:from.name+' → '+to.name+' · '+reason,transferId:event.id});
 // Preserve attachment locations; access is checked against the new record, never a caller-supplied source garage.
 destination.attachmentOrigins??={};destination.attachmentOrigins.photos??={};destination.attachmentOrigins.documents??={};
 for(const r of [...bundle.faults,...bundle.reports])for(const photo of r.photos||[])destination.attachmentOrigins.photos[photo]=source.attachmentOrigins?.photos?.[photo]||from.id;
 for(const i of bundle.inspections)if(i.templateSnapshot?.sourceId)destination.attachmentOrigins.documents[i.templateSnapshot.sourceId]=source.attachmentOrigins?.documents?.[i.templateSnapshot.sourceId]||from.id;
 for(const key of ['vehicles',...busRecordKeys]){
  const ids=new Set(original[key].map(r=>r.id));source[key]=(source[key]||[]).filter(r=>!(r.garage===from.id&&ids.has(r.id)));
  destination[key]??=[];destination[key].push(...bundle[key]);
 }
 (source.vehicleTransfers??=[]).push(event);(destination.vehicleTransfers??=[]).push(structuredClone(event));
 (source.vehicleTransferArchive??=[]).push({...event,state:original});
 return {id,garage:to.id,transferId:event.id,openJobs:event.openJobs,openActions:event.openActions};
}
