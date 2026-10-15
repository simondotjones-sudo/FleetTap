import {isPM3} from './templates.js';
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function validDate(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;}
export function addInterval(date,amount,unit){
 if(!validDate(date)||!Number.isInteger(amount)||amount<1||amount>3650||!['days','weeks','months'].includes(unit))throw Error('Choose a valid date and inspection interval.');
 const d=new Date(date+'T12:00:00Z');
 if(unit==='months'){const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+amount);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));}
 else d.setUTCDate(d.getUTCDate()+amount*(unit==='weeks'?7:1));
 return d.toISOString().slice(0,10);
}
export function scheduleStatus(state,garage,vehicle,date=today()){
 const bus=state.vehicles.find(v=>v.id===vehicle&&v.garage===garage),schedule=(state.schedules||[]).find(s=>s.garage===garage&&s.vehicle===vehicle&&s.templateId==='pm3');
 const all=state.inspections.filter(i=>i.garage===garage&&i.vehicle===vehicle&&isPM3(i)&&!i.deletedAt);
 const complete=all.filter(i=>i.status==='Completed'&&validDate(i.completedDate)).sort((a,b)=>b.completedDate.localeCompare(a.completedDate))[0];
 const last=[complete?.completedDate,schedule?.lastDate].filter(Boolean).sort().at(-1)||'';
 const latest=all.filter(i=>i.submitted).sort((a,b)=>b.submitted.localeCompare(a.submitted))[0];
 const completedSinceStart=all.filter(i=>i.status==='Completed'&&i.completedAt>(schedule?.startedAt||'')&&validDate(i.completedDate)).sort((a,b)=>b.completedDate.localeCompare(a.completedDate))[0];
 const due=schedule?(schedule.enabled===false?'':schedule.firstDue?(completedSinceStart?addInterval(completedSinceStart.completedDate,schedule.interval,schedule.unit):schedule.firstDue):last?addInterval(last,schedule.interval,schedule.unit):''):bus?.due||'';
 const soon=addInterval(date,7,'days');
 return {schedule,last,lastSubmitted:latest?.submitted?.slice(0,10)||'',due,status:schedule?.enabled===false?'Paused':!due?'Not scheduled':due<date?'Overdue':due===date?'Due today':due<=soon?'Due soon':'Upcoming'};
}
export function saveSchedule(state,garage,values,actor){
 const ids=Array.isArray(values.vehicles)?[...new Set(values.vehicles)]:[values.vehicle];
 if(!ids.length||ids.length>2000||ids.some(id=>!state.vehicles.some(v=>v.id===id&&v.garage===garage)))throw Error('Choose buses in this garage.');
 const interval=Number(values.interval),unit=values.unit,lastDate=values.lastDate||'',firstDue=values.firstDue||'';
 addInterval('2026-01-01',interval,unit);
 if(lastDate&&(!validDate(lastDate)||lastDate>today()))throw Error('Last inspection must be a valid date, no later than today.');
 if(firstDue&&!validDate(firstDue))throw Error('Choose a valid first due date.');
 if(!lastDate&&!firstDue)throw Error('Enter the last completed inspection or the first due date.');
 if(lastDate&&firstDue)throw Error('Use either the last completed date or the first due date.');
 const reference=String(values.reference||'').trim().slice(0,1000);if(lastDate&&!reference)throw Error('Add a reference for the completed inspection date.');
 state.schedules??=[];
 for(const vehicle of ids){
  const old=state.schedules.find(s=>s.garage===garage&&s.vehicle===vehicle&&s.templateId==='pm3');
  const now=new Date().toISOString();
  const next={id:old?.id||crypto.randomUUID(),garage,vehicle,templateId:'pm3',interval,unit,lastDate,firstDue,reference,enabled:values.enabled!==false,updated:now,startedAt:old?.firstDue===firstDue?(old.startedAt||old.updated):now,updatedBy:actor,audit:old?.audit||[]};
  next.audit.push({at:next.updated,actor,previous:old?{...old,audit:undefined}:null});
  if(old)state.schedules[state.schedules.indexOf(old)]=next;else state.schedules.push(next);
 }
 return {count:ids.length};
}
