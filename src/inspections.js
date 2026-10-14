import {pm3} from './pm3.js';
import {addRecord} from './model.js';
export const revision='TO-PMS 035 · Revision 8 · demo mapping 1';
export const sections=[...new Set(pm3.map(i=>i.section))];
export const readings={
 '1-1':[['Side slip','m/km',-14,14]],'2-11':[['Coolant concentration','%',40,40]],
 '3-4':[['Build-up time','seconds',0,330]],'4-1':[['Nearside > 4 mm','Yes/No'],['Offside > 4 mm','Yes/No']],
 '4-6':[['Nearside end-float','mm',0,.2],['Offside end-float','mm',0,.2]],
 '4-8':[['Lift / findings','text']],'4-9':[['End-float or no play detected','text']],
 '4-10':[['Nearside axial clearance','mm',0,.1],['Offside axial clearance','mm',0,.1]],
 '4-11':[['Nearside radial clearance','mm',0,5.3],['Offside radial clearance','mm',0,5.3]],
 '4-12':[['Nearside findings','text'],['Offside findings','text']],
 '4-13':[['Total toe in','mm',0,1.5],['Printed result reference','text']],
 '5-1':[['Nearside > 4 mm','Yes/No'],['Offside > 4 mm','Yes/No']],
 '5-7':[['Nearside end-float','mm',0,.05],['Offside end-float','mm',0,.05]],
 '6-5':[['Front ride height','mm',233,241],['Rear ride height','mm',232,240]],
 '7-1':[['Fault-code printout reference','text']],'7-2':[['Speed setting','km/h',65,65]],
 '2-20':[['Belts changed','Yes/No'],['Condition check / history reference','text']],
 '2-21':[['Injection pipe task','choice']], '16-5':[['Extinguisher mass','kg',0,100]]
};
export function startInspection(state,vehicle,garage,craftworker){
 if(!state.vehicles.some(v=>v.id===vehicle&&v.garage===garage))throw Error('Choose a vehicle in this garage.');
 if(!craftworker?.trim())throw Error('Enter the demo craftworker name.');
 const existing=state.inspections.find(i=>i.vehicle===vehicle&&i.template===revision&&i.status==='In progress');
 if(existing)return existing;
 const item={id:'FT-I-'+crypto.randomUUID().slice(0,8),vehicle,garage,template:revision,craftworker:craftworker.trim(),status:'In progress',created:new Date().toISOString(),answers:{},notes:'',audit:[]};
 state.inspections.unshift(item);return item;
}
export function inspectionFor(state,id,garage){const i=state.inspections.find(i=>i.id===id&&i.garage===garage&&i.template===revision);if(!i)throw Error('Inspection unavailable in this garage.');return i;}
export function outOfRange(task,answer){return (readings[task.id]||[]).some((r,n)=>{const raw=answer.readings?.[n];if(raw==null||raw==='')return false;if(r[1]==='Yes/No')return raw==='No';return r.length===4&&(Number(raw)<r[2]||Number(raw)>r[3]);});}
export function saveAnswer(state,id,garage,taskId,answer){
 const i=inspectionFor(state,id,garage),task=pm3.find(t=>t.id===taskId);
 if(i.status!=='In progress')throw Error('Submitted inspections are locked.');
 if(!task||task.blocked)throw Error('This item is blocked pending technical review.');
 if(!['OK','Defect','Not completed','Not due'].includes(answer.result))throw Error('Select a result.');
 if(answer.result==='Not due'&&(!task.conditional||task.id==='2-20'))throw Error('This task cannot be marked not due.');
 if(!answer.worker?.trim())throw Error('Enter the craftworker for this item.');
 if(answer.result!=='OK'&&!answer.notes?.trim())throw Error('Add a reason, defect details or maintenance-history reference.');
 const fields=readings[taskId]||[];
 if(['OK','Defect'].includes(answer.result))fields.forEach((r,n)=>{const val=answer.readings?.[n];if(val==null||String(val).trim()==='')throw Error('Complete the required readings.');if(r.length===4&&!Number.isFinite(Number(val)))throw Error('Enter a valid numeric reading.');});
 if(outOfRange(task,answer)&&answer.result==='OK')throw Error('Reading outside the source tolerance. Record a defect and details for review.');
 const previous=i.answers[taskId];
 if(previous?.fault&&answer.result!=='Defect')throw Error('A linked defect exists. Keep the defect result; repair and review are tracked separately.');
 const saved={...answer,worker:answer.worker.trim(),updated:new Date().toISOString(),fault:previous?.fault||null};
 if(answer.result==='Defect'&&!saved.fault){const f=addRecord(state,'faults',{garage,vehicle:i.vehicle,title:`${task.section} · item ${task.number}`,description:answer.notes,inspection:i.id,item:task.id});saved.fault=f.id;}
 i.answers[taskId]=saved;i.audit.push({item:taskId,previous:previous||null,value:structuredClone(saved),at:saved.updated});return saved;
}
export function submitInspection(state,id,garage,notes){
 const i=inspectionFor(state,id,garage);if(i.status!=='In progress')throw Error('Inspection already submitted.');
 if(pm3.some(t=>!t.blocked&&!i.answers[t.id]))throw Error('Record a result for every available item before submitting.');
 i.notes=notes.trim();i.status='Awaiting review';i.submitted=new Date().toISOString();
 state.actions.unshift({id:'FT-A-'+crypto.randomUUID().slice(0,8),garage,vehicle:i.vehicle,title:'Review PM3 demonstration — blocked regeneration item',source:i.id,owner:'Demo supervisor',status:'Open',evidence:''});
}
export function saveVehicle(state,garage,values){
 const id=values.id?.trim().toUpperCase().replace(/\s+/g,'-');if(!id||!values.model?.trim())throw Error('Enter a fleet number and vehicle model.');
 if(!/^[A-Z0-9 -]{1,40}$/.test(id))throw Error('Use letters, numbers, spaces or hyphens for the fleet number.');
 if(state.vehicles.some(v=>v.id===id))throw Error('This fleet number already exists.');
 const v={id,garage,model:values.model.trim(),registration:values.registration?.trim()||'',status:'Awaiting inspection',warranty:'Unknown',history:[],due:values.due||'',created:new Date().toISOString()};state.vehicles.push(v);return v;
}
