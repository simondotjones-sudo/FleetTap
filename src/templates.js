import {criticalTask} from './critical-safety.js';
import {pm3} from './pm3.js';

export const PM3_ID='pm3';
export function templateFor(state){const t=state.inspectionTemplate||{id:PM3_ID,version:1,title:'SG271+ · PM3',tasks:structuredClone(pm3),sourceId:null};return {...t,tasks:(t.tasks||pm3).map(task=>({...task,criticalSafety:criticalTask(task)}))};}
export const tasksFor=inspection=>inspection?.templateSnapshot?.tasks||pm3;
export const fieldsFor=task=>task?.fields;
export const isPM3=i=>i?.templateId===PM3_ID||i?.template?.startsWith('TO-PMS 035');
const text=(v,max=4000)=>String(v??'').trim().slice(0,max);
function record(template,actor,action,previous){
 template.version++;template.updated=new Date().toISOString();
 (template.audit??=[]).push({action,actor,at:template.updated,previous});
}
// Domain commands only: caller cannot replace the entire template or clear the blocked source item.
export function editTemplate(state,values,actor){
 const current=templateFor(state),t=structuredClone(current),op=values.operation;
 const sections=[...new Set(t.tasks.map(x=>x.section))];
 if(op==='section'){
  const from=text(values.section,120),name=text(values.name,120);
  if(!sections.includes(from)||!name)throw Error('Choose a section and enter its name.');
  if(name!==from&&sections.includes(name))throw Error('A section with that name already exists.');
  t.tasks.filter(x=>x.section===from).forEach(x=>x.section=name);
  record(t,actor,'Rename section',{from,to:name});
 }else if(op==='move_section'){
  const n=sections.indexOf(values.section),to=n+Number(values.direction);
  if(n<0||![1,-1].includes(Number(values.direction))||to<0||to>=sections.length)throw Error('Cannot move this section.');
  [sections[n],sections[to]]=[sections[to],sections[n]];
  t.tasks.sort((a,b)=>sections.indexOf(a.section)-sections.indexOf(b.section));record(t,actor,'Reorder section',{section:values.section,direction:values.direction});
 }else if(op==='delete_section'){
  if(!sections.includes(values.section))throw Error('Choose a section.');
  if(t.tasks.some(x=>x.section===values.section&&x.blocked))throw Error('The blocked regeneration item must remain until Technical Office approval.');
  if(sections.length<=1)throw Error('Keep at least one section.');
  const removed=t.tasks.filter(x=>x.section===values.section);t.tasks=t.tasks.filter(x=>x.section!==values.section);record(t,actor,'Delete section',removed);
 }else{
  const n=t.tasks.findIndex(x=>x.id===values.id),old=t.tasks[n];
  if(op==='delete_question'){
   if(!old)throw Error('Question unavailable.');if(old.blocked)throw Error('The blocked regeneration item cannot be removed.');
   if(t.tasks.length<=1)throw Error('Keep at least one question.');t.tasks.splice(n,1);record(t,actor,'Delete question',old);
  }else if(op==='move_question'){
   const to=n+Number(values.direction);if(!old||![1,-1].includes(Number(values.direction))||!t.tasks[to]||t.tasks[to].section!==old.section)throw Error('Cannot move this question.');
   [t.tasks[n],t.tasks[to]]=[t.tasks[to],t.tasks[n]];record(t,actor,'Reorder question',{id:old.id,direction:values.direction});
  }else if(op==='question'){
   if(values.id&&!old)throw Error('Question unavailable.');
   const section=text(values.section,120),question=text(values.question),instruction=text(values.instruction,12000);
   if(!section||!question||!instruction)throw Error('Enter a section, question and full instruction.');
   const page=Number(values.page);if(!Number.isInteger(page)||page<1||page>1000)throw Error('Enter a source page between 1 and 1000.');
   if(old?.blocked)throw Error('This source conflict is locked pending Technical Office approval.');
   if(t.tasks.length>=300&&!old)throw Error('A template can contain up to 300 questions.');
   let fields=old?.fields;
   // Existing source measurement tolerances remain attached when editing wording.
   if(values.criticalSafety!==undefined&&typeof values.criticalSafety!=='boolean')throw Error('Choose a valid critical safety setting.');
   const item={...old,criticalSafety:values.criticalSafety??(old?criticalTask(old):false),id:old?.id||'q-'+crypto.randomUUID(),section,number:old?.number||String(t.tasks.filter(x=>x.section===section).length+1),page,question,text:instruction,conditional:!!values.conditional,requiresAcknowledgement:values.requiresAcknowledgement===undefined?!!old?.requiresAcknowledgement:!!values.requiresAcknowledgement,blocked:false,...(fields?{fields}: {})};
   if(old)t.tasks[n]=item;else t.tasks.push(item);
   const order=[...new Set(t.tasks.map(x=>x.section))];t.tasks.sort((a,b)=>order.indexOf(a.section)-order.indexOf(b.section));
   record(t,actor,old?'Edit question':'Add question',old||null);
  }else throw Error('Unknown template change.');
 }
 state.inspectionTemplate=t;return {version:t.version};
}
