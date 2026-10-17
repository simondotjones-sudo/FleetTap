import {esc} from './api.js';
import {manager} from './roles.js';
import {backRoute} from './navigation.js';
import {vehicleModelType} from './fleet-models.js';
import {dublinDate} from './performance-model.js';
import {faultAnalysis,questionBreakdown,questionLabel,repeatLabels,analysisCSV} from './fault-analysis.js';

let host,busy=false;
let lastAnalysis;
function cachedAnalysis(c,f){
 const key=JSON.stringify(['from','to','model','bus','section','question','window'].map(k=>f[k]||''));
 if(lastAnalysis?.state===c.state&&lastAnalysis.garage===c.garage&&lastAnalysis.key===key&&Date.now()-lastAnalysis.at<60000)return lastAnalysis.report;
 const report=faultAnalysis(c.state,c.garage,f);lastAnalysis={state:c.state,garage:c.garage,key,at:Date.now(),report};return report;
}
export const faultAnalysisBusy=()=>busy;
const root='performance/faults';
const route=c=>c.page.split('?')[0];
const active=c=>route(c)===root||route(c).startsWith(root+'/');
const go=(path,label,cls='secondary')=>`<button type="button" class="${cls}" data-go="${esc(path)}">${esc(label)}</button>`;
const option=(value,label,chosen)=>`<option value="${esc(value)}" ${String(chosen)===String(value)?'selected':''}>${esc(label)}</option>`;
const n=value=>Number(value||0).toLocaleString('en-IE');
const rate=value=>value===null?'—':(100*value).toLocaleString('en-IE',{maximumFractionDigits:1})+'%';
const date=value=>new Date(value).toLocaleDateString('en-IE',{timeZone:'Europe/Dublin',day:'numeric',month:'short',year:'numeric'});
const sortQuestions=(rows,sort)=>[...rows].sort((a,b)=>sort==='rate'?(b.rate??-1)-(a.rate??-1)||b.checked-a.checked:sort==='repeats'?b.repeats-a.repeats||b.failures-a.failures:b.failures-a.failures||b.repeats-a.repeats);
const stat=(label,value,note)=>`<article class="perf-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;
const badge=(text,tone='')=>`<span class="fa-badge ${tone}">${esc(text)}</span>`;
const daysAgo=(days,now=new Date())=>{const d=new Date(dublinDate(now)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10);};
export function analysisParams(page,now=new Date()){
 const p=new URLSearchParams(page.split('?')[1]||'');
 return {from:p.has('from')?p.get('from'):daysAgo(89,now),to:p.has('to')?p.get('to'):dublinDate(now),
  model:p.get('model')||'',bus:p.get('bus')||'',section:p.get('section')||'',question:p.get('question')||'',window:p.get('window')||'90',
  sort:p.get('sort')||'failures',search:p.get('search')||'',page:Math.max(0,Math.min(100000,parseInt(p.get('page'),10)||0))};
}
const url=(path,f,changes={})=>{const p=new URLSearchParams();for(const [k,v] of Object.entries({...f,...changes}))if(v!==undefined&&(!['page','search','model','bus','section','question'].includes(k)||v))p.set(k,String(v));return path+'?'+p;};
const detailURL=(f,id,changes={})=>url(root+'/question/'+encodeURIComponent(id),f,{page:0,question:'',...changes});
const pager=(total,page,f,path)=>{const pages=Math.max(1,Math.ceil(total/12));return pages>1?`<div class="fa-pagination"><button type="button" class="secondary" data-go="${esc(url(path,f,{page:page-1}))}" ${page===0?'disabled':''}>Previous</button><span>${page+1} / ${pages}</span><button type="button" class="secondary" data-go="${esc(url(path,f,{page:page+1}))}" ${page===pages-1?'disabled':''}>Next</button></div>`:'';};
const empty=(title,description)=>`<section class="card fa-empty"><h2>${esc(title)}</h2><p>${esc(description)}</p></section>`;

function filters(c,f,report){
 const garages=c.garages?.length?c.garages:[{id:c.garage,name:'Current garage'}];
 const multipleOrgs=new Set(garages.map(g=>g.organisation_id)).size>1;
 const models=[...new Set(report.vehicles.map(v=>vehicleModelType(v)||'OTHER'))].sort();
 const sections=[...new Set([...report.catalogue.map(q=>q.section),...report.allObservations.map(o=>o.task.section)])].sort();
 const questions=report.catalogue.filter(q=>!f.section||q.section===f.section||report.allObservations.some(o=>o.task.id===q.id&&o.task.section===f.section));
 const activeCount=[f.model,f.bus,f.section,f.question].filter(Boolean).length;
 const garageName=garages.find(g=>g.id===c.garage)?.name||'Current garage';
 return `<details class="perf-report-filters" ${activeCount?'open':''}><summary>Dates & filters${activeCount?` <span class="perf-filter-count">${activeCount} active</span>`:''}<span class="perf-filter-context">${esc(garageName)} · Inspections started ${f.from?esc(date(f.from+'T12:00:00Z')):'any time'}${f.to?' – '+esc(date(f.to+'T12:00:00Z')):''}</span></summary><div class="perf-filter-body">
  <div class="perf-presets" role="group" aria-label="Inspection period">${[['30','30 days'],['90','90 days'],['all','All dates']].map(([value,label])=>`<button type="button" data-fa-period="${value}">${label}</button>`).join('')}</div>
  <form data-fault-analysis-filters class="fa-filters">
   <label>Garage<select name="garage" ${garages.length<2?'disabled':''}>${garages.map(g=>option(g.id,(multipleOrgs?g.organisation_name+' · ':'')+g.name,c.garage)).join('')}</select></label>
   <label>Model<select name="model">${option('','All models',f.model)}${models.map(m=>option(m,m==='OTHER'?'Other model':m,f.model)).join('')}</select></label>
   <label>Bus<select name="bus">${option('','All buses',f.bus)}${report.vehicles.filter(v=>!f.model||(vehicleModelType(v)||'OTHER')===f.model||v.id===f.bus).map(v=>option(v.id,v.id+(v.registration?' · '+v.registration:''),f.bus)).join('')}</select></label>
   <label>Inspection started from<input type="date" name="from" value="${esc(f.from)}"></label>
   <label>Inspection started to<input type="date" name="to" value="${esc(f.to)}"></label>
   <label>Compare with earlier failures<select name="window">${[['30','Within 30 days'],['90','Within 90 days'],['180','Within 180 days'],['365','Within 365 days'],['all','All recorded history']].map(([v,l])=>option(v,l,f.window)).join('')}</select></label>
   <label>Section<select name="section">${option('','All sections',f.section)}${sections.map(s=>option(s,s,f.section)).join('')}</select></label>
   <label class="fa-question-filter">PM3 question<select name="question">${option('','All questions',f.question)}${questions.map(q=>option(q.id,questionLabel(q.id)+' · '+q.title,f.question)).join('')}</select></label>
   <div class="fa-filter-actions"><button ${busy?'disabled':''}>Apply filters</button>${go(url(route(c),f,{from:daysAgo(89),to:dublinDate(new Date()),model:'',bus:'',section:'',question:'',page:0,search:''}),'Clear filters','tap-small')}</div><p class="form-error" role="alert"></p>
  </form></div></details>`;
}

function methodology(report){return `<details class="card fa-method"><summary>How this is counted</summary><p>A check is one PM3 question in one inspection. Its original failure remains counted after repair or amendment. “I fixed it” is a finding. Rechecks and repeated saves do not add checks. Not due, unanswered and blocked questions are excluded from the failure rate.</p><p>Dates select when inspections started, in Dublin time. Results include saved work in progress. Repeat comparisons use earlier failures on the same bus and question, including inspections outside these dates, within the chosen window. “After closure” means the earlier linked faults were recorded closed before the next finding; it does not establish the same cause or prove a repair failed.</p><p>Open counts use current fault status. Questions are grouped by their stable ID across template versions; each finding retains its original wording. Model and garage are the bus’s current assignments. Deleted inspections are excluded.</p>${report.unlinked?`<p>${n(report.unlinked)} other fault record(s) in these dates have no usable PM3 question link and are excluded from this analysis. ${go('records/faults','View fault records','tap-small')}</p>`:''}${report.missingDates?`<p>${n(report.missingDates)} inspection(s) have no valid start date and are excluded.</p>`:''}</details>`;}

function recurringCards(rows,f,page){return `<div class="fa-repeat-grid">${rows.slice(page*12,page*12+12).map(r=>`<button type="button" class="fa-repeat-card" data-go="${esc(detailURL(f,r.question.id,{bus:r.bus.id,search:''}))}">
 <span class="fa-card-heading"><span><strong>${esc(r.bus.id)}</strong><small>${esc(r.model)} · PM3 ${esc(questionLabel(r.question.id))}</small></span>${badge(n(r.repeats)+' repeat'+(r.repeats===1?'':'s'),'amber')}</span>
 <span class="fa-question-title">${esc(r.question.title)}</span><span class="fa-card-meta">${r.afterClosure?badge(n(r.afterClosure)+' after closure'):''}${r.unresolved?badge(n(r.unresolved)+' while open','amber'):''}${r.unknown?badge('Closure unknown'):''}${r.critical?badge('Critical question','critical'):''}</span>
 <span class="fa-card-foot"><span>${esc(date(r.latest.at))} · ${r.open?n(r.open)+' open now':'No linked faults open'}</span><span aria-hidden="true">↗</span></span></button>`).join('')}</div>`;}

function questionCards(rows,f,page){return `<div class="fa-questions">${rows.slice(page*12,page*12+12).map(q=>`<button type="button" class="fa-question-row" data-go="${esc(detailURL(f,q.id,{search:''}))}"><span class="fa-question-copy"><small>PM3 ${esc(questionLabel(q.id))} · ${esc(q.section)}</small><strong>${esc(q.title)}</strong></span><span class="fa-question-numbers"><span><strong>${n(q.failures)}<small> / ${n(q.checked)}</small></strong><small>Checks with faults</small></span><span><strong>${rate(q.rate)}</strong><small>Failure rate</small></span><span><strong>${n(q.repeats)}</strong><small>Repeated</small></span></span></button>`).join('')}</div>`;}

function breakdownTable(rows,label,f,id){return `<div class="fa-table-wrap"><table class="fa-table"><thead><tr><th scope="col">${esc(label)}</th><th scope="col">Checks</th><th scope="col">With faults</th><th scope="col">Failure rate</th><th scope="col">Repeats</th></tr></thead><tbody>${rows.map(r=>`<tr><th scope="row">${label==='Bus'?go(detailURL(f,id,{bus:r.name,page:0}),r.name,'tap-small'):esc(r.name)}</th><td>${n(r.checked)}</td><td>${n(r.failures)}</td><td>${rate(r.rate)}</td><td>${n(r.repeats)}</td></tr>`).join('')}</tbody></table></div>`;}

function evidence(o){
 const closure=o.faults.filter(f=>f.closureNotes||f.safetyResolution||f.repairReported);
 const failedAnswer=o.answers.find(a=>['Defect','Fixed'].includes(a.result));
 const section=[...new Set((o.inspection.templateSnapshot?.tasks||[o.task]).map(t=>t.section))].indexOf(o.task.section);
 return `<article class="fa-evidence"><div class="fa-evidence-top"><strong>${esc(o.bus.id)} <small>· ${esc(date(o.at))}</small></strong><span>${!o.selected?badge('Earlier context'):''}${o.previous?badge(repeatLabels[o.repeatState],o.repeatState==='open'?'amber':''):''}${o.open?badge('Open now','amber'):o.closureUnknown?badge('Closure unknown'):badge('Closed')}</span></div><p class="fa-evidence-question">${esc(o.task.question||o.task.text)}</p><p class="record-note">${esc(o.faults.map(f=>f.description).filter(Boolean).join('\n')||failedAnswer?.notes||'Finding retained in inspection history.')}</p>
 ${o.previous?`<p class="fa-prior">Earlier finding: ${esc(date(o.previous.at))} · ${n(Math.floor(o.daysSincePrevious))} elapsed days earlier. ${go('inspection-record/'+encodeURIComponent(o.previous.inspection.id),'Earlier inspection','tap-small')}</p>`:''}
 ${closure.length?`<details><summary>Repair & closure evidence</summary>${closure.map(f=>`<div class="fa-closure">${f.repairReported?`<p><strong>Reported repair:</strong> ${esc(f.repairReported.work)}</p><p><strong>Recheck:</strong> ${esc(f.repairReported.recheck)}</p>`:''}${f.safetyResolution?`<p><strong>Verified repair:</strong> ${esc(f.safetyResolution.repairEvidence)}</p><p><strong>Verified recheck:</strong> ${esc(f.safetyResolution.recheckEvidence)}</p>`:''}${f.closureNotes?`<p><strong>Closure:</strong> ${esc(f.closureNotes)}</p>`:''}${f.closedAt?`<small>${esc(date(f.closedAt))} · ${esc(f.closedBy||'Reviewer')}</small>`:''}</div>`).join('')}</details>`:''}
 <div class="fa-evidence-links">${go('inspection-record/'+encodeURIComponent(o.inspection.id)+(section>=0?'/'+section:''),'Inspection evidence','tap-small')}${o.faults.map(f=>go('records/faults/'+encodeURIComponent(f.id),'Fault '+f.id,'tap-small')).join('')}</div><small class="fa-evidence-source">${esc(o.inspection.status)} · Template version ${esc(o.inspection.templateSnapshot?.version||1)}${!o.timeKnown?' · Finding date unavailable; inspection start shown':''}</small></article>`;
}

function detail(report,id,f,c){
 const q=questionBreakdown(report,id);if(!q)return empty('Question unavailable','Choose a question from PM3 questions.');
 const selected=q.history.filter(o=>o.selected),earlier=q.history.filter(o=>!o.selected&&selected.some(s=>s.previous===o));
 const events=[...new Map([...selected,...earlier].map(o=>[o.id,o])).values()].sort((a,b)=>b.at-a.at),page=Math.min(f.page,Math.max(0,Math.ceil(events.length/12)-1));
 return `<div class="fa-detail-heading"><p>PM3 ${esc(questionLabel(q.id))} · ${esc(q.section)}</p><h2>${esc(q.title)}</h2></div><div class="perf-stats">${stat('Checks assessed',n(q.checked),'One per inspection')}${stat('Checks with faults',n(q.failures),rate(q.rate)+' failure rate')}${stat('Buses affected',n(q.buses),'In selected inspections')}${stat('Repeated findings',n(q.repeats),n(q.afterClosure)+' after closure')}</div>
 ${q.checked?`<details class="card fa-breakdown" open><summary>By model</summary>${breakdownTable(q.models,'Model',f,id)}</details><details class="card fa-breakdown"><summary>By bus</summary>${breakdownTable(q.busesByFailure,'Bus',f,id)}</details><details class="card fa-breakdown"><summary>By month</summary>${breakdownTable(q.months,'Inspection month',f,id)}</details>`:empty('No assessed checks in this view','Try a wider date range or another model.')}
 <div class="fa-results-heading"><h2>Findings & repairs</h2><span>${n(selected.length)} finding(s)${earlier.length?' · '+n(earlier.length)+' earlier comparison(s)':''}</span></div>${events.length?`<div class="fa-evidence-list">${events.slice(page*12,page*12+12).map(evidence).join('')}</div>${pager(events.length,page,f,route(c))}`:empty('No findings recorded','Assessed checks without faults still contribute to the failure rate.')}`;
}

export function faultAnalysisView(c){
 if(!manager(c.me))return '<section class="ops-page"><h1>Manager access required</h1><p>Fault analysis is available to garage managers and administrators.</p></section>';
 if(!c.garage)return empty('Choose a garage','Choose a garage to view its fault analysis.');
 const f=analysisParams(c.page),path=route(c),isQuestions=path===root+'/questions',detailId=path.startsWith(root+'/question/')?path.slice((root+'/question/').length):'';
 let report,id;try{id=decodeURIComponent(detailId);report=cachedAnalysis(c,{...f,...(id?{question:id}:{})});}catch(error){return `<section class="ops-page"><h1>Fault analysis</h1><p role="alert">${esc(error.message)}</p>${go(root,'Reset analysis')}</section>`;}
 const search=f.search.toLowerCase().trim();let rows=(isQuestions?report.questions:report.recurring).filter(r=>[r.title,r.section,r.id,r.question?.title,r.question?.id,r.bus?.id,r.model].filter(Boolean).join(' ').toLowerCase().includes(search));
 if(isQuestions)rows=sortQuestions(rows,f.sort);
 const page=Math.min(f.page,Math.max(0,Math.ceil(rows.length/12)-1));
 return `<section class="ops-page performance-page performance-dashboard fault-analysis" ${busy?'aria-busy="true"':''}>
 <div class="perf-header"><h1>Fault analysis</h1><div class="report-switch perf-tabs" role="group" aria-label="Management view">${['overview','buses','models','warranty'].map(k=>`<button type="button" data-perf-tab="${k}" aria-pressed="false">${{overview:'Overview',buses:'Buses',models:'Models',warranty:'Warranty'}[k]}</button>`).join('')}<button type="button" data-go="performance/downtime" aria-pressed="false">Downtime</button><button type="button" aria-pressed="true" data-go="${esc(url(root,f,{page:0}))}">Faults</button></div>
 <div class="fa-view-switch" role="group" aria-label="Fault analysis view">${go(url(root,f,{page:0,search:''}),'Recurring faults',!isQuestions&&!id?'selected':'')}${go(url(root+'/questions',f,{page:0,search:''}),'PM3 questions',isQuestions||id?'selected':'')}</div>
 ${filters(c,f,report)}</div>
 ${id?detail(report,id,f,c):`<div class="perf-stats">${stat('Checks with faults',n(report.totals.failures),'From '+n(report.totals.checked)+' assessed checks')}${stat('Buses affected',n(report.totals.buses),'In selected inspections')}${stat('Repeated findings',n(report.totals.repeats),'Same bus and PM3 question')}${stat('After closure',n(report.totals.afterClosure),'Earlier faults closed before repeat')}</div>`}
 ${!id?`<form class="fa-list-tools" data-fault-analysis-search><label><span class="sr-only">Find a ${isQuestions?'question or section':'bus or question'}</span><input type="search" name="search" value="${esc(f.search)}" placeholder="${isQuestions?'Find a question or section':'Find a bus or question'}"></label>${isQuestions?`<label>Sort by<select name="sort">${[['failures','Most faults'],['rate','Highest failure rate'],['repeats','Most repeats']].map(([v,l])=>option(v,l,f.sort)).join('')}</select></label>`:''}<button type="submit" class="secondary">Search</button></form><div class="fa-results-heading"><h2>${isQuestions?'PM3 questions':'Recurring faults'}</h2><span>${n(rows.length)} ${isQuestions?'questions':'bus / question matches'}</span></div>${rows.length?(isQuestions?questionCards(rows,f,page):recurringCards(rows,f,page))+pager(rows.length,page,f,path):empty(isQuestions?'No matching questions':'No repeated findings in this view',isQuestions?'Try another section or search.':'Try a wider date range or repeat window. Only linked PM3 findings can be compared.')}`:''}
 <div class="fa-report-actions"><button type="button" class="secondary" data-fa-export="${id||isQuestions?'questions':'recurring'}">Export CSV</button><button type="button" class="tap-small" data-fa-refresh ${busy?'disabled':''}>${busy?'Refreshing…':'Refresh'}</button></div>${methodology(report)}${backRoute(id?url(root+'/questions',f,{page:0}):'performance')}</section>`;
}

export function setupFaultAnalysis(h){host=h;
 document.addEventListener('click',async e=>{
  const b=e.target.closest('button'),c=host.context();if(!b||!active(c)||!manager(c.me)||busy)return;
  const f=analysisParams(c.page);
  if(b.dataset.faPeriod){const all=b.dataset.faPeriod==='all';host.go(url(route(c),f,{from:all?'':daysAgo(Number(b.dataset.faPeriod)-1),to:dublinDate(new Date()),page:0}));}
  if(b.dataset.faExport){
   const raw=route(c).startsWith(root+'/question/')?route(c).slice((root+'/question/').length):'';
   try{const report=faultAnalysis(c.state,c.garage,{...f,...(raw?{question:decodeURIComponent(raw)}:{})});
    // Export the visible search and sort, across all pages.
    const query=f.search.trim().toLowerCase();report.questions=sortQuestions(report.questions.filter(q=>[q.title,q.section,q.id].join(' ').toLowerCase().includes(query)),f.sort);report.recurring=report.recurring.filter(r=>[r.question.title,r.question.id,r.bus.id,r.model].join(' ').toLowerCase().includes(query));
    const blob=new Blob(['\uFEFF'+analysisCSV(report,b.dataset.faExport)],{type:'text/csv;charset=utf-8'}),href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download='fleettap-'+b.dataset.faExport+'-'+(f.to||dublinDate(new Date()))+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
   }catch(error){host.notify(error.message);}
  }
  if(b.hasAttribute('data-fa-refresh')){busy=true;host.render();try{await host.reload();}catch(error){host.notify(error.message);}finally{busy=false;host.render();}}
 });
 document.addEventListener('submit',async e=>{
  const form=e.target,c=host.context();if(!form.hasAttribute('data-fault-analysis-filters')&&!form.hasAttribute('data-fault-analysis-search'))return;
  e.preventDefault();if(!active(c)||!manager(c.me)||busy)return;
  const values=Object.fromEntries(new FormData(form)),f=analysisParams(c.page);
  if(form.hasAttribute('data-fault-analysis-search')){host.go(url(route(c),f,{...values,page:0}));return;}
  const err=form.querySelector('.form-error');err.textContent='';
  try{
   const selectedGarage=values.garage||c.garage;delete values.garage;
   faultAnalysis(c.state,c.garage,{...f,...values});
   if(selectedGarage!==c.garage){
    if(!c.garages?.some(g=>g.id===selectedGarage))throw Error('Choose an available garage.');
    busy=true;form.querySelectorAll('button').forEach(b=>b.disabled=true);await host.reload(selectedGarage);busy=false;
    host.go(url(root,{...f,...values},{model:'',bus:'',section:'',question:'',page:0,search:''}));
   }else{host.go(url(values.question?root+'/questions':route(c),f,{...values,page:0}));}
  }catch(error){err.textContent=error.message;busy=false;form.querySelectorAll('button').forEach(b=>b.disabled=false);}
 });
}
