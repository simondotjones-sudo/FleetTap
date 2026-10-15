import {esc} from './api.js';
import {fleetModels,fleetModel,vehicleModelType} from './fleet-models.js';
import {fleetNav} from './fleet-nav.js';
import {scheduleStatus,modelSchedule,individualSchedule,saveSchedule,addInterval,today} from './scheduling.js';

const go=(page,label,primary=false)=>`<button type="button" class="${primary?'tap-primary':'tap-small'}" data-go="${esc(page)}">${esc(label)}</button>`;
const date=v=>v?v.slice(0,10).split('-').reverse().join('.'):'Not recorded';
const interval=s=>`Every ${s.interval} ${s.unit}`;
const pill=s=>`<span class="pill ${s==='Overdue'?'critical':['Due today','Due soon'].includes(s)?'attention':'status-neutral'}">${esc(s)}</span>`;
const lists=new Map();
const filtersFor=c=>{if(!lists.has(c.garage))lists.set(c.garage,{query:'',model:'',status:'',page:0});return lists.get(c.garage);};
const frame=(c,title,body)=>`<section class="admin-tools fleet-schedules"><div class="tap-heading"><h1>${esc(title)}</h1></div>${fleetNav(c,'schedules')}${body}</section>`;
const modelOptions=(selected='')=>fleetModels.map(m=>`<option value="${m.id}" ${selected===m.id?'selected':''}>${esc(m.id+' · '+m.name)}</option>`).join('');

export function scheduleRows(c){
 return c.state.vehicles.filter(v=>v.garage===c.garage).map(v=>({v,...scheduleStatus(c.state,c.garage,v.id)})).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||a.v.id.localeCompare(b.v.id,undefined,{numeric:true}));
}
function scheduleList(c){
 const all=scheduleRows(c),f=filtersFor(c),rules=(c.state.modelSchedules||[]).filter(s=>s.garage===c.garage&&s.templateId==='pm3');
 const rows=all.filter(r=>(!f.model||r.modelType===f.model)&&(!f.status||r.status===f.status)&&[r.v.id,r.v.name,r.v.registration,r.v.model,r.modelType].join(' ').toLowerCase().includes(f.query.toLowerCase()));
 const pages=Math.max(1,Math.ceil(rows.length/25));f.page=Math.max(0,Math.min(f.page,pages-1));
 const stats=[['Overdue',all.filter(r=>r.status==='Overdue').length,'critical'],['Due in 7 days',all.filter(r=>['Due today','Due soon'].includes(r.status)).length,'attention'],['Not scheduled',all.filter(r=>r.status==='Not scheduled').length,'status-neutral']];
 return frame(c,'Schedules',`<div class="schedule-title-row"><p>Last inspection, next due and model schedules.</p>${go('schedules/new','+ Create schedule',true)}</div>
 <div class="schedule-summary">${stats.map(([label,n,tone])=>`<div class="card"><span class="pill ${tone}">${label}</span><strong>${n}</strong></div>`).join('')}</div>
 ${rules.length?`<details class="schedule-model-rules"><summary>Model schedules <span>${rules.length}</span></summary><div class="schedule-rules-grid">${rules.map(s=>{const matching=all.filter(r=>r.modelType===s.modelType),exceptions=matching.filter(r=>r.source==='bus').length;return `<article class="card"><div class="row"><h2>${esc(s.modelType)}</h2>${pill(s.enabled===false?'Paused':interval(s))}</div><p>${matching.length} buses${exceptions?' · '+exceptions+' individual exceptions':''}</p>${go('schedules/model/'+s.modelType,'Edit model schedule')}</article>`;}).join('')}</div></details>`:''}
 <div class="schedule-filters"><label class="schedule-search">Find a bus<input type="search" id="schedule-search" data-schedule-filter="query" placeholder="Fleet number, name or registration" value="${esc(f.query)}"></label><label>Model<select data-schedule-filter="model"><option value="">All models</option>${modelOptions(f.model)}</select></label><label>Status<select data-schedule-filter="status"><option value="">All statuses</option>${['Overdue','Due today','Due soon','Upcoming','Not scheduled','Paused'].map(s=>`<option ${f.status===s?'selected':''}>${s}</option>`).join('')}</select></label></div>
 <div class="schedule-table-wrap"><table class="schedule-table"><caption class="sr-only">Last completed inspection and next due for each bus</caption><thead><tr><th scope="col">Bus / model</th><th scope="col">Last completed</th><th scope="col">Next due</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Manage</span></th></tr></thead><tbody>${rows.slice(f.page*25,f.page*25+25).map(({v,last,lastSubmitted,due,status,schedule,source,modelType})=>`<tr><th scope="row">${esc(v.name||v.id)}<small>${esc([v.name?v.id:'',modelType||'Other model'].filter(Boolean).join(' · '))}</small></th><td>${esc(date(last))}${lastSubmitted&&lastSubmitted!==last?`<small>Submitted: ${esc(date(lastSubmitted))}</small>`:''}</td><td>${due?esc(date(due)):'Not set'}${schedule?`<small>${esc(interval(schedule))} · ${source==='model'?esc(modelType)+' model':'Individual'}</small>`:''}</td><td>${pill(status)}</td><td>${go('schedules/vehicle/'+encodeURIComponent(v.id),source==='model'?'View / customise':schedule?'Edit schedule':'Set schedule')}</td></tr>`).join('')||'<tr><td colspan="5">No buses match these filters.</td></tr>'}</tbody></table></div>
 <div class="schedule-pagination"><span>${rows.length?f.page*25+1:0}–${Math.min((f.page+1)*25,rows.length)} of ${rows.length} buses</span><div>${pages>1?`<button class="tap-small" data-schedule-page="-1" ${f.page===0?'disabled':''}>Previous</button><button class="tap-small" data-schedule-page="1" ${f.page===pages-1?'disabled':''}>Next</button>`:''}</div></div>`);
}

export function schedulesView(c,part,value){
 if(!part)return scheduleList(c);
 const buses=c.state.vehicles.filter(v=>v.garage===c.garage);
 const isNew=part==='new',isModel=part==='model',selected=isNew||isModel?null:buses.find(v=>v.id===(part==='vehicle'?value:part));
 const model=isModel?fleetModel(value):null;
 if((isModel&&!model)||(!isNew&&!isModel&&!selected))return frame(c,'Schedule unavailable',go('schedules','Back to schedules'));
 const status=selected?scheduleStatus(c.state,c.garage,selected.id):null,s=model?modelSchedule(c.state,c.garage,model.id):status?.schedule;
 const scope=selected?'bus':'model',basis=s?.basis||(s?.lastDate?'last':s?.firstDue?'first':'history');
 const inherited=selected&&status.source==='model',own=selected&&individualSchedule(c.state,c.garage,selected.id),parent=selected&&modelSchedule(c.state,c.garage,vehicleModelType(selected));
 const heading=isNew?'Create schedule':model?model.id+' model schedule':selected.id+' schedule';
 return frame(c,heading,`<div class="schedule-title-row">${go('schedules','← Schedules')}<p>PM3 inspection · ${model?'all '+esc(model.id)+' buses':selected?esc(selected.name||selected.id):'choose who, how often and when'}</p></div>
 ${inherited?`<div class="notice">This bus follows the ${esc(status.modelType)} model schedule. Saving here creates an individual exception. ${go('schedules/model/'+status.modelType,'Edit model schedule')}</div>`:''}
 ${own&&parent?`<div class="notice">This bus has an individual schedule. <button type="button" class="tap-small" data-schedule-inherit="${esc(selected.id)}">Use ${esc(vehicleModelType(selected))} model schedule</button></div>`:''}
 <form class="card schedule-form" data-admin-form="schedule">
 <fieldset class="schedule-scope"><legend>1. Apply to</legend><input type="hidden" name="scope" value="${scope}"><div class="interval-presets">${[['model','Model type'],['bus','One bus'],['all','Whole garage']].map(([v,t])=>`<button class="tap-small" type="button" data-schedule-scope="${v}" aria-pressed="${scope===v}" ${!isNew&&scope!==v?'disabled':''}>${t}</button>`).join('')}</div>
 <label data-scope-model ${scope!=='model'?'hidden':''}>Model type<select name="modelType" ${scope==='model'?'required':'disabled'}><option value="">Choose a model</option>${modelOptions(model?.id)}</select></label>
 <label data-scope-bus ${scope!=='bus'?'hidden':''}>Bus<select name="vehicle" ${scope==='bus'?'required':'disabled'}><option value="">Choose a bus</option>${buses.map(v=>`<option value="${esc(v.id)}" ${selected?.id===v.id?'selected':''}>${esc(v.name?v.name+' · '+v.id:v.id)}</option>`).join('')}</select></label>
 <p class="help" data-schedule-coverage>${model?`${buses.filter(v=>vehicleModelType(v)===model.id).length} matching buses. Future ${model.id} buses inherit this schedule automatically.`:selected?'Applies to this bus only.':'Choose a model to see the buses covered.'}</p>
 <label class="toggle-label" data-scope-overrides ${scope!=='model'?'hidden':''}><input type="checkbox" name="replaceOverrides" checked ${scope!=='model'?'disabled':''}> Apply to every matching bus, replacing individual schedules</label></fieldset>
 <fieldset><legend>2. How often?</legend><div class="interval-presets">${[[1,'months','Monthly'],[4,'weeks','4 weeks'],[3,'months','3 months'],[6,'months','6 months'],[12,'months','Yearly']].map(([n,u,l])=>`<button class="tap-small" type="button" data-schedule-interval="${n}" data-schedule-unit="${u}" aria-pressed="${n===(s?.interval||1)&&u===(s?.unit||'months')}">${l}</button>`).join('')}</div><div class="schedule-interval"><label>Every<input type="number" name="interval" min="1" max="3650" required value="${s?.interval||1}"></label><label>Period<select name="unit">${['days','weeks','months'].map(u=>`<option ${u===(s?.unit||'months')?'selected':''}>${u}</option>`).join('')}</select></label></div></fieldset>
 <fieldset><legend>3. Starting point</legend><label>Calculate from<select name="basis">${[['history',"Each bus’s last completed inspection"],['first','A first due date'],['last','An external completed inspection']].map(([v,t])=>`<option value="${v}" ${basis===v?'selected':''}>${t}</option>`).join('')}</select></label><label data-schedule-date-label>${basis==='last'?'Last completed inspection':basis==='history'?'First due date when no completed inspection exists':'First due date'}<input type="date" name="date" required ${basis==='last'?`max="${today()}"`:''} value="${esc(s?.lastDate||s?.firstDue||'')}"></label><label data-schedule-reference ${basis!=='last'?'hidden':''}>Inspection / service record reference<input name="reference" maxlength="1000" value="${esc(s?.reference||'')}" ${basis==='last'?'required':''}></label><p class="help" data-schedule-history-help>${basis==='history'?'Each bus gets its own next due date from its completed inspection. The date above is only used where no completed inspection is recorded.':basis==='last'?'Only use a shared completed date if every selected bus has supporting service records.':'After the next confirmed completion, each bus advances by this interval.'}</p></fieldset>
 <label class="toggle-label"><input name="enabled" type="checkbox" ${s?.enabled===false?'':'checked'}> Schedule active</label>
 <p class="schedule-calculation" aria-live="polite" data-schedule-preview>${selected?'Current next due: '+esc(status.due?date(status.due):'Not set'):'Choose the starting date to preview the schedule.'}</p><p class="help">Awaiting-review, deleted and unfinished inspections never advance a due date. This scheduling rule does not approve a template for a different vehicle model.</p><p class="admin-error" role="alert"></p><div class="schedule-save"><button>${inherited?'Save individual schedule':'Save schedule'}</button>${go('schedules','Cancel')}</div></form>`);
}

export function scheduleValues(v){
 return {scope:v.scope,vehicle:v.vehicle,modelType:v.modelType,interval:Number(v.interval),unit:v.unit,basis:v.basis,lastDate:v.basis==='last'?v.date:'',firstDue:v.basis==='last'?'':v.date,reference:v.reference,enabled:v.enabled==='on',replaceOverrides:v.replaceOverrides==='on'};
}
export function schedulePreview(form,c){
 const f=form.elements,scope=f.scope.value,basis=f.basis.value;
 for(const [selector,visible] of [['[data-scope-model]',scope==='model'],['[data-scope-bus]',scope==='bus'],['[data-scope-overrides]',scope==='model']])form.querySelector(selector).hidden=!visible;
 f.modelType.disabled=scope!=='model';f.modelType.required=scope==='model';f.vehicle.disabled=scope!=='bus';f.vehicle.required=scope==='bus';f.replaceOverrides.disabled=scope!=='model';
 form.querySelectorAll('[data-schedule-scope]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scheduleScope===scope)));
 form.querySelectorAll('[data-schedule-interval]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.scheduleInterval)===Number(f.interval.value)&&b.dataset.scheduleUnit===f.unit.value)));
 form.querySelector('[data-schedule-date-label]').firstChild.textContent=basis==='last'?'Last completed inspection':basis==='history'?'First due date when no completed inspection exists':'First due date';
 form.querySelector('[data-schedule-reference]').hidden=basis!=='last';f.reference.required=basis==='last';if(basis==='last')f.date.max=today();else f.date.removeAttribute('max');
 const buses=c.state.vehicles.filter(v=>v.garage===c.garage&&(scope==='model'?vehicleModelType(v)===f.modelType.value:scope==='bus'?v.id===f.vehicle.value:true));
 const exceptions=scope==='model'?buses.filter(v=>individualSchedule(c.state,c.garage,v.id)).length:0;
 form.querySelector('[data-schedule-coverage]').textContent=scope==='model'&&!f.modelType.value?'Choose a model to see the buses covered.':`${buses.length} ${buses.length===1?'bus':'buses'} selected.${scope==='model'?` Future ${f.modelType.value} buses inherit this schedule automatically.${exceptions?` ${exceptions} individual schedules will be ${f.replaceOverrides.checked?'replaced':'kept'}.`:''}`:''}${scope==='all'?' Applies to buses currently in this garage.':''}`;
 form.querySelector('[data-schedule-history-help]').textContent=basis==='history'?'Each bus keeps its own last completed inspection. Only buses without completed history use the fallback date.':basis==='last'?'Only use a shared completed date if every selected bus has supporting service records.':'After the next confirmed completion, each bus advances by this interval.';
 const preview=form.querySelector('[data-schedule-preview]');
 try{
  // Run the same rules as Save against detached schedule collections, never the live workspace.
  const previewState={...c.state,schedules:(c.state.schedules||[]).map(s=>({...s,audit:[]})),modelSchedules:(c.state.modelSchedules||[]).map(s=>({...s,audit:[]}))};
  const values=scheduleValues(Object.fromEntries(['scope','modelType','vehicle','interval','unit','basis','date','reference'].map(k=>[k,f[k].value])));
  values.enabled=f.enabled.checked;values.replaceOverrides=f.replaceOverrides.checked;values.reference ||= 'Preview only';
  saveSchedule(previewState,c.garage,values,'Preview');
  const unique=[...new Set(buses.map(v=>scheduleStatus(previewState,c.garage,v.id).due).filter(Boolean))].sort();
  const fallback=basis==='last'?addInterval(f.date.value,Number(f.interval.value),f.unit.value):f.date.value;
  preview.textContent=!f.enabled.checked?'Schedule paused.':'Next due: '+(unique.length>1?date(unique[0])+' – '+date(unique.at(-1))+' (calculated for each bus)':date(unique[0]||fallback));
 }catch{preview.textContent='Choose a valid date, selection and interval to preview the next due date.';}
}

export function setupScheduleUI(host,isBusy){
 document.addEventListener('click',async e=>{
  const el=e.target.closest('button'),c=host.context();if(!el||isBusy()||!c.page.startsWith('schedules'))return;
  if(el.dataset.schedulePage){filtersFor(c).page+=Number(el.dataset.schedulePage);host.render();return;}
  const form=el.closest('form');
  if(el.dataset.scheduleScope&&form){form.elements.scope.value=el.dataset.scheduleScope;schedulePreview(form,c);}
 });
 function filter(e){const key=e.target.dataset?.scheduleFilter,c=host.context();if(!key||isBusy()||c.page!=='schedules')return;const f=filtersFor(c),position=e.target.selectionStart;f[key]=e.target.value;f.page=0;host.render();const input=document.querySelector(`[data-schedule-filter="${key}"]`);input?.focus();if(key==='query')try{input.setSelectionRange(position,position);}catch{}}
 document.addEventListener('input',e=>{if(e.target.dataset?.scheduleFilter==='query')filter(e);});
 document.addEventListener('change',e=>{if(e.target.dataset?.scheduleFilter!=='query')filter(e);});
}
