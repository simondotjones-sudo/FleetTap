export function busTimeline(s,g,id){
 const b=s.vehicles.find(b=>b.id===id&&b.garage===g);if(!b)return [];
 const out=[],add=(type,at,title,actor,notes,link='',source='')=>out.push({type,at:at||'',title,actor:actor||'Not recorded',notes:notes||'',link,source});
 add('Bus',b.created,'Bus added',b.createdBy,'Fleet '+b.id,'vehicle/'+encodeURIComponent(id),id);
 for(const a of b.audit||[])add(a.action==='Road documents updated'?'Documents':a.event?.startsWith('Warranty')?'Warranty':'Bus',a.at,a.action||a.event,a.actor,a.reason||JSON.stringify(a.value||a.previous||{}),'vehicle/'+encodeURIComponent(id),id);
 const list=k=>(s[k]||[]).filter(r=>r.garage===g&&r.vehicle===id);
 for(const i of list('inspections')){
  const link='inspection-record/'+i.id;
  add('Inspection',i.created,'Inspection started · '+i.id,i.craftworker,i.status+(i.deletedAt?' · deleted':''),link,i.id);
  for(const a of i.audit||[]){const value=a.value;add('Inspection',a.at,a.action||(a.item?'Check '+a.item+' · '+(value?.result||'Updated'):'Inspection updated'),a.actor||value?.worker||a.worker,value?[value.notes,(value.readings||[]).join(' · '),value.recheck?'Recheck: '+value.recheck.note:''].filter(Boolean).join(' · '):a.reason||a.notes||(a.readings||[]).join(' · '),link,i.id);}
  if(i.completedAt)add('Inspection',i.completedAt,'Inspection signed off',i.completedBy,i.completedDate,link,i.id);
 }
 for(const k of ['faults','reports','actions'])for(const r of list(k)){
  const type={faults:'Fault',reports:'Report',actions:'Action'}[k],link=k==='faults'?'history/'+encodeURIComponent(id)+'/fault/'+r.id:k==='actions'?'actions/'+r.id:'';
  add(type,r.created||r.audit?.[0]?.at,type+' · '+r.title,r.createdBy||r.owner,r.description||r.evidence,link,r.id);
  for(const a of r.audit||[])add(type,a.at,a.action||'Updated',a.actor,a.notes||a.reason||a.evidence,link,r.id);
  if(r.closedAt)add(type,r.closedAt,type+' closed',r.closedBy,r.closureNotes,link,r.id);
 }
 for(const j of list('jobs'))for(const a of j.audit||[])add('Job',a.at,j.title+' · '+a.event,a.actor,a.note||a.reason||'', 'my-jobs/'+j.id,j.id);
 for(const r of list('checklistRuns')){
  add('Checklist',r.created,r.template?.title||'Checklist started',r.createdBy,r.status,'checklists/run/'+r.id,r.id);
  for(const [n,a] of Object.entries(r.answers||{}))add('Checklist',a.at,(r.template?.steps[n]||'Check')+' · '+a.result,a.actor,a.notes,'checklists/run/'+r.id,r.id);
  for(const a of r.audit||[])add('Checklist',a.at,a.action||'Answer amended',a.actor,a.notes,'checklists/run/'+r.id,r.id);
  if(r.completedAt)add('Checklist',r.completedAt,'Checklist signed off',r.completedBy,r.reviewNotes,'checklists/run/'+r.id,r.id);
 }
 for(const d of list('downtime')){
  const link='performance/bus/'+encodeURIComponent(id);
  add('Downtime',d.startedAt,'Off road'+(d.voidedAt?' · voided':''),d.createdBy,d.reason,link,d.id);
  if(d.endedAt)add('Downtime',d.endedAt,'Returned from repair',d.updatedBy,d.reason,link,d.id);
  for(const a of d.audit||[])add('Downtime',a.at,a.action||a.event||'Downtime updated',a.actor,a.reason||a.notes||'',link,d.id);
 }
 for(const e of list('releaseEvents'))add('Release',e.at,{release:'Released for service',hold:'Supervisor hold',hold_cleared:'Supervisor hold cleared',invalidated:'Release invalidated'}[e.type]||e.type,e.actor,e.notes,'bus-release/'+encodeURIComponent(id),e.id);
 for(const r of list('serviceHistory')){
  add('Historical service',r.date+'T12:00:00Z','Historical service'+(r.voidedAt?' · voided':''),r.performedBy,r.notes+' · Evidence: '+r.reference+' · Recorded by '+r.actor+' at '+r.at,'',r.id);
  if(r.voidedAt)add('Historical service',r.voidedAt,'Historical entry voided',r.voidedBy,r.voidReason,'',r.id);
 }
 return out.sort((a,b)=>b.at.localeCompare(a.at)||a.type.localeCompare(b.type));
}
export function timelineCSV(rows){const cell=x=>'"'+String(x??'').replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')+'"';return [['Date / time','Type','Event','Person','Evidence / details','Record'],...rows.map(x=>[x.at,x.type,x.title,x.actor,x.notes,x.source])].map(r=>r.map(cell).join(',')).join('\r\n');}
