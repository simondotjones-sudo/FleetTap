import {targetMatches} from './bulletins.js';
import {isPM3,tasksFor,templateFor} from './templates.js';
import {taskCopy} from './question-copy.js';

export const downtimeKinds=[['unplanned','Unplanned failure'],['planned','Planned maintenance'],['unclassified','Unclassified']];
export const downtimeComponents=[['doors','Doors'],['brakes','Brakes'],['engine','Engine'],['transmission','Transmission'],['electrical','Electrical'],['battery','Battery / charging'],['steering','Steering'],['suspension','Suspension'],['wheels','Wheels / tyres'],['body','Body / glazing'],['hvac','Heating / ventilation'],['accessibility','Accessibility'],['other','Other'],['unclassified','Unclassified']];
export const kindLabel=id=>downtimeKinds.find(x=>x[0]===id)?.[1]||'Unclassified';
export const componentLabel=id=>downtimeComponents.find(x=>x[0]===id)?.[1]||'Unclassified';
export const partKey=value=>String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-IE');
const alive=r=>!r.deletedAt&&!r.voidedAt;
export function downtimeQuestions(state,garage,vehicle=''){
 const questions=new Map();
 const add=t=>{if(!t.blocked&&!questions.has(t.id))questions.set(t.id,{id:t.id,title:taskCopy(t).text,section:t.section});};
 templateFor(state).tasks.forEach(add);
 for(const i of (state.inspections||[]).filter(i=>i.garage===garage&&alive(i)&&isPM3(i)&&(!vehicle||i.vehicle===vehicle)))tasksFor(i).forEach(add);
 return [...questions.values()];
}
export function downtimeFaultQuestion(state,garage,vehicle,fault){
 const i=(state.inspections||[]).find(i=>i.id===fault?.inspection&&i.garage===garage&&i.vehicle===vehicle&&alive(i)&&isPM3(i));
 const task=i&&tasksFor(i).find(t=>t.id===fault.item&&!t.blocked);
 return task?{id:task.id,title:taskCopy(task).text,section:task.section}:null;
}
// Both the browser and the server use these rules. Links must belong to the same bus and garage.
export function downtimeAttribution(state,garage,vehicle,values,old={}){
 const pick=k=>values[k]===undefined?old[k]:values[k];
 const kind=pick('downtimeKind')||'unclassified',component=pick('component')||'unclassified';
 if(!downtimeKinds.some(x=>x[0]===kind))throw Error('Choose a valid maintenance type.');
 if(!downtimeComponents.some(x=>x[0]===component))throw Error('Choose a valid primary component.');
 const part=String(pick('part')||'').trim();if(part.length>160)throw Error('Keep the part name within 160 characters.');
 const faultId=String(pick('faultId')||''),questionId=String(pick('questionId')||'');
 const fault=faultId&&(state.faults||[]).find(f=>f.id===faultId&&f.garage===garage&&f.vehicle===vehicle&&alive(f));
 if(faultId&&!fault)throw Error('Choose a fault belonging to this bus and garage.');
 const linked=downtimeFaultQuestion(state,garage,vehicle,fault);
 if(linked&&questionId&&linked.id!==questionId)throw Error('The PM3 question must match the linked fault.');
 const question=linked||(questionId&&((old.questionId===questionId?old.questionSnapshot:null)||downtimeQuestions(state,garage,vehicle).find(q=>q.id===questionId)))||null;
 if(questionId&&!question)throw Error('Choose an available PM3 question.');
 const bulletinId=String(pick('bulletinId')||''),bus=state.vehicles.find(b=>b.garage===garage&&b.id===vehicle),bulletin=(state.activeBulletins||[]).find(x=>x.id===bulletinId&&targetMatches(x,bus));
 if(bulletinId&&!bulletin&&old.bulletinId!==bulletinId)throw Error('Choose a published TSB applying to this bus.');
 const bulletinSnapshot=bulletin?{id:bulletin.id,version:bulletin.version,reference:bulletin.reference,title:bulletin.title}:old.bulletinId===bulletinId?old.bulletinSnapshot:null;
 return {...(bulletinId?{bulletinId,bulletinSnapshot}:old.bulletinId?{bulletinId:'',bulletinSnapshot:null}:{}),downtimeKind:kind,component,part,faultId,questionId:question?.id||'',questionSnapshot:question};
}
