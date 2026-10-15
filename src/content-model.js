import {addRecord} from './model.js';
// Organisation-authored content is shared by all of its garages.
export function saveContent(data,kind,values,actor){
 if(!['sops','checklists'].includes(kind))throw Error('Choose SOPs or checklists.');
 const list=data[kind]??=[],old=values.id?list.find(x=>x.id===values.id):null;
 if(values.id&&!old)throw Error('Content unavailable.');
 const title=String(values.title||'').trim(),instructions=String(values.instructions||'').trim();
 if(!title||title.length>160||!instructions||instructions.length>20000)throw Error('Enter a title and full instructions (up to 20,000 characters).');
 const steps=String(values.steps||'').split('\n').map(s=>s.trim()).filter(Boolean);
 if(!steps.length||steps.length>100||steps.some(s=>s.length>1000))throw Error('Enter 1–100 steps or questions, one per line (up to 1,000 characters each).');
 const entry={id:old?.id||crypto.randomUUID(),title,instructions,steps,version:(old?.version||0)+1,updated:new Date().toISOString(),updatedBy:actor,audit:[...(old?.audit||[]),...(old?[{at:new Date().toISOString(),actor,previous:{title:old.title,instructions:old.instructions,steps:old.steps,version:old.version}}]:[])]};
 if(old)list[list.indexOf(old)]=entry;else list.push(entry);data[kind]=list;return entry;
}
export function checklistCommand(state,garage,action,values,id,content,actor){
 const all=state.checklistRuns??=[];
 if(action==='checklist_start'){
  const template=content.checklists?.find(t=>t.id===values.template);if(!template)throw Error('Checklist unavailable.');
  if(values.vehicle&&!state.vehicles.some(v=>v.garage===garage&&v.id===values.vehicle))throw Error('Choose a bus in this garage.');
  const run={id:crypto.randomUUID(),garage,vehicle:values.vehicle||'',template:structuredClone(template),status:'In progress',created:new Date().toISOString(),createdBy:actor,answers:{}};delete run.template.audit;all.unshift(run);return run;
 }
 const run=all.find(r=>r.id===id&&r.garage===garage);if(!run)throw Error('Checklist record unavailable.');
 if(action==='checklist_return'){
  if(run.status!=='Awaiting review')throw Error('Only submitted checklists can be returned.');
  const notes=String(values.notes||'').trim();if(notes.length<5||notes.length>4000)throw Error('Explain the corrections needed (5–4000 characters).');
  (run.audit??=[]).push({action:'Return for correction',actor,notes,at:new Date().toISOString()});run.status='In progress';return {id};
 }
 if(action==='checklist_signoff'){
  if(run.status!=='Awaiting review')throw Error('Submit the checklist first.');
  if(Object.values(run.answers).some(a=>a.result==='Not completed'))throw Error('Unfinished items must be resolved before sign-off.');
  const notes=String(values.notes||'').trim();if(notes.length<5||notes.length>4000)throw Error('Enter the sign-off notes (5–4000 characters).');
  run.status='Completed';run.completedBy=actor;run.completedAt=new Date().toISOString();run.reviewNotes=notes;return {id};
 }
 if(run.status!=='In progress')throw Error('This checklist is locked for review.');
 if(action==='checklist_answer'){
  const n=Number(values.item);if(!Number.isInteger(n)||n<0||n>=run.template.steps.length)throw Error('Question unavailable.');
  if(!['OK','Fault','Not completed'].includes(values.result))throw Error('Choose a result.');
  const notes=String(values.notes||'').trim().slice(0,4000);if(values.result!=='OK'&&!notes)throw Error('Add details for this result.');
  (run.audit??=[]).push({item:n,previous:run.answers[n]||null,actor,at:new Date().toISOString()});
  let fault=run.answers[n]?.fault;
  if(values.result==='Fault'&&!fault){const record=addRecord(state,run.vehicle?'faults':'reports',{garage,vehicle:run.vehicle,title:run.template.title+': '+run.template.steps[n],description:notes,createdBy:actor,type:'Checklist issue'});fault=record.id;}
  run.answers[n]={fault,result:values.result,notes,actor,at:new Date().toISOString()};return {id};
 }
 if(action==='checklist_submit'){
  if(run.template.steps.some((_,n)=>!run.answers[n]))throw Error('Answer every question before submitting.');
  run.status='Awaiting review';run.submittedAt=new Date().toISOString();run.submittedBy=actor;return {id};
 }
 throw Error('Unknown checklist request.');
}
