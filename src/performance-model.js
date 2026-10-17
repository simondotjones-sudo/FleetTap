import {downtimeAttribution} from './downtime-attribution.js';
import {criticalFaults,openCriticalFaults} from './critical-safety.js';
import {manager,workerName} from './roles.js';
import {fleetModel,vehicleModelType} from './fleet-models.js';
import {validDate,addInterval} from './scheduling.js';
const DAY=86400000;
const requireThat=(ok,message)=>{if(!ok)throw Error(message);};
const text=(v,max=2000)=>String(v||'').trim().slice(0,max);
export const dublinDate=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export const dublinTime=value=>{if(!value)return '';const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;};
export function instant(value){
 requireThat(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)&&validDate(value.slice(0,10)),'Enter a valid Dublin date and time.');
 const utc=Date.parse(value+'Z'),matches=[utc,utc-3600000].filter(t=>Number.isFinite(t)&&dublinTime(t)===value);
 requireThat(matches.length===1,'This time is missing or ambiguous at the clock change. Choose an unambiguous time.');return new Date(matches[0]).toISOString();
}
export const dayStart=date=>Date.parse(instant(date+'T00:00'));
export const nextDate=date=>addInterval(date,1,'days');
export const modelKey=b=>vehicleModelType(b)||'OTHER';
export const modelPolicy=(content,b)=>(content.warrantyModels||[]).find(x=>x.modelType===modelKey(b));
export function coverage(bus,content){
 const policy=modelPolicy(content,bus),start=bus.warrantyStart||'',standardEnd=start&&policy?addInterval(start,policy.months,'months'):'',extension=bus.warrantyExtendedUntil||'';
 const end=[extension?nextDate(extension):'',standardEnd].filter(Boolean).sort().at(-1)||'';
 return {start,end,standardEnd,extendedUntil:extension,known:!!(start&&end),modelType:modelKey(bus),months:policy?.months??null,repairHours:policy?.repairHours??null,reference:bus.warrantyReference||policy?.reference||''};
}
export function saveWarrantyModel(content,v,actor){
 const modelType=v.modelType;requireThat(modelType==='OTHER'||fleetModel(modelType),'Choose a model.');
 const months=Number(v.months),repairHours=v.repairHours===''||v.repairHours==null?null:Number(v.repairHours);
 requireThat(String(v.months).trim()!==''&&Number.isInteger(months)&&months>=1&&months<=360,'Enter a warranty duration of 1–360 months.');
 requireThat(repairHours===null||(Number.isFinite(repairHours)&&repairHours>=1&&repairHours<=8760),'Enter a repair window of 1–8,760 hours, or leave it unset.');
 const reference=text(v.reference);requireThat(reference,'Record the warranty source or agreement reference.');
 content.warrantyModels??=[];const old=content.warrantyModels.find(x=>x.modelType===modelType);
 const row={id:old?.id||crypto.randomUUID(),modelType,months,repairHours,reference,updatedAt:new Date().toISOString(),audit:[...(old?.audit||[]),{at:new Date().toISOString(),actor,previous:old?{...old,audit:undefined}:null}]};
 if(old)content.warrantyModels[content.warrantyModels.indexOf(old)]=row;else content.warrantyModels.push(row);return row;
}
const findBus=(s,g,id)=>s.vehicles.find(b=>b.garage===g&&b.id===id);
export const activeDowntime=(s,g,id)=>(s.downtime||[]).find(e=>e.garage===g&&e.vehicle===id&&!e.voidedAt&&!e.endedAt);
function validEpisode(s,g,v,id,now){
 const startedAt=instant(v.startedAt),endedAt=v.endedAt?instant(v.endedAt):null,start=Date.parse(startedAt),end=endedAt?Date.parse(endedAt):Infinity;
 requireThat(start<=now,'Off-road time cannot be in the future.');requireThat(end===Infinity||(end>start&&end<=now),'Return time must be after the start and no later than now.');
 requireThat(!(s.downtime||[]).some(e=>e.id!==id&&e.garage===g&&e.vehicle===v.vehicle&&!e.voidedAt&&start<Date.parse(e.endedAt||'9999-12-31T00:00:00Z')&&Date.parse(e.startedAt)<end),'This bus already has an overlapping off-road period.');
 return {startedAt,endedAt};
}
export function performanceCommand(s,g,u,action,v={},id='',content={},now=new Date()){
 requireThat(manager(u),'Manager access required.');const at=now.toISOString(),actor=workerName(u),audit=(r,event,previous)=>{(r.audit??=[]).push({at,actor,actorId:u.id,event,reason:text(v.changeReason),previous});};
 if(action==='bus_warranty'){
  const b=findBus(s,g,id);requireThat(b,'Bus unavailable in this garage.');
  const start=v.warrantyStart||'',extension=v.warrantyExtendedUntil||'';requireThat(!start||validDate(start),'Choose a valid warranty start date.');requireThat(!extension||validDate(extension),'Choose a valid extension date.');requireThat(!extension||start,'Enter the warranty start before adding an extension.');
  const proposed={...b,warrantyStart:start,warrantyExtendedUntil:extension},cov=coverage(proposed,content);
  requireThat(!extension||extension>=start,'The extension must be on or after the warranty start.');
  requireThat(!extension||!cov.standardEnd||nextDate(extension)>=cov.standardEnd,'An extension cannot shorten the standard model warranty.');
  requireThat(text(v.reference),'Record the warranty source or evidence reference.');
  audit(b,'Warranty dates updated',{start:b.warrantyStart||'',extension:b.warrantyExtendedUntil||'',reference:b.warrantyReference||''});
  Object.assign(b,{warrantyStart:start,warrantyExtendedUntil:extension,warrantyReference:text(v.reference)});return {id:b.id};
 }
 if(action==='downtime_rates'){
  const downtime=Number(v.downtime),mechanic=Number(v.mechanic);requireThat(v.downtime!==''&&v.mechanic!==''&&Number.isFinite(downtime)&&Number.isFinite(mechanic)&&downtime>=0&&mechanic>=0&&downtime<=100000&&mechanic<=100000,'Enter valid daily rates.');requireThat(text(v.changeReason),'Record why the rates changed.');
  const old=s.downtimeRates||{};s.downtimeRates={downtime,mechanic,audit:old.audit||[]};audit(s.downtimeRates,'Rates changed',{downtime:old.downtime??190,mechanic:old.mechanic??87});return {id:g};
 }
 s.downtime??=[];
 if(action==='downtime_save'){
  const old=id?s.downtime.find(e=>e.id===id&&e.garage===g&&!e.voidedAt):null;requireThat(!id||old,'Off-road record unavailable.');
  const vehicle=old?.vehicle||v.vehicle,b=findBus(s,g,vehicle);requireThat(b,'Choose a bus in this garage.');
  if(!old&&v.requestId){const prior=s.downtime.find(e=>e.garage===g&&e.requestId===v.requestId&&e.createdBy===u.id);if(prior)return {id:prior.id};}
  const times=validEpisode(s,g,{...v,vehicle},id,now.getTime()),reason=text(v.reason,160);requireThat(reason,'Record why the bus is off road.');requireThat(text(v.changeReason),'Record the source or reason for this entry.');
  if(old?.workDays?.length)requireThat(old.workDays.every(w=>dayStart(w.date)<Date.parse(times.endedAt||at)&&dayStart(nextDate(w.date))>Date.parse(times.startedAt)),'Recorded mechanic days must remain within the off-road period.');
  const attribution=downtimeAttribution(s,g,vehicle,v,old||{});
  const row={...old,...attribution,id:old?.id||crypto.randomUUID(),garage:g,vehicle,...times,reason,notes:text(v.notes,4000),createdBy:old?.createdBy||u.id,requestId:old?.requestId||text(v.requestId,40),createdAt:old?.createdAt||at,updatedAt:at,rates:old?.rates||{downtime:s.downtimeRates?.downtime??190,mechanic:s.downtimeRates?.mechanic??87},warrantySnapshot:old?.warrantySnapshot||coverage(b,content),audit:old?.audit||[],workDays:old?.workDays||[]};
  if(row.manufacturerNotifiedAt)requireThat(Date.parse(row.manufacturerNotifiedAt)>=Date.parse(times.startedAt)&&(!times.endedAt||Date.parse(row.manufacturerNotifiedAt)<=Date.parse(times.endedAt)),'The manufacturer notification must stay within this off-road period.');
  if(row.manufacturerRepairedAt&&times.endedAt)requireThat(Date.parse(row.manufacturerRepairedAt)<=Date.parse(times.endedAt),'Return time cannot precede the manufacturer repair.');
  if(old)audit(row,'Off-road record amended',{...old,audit:undefined});else audit(row,'Off-road period recorded',null);
  if(old)s.downtime[s.downtime.indexOf(old)]=row;else s.downtime.push(row);return {id:row.id};
 }
 const e=s.downtime.find(e=>e.id===id&&e.garage===g&&!e.voidedAt);requireThat(e,'Off-road record unavailable.');
 requireThat(text(v.changeReason),'Record the evidence or reason for this change.');
 if(action==='downtime_void'){audit(e,'Record voided',{...e,audit:undefined});e.voidedAt=at;return {id};}
 if(action==='downtime_reassess'){const b=findBus(s,g,e.vehicle);requireThat(b,'Bus unavailable.');audit(e,'Warranty reassessed',e.warrantySnapshot);e.warrantySnapshot=coverage(b,content);return {id};}
 if(action==='downtime_workday'){
  requireThat(validDate(v.date)&&dayStart(v.date)<=now.getTime()&&dayStart(v.date)<Date.parse(e.endedAt||at)&&dayStart(nextDate(v.date))>Date.parse(e.startedAt),'Choose a mechanic work date within this off-road period.');
  e.workDays??=[];requireThat(!e.workDays.some(w=>w.date===v.date),'This mechanic day is already recorded.');
  e.workDays.push({date:v.date,actor,at,note:text(v.changeReason)});audit(e,'Mechanic work day recorded',{date:v.date});return {id};
 }
 if(action==='downtime_workday_remove'){
  const w=(e.workDays||[]).find(w=>w.date===v.date);requireThat(w,'Recorded day unavailable.');audit(e,'Manual mechanic day removed',w);e.workDays=e.workDays.filter(x=>x!==w);return {id};
 }
 if(action==='downtime_manufacturer_clear'){audit(e,'Manufacturer case removed',{notifiedAt:e.manufacturerNotifiedAt,repairedAt:e.manufacturerRepairedAt,hours:e.repairHours,reference:e.manufacturerReference});for(const key of ['manufacturerNotifiedAt','manufacturerRepairedAt','repairHours','manufacturerReference','manufacturerAccepted'])delete e[key];return {id};}
 if(action==='downtime_manufacturer'){
  const notifiedAt=instant(v.notifiedAt),repairedAt=v.repairedAt?instant(v.repairedAt):null,hours=Number(v.hours);
  requireThat(Date.parse(notifiedAt)>=Date.parse(e.startedAt)&&Date.parse(notifiedAt)<=Date.parse(e.endedAt||at),'Notification must be within the off-road period.');
  requireThat(!repairedAt||(Date.parse(repairedAt)>=Date.parse(notifiedAt)&&Date.parse(repairedAt)<=Date.parse(e.endedAt||at)),'Repair must be after notification and within the off-road period.');
  requireThat(Number.isFinite(hours)&&hours>=1&&hours<=8760,'Enter the agreed repair window in hours.');
  requireThat(text(v.reference),'Enter the manufacturer case or agreement reference.');
  requireThat(v.confirm==='yes','Confirm the manufacturer accepted this as a warranty repair.');
  audit(e,'Manufacturer case updated',{notifiedAt:e.manufacturerNotifiedAt,repairedAt:e.manufacturerRepairedAt,hours:e.repairHours,reference:e.manufacturerReference});
  Object.assign(e,{manufacturerNotifiedAt:notifiedAt,manufacturerRepairedAt:repairedAt,repairHours:hours,manufacturerReference:text(v.reference),manufacturerAccepted:true});return {id};
 }
 throw Error('Unknown management request.');
}
const overlap=(a,b,c,d)=>Math.max(0,Math.min(b,d)-Math.max(a,c));
export function performanceReport(s,g,content,{from,to,model='',type='',bus=''}={},now=new Date()){
 requireThat(validDate(from)&&validDate(to)&&from<=to,'Choose a valid reporting period.');const lo=dayStart(from),hi=Math.min(dayStart(nextDate(to)),now.getTime());
 const buses=s.vehicles.filter(b=>b.garage===g&&(!model||modelKey(b)===model)&&(!type||(fleetModel(vehicleModelType(b))?.technology||'Other')===type)&&(!bus||b.id===bus));
 const rows=buses.map(b=>{
  const episodes=(s.downtime||[]).filter(e=>e.garage===g&&e.vehicle===b.id&&!e.voidedAt&&overlap(Date.parse(e.startedAt),Date.parse(e.endedAt||now.toISOString()),lo,hi)>0).sort((a,b)=>a.startedAt.localeCompare(b.startedAt));
  const usedDays=new Set();const details=episodes.map(e=>{
   const a=Math.max(lo,Date.parse(e.startedAt)),z=Math.min(hi,Date.parse(e.endedAt||now.toISOString())),days=Math.max(0,z-a)/DAY,c=e.warrantySnapshot||{},covered=c.known?overlap(a,z,dayStart(c.start),dayStart(c.end))/DAY:0;
   const outside=c.known?Math.max(0,days-covered):0,unknown=c.known?0:days;
   const late=e.manufacturerAccepted&&e.manufacturerNotifiedAt?overlap(a,z,Date.parse(e.manufacturerNotifiedAt)+e.repairHours*3600000,Date.parse(e.manufacturerRepairedAt||e.endedAt||now.toISOString()))/DAY:0;
   const candidates=new Set((e.workDays||[]).filter(w=>overlap(a,z,dayStart(w.date),dayStart(nextDate(w.date)))>0).map(w=>w.date));
   for(const j of (s.jobs||[]).filter(j=>j.garage===g&&j.vehicle===b.id))for(const event of j.audit||[])if(event.event==='Started'&&Date.parse(event.at)>=a&&Date.parse(event.at)<z)candidates.add(dublinDate(event.at));
   const workDays=[...candidates].filter(d=>!usedDays.has(d));workDays.forEach(d=>usedDays.add(d));
   const rate=e.rates||{downtime:190,mechanic:87};return {episode:e,days,covered,outside,unknown,late,mechanicDays:workDays.length,workDates:workDays,downtimeCost:days*rate.downtime,mechanicCost:workDays.length*rate.mechanic,outsideCost:outside*rate.downtime,lateCost:late*rate.downtime};
  });
  const sum=k=>details.reduce((n,d)=>n+d[k],0),days=sum('days'),downtimeCost=sum('downtimeCost'),mechanicCost=sum('mechanicCost');
  const critical=criticalFaults(s,g,b.id),raised=critical.filter(f=>Date.parse(f.created)>=lo&&Date.parse(f.created)<hi),unresolved=openCriticalFaults(s,g,b.id);
  return {criticalRaised:raised.length,criticalOpen:unresolved.length,criticalBusesHeld:unresolved.length?1:0,criticalChecks:new Set(raised.map(f=>f.inspection||f.checklistRun).filter(Boolean)).size,bus:b,model:modelKey(b),type:fleetModel(vehicleModelType(b))?.technology||'Other',coverage:coverage(b,content),episodes:details,visits:details.length,days,covered:sum('covered'),outside:sum('outside'),unknown:sum('unknown'),late:sum('late'),mechanicDays:sum('mechanicDays'),downtimeCost,mechanicCost,cost:downtimeCost+mechanicCost,outsideCost:sum('outsideCost'),lateCost:sum('lateCost'),longest:Math.max(0,...details.map(d=>d.days)),offRoad:!!activeDowntime(s,g,b.id)};
 });
 const totals={};for(const k of ['criticalRaised','criticalOpen','criticalBusesHeld','criticalChecks','days','covered','outside','unknown','late','mechanicDays','downtimeCost','mechanicCost','cost','outsideCost','lateCost','visits'])totals[k]=rows.reduce((n,r)=>n+r[k],0);
 const models=[...new Set(rows.map(r=>r.model))].map(model=>{const group=rows.filter(r=>r.model===model),r={model,buses:group.length};for(const k of ['criticalRaised','criticalOpen','criticalBusesHeld','criticalChecks','days','outside','unknown','late','cost','visits'])r[k]=group.reduce((n,x)=>n+x[k],0);return r;});
 return {from,to,rows:rows.sort((a,b)=>b.days-a.days||a.bus.id.localeCompare(b.bus.id)),models:models.sort((a,b)=>b.days-a.days),totals,offRoad:rows.filter(r=>r.offRoad).length,unknownWarranty:rows.filter(r=>!r.coverage.known).length,repeatVisits:rows.filter(r=>r.visits>1).length};
}
// Staff see the operational off-road marker, never management cost/case detail.
export function visiblePerformance(s,u){if(manager(u))return s;const {downtimeRates,...rest}=s;return {...rest,downtime:(s.downtime||[]).filter(e=>!e.voidedAt).map(({id,garage,vehicle,startedAt,endedAt,reason})=>({id,garage,vehicle,startedAt,endedAt,reason}))};}
