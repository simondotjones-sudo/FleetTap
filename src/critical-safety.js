// FleetTap pilot policy agreed with Simon. These are not classifications in TO-PMS 035.
// Explicit false values are authoritative; later template edits never downgrade saved faults.
export const criticalSafetyPolicy='FleetTap pilot safety policy · 17 October 2026';
export const criticalPM3Ids=new Set([
 '1-2','1-3','2-13','2-15','2-16','2-17','3-4',
 '4-1','4-2','4-3','4-5','4-6','4-7','4-8','4-9','4-10','4-11','4-12',
 '5-1','5-2','5-3','5-6','5-7','6-1','6-2','6-3','6-5','6-8',
 '7-1','7-3','7-4','7-6','8-4','8-5','8-6','9-1','9-2',
 '10-1','10-2','10-3','10-4','10-7','10-8','10-9','10-11','10-12',
 '11-1','11-1.1','11-1.2','11-1.3','11-1.4','11-1.5','11-1.7','11-1.8',
 '12-2.1','12-2.2','12-2.3','12-2.4','12-2.5',
 '13-3.1','13-3.2','13-3.3','13-3.4','14-4.1','14-4.2','14-4.3','15-5.1','15-5.2','15-5.3',
 '16-1','16-2','16-3','16-4','16-5','16-6','16-7','16-9','16-10','17-1'
]);
export const criticalTask=t=>typeof t?.criticalSafety==='boolean'?t.criticalSafety:criticalPM3Ids.has(t?.id);
export const criticalStep=(template,n)=>template?.criticalSafetySteps?.includes(Number(n))===true;
export function isCriticalFault(state,f){
 if(!f)return false;
 if(typeof f.criticalSafety==='boolean')return f.criticalSafety;
 // Backfill only unresolved legacy PM3 defects; closed history keeps its original meaning.
 if(f.status==='Closed'||!f.inspection||!f.item)return false;
 const i=(state.inspections||[]).find(i=>i.id===f.inspection&&i.garage===f.garage);
 if(!i)return false;
 const task=i.templateSnapshot?.tasks?.find(t=>t.id===f.item);
 return task?criticalTask(task):!i.templateSnapshot&&criticalPM3Ids.has(f.item);
}
export const safetyResolved=f=>f?.status==='Closed'&&f.safetyResolution?.verified===true&&!!f.safetyResolution?.repairEvidence?.trim()&&!!f.safetyResolution?.recheckEvidence?.trim()&&!!f.safetyResolution?.actor&&!!f.safetyResolution?.at;
export const criticalFaults=(state,garage,vehicle)=>(state.faults||[]).filter(f=>f.garage===garage&&(vehicle===undefined||f.vehicle===vehicle)&&isCriticalFault(state,f));
export const openCriticalFaults=(state,garage,vehicle)=>criticalFaults(state,garage,vehicle).filter(f=>!safetyResolved(f));
export function criticalSummary(state,garage,vehicle){
 const all=criticalFaults(state,garage,vehicle),open=all.filter(f=>!safetyResolved(f));
 return {total:all.length,open:open.length,resolved:all.length-open.length,busesHeld:new Set(open.map(f=>f.vehicle).filter(Boolean)).size,checksAffected:new Set(all.map(f=>f.inspection||f.checklistRun).filter(Boolean)).size};
}
export function checkCriticalFaults(state,run){return criticalFaults(state,run.garage,run.vehicle).filter(f=>f.inspection===run.id||f.checklistRun===run.id);}
export function criticalCheckBlocked(state,run){
 if(checkCriticalFaults(state,run).some(f=>!safetyResolved(f)))return true;
 const tasks=run.templateSnapshot?.tasks;
 return Object.entries(run.answers||{}).some(([key,a])=>{
  const task=tasks?.find(t=>t.id===key),fault=(state.faults||[]).find(f=>f.id===a.fault&&f.garage===run.garage&&f.vehicle===run.vehicle);
  if(fault?.status==='Closed'&&fault.criticalSafety===undefined&&task?.criticalSafety===undefined)return false;
  const critical=tasks?criticalTask(task):run.template?.steps?criticalStep(run.template,key):criticalPM3Ids.has(key);
  return critical&&['Defect','Fixed','Fault'].includes(a.result)&&!safetyResolved(fault);
 });
}
