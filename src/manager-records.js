import {esc} from './api.js';
import {manager} from './admin-ui.js';
import {photoGallery} from './photos.js';

const lists=new Map();
const listFor=c=>{const key=c.garage+':'+c.page;if(!lists.has(key))lists.set(key,{query:'',page:0});return lists.get(key);};
const go=(page,label)=>`<button type="button" class="tap-small" data-go="${esc(page)}">${esc(label)}</button>`;
const badge=s=>`<span class="pill ${s==='Closed'?'good':s==='Open'||s==='Awaiting review'?'attention':'status-neutral'}">${esc(s||'Submitted')}</span>`;
const date=value=>value?esc(value.slice(0,10).split('-').reverse().join('.')):'Not recorded';
const frame=(title,content,back='manage')=>`<section class="admin-tools manager-records"><div class="tap-heading"><h1>${esc(title)}</h1></div>${content}<div class="toolbar">${go(back,'← Back')}</div></section>`;
export function garageExport(c){
 if(!manager(c.me)||!c.garage)throw Error('Manager access required.');
 const result={schema:c.state.schema,garage:c.garage,exportedAt:new Date().toISOString()};
 for(const key of ['vehicles','inspections','reports','faults','actions','schedules','modelSchedules','checklistRuns','jobs','shifts','briefings'])result[key]=(c.state[key]||[]).filter(r=>r.garage===c.garage);
 if(c.state.inspectionTemplate)result.inspectionTemplate=c.state.inspectionTemplate;
 return structuredClone(result);
}
export function managerRecordsView(c){
 if(!manager(c.me))return frame('Manager access required','<p>This area is available to depot managers and administrators.</p>','home');
 let parts;try{parts=c.page.split('/').map(decodeURIComponent);}catch{return frame('Report unavailable','Choose a report from this depot.');}
 const kind=parts[1]==='faults'?'faults':'reports',base='submitted-reports/'+kind,rows=(c.state[kind]||[]).filter(r=>r.garage===c.garage&&!r.deletedAt);
 if(parts[2]){
  const r=rows.find(r=>r.id===parts[2]);if(!r)return frame('Report unavailable','Choose a report from this depot.',base);
  const actions=c.state.actions.filter(a=>a.garage===c.garage&&a.source===r.id);
  return frame(r.title,`<article class="card"><div class="row">${badge(r.status)}<span>${date(r.created)}</span></div><p>${esc(r.vehicle||'Depot')} · ${esc(r.type||'Vehicle fault')}</p><p class="record-note">${esc(r.description)}</p>${r.immediate?`<p class="record-note"><strong>Immediate response:</strong> ${esc(r.immediate)}</p>`:''}${photoGallery(r.photos,c.garage)}${go('reviews/'+kind+'/'+r.id,'Review & close')}<p class="help">${esc(r.id)}</p>${actions.length?`<div class="toolbar">${actions.map(a=>go('actions/'+encodeURIComponent(a.id),'Linked action · '+a.status)).join('')}</div>`:''}</article>`,base);
 }
 const l=listFor(c),filtered=rows.filter(r=>[r.id,r.title,r.vehicle,r.type,r.status].join(' ').toLowerCase().includes(l.query.toLowerCase())).sort((a,b)=>(b.created||'').localeCompare(a.created||'')),pages=Math.max(1,Math.ceil(filtered.length/6));l.page=Math.max(0,Math.min(l.page,pages-1));
 return frame('Submitted reports',`<div class="report-switch manager-report-tabs" role="group" aria-label="Report type">${[['reports','Reports'],['faults','Faults']].map(([id,label])=>`<button type="button" data-go="submitted-reports/${id}" aria-pressed="${kind===id}">${label}</button>`).join('')}</div><label class="sr-only" for="manager-report-search">Find a report, bus or status</label><input id="manager-report-search" class="tap-search" type="search" value="${esc(l.query)}" placeholder="Find a report, bus or status"><div class="manager-report-grid">${filtered.slice(l.page*6,l.page*6+6).map(r=>`<button type="button" class="tap-tile manager-report-tile" data-go="${base}/${encodeURIComponent(r.id)}"><strong>${esc(r.title)}</strong><small>${esc(r.vehicle||'Depot')} · ${date(r.created)}</small>${badge(r.status)}</button>`).join('')}</div>${!filtered.length?'<p class="tap-caption">No matching submitted '+kind+'.</p>':''}${pages>1?`<div class="schedule-pagination"><button type="button" class="tap-small" data-manager-report-page="-1" ${l.page===0?'disabled':''}>Previous</button><span>${l.page+1} / ${pages}</span><button type="button" class="tap-small" data-manager-report-page="1" ${l.page===pages-1?'disabled':''}>Next</button></div>`:''}`);
}
export function setupManagerRecords(host){
 document.addEventListener('click',e=>{const el=e.target.closest('[data-manager-report-page]'),c=host.context();if(!el||!manager(c.me)||!c.page.startsWith('submitted-reports'))return;listFor(c).page+=Number(el.dataset.managerReportPage);host.render();});
 document.addEventListener('input',e=>{if(e.target.id!=='manager-report-search')return;const c=host.context();if(!manager(c.me))return;const l=listFor(c),pos=e.target.selectionStart;l.query=e.target.value;l.page=0;host.render();const input=document.querySelector('#manager-report-search');input.focus();try{input.setSelectionRange(pos,pos);}catch{}});
}
