import {esc} from './api.js';
import {displayDate} from './display.js';
import {vehicleModelType} from './fleet-models.js';
import {isPM3} from './templates.js';
import {criticalCheckBadge} from './critical-safety-ui.js';

export const emptyRecordFilters=()=>({query:'',model:'',status:'',from:'',to:'',page:0,filtersOpen:false});
export const recordFilterCount=f=>['model','status','from','to'].filter(key=>f[key]).length;
export const recordDateError=f=>f.from&&f.to&&f.from>f.to?'Choose an end date on or after the start date.':'';
export const mechanicName=value=>String(value||'').replace(/\s+\([^()]*@[^()]*\)\s*$/,'').trim()||'Not recorded';
const modelFor=(vehicles,garage,id)=>vehicleModelType(vehicles.find(v=>v.garage===garage&&v.id===id)||{});

export function filterInspectionRecords(rows,vehicles,garage,f){
 if(recordDateError(f))return [];
 const query=String(f.query||'').trim().toLowerCase();
 return rows.filter(i=>{
  if(i.garage!==garage||i.deletedAt||!isPM3(i))return false;
  const v=vehicles.find(v=>v.garage===garage&&v.id===i.vehicle),model=vehicleModelType(v||{}),day=String(i.created||'').slice(0,10);
  return (!f.model||(model||'other')===f.model)&&(!f.status||i.status===f.status)&&
   (!f.from||day>=f.from)&&(!f.to||day&&day<=f.to)&&
   [i.vehicle,i.craftworker,i.status,v?.name,v?.registration,v?.model,model].join(' ').toLowerCase().includes(query);
 }).sort((a,b)=>String(b.created||'').localeCompare(String(a.created||''))||a.id.localeCompare(b.id));
}

const svg=path=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
const busIcon=svg('M5 4h14v15H5zM5 11h14M9 4v7M15 4v7M8 19v2M16 19v2M8 15h1M15 15h1');
const filterIcon=svg('M4 7h16M4 17h16M8 4v6M16 14v6');
const option=(value,label,selected)=>`<option value="${esc(value)}" ${selected===value?'selected':''}>${esc(label)}</option>`;
export function recordFilters(c,f,rows,{busy=false}={}){
 const models=[...new Set(rows.map(i=>modelFor(c.state.vehicles,c.garage,i.vehicle)||'other'))].sort();
 if(f.model&&!models.includes(f.model))models.push(f.model);
 const statuses=[...new Set(['In progress','Awaiting review','Completed',...rows.map(i=>i.status)])];
 const garages=c.garages?.length?c.garages:[{id:c.garage,name:'Current garage'}],multipleOrgs=new Set(garages.map(g=>g.organisation_id)).size>1;
 const count=recordFilterCount(f),error=recordDateError(f);
 return `<div class="inspection-record-tools" ${busy?'aria-busy="true"':''}>
  <div class="inspection-record-search"><label class="sr-only" for="checks-search">Find bus, registration or mechanic</label><input id="checks-search" type="search" value="${esc(f.query)}" placeholder="Bus or mechanic" autocomplete="off" ${busy?'disabled':''}><button type="button" class="record-filter-toggle" data-record-filters aria-expanded="${f.filtersOpen}" aria-controls="inspection-record-filters" ${busy?'disabled':''}>${filterIcon}<span>Filters${count?` <b>${count}</b>`:''}</span></button></div>
  <div id="inspection-record-filters" class="inspection-record-filters" ${f.filtersOpen?'':'hidden'}>
   <label>Garage<select id="records-garage" ${garages.length<2||busy?'disabled':''}>${garages.map(g=>option(g.id,(multipleOrgs?g.organisation_name+' · ':'')+g.name,c.garage)).join('')}</select></label>
   <label>Model<select id="records-model" data-record-filter="model" ${busy?'disabled':''}>${option('','All models',f.model)}${models.map(m=>option(m,m==='other'?'Other model':m,f.model)).join('')}</select></label>
   <label>Status<select id="records-status" data-record-filter="status" ${busy?'disabled':''}>${option('','All statuses',f.status)}${statuses.map(s=>option(s,s,f.status)).join('')}</select></label>
   <label>Started from<input id="records-from" type="date" data-record-filter="from" value="${esc(f.from)}" ${f.to?`max="${esc(f.to)}"`:''} ${busy?'disabled':''}></label>
   <label>Started to<input id="records-to" type="date" data-record-filter="to" value="${esc(f.to)}" ${f.from?`min="${esc(f.from)}"`:''} ${error?'aria-invalid="true" aria-describedby="record-date-error"':''} ${busy?'disabled':''}></label>
   ${error?`<p id="record-date-error" class="record-date-error" role="alert">${error}</p>`:''}
  </div>
 </div>`;
}

export function inspectionRecordCard(c,i){
 const v=c.state.vehicles.find(v=>v.garage===c.garage&&v.id===i.vehicle),model=vehicleModelType(v||{});
 const statusClass=i.status==='Completed'?'complete':i.status==='Awaiting review'?'review':'progress';
 return `<button type="button" class="inspection-record-card" data-go="inspection-record/${esc(encodeURIComponent(i.id))}">
  <span class="inspection-record-top"><span class="inspection-record-bus">${busIcon}<span><strong>${esc(i.vehicle)}</strong><small>${esc([model,v?.registration].filter(Boolean).join(' · ')||'PM3 inspection')}</small></span></span><span class="record-status record-status-${statusClass}">${esc(i.status)}</span></span>
  <span class="inspection-record-meta"><span><small>Started</small><span>${esc(displayDate(i.created))}</span></span><span><small>Mechanic</small><span>${esc(mechanicName(i.craftworker))}</span></span></span>
  <span class="inspection-record-bottom">${criticalCheckBadge(c.state,i)}<span class="inspection-record-open">View record ${svg('m9 5 7 7-7 7')}</span></span>
 </button>`;
}
