import {validDate} from './scheduling.js';
import {dayStart,dublinDate,nextDate,modelKey} from './performance-model.js';
import {downtimeKinds,downtimeComponents,partKey} from './downtime-attribution.js';
const HOUR=3600000;
const alive=r=>!r.deletedAt&&!r.voidedAt;
const stamp=v=>v&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
export const monthShift=(date,delta)=>{const [y,m]=date.slice(0,7).split('-').map(Number);return new Date(Date.UTC(y,m-1+delta,1,12)).toISOString().slice(0,10);};
export const monthEnd=date=>{const d=new Date(monthShift(date,1)+'T12:00:00Z');d.setUTCDate(0);return d.toISOString().slice(0,10);};
export function downtimePeriod(months=6,now=new Date()){
 const today=dublinDate(now);return {from:monthShift(today,-months),to:monthEnd(monthShift(today,-1))};
}
export function validateDowntimeFilters(f){
 if(!validDate(f.from)||!validDate(f.to)||f.from>f.to)throw Error('Choose a valid date range.');
 const span=(Number(f.to.slice(0,4))-Number(f.from.slice(0,4)))*12+Number(f.to.slice(5,7))-Number(f.from.slice(5,7));
 if(span>35)throw Error('Choose up to 36 months at a time.');
 if(f.month&&(!/^\d{4}-\d{2}$/.test(f.month)||!validDate(f.month+'-01')||f.month<f.from.slice(0,7)||f.month>f.to.slice(0,7)))throw Error('Choose a month within the reporting dates.');
 if(f.kind&&!downtimeKinds.some(x=>x[0]===f.kind))throw Error('Choose a valid maintenance type.');
 if(f.component&&!downtimeComponents.some(x=>x[0]===f.component))throw Error('Choose a valid component.');
 if(f.age&&!['under1','1to3','3to7','7plus'].includes(f.age))throw Error('Choose a valid absence duration.');
}
export const ageBand=hours=>hours<24?'under1':hours<72?'1to3':hours<168?'3to7':'7plus';
export const ageBands=[['under1','Under 1 day'],['1to3','1–3 days'],['3to7','3–7 days'],['7plus','7+ days']];
const overlap=(a,b,lo,hi)=>Math.max(0,Math.min(b,hi)-Math.max(a,lo))/HOUR;
const sum=(rows,k)=>rows.reduce((n,r)=>n+r[k],0);
const rounded=v=>Number(v.toFixed(4));
// Read-only elapsed-time reporting. Calendar-month boundaries use Europe/Dublin.
export function downtimeAnalysis(state,garage,filters={},now=new Date()){
 const f={...downtimePeriod(6,now),model:'',bus:'',component:'',kind:'',part:'',question:'',month:'',age:'',...filters};validateDowntimeFilters(f);
 const nowMs=Number(now),vehicles=(state.vehicles||[]).filter(v=>v.garage===garage&&alive(v)),buses=new Map(vehicles.map(v=>[v.id,v]));
 let invalid=0;
 const records=[];
 for(const e of state.downtime||[]){
  if(e.garage!==garage||!alive(e)||!buses.has(e.vehicle))continue;
  const b=buses.get(e.vehicle),model=modelKey(b),kind=downtimeKinds.some(x=>x[0]===e.downtimeKind)?e.downtimeKind:'unclassified',component=downtimeComponents.some(x=>x[0]===e.component)?e.component:'unclassified';
  if(f.model&&model!==f.model||f.bus&&b.id!==f.bus||f.component&&component!==f.component||f.kind&&kind!==f.kind||f.question&&e.questionId!==f.question||f.part&&partKey(e.part)!==(f.part==='__missing__'?'':f.part))continue;
  const start=stamp(e.startedAt),end=e.endedAt?stamp(e.endedAt):nowMs;
  if(start===null||end===null||end<=start||start>nowMs||e.endedAt&&end>nowMs){invalid++;continue;}
  const rate=Number(e.rates?.downtime??190);
  records.push({episode:e,bus:b,model,kind,component,part:partKey(e.part),start,end:Math.min(end,nowMs),open:!e.endedAt,rate:Number.isFinite(rate)&&rate>=0?rate:0});
 }
 const lo=dayStart(f.from),hi=Math.min(dayStart(nextDate(f.to)),nowMs);
 const slice=(rows,a,z)=>rows.map(r=>({...r,hours:overlap(r.start,r.end,a,z)})).filter(r=>r.hours>0).map(r=>({...r,cost:r.hours/24*r.rate}));
 const trend=[];
 for(let date=f.from.slice(0,7)+'-01';date<=f.to;date=monthShift(date,1)){
  const start=Math.max(lo,dayStart(date)),end=Math.min(hi,dayStart(monthShift(date,1))),rows=slice(records,start,end);
  const closed=records.filter(r=>!r.open&&r.end>=start&&r.end<end),completedHours=sum(closed.map(r=>({hours:(r.end-r.start)/HOUR})),'hours');
  trend.push({month:date.slice(0,7),hours:sum(rows,'hours'),cost:sum(rows,'cost'),episodes:rows.length,buses:new Set(rows.map(r=>r.bus.id)).size,planned:sum(rows.filter(r=>r.kind==='planned'),'hours'),unplanned:sum(rows.filter(r=>r.kind==='unplanned'),'hours'),unclassified:sum(rows.filter(r=>r.kind==='unclassified'),'hours'),completed:closed.length,average:closed.length?completedHours/closed.length:null,complete:start===dayStart(date)&&end===dayStart(monthShift(date,1)),future:start>=nowMs});
 }
 const selectedLo=f.month?Math.max(lo,dayStart(f.month+'-01')):lo,selectedHi=f.month?Math.min(hi,dayStart(monthShift(f.month+'-01',1))):hi;
 const episodes=slice(records,selectedLo,selectedHi).sort((a,b)=>b.hours-a.hours||a.bus.id.localeCompare(b.bus.id));
 const completed=records.filter(r=>!r.open&&r.end>=selectedLo&&r.end<selectedHi);
 const average=completed.length?completed.reduce((n,r)=>n+(r.end-r.start)/HOUR,0)/completed.length:null;
 const group=field=>{
  const groups=new Map();
  for(const r of episodes){const id=field==='part'?(r.part||'__missing__'):field==='bus'?r.bus.id:r[field];let g=groups.get(id);if(!g){g={id,hours:0,cost:0,episodes:0,buses:new Set(),label:field==='part'?(r.episode.part?.trim()||'Part not recorded'):id};groups.set(id,g);}g.hours+=r.hours;g.cost+=r.cost;g.episodes++;g.buses.add(r.bus.id);}
  return [...groups.values()].map(g=>({...g,buses:g.buses.size})).sort((a,b)=>b.hours-a.hours||a.id.localeCompare(b.id));
 };
 const open=records.filter(r=>r.open).map(r=>({...r,age:(nowMs-r.start)/HOUR})).sort((a,b)=>b.age-a.age);
 const aging=ageBands.map(([id,label])=>({id,label,count:open.filter(r=>ageBand(r.age)===id).length}));
 const comparable=trend.filter(m=>m.complete&&(!f.month||m.month<=f.month));
 const latest=comparable.at(-1),previous=latest&&trend.find(m=>m.month===monthShift(latest.month+'-01',-1).slice(0,7)&&m.complete);
 const comparison=latest&&previous&&(!f.month||latest.month===f.month)?{current:latest.month,previous:previous.month,delta:latest.hours-previous.hours,percent:previous.hours>0?(latest.hours-previous.hours)/previous.hours*100:null}:null;
 return {garage,filters:f,vehicles,trend,episodes,totals:{hours:sum(episodes,'hours'),cost:sum(episodes,'cost'),episodes:episodes.length,buses:new Set(episodes.map(r=>r.bus.id)).size,average,completed:completed.length,unclassified:sum(episodes.filter(r=>r.component==='unclassified'),'hours')},components:group('component'),models:group('model'),buses:group('bus'),parts:group('part'),open:open.filter(r=>!f.age||ageBand(r.age)===f.age),openCount:open.length,aging,comparison,invalid};
}
const csvCell=value=>{let s=String(value??'');if(/^\s*[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
export function downtimeCSV(report,view='months'){
 const f=report.filters,context=[report.garage,f.from,f.to,f.month,f.model,f.bus,f.kind,f.component,f.part,f.question];
 const labels=['Garage','From','To','Selected month','Model filter','Bus filter','Type filter','Component filter','Part filter','PM3 question filter'];
 const columns=view==='episodes'?['Record','Bus','Model','Off road from','Returned from repair','Type','Component','Part','PM3 question','Fault','Reason','Hours within selected dates','Estimated downtime EUR']:['Month','Status','Bus-hours lost','Planned hours','Unplanned hours','Unclassified hours','Episodes overlapping month','Affected buses','Completed episodes','Average full hours per completed episode','Estimated downtime EUR'];
 const rows=view==='episodes'?report.episodes.map(r=>[r.episode.id,r.bus.id,r.model,r.episode.startedAt,r.episode.endedAt||'',r.kind,r.component,r.episode.part||'',r.episode.questionId||'',r.episode.faultId||'',r.episode.reason,rounded(r.hours),r.cost.toFixed(2)]):report.trend.filter(m=>!f.month||m.month===f.month).map(m=>[m.month,m.complete?'Complete':m.future?'Future':'Partial',rounded(m.hours),rounded(m.planned),rounded(m.unplanned),rounded(m.unclassified),m.episodes,m.buses,m.completed,m.average===null?'':rounded(m.average),m.cost.toFixed(2)]);
 return [[...labels,...columns],...rows.map(r=>[...context,...r])].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
