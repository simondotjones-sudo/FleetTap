import {isCriticalFault,criticalSafetyPolicy} from './critical-safety.js';
export function returnAction(state,garage,id,values,actor){
 const r=state.actions.find(a=>a.id===id&&a.garage===garage&&!a.deletedAt);
 if(!r||r.status!=='Awaiting review')throw Error('Choose an action awaiting review.');
 const notes=String(values.notes||'').trim();if(notes.length<5||notes.length>4000)throw Error('Explain the work still required (5–4000 characters).');
 (r.audit??=[]).push({action:'Returned for work',actor,notes,at:new Date().toISOString(),previous:{status:r.status,evidence:r.evidence}});
 r.status='Open';r.nextStep=notes;r.returnNotes=notes;return {id};
}
export function closeRecord(state,garage,kind,id,values,actor){
 if(!['faults','reports','actions'].includes(kind))throw Error('Choose a fault, report or action.');
 const r=state[kind].find(r=>r.id===id&&r.garage===garage&&!r.deletedAt);
 if(!r)throw Error('Record unavailable in this garage.');
 if(r.status==='Closed')throw Error('This record is already closed.');
 const notes=String(values.notes||'').trim();if(notes.length<5||notes.length>4000)throw Error('Record the review and closure evidence (5–4000 characters).');
 if(kind==='actions'&&r.status!=='Awaiting review')throw Error('Record the completed work before closing this action.');
 if(kind!=='actions'&&state.actions.some(a=>a.garage===garage&&a.source===id&&a.status!=='Closed'))throw Error('Review and close the linked actions first.');
 if(kind==='faults'&&isCriticalFault(state,r)){
  const repairEvidence=String(values.repairEvidence||'').trim(),recheckEvidence=String(values.recheckEvidence||'').trim();
  if(values.safetyVerified!=='yes'||repairEvidence.length<5||repairEvidence.length>4000||recheckEvidence.length<5||recheckEvidence.length>4000)throw Error('Critical Safety Fault: record the repair, successful recheck and confirm the bus fault is fixed. Deferral cannot clear a critical fault.');
  r.criticalSafety=true;r.safetySource??={kind:'PM3',item:r.item,policy:criticalSafetyPolicy};
  r.safetyResolution={repairEvidence,recheckEvidence,verified:true,actor,at:new Date().toISOString()};
 }
 (r.audit??=[]).push({action:'Close',at:new Date().toISOString(),actor,previous:{status:r.status},notes});
 r.status='Closed';r.closedAt=new Date().toISOString();r.closedBy=actor;r.closureNotes=notes;
 return {id};
}
