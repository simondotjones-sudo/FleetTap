import {backRoute} from './navigation.js';
import {WorkDraftMap} from './work-drafts.js';
import {coveredThrough,displayDate} from './display.js';
import {releaseBadge,busStatus,releaseLabel} from './bus-release-ui.js';
import {activeDowntime,coverage} from './performance-model.js';
import {scheduleStatus,modelSchedule} from './scheduling.js';
import {fleetModels,fleetModel,vehicleModelType,modelTypeForSave} from './fleet-models.js';
import {fleetNav} from './fleet-nav.js';
import {isPM3} from './templates.js';
import {esc} from './api.js';
import {manager} from './admin-ui.js';
import {revision} from './inspections.js';
import {photoGallery} from './photos.js';
import {dictationButton,dictationActive,stopDictation,toggleDictation} from './dictation.js';

const paths={bus:'M5 4h14v15H5zM5 11h14M9 4v7M15 4v7M8 19v2M16 19v2',check:'M5 12l4 4L19 6',fault:'M14 6a5 5 0 0 0-6 6L3 17l4 4 5-5a5 5 0 0 0 6-6l-4 4-4-4z',clock:'M12 7v5l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',list:'M5 5h14M5 12h14M5 19h14',calendar:'M4 5h16v16H4zM4 9h16M8 2v6M16 2v6',question:'M8 7a4 4 0 1 1 6 4c-2 1-2 2-2 4M12 19v1',plus:'M12 5v14M5 12h14'};
const icon=k=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[k]||paths.bus}"/></svg>`;
const button=(attr,label)=>`<button type="button" class="tap-small" ${attr}>${esc(label)}</button>`;
const go=(page,label)=>button(`data-go="${esc(page)}"`,label);
const tile=(attr,label,k='bus',sub='',extra='')=>`<button type="button" class="tap-tile fleet-tile" ${attr}>${icon(k)}<strong>${esc(label)}</strong>${sub?`<small>${esc(sub)}</small>`:''}${extra}</button>`;
const route=(page,label,k='bus',sub='',extra='')=>tile(`data-go="${esc(page)}"`,label,k,sub,extra);
const date=s=>displayDate(s);
const today=()=>new Date().toISOString().slice(0,10);
const overdue=v=>!!v.due&&v.due<today();
const badge=s=>`<span class="pill ${s==='Held for review'?'critical':s==='Open'||s==='Inspection overdue'?'attention':s==='Closed'?'action-closed':'status-neutral'}">${esc(s||'Status unknown')}</span>`;
const scoped=(c,key,vehicle)=>c.state[key].filter(r=>r.garage===c.garage&&!r.deletedAt&&(vehicle===undefined||r.vehicle===vehicle));
const vehicleFor=(c,id)=>c.state.vehicles.find(v=>v.id===id&&v.garage===c.garage);
const drafts=new WorkDraftMap('fleet'),lists=new Map();let host,busy=false,showAllModels=false;
export const fleetBusy=()=>busy;
export const isFleetRoute=page=>['fleet','vehicle','history'].includes(page.split('/')[0]);
const draftFor=c=>{if(!drafts.has(c.garage))drafts.set(c.garage,{step:'id',id:'',registration:'',model:'',due:'',trail:[],dirty:false,error:'',conflict:false,saved:null});return drafts.get(c.garage);};
const listFor=c=>{const key=c.garage+':'+c.page;if(!lists.has(key))lists.set(key,{query:'',page:0});return lists.get(key);};
function frame(title,content,footer){return `<section class="tap-screen fleet-screen"><div class="tap-heading"><h1>${esc(title)}</h1></div><div class="tap-content">${content}</div>${footer?`<footer class="tap-footer">${footer}</footer>`:''}</section>`;}
const unavailable=(text='Bus unavailable')=>frame(text,'<p class="tap-caption">Choose a record from your current garage.</p>',backRoute('fleet/list'));
const nav=fleetNav;
const releaseLabels={released:'Released for service',offroad:'Off road',awaiting:'Awaiting release',unconfirmed:'Status unconfirmed'};
const empty=text=>`<div class="fleet-empty">${icon('bus')}<h2>${esc(text)}</h2></div>`;
function pageControls(l,total){const pages=Math.max(1,Math.ceil(total/6));l.page=Math.max(0,Math.min(l.page,pages-1));return pages>1?button(`data-fleet-page="-1" ${l.page===0?'disabled':''}`,'Previous')+`<span>${l.page+1} / ${pages}</span>`+button(`data-fleet-page="1" ${l.page===pages-1?'disabled':''}`,'Next'):'';}
function busList(c,filter='all',modelType=''){const l=listFor(c),buses=c.state.vehicles.filter(v=>v.garage===c.garage&&(!modelType||vehicleModelType(v)===modelType)&&(!releaseLabels[filter]||busStatus(c,v.id).status===releaseLabels[filter])&&(filter!=='overdue'||overdue(v))&&(filter!=='unknown'||!v.due)&&[v.id,v.name,v.registration,v.model,vehicleModelType(v)].join(' ').toLowerCase().includes(l.query.toLowerCase())),paging=pageControls(l,buses.length);
 const content=nav(c,'fleet/list')+`<label class="sr-only" for="fleet-find">Find a bus by number, registration or model</label><input id="fleet-find" class="tap-search" type="search" placeholder="Find bus number, registration or model" value="${esc(l.query)}"><div class="tap-grid fleet-tiles">${buses.slice(l.page*6,l.page*6+6).map(v=>route('vehicle/'+encodeURIComponent(v.id),v.name||v.id,'bus',v.name?v.id+' · '+(v.registration||v.model):v.registration||v.model,releaseBadge(c,v.id)+(overdue(v)?'<small class="fleet-overdue">Inspection overdue</small>':''))).join('')}</div>`+(!buses.length?empty(l.query?'No matching buses':filter==='overdue'?'No overdue inspection dates':filter==='unknown'?'All buses have a due date':'No buses in this garage'):'');
 return frame(modelType?modelType+' buses':releaseLabel(releaseLabels[filter])|| (filter==='overdue'?'Inspection overdue':filter==='unknown'?'Due date unknown':'Choose a bus'),content,(filter==='all'?backRoute('home'):backRoute('fleet/overview'))+paging);
}
function models(c){
 if(!manager(c.me))return unavailable('Manager access required');
 const buses=c.state.vehicles.filter(v=>v.garage===c.garage);
 return frame('Model types',nav(c,'fleet/models')+`<div class="toolbar"><button type="button" class="tap-small" data-all-models>${showAllModels?'Show fleet models':'Show all models'}</button></div><div class="fleet-model-grid">${fleetModels.filter(m=>showAllModels||buses.some(v=>vehicleModelType(v)===m.id)).map(m=>{
  const count=buses.filter(v=>vehicleModelType(v)===m.id).length,s=modelSchedule(c.state,c.garage,m.id);
  return `<article class="fleet-model-card"><div class="row"><h2>${esc(m.id)}</h2><span class="pill status-neutral">${count} ${count===1?'bus':'buses'}</span></div><p>${esc(m.name)}</p><details><summary>Model details</summary><p>${esc(m.technology)}</p><p>${esc(m.years)}</p>${m.series!==m.id?`<p>Source group: ${esc(m.series)}</p>`:''}</details><small>${s?s.enabled===false?'Schedule paused':`Every ${s.interval} ${esc(s.unit)}`:'No model schedule'}</small><div class="fleet-model-actions">${go('fleet/model/'+m.id,'View buses')}${go(c.me.role==='organisation_admin'?'schedules/model/'+m.id:'schedules',c.me.role==='organisation_admin'?(s?'Edit schedule':'Set schedule'):'View schedules')}</div></article>`;
 }).join('')}</div><p class="tap-caption">Model descriptions and approximate years are from the supplied catalogue. Each fleet prefix can have its own schedule.</p>`,backRoute('fleet'));
}
function overview(c){const vs=c.state.vehicles.filter(v=>v.garage===c.garage),faults=scoped(c,'faults').filter(f=>f.status!=='Closed'),checks=scoped(c,'inspections');
 const stats=[['fleet/list','Buses',vs.length,'bus',''],['fleet/list/overdue','Inspection overdue',vs.filter(overdue).length,'calendar','attention'],['fleet/list/unknown','Due date unknown',vs.filter(v=>!v.due).length,'question',''],['fleet/records/faults','Open faults',faults.length,'fault','attention'],['fleet/records/checks','Checks underway',checks.filter(i=>i.status==='In progress').length,'check',''],['fleet/records/review','Inspections awaiting sign-off',checks.filter(i=>i.status==='Awaiting review').length,'clock','']];
 return frame('Fleet overview',nav(c,'fleet')+`<h2 class="section-label">Fleet status</h2><div class="release-summary">${Object.entries(releaseLabels).map(([key,label])=>`<button type="button" data-go="fleet/list/${key}"><strong>${vs.filter(v=>busStatus(c,v.id).status===label).length}</strong><span>${releaseLabel(label)}</span></button>`).join('')}</div><h2 class="section-label">Needs attention and records</h2><div class="tap-grid fleet-tiles fleet-stat-tiles">${stats.map(([p,t,n,k,tone])=>route(p,t,k,'',`<span class="fleet-stat ${n&&tone?' '+tone:''}">${n}</span>`)).join('')}</div>`, '');
}
function busHome(c,v){const id=encodeURIComponent(v.id),ins=scoped(c,'inspections',v.id),current=ins.find(i=>isPM3(i)&&i.status==='In progress'),faults=scoped(c,'faults',v.id),actions=scoped(c,'actions',v.id).filter(a=>a.status!=='Closed');
 return frame(v.name||v.id,`<div class="fleet-bus-summary"><p>${esc([v.name?v.id:'',v.registration,v.model].filter(Boolean).join(' · '))}</p>${releaseBadge(c,v.id)}<p>Last completed: ${date(scheduleStatus(c.state,c.garage,v.id).last)}</p><p>Next inspection: ${v.due?esc(date(v.due)):'Unknown'}</p></div>${busStatus(c,v.id).status!=='Released for service'?`<div class="bus-next-step"><p>${esc([...busStatus(c,v.id).blockers,...busStatus(c,v.id).unknown][0]||'Supervisor release is required.')}</p>${go('bus-release/'+id,'View next steps')}</div>`:''}<div class="tap-grid fleet-tiles">${route('checks/'+id,current?'Resume check':'Start check','check','PM3 inspection')}${route('defect/'+id,'Report fault','fault')}${route('history/'+id+'/actions','Actions','list',`${actions.length} outstanding`)}${route('bus-release/'+id,'Release status','check','Requirements & sign-off')}${route('bus-timeline/'+id,'Bus history','clock','One bus timeline')}${route('vehicle/'+id+'/details','Bus details','bus')}</div><div class="toolbar">${go('vehicle/'+id+'/jobs','Bus jobs')}${manager(c.me)?go('performance/bus/'+id,'Downtime & warranty'):''}</div>`,backRoute('fleet/list'));
}
function details(c,v){const id=encodeURIComponent(v.id);return frame('Bus details',`<article class="fleet-detail"><h2>${esc(v.name||v.id)}</h2>${releaseBadge(c,v.id)}<dl>${[['Fleet number',v.id],['Bus name',v.name||'Not set'],['Registration',v.registration||'Not recorded'],['Model type',vehicleModelType(v)||'Other model'],['Model / class',v.model],['Warranty',coverage(v,c.content||{}).known?'Covered through '+coveredThrough(coverage(v,c.content||{}).end):v.warranty||'Unknown'],['Next inspection',v.due?date(v.due):'Unknown']].map(([k,val])=>`<div><dt>${k}</dt><dd>${esc(val)}</dd></div>`).join('')}</dl></article><div class="tap-grid jobs">${route('bus-timeline/'+id,'Bus history','clock')}${manager(c.me)?route('bus-edit/'+id,'Edit bus','bus')+route(c.me.role==='organisation_admin'?'schedules/'+id:'schedules','Inspection schedule','calendar')+route('performance/bus/'+id,'Downtime & warranty','clock'):''}</div>${c.me.role==='organisation_admin'?`<details class="card fleet-management-options"><summary>Manage bus</summary><p>Move this bus when its garage allocation changes.</p>${go('vehicle/'+id+'/transfer','Move to another garage')}</details>`:''}`,backRoute('vehicle/'+id));}
function historyHome(c,v){const id=encodeURIComponent(v.id);return frame('Choose a history',`<div class="tap-grid fleet-tiles">${route('bus-timeline/'+id,'Bus history','clock','All available records')}${route('bus-release/'+id,'Release status','check','Requirements & decisions')}${route('history/'+id+'/checks','Inspections','check',`${scoped(c,'inspections',v.id).length} recorded`)}${route('history/'+id+'/faults','Faults','fault',`${scoped(c,'faults',v.id).length} recorded`)}${route('history/'+id+'/maintenance','Component history','clock','Not imported')}</div>`,backRoute('vehicle/'+id));}
function records(c,kind,v){const l=listFor(c),id=v&&encodeURIComponent(v.id);let rows,title;
 if(kind==='faults'){rows=scoped(c,'faults',v?.id).filter(r=>v||r.status!=='Closed');title=v?'Fault history':'Open faults';}
 else if(kind==='actions'){rows=scoped(c,'actions',v?.id);title='Bus actions';}
 else{rows=scoped(c,'inspections',v?.id).filter(i=>v||i.status===(kind==='review'?'Awaiting review':'In progress'));title=v?'Check history':kind==='review'?'Checks for review':'Checks underway';}
 const paging=pageControls(l,rows.length),grid=rows.length?`<div class="tap-grid fleet-tiles">${rows.slice(l.page*6,l.page*6+6).map(r=>{const path=kind==='actions'?'actions/'+encodeURIComponent(r.id):kind==='faults'?(v?'history/'+id+'/fault/':'fleet/fault/')+encodeURIComponent(r.id):isPM3(r)?(v?'inspection-record/':'inspection/')+encodeURIComponent(r.id):(v?'history/'+id+'/check/':'fleet/check/')+encodeURIComponent(r.id);return route(path,kind==='faults'||kind==='actions'?r.title:r.vehicle,kind==='faults'?'fault':kind==='actions'?'list':'check',kind==='actions'?r.owner:kind==='faults'?r.vehicle:date(r.created),badge(r.status));}).join('')}</div>`:empty(kind==='actions'?'No actions for this bus':kind==='faults'?'No faults recorded':'No checks recorded');
 return frame(title,grid,(v?backRoute('vehicle/'+id):backRoute('fleet/overview'))+paging);
}
function recordDetail(c,kind,recordId,v){const key=kind==='fault'?'faults':'inspections',r=scoped(c,key,v?.id).find(r=>r.id===recordId);if(!r)return unavailable('Record unavailable');const back=v?'history/'+encodeURIComponent(v.id)+(kind==='fault'?'/faults':'/checks'):'fleet/records/'+(kind==='fault'?'faults':r.status==='Awaiting review'?'review':'checks');
 const actions=kind==='fault'?scoped(c,'actions',r.vehicle).filter(a=>a.source===r.id):[];
 return frame(kind==='fault'?'Fault record':'Check record',`<article class="fleet-detail"><div class="row">${badge(r.status)}<span>${esc(r.vehicle)}</span></div><h2>${esc(r.title||r.template||'Inspection')}</h2><p class="record-note">${esc(r.description||r.notes||'No notes recorded.')}</p>${r.immediate?`<p class="record-note">${esc(r.immediate)}</p>`:''}${kind==='fault'?photoGallery(r.photos,c.garage):`<p>Recorded by: ${esc(r.craftworker||'Not recorded')}</p>`}<p class="help">${esc(date(r.created))} · ${esc(r.id)}${r.inspection?' · Inspection '+esc(r.inspection):''}</p></article>${actions.length?`<div class="tap-grid jobs">${actions.map(a=>route('actions/'+encodeURIComponent(a.id),'View linked action','list',a.status)).join('')}</div>`:''}`,backRoute(back));
}
export function vehicleValues(d){const id=d.id.trim().toUpperCase().replace(/\s+/g,'-');if(!/^[A-Z0-9 -]{1,40}$/.test(id))throw Error('Use letters, numbers, spaces or hyphens for the fleet number.');if(!d.model.trim())throw Error('Choose or enter a model.');if(d.due&&(!/^\d{4}-\d{2}-\d{2}$/.test(d.due)||!Number.isFinite(Date.parse(d.due))||new Date(d.due).toISOString().slice(0,10)!==d.due))throw Error('Choose a valid inspection date.');return {id,registration:d.registration.trim().slice(0,30),model:d.model.trim().slice(0,120),modelType:modelTypeForSave({...d,id}),due:d.due};}
function inputView(d,field,label,placeholder,max){return `<div class="report-text-entry fleet-entry">${dictationButton()}<label class="sr-only" for="fleet-value">${esc(label)}</label><input id="fleet-value" data-fleet-field="${field}" maxlength="${max}" value="${esc(d[field])}" placeholder="${esc(placeholder)}" autocomplete="off"><p class="tap-caption">Review numbers and letters before continuing.</p></div>`;}
function addBus(c){if(!manager(c.me))return unavailable('Manager access required');const d=draftFor(c);return frame('Add bus',`<form class="card fleet-form" data-fleet-create><label>Fleet number<input name="id" required maxlength="40" placeholder="e.g. SG271"></label><label>Registration (optional)<input name="registration" maxlength="30"></label><label>Model<select name="modelType" required><option value="">Choose a model</option>${fleetModels.map(m=>`<option value="${m.id}">${esc(m.id+' · '+m.name)}</option>`).join('')}<option value="OTHER">Other model</option></select></label><label data-other-model hidden>Model description<input name="model" maxlength="120"></label>${c.me.role==='organisation_admin'?'<details><summary>Inspection planning</summary><label>Next inspection due (if known)<input type="date" name="due"></label></details>':'<p class="help">This bus inherits its model schedule. Contact your Organisation Admin if a schedule needs changing.</p>'}<p class="form-error" role="alert">${esc(d.error)}</p><button>Add bus</button></form>`,backRoute('fleet/list'));}
function transferView(c,v){
 if(c.me.role!=='organisation_admin')return unavailable('Organisation Admin access required');
 const choices=(c.garages||[]).filter(g=>g.organisation_id===c.organisation&&g.id!==c.garage),jobs=(c.state.jobs||[]).filter(j=>j.garage===c.garage&&j.vehicle===v.id&&!['Completed','Cancelled'].includes(j.status)),sources=new Set([...(c.state.faults||[]),...(c.state.reports||[])].filter(r=>r.garage===c.garage&&r.vehicle===v.id).map(r=>r.id)),actions=(c.state.actions||[]).filter(a=>a.garage===c.garage&&(a.vehicle===v.id||sources.has(a.source))&&!a.deletedAt&&a.status!=='Closed');
 return frame('Move '+v.id,choices.length?`<form class="card fleet-form" data-fleet-transfer data-id="${esc(v.id)}"><p>From <strong>${esc(c.garages.find(g=>g.id===c.garage)?.name||'this garage')}</strong></p><label>Receiving garage<select name="garage" required><option value="">Choose a garage</option>${choices.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}</select></label><label>Reason for the move<textarea name="reason" required minlength="5" maxlength="2000" rows="3" placeholder="e.g. Route allocation changed"></textarea></label><p>Bus details, inspection history, faults, warranty and downtime move with the bus. The original garage keeps a departure archive.</p><p class="notice">${jobs.length} unfinished jobs and ${actions.length} open actions will need review at the receiving garage. Their assignments will be cleared; completed work stays recorded.</p><label class="transfer-confirm"><input type="checkbox" name="confirm" value="yes" required><span>I have checked the receiving garage and outstanding work.</span></label><button>Confirm move</button><p class="form-error" role="alert"></p></form>`:'<article class="card"><p>Add another garage in Manage FleetTap before moving a bus.</p>'+go('admin/garages','Garages')+'</article>',backRoute('vehicle/'+encodeURIComponent(v.id)+'/details'));
}
export function fleetFlowView(c){c={...c,state:{...c.state,vehicles:c.state.vehicles.map(v=>v.garage===c.garage?{...v,due:scheduleStatus(c.state,c.garage,v.id).due}:v)}};let parts;try{parts=c.page.split('/').map(decodeURIComponent);}catch{return unavailable();}const [root,id,section,recordId]=parts;
 if(root==='fleet'){if(!id)return overview(c);if(id==='list'&&!section)return busList(c);if(id==='models')return models(c);if(id==='model'&&fleetModel(section))return busList(c,'all',section);if(id==='overview')return overview(c);if(id==='new')return addBus(c);if(id==='list'&&['overdue','unknown',...Object.keys(releaseLabels)].includes(section))return busList(c,section);if(id==='records'&&['faults','checks','review'].includes(section))return records(c,section);if(['fault','check'].includes(id))return recordDetail(c,id,section);return unavailable();}
 const v=vehicleFor(c,id);if(!v)return unavailable();
 if(root==='vehicle'&&section==='jobs')return frame(v.id+' · Jobs',(c.state.jobs||[]).filter(j=>j.garage===c.garage&&j.vehicle===v.id).map(j=>`<article class="card"><h2>${esc(j.title)}</h2><p>${esc(j.assigneeName||'Unassigned')} · ${esc(j.status)}</p>${go((manager(c.me)?'garage-today/':'my-jobs/')+j.id,'Open job')}</article>`).join('')||'<p>No jobs recorded for this bus.</p>',backRoute('vehicle/'+encodeURIComponent(v.id)));
 if(root==='vehicle')return !section?busHome(c,v):section==='details'?details(c,v):section==='transfer'?transferView(c,v):unavailable();
 if(!section)return historyHome(c,v);
 if(['checks','faults','actions'].includes(section))return records(c,section,v);
 if(['fault','check'].includes(section))return recordDetail(c,section,recordId,v);
 if(section==='maintenance')return frame('Component history',`<article class="fleet-detail"><h2>History not imported</h2><p>Two-, three- and four-year task history is not available in FleetTap yet.</p><p>A not-due result requires a supporting maintenance-history reference. Unknown history does not mean a task is not due.</p></article>`,backRoute('history/'+encodeURIComponent(v.id)));
 return unavailable();
}
export function setupFleet(h){host=h;
 document.addEventListener('submit',async e=>{
  const f=e.target;if(!f.hasAttribute('data-fleet-transfer'))return;e.preventDefault();if(busy||host.context().me.role!=='organisation_admin')return;
  busy=true;const button=f.querySelector('button:not([type])');button.disabled=true;const values=Object.fromEntries(new FormData(f)),source=host.context().garage;let saved;
  try{saved=await host.mutation('vehicle_transfer',values,{id:f.dataset.id});await host.reload(saved.garage);host.go('vehicle/'+encodeURIComponent(saved.id));host.notify('Bus moved. Review outstanding work in Garage today.');}
  catch(error){
   if(saved){host.go('home');host.notify('Bus moved. Select the receiving garage to view its records.');return;}
   if(!error.status||error.status===409)try{
    await host.reload(source);const c=host.context(),moved=!c.state.vehicles.some(v=>v.garage===source&&v.id===f.dataset.id)&&(c.state.vehicleTransfers||[]).find(t=>t.vehicle===f.dataset.id&&t.from===source&&t.to===values.garage&&t.actorId===c.me.id);
    if(moved){await host.reload(values.garage);host.go('vehicle/'+encodeURIComponent(f.dataset.id));host.notify('This bus has moved. Review outstanding work in Garage today.');return;}
   }catch{}
   f.querySelector('.form-error').textContent=error.message;
  }
  finally{busy=false;button.disabled=false;}
 });
 document.addEventListener('form-draft-restored',e=>{if(e.target.hasAttribute('data-fleet-create'))e.target.elements.modelType.dispatchEvent(new Event('change',{bubbles:true}));});
 document.addEventListener('change',e=>{const f=e.target.closest('[data-fleet-create]');if(!f||e.target.name!=='modelType')return;const other=e.target.value==='OTHER';f.querySelector('[data-other-model]').hidden=!other;f.elements.model.required=other;});
 document.addEventListener('submit',async e=>{
  const f=e.target;if(!f.hasAttribute('data-fleet-create'))return;e.preventDefault();if(busy)return;
  const c=host.context();if(!manager(c.me))return;const d=draftFor(c),v=Object.fromEntries(new FormData(f));let values;
  busy=true;const button=f.querySelector('button[type=submit],button:not([type])');if(button)button.disabled=true;d.error='';
  try{v.model=v.modelType==='OTHER'?v.model:fleetModel(v.modelType)?.name||'';if(v.modelType==='OTHER')v.modelType='';values=vehicleValues(v);const saved=await host.mutation('vehicle',values);d.dirty=false;host.go('vehicle/'+encodeURIComponent(saved.id));host.notify('Bus added.');}
  catch(error){
   if(values&&(!error.status||error.status===409)){try{await host.reload();const existing=host.context().state.vehicles.find(b=>b.garage===c.garage&&b.id===values.id&&b.registration===values.registration&&b.model===values.model);if(existing){d.error='';host.go('vehicle/'+encodeURIComponent(existing.id));host.notify('This bus is saved with these details.');return;}}catch{}}
   d.error=error.message;f.querySelector('.form-error').textContent=error.message;
  }finally{busy=false;if(button)button.disabled=false;}
 });
 document.addEventListener('click',e=>{const el=e.target.closest('button'),c=host.context();if(!el||!isFleetRoute(c.page)||busy)return;if(el.hasAttribute('data-all-models')){showAllModels=!showAllModels;host.render();return;}if(el.hasAttribute('data-fleet-page')){listFor(c).page+=Number(el.dataset.fleetPage);host.render();}});
 document.addEventListener('input',e=>{if(e.target.id!=='fleet-find'||busy)return;const l=listFor(host.context()),position=e.target.selectionStart;l.query=e.target.value;l.page=0;host.render();const input=document.querySelector('#fleet-find');input?.focus();try{input.setSelectionRange(position,position);}catch{}});
}
