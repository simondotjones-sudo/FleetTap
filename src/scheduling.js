import {isPM3} from './templates.js';
import {fleetModel,vehicleModelType} from './fleet-models.js';
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function validDate(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;}
export function addInterval(date,amount,unit){
 if(!validDate(date)||!Number.isInteger(amount)||amount<1||amount>3650||!['days','weeks','months'].includes(unit))throw Error('Choose a valid date and inspection interval.');
 const d=new Date(date+'T12:00:00Z');
 if(unit==='months'){const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+amount);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));}
 else d.setUTCDate(d.getUTCDate()+amount*(unit==='weeks'?7:1));
 return d.toISOString().slice(0,10);
}
export const individualSchedule=(state,garage,vehicle)=>(state.schedules||[]).find(s=>s.garage===garage&&s.vehicle===vehicle&&s.templateId==='pm3'&&!s.supersededAt);
export const modelSchedule=(state,garage,modelType)=>(state.modelSchedules||[]).find(s=>s.garage===garage&&s.modelType===modelType&&s.templateId==='pm3');
export function scheduleStatus(state,garage,vehicle,date=today()){
 const bus=state.vehicles.find(v=>v.id===vehicle&&v.garage===garage);
 if(!bus)return {schedule:null,last:'',lastSubmitted:'',due:'',status:'Not scheduled',source:'',modelType:''};
 const modelType=vehicleModelType(bus),own=individualSchedule(state,garage,vehicle),inherited=modelSchedule(state,garage,modelType),schedule=own||inherited;
 const all=state.inspections.filter(i=>i.garage===garage&&i.vehicle===vehicle&&isPM3(i)&&!i.deletedAt);
 const complete=all.filter(i=>i.status==='Completed'&&validDate(i.completedDate)).sort((a,b)=>b.completedDate.localeCompare(a.completedDate))[0];
 // An evidenced service date belongs to the bus even after it starts inheriting a model rule.
 const previous=own?null:(state.schedules||[]).filter(s=>s.garage===garage&&s.vehicle===vehicle&&s.templateId==='pm3'&&s.supersededAt&&validDate(s.lastDate)).sort((a,b)=>b.updated.localeCompare(a.updated))[0];
 const last=[complete?.completedDate,schedule?.lastDate,previous?.lastDate].filter(Boolean).sort().at(-1)||'';
 const latest=all.filter(i=>i.submitted).sort((a,b)=>b.submitted.localeCompare(a.submitted))[0];
 const completedSinceStart=all.filter(i=>i.status==='Completed'&&i.completedAt>(schedule?.startedAt||'')&&validDate(i.completedDate)).sort((a,b)=>b.completedDate.localeCompare(a.completedDate))[0];
 const due=schedule?(schedule.enabled===false?'':schedule.basis==='history'?(last?addInterval(last,schedule.interval,schedule.unit):schedule.firstDue):schedule.firstDue?(completedSinceStart?addInterval(completedSinceStart.completedDate,schedule.interval,schedule.unit):schedule.firstDue):last?addInterval(last,schedule.interval,schedule.unit):''):bus.due||'';
 const soon=addInterval(date,7,'days');
 return {schedule,last,lastSubmitted:latest?.submitted?.slice(0,10)||'',due,modelType,source:own?'bus':inherited?'model':'',status:schedule?.enabled===false?'Paused':!due?'Not scheduled':due<date?'Overdue':due===date?'Due today':due<=soon?'Due soon':'Upcoming'};
}
export function saveSchedule(state,garage,values,actor){
 if(values.scope&&!['bus','model','all'].includes(values.scope))throw Error('Choose a schedule scope.');
 const isModel=values.scope==='model',modelType=isModel?values.modelType:'';
 if(isModel&&!fleetModel(modelType))throw Error('Choose a model type from the catalogue.');
 const ids=isModel?state.vehicles.filter(v=>v.garage===garage&&vehicleModelType(v)===modelType).map(v=>v.id):values.scope==='all'?state.vehicles.filter(v=>v.garage===garage).map(v=>v.id):Array.isArray(values.vehicles)?[...new Set(values.vehicles)]:[values.vehicle];
 if((!isModel&&!ids.length)||ids.length>2000||ids.some(id=>!state.vehicles.some(v=>v.id===id&&v.garage===garage)))throw Error('Choose buses in this garage.');
 const now=new Date().toISOString();
 const supersede=(s,action)=>{(s.audit??=[]).push({at:now,actor,action,previous:{...s,audit:undefined}});s.supersededAt=now;s.updated=now;s.updatedBy=actor;};
 if(values.operation==='inherit'){
  if(isModel||ids.length!==1||!modelSchedule(state,garage,vehicleModelType(state.vehicles.find(v=>v.id===ids[0]&&v.garage===garage))))throw Error('This bus has no model schedule to inherit.');
  const own=individualSchedule(state,garage,ids[0]);if(own)supersede(own,'Use model schedule');return {count:1};
 }
 if(values.operation)throw Error('Unknown schedule change.');
 const interval=Number(values.interval),unit=values.unit,lastDate=values.lastDate||'',firstDue=values.firstDue||'';
 addInterval('2026-01-01',interval,unit);
 if(lastDate&&(!validDate(lastDate)||lastDate>today()))throw Error('Last inspection must be a valid date, no later than today.');
 if(firstDue&&!validDate(firstDue))throw Error('Choose a valid first due date.');
 if(!lastDate&&!firstDue)throw Error('Enter the last completed inspection or the first due date.');
 if(lastDate&&firstDue)throw Error('Use either the last completed date or the first due date.');
 const basis=values.basis|| (firstDue?'first':'last');
 if(!['first','last','history'].includes(basis)||(basis==='last'?!lastDate:!firstDue))throw Error('Choose a starting point and its date.');
 const reference=String(values.reference||'').trim().slice(0,1000);if(lastDate&&!reference)throw Error('Add a reference for the completed inspection date.');
 state.schedules??=[];
 state.modelSchedules??=[];
 const records=isModel?state.modelSchedules:state.schedules;
 for(const vehicle of isModel?[null]:ids){
  const old=isModel?modelSchedule(state,garage,modelType):individualSchedule(state,garage,vehicle);
  const inherited=!isModel?modelSchedule(state,garage,vehicleModelType(state.vehicles.find(v=>v.id===vehicle&&v.garage===garage))):null,anchor=old||inherited;
  const next={id:old?.id||crypto.randomUUID(),garage,...(isModel?{modelType}:{vehicle}),templateId:'pm3',interval,unit,basis,lastDate,firstDue,reference,enabled:values.enabled!==false,updated:now,startedAt:anchor?.firstDue===firstDue&&(anchor?.basis||'first')===basis?(anchor.startedAt||anchor.updated):now,updatedBy:actor,audit:old?.audit||[]};
  next.audit.push({at:next.updated,actor,previous:old?{...old,audit:undefined}:null});
  if(old)records[records.indexOf(old)]=next;else records.push(next);
 }
 if(isModel&&values.replaceOverrides===true)for(const vehicle of ids){const own=individualSchedule(state,garage,vehicle);if(own)supersede(own,'Apply '+modelType+' model schedule');}
 return {count:ids.length,scope:isModel?'model':'bus'};
}
