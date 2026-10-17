import {isCriticalFault,safetyResolved,criticalSummary} from './critical-safety.js';
import {criticalFaultBadge,criticalFaultNotice,criticalStats} from './critical-safety-ui.js';
import {backRoute} from './navigation.js';
import {displayDate} from './display.js';
import {esc} from './api.js';
import {manager,reviewer} from './roles.js';
import {photoGallery} from './photos.js';
import {docketSourceView} from './docket.js';

const lists=new Map();
const listFor=c=>{const key=c.garage+':'+c.page;if(!lists.has(key))lists.set(key,{query:'',page:0});return lists.get(key);};
const go=(page,label)=>`<button type="button" class="tap-small" data-go="${esc(page)}">${esc(label)}</button>`;
const badge=s=>`<span class="pill ${s==='Closed'?'good':s==='Open'||s==='Awaiting review'?'attention':'status-neutral'}">${esc(s||'Submitted')}</span>`;
const date=value=>esc(displayDate(value));
const frame=(title,content,back='manage')=>`<section class="admin-tools manager-records"><div class="tap-heading"><h1>${esc(title)}</h1></div>${content}<div class="toolbar">${backRoute(back)}</div></section>`;
export function garageExport(c){
 if(!manager(c.me)||!c.garage)throw Error('Manager access required.');
 const result={schema:c.state.schema,garage:c.garage,exportedAt:new Date().toISOString()};
 for(const key of ['vehicles','inspections','reports','faults','actions','schedules','modelSchedules','checklistRuns','jobs','shifts','briefings','downtime','instructionAcks','releaseEvents','serviceHistory'])result[key]=(c.state[key]||[]).filter(r=>r.garage===c.garage);
 result.vehicleTransfers=(c.state.vehicleTransfers||[]).filter(t=>t.from===c.garage||t.to===c.garage);
 result.vehicleTransferArchive=(c.state.vehicleTransferArchive||[]).filter(t=>t.from===c.garage);
 if(c.state.attachmentOrigins)result.attachmentOrigins=structuredClone(c.state.attachmentOrigins);
 if(c.state.downtimeRates)result.downtimeRates=structuredClone(c.state.downtimeRates);
 if(c.state.inspectionTemplate)result.inspectionTemplate=c.state.inspectionTemplate;
 result.criticalSafety=criticalSummary(c.state,c.garage);
 result.faults=result.faults.map(f=>({...f,criticalSafety:isCriticalFault(c.state,f)}));
 return structuredClone(result);
}
export function managerRecordsView(c){
 if(c.page.startsWith('submitted-reports')&&!manager(c.me))return frame('Manager access required','','home');

 let parts;try{parts=c.page.split('?')[0].split('/').map(decodeURIComponent);}catch{return frame('Report unavailable','Choose a report from this depot.');}
 const kind=parts[1]==='faults'?'faults':'reports',base='records/'+kind,rows=(c.state[kind]||[]).filter(r=>r.garage===c.garage&&!r.deletedAt);
 if(parts[2]){
  const r=rows.find(r=>r.id===parts[2]);if(!r)return frame('Report unavailable','Choose a report from this depot.',base);
  const actions=c.state.actions.filter(a=>a.garage===c.garage&&a.source===r.id);
  return frame(r.title,`<article class="card"><div class="row">${badge(r.status)}${criticalFaultBadge(c.state,r)}<span>${date(r.created)}</span></div><p>${esc(r.vehicle||'Depot')} · ${esc(r.type||'Vehicle fault')}</p>${criticalFaultNotice(c.state,r)}<p class="record-note">${esc(r.description)}</p>${r.immediate?`<p class="record-note"><strong>Immediate response:</strong> ${esc(r.immediate)}</p>`:''}${docketSourceView(r.docket)}${photoGallery(r.photos,c.garage)}${reviewer(c.me)?go('reviews/'+kind+'/'+r.id,'Review & sign off'):''}${r.vehicle?go('vehicle/'+encodeURIComponent(r.vehicle),'Bus'):''}<p class="help">${esc(r.id)}</p><h2>Linked work</h2>${actions.length?`<div class="toolbar">${actions.map(a=>go('actions/'+encodeURIComponent(a.id),a.title+' · '+a.status)).join('')}</div>`:r.status!=='Closed'?'<p>The corrective action is awaiting allocation or is assigned to another person. Your manager can view it in Garage actions.</p>':''}${(c.state.jobs||[]).filter(j=>j.garage===c.garage&&j.faultId===r.id&&j.status!=='Cancelled').map(j=>go((manager(c.me)?'garage-today/':'my-jobs/')+j.id,j.title+' · '+j.status)).join('')}${manager(c.me)&&kind==='faults'&&r.status!=='Closed'&&!(c.state.jobs||[]).some(j=>j.faultId===r.id&&!['Completed','Cancelled'].includes(j.status))?go('garage-today/new?bus='+encodeURIComponent(r.vehicle)+'&fault='+encodeURIComponent(r.id),'Create repair job'):''}</article>`,base);
 }
 const filter=new URLSearchParams(c.page.split('?')[1]||''),severity=filter.get('severity')||'all',bus=filter.get('bus')||'',l=listFor(c),filtered=rows.filter(r=>(!bus||r.vehicle===bus)&&(severity==='all'||isCriticalFault(c.state,r)&&(severity!=='critical'||!safetyResolved(r)))&&[r.id,r.title,r.vehicle,r.type,r.status,isCriticalFault(c.state,r)?'Critical Safety Fault':''].join(' ').toLowerCase().includes(l.query.toLowerCase())).sort((a,b)=>(isCriticalFault(c.state,b)&&!safetyResolved(b)?1:0)-(isCriticalFault(c.state,a)&&!safetyResolved(a)?1:0)||(b.created||'').localeCompare(a.created||'')),pages=Math.max(1,Math.ceil(filtered.length/6));l.page=Math.max(0,Math.min(l.page,pages-1));
 return frame(kind==='faults'?'Fault records':'Report records',`<div class="report-switch manager-report-tabs" role="group" aria-label="Report type">${[['reports','Reports'],['faults','Faults']].map(([id,label])=>`<button type="button" data-go="records/${id}" aria-pressed="${kind===id}">${label}</button>`).join('')}</div>${kind==='faults'?criticalStats(c)+`<div class="report-switch" aria-label="Fault severity">${[['all','All faults'],['critical','Open critical'],['all-critical','All critical']].map(([value,label])=>`<button type="button" data-go="records/faults?severity=${value}${bus?'&bus='+encodeURIComponent(bus):''}" aria-pressed="${severity===value}">${label}</button>`).join('')}</div><div class="toolbar"><span>${filtered.length} matching faults</span>${manager(c.me)?'<button type="button" class="tap-small" data-fault-export>Export faults CSV</button>':''}</div>`:''}<label class="sr-only" for="manager-report-search">Find a report, bus or status</label><input id="manager-report-search" class="tap-search" type="search" value="${esc(l.query)}" placeholder="Find a report, bus or status"><div class="manager-report-grid">${filtered.slice(l.page*6,l.page*6+6).map(r=>`<button type="button" class="tap-tile manager-report-tile" data-go="${base}/${encodeURIComponent(r.id)}"><strong>${esc(r.title)}</strong><small>${esc(r.vehicle||'Depot')} · ${date(r.created)}</small>${badge(r.status)}${criticalFaultBadge(c.state,r)}</button>`).join('')}</div>${!filtered.length?'<p class="tap-caption">No matching submitted '+kind+'.</p>':''}${pages>1?`<div class="schedule-pagination"><button type="button" class="tap-small" data-manager-report-page="-1" ${l.page===0?'disabled':''}>Previous</button><span>${l.page+1} / ${pages}</span><button type="button" class="tap-small" data-manager-report-page="1" ${l.page===pages-1?'disabled':''}>Next</button></div>`:''}`);
}
export function faultCSV(c){
 const f=new URLSearchParams(c.page.split('?')[1]||''),severity=f.get('severity')||'all',bus=f.get('bus')||'',query=listFor(c).query.toLowerCase();
 const rows=(c.state.faults||[]).filter(r=>r.garage===c.garage&&!r.deletedAt&&(!bus||r.vehicle===bus)&&(severity==='all'||isCriticalFault(c.state,r)&&(severity!=='critical'||!safetyResolved(r)))&&[r.id,r.title,r.vehicle,r.type,r.status,isCriticalFault(c.state,r)?'Critical Safety Fault':''].join(' ').toLowerCase().includes(query));
 const cell=x=>'"'+String(x??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
 return [['Fault','Bus','Question / fault','Critical Safety Fault','Status','Created','Source check','Repair evidence','Successful recheck','Verified by','Verified at'],...rows.map(r=>[r.id,r.vehicle,r.title,isCriticalFault(c.state,r)?'Yes':'No',isCriticalFault(c.state,r)&&!safetyResolved(r)?'Bus held':r.status,r.created,r.inspection||r.checklistRun||'',r.safetyResolution?.repairEvidence,r.safetyResolution?.recheckEvidence,r.safetyResolution?.actor,r.safetyResolution?.at])].map(r=>r.map(cell).join(',')).join('\r\n');
}
export function setupManagerRecords(host){
 document.addEventListener('click',e=>{if(!e.target.closest('[data-fault-export]')||!manager(host.context().me))return;const url=URL.createObjectURL(new Blob(['\uFEFF'+faultCSV(host.context())],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='fleettap-faults.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 document.addEventListener('click',e=>{const el=e.target.closest('[data-manager-report-page]'),c=host.context();if(!el||!['records','submitted-reports'].includes(c.page.split('/')[0]))return;listFor(c).page+=Number(el.dataset.managerReportPage);host.render();});
 document.addEventListener('input',e=>{if(e.target.id!=='manager-report-search')return;const c=host.context();const l=listFor(c),pos=e.target.selectionStart;l.query=e.target.value;l.page=0;host.render();const input=document.querySelector('#manager-report-search');input.focus();try{input.setSelectionRange(pos,pos);}catch{}});
}
