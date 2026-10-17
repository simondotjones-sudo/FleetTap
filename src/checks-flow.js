import {criticalQuestionBadge,criticalCheckBadge,criticalStats,criticalBusBadge} from './critical-safety-ui.js';
import {backRoute} from './navigation.js';
import {displayDate} from './display.js';
import {releaseBadge} from './bus-release-ui.js';
import {reviewer} from './roles.js';
import {esc} from './api.js';
import {manager} from './admin-ui.js';
import {templateFor,tasksFor,isPM3} from './templates.js';
import {scheduleStatus} from './scheduling.js';
import {taskReadings} from './inspections.js';

const lists=new Map();
let host;
export const isChecksRoute=page=>['checks','bus-checks','my-checks','inspection-record','inspection-records'].includes(page.split('/')[0]);
const listFor=c=>{const key=c.garage+':'+c.page;if(!lists.has(key))lists.set(key,{query:'',page:0});return lists.get(key);};
const go=(page,label)=>`<button type="button" class="tap-small" data-go="${esc(page)}">${esc(label)}</button>`;
const icon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v15H5zM5 11h14M9 4v7M15 4v7M8 19v2M16 19v2M8 15h1M15 15h1"/></svg>';
const checklistIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H5v17h14V4h-3M8 2h8v4H8zM8 11l2 2 6-6M8 17h8"/></svg>';
const tile=(page,title,sub,extra='',symbol=icon)=>`<button type="button" class="tap-tile" data-go="${esc(page)}">${symbol}<strong>${esc(title)}</strong><small>${esc(sub)}</small>${extra}</button>`;
const date=value=>esc(displayDate(value));
const badge=status=>`<span class="pill ${status==='Overdue'?'critical':['Due today','Due soon','Awaiting review'].includes(status)?'attention':'status-neutral'}">${esc(status)}</span>`;
const frame=(title,content,footer='')=>`<section class="tap-screen checks-screen"><div class="tap-heading"><h1>${esc(title)}</h1></div><div class="tap-content">${content}</div>${footer?`<footer class="tap-footer">${footer}</footer>`:''}</section>`;
const scoped=c=>c.state.inspections.filter(i=>i.garage===c.garage&&isPM3(i)&&!i.deletedAt);
const unavailable=()=>frame('Check unavailable','<p class="tap-caption">Choose a bus or inspection from your current garage.</p>',go('bus-checks','Choose a bus'));
function paging(l,total){const pages=Math.max(1,Math.ceil(total/6));l.page=Math.max(0,Math.min(l.page,pages-1));return pages>1?`<button type="button" class="tap-small" data-checks-page="-1" ${l.page===0?'disabled':''}>Previous</button><span>${l.page+1} / ${pages}</span><button type="button" class="tap-small" data-checks-page="1" ${l.page===pages-1?'disabled':''}>Next</button>`:'';}
const search=(l,placeholder)=>`<label class="sr-only" for="checks-search">${placeholder}</label><input id="checks-search" class="tap-search" type="search" value="${esc(l.query)}" placeholder="${placeholder}" autocomplete="off">`;
export function isMyInspection(i,me){
 const email=String(me?.email||me?.employee_id||me?.id||'').trim().toLowerCase();
 if(!email)return false;
 const matches=worker=>String(worker||'').trim().toLowerCase().endsWith(' ('+email+')');
 return matches(i.craftworker)||Object.values(i.answers||{}).some(a=>matches(a.worker));
}
function busPicker(c){
 const l=listFor(c),buses=c.state.vehicles.filter(v=>v.garage===c.garage&&[v.id,v.name,v.registration,v.model].join(' ').toLowerCase().includes(l.query.toLowerCase())),footer=paging(l,buses.length);
 return frame('Choose your bus',search(l,'Find bus number, name or registration')+`<div class="tap-grid buses">${buses.slice(l.page*6,l.page*6+6).map(v=>{
  const draft=scoped(c).find(i=>i.vehicle===v.id&&i.status==='In progress'),s=scheduleStatus(c.state,c.garage,v.id);
  return tile('checks/'+encodeURIComponent(v.id),v.name||v.id,[v.name?v.id:'',v.registration].filter(Boolean).join(' · ')||v.model,(draft?badge('Check in progress'):s.due?badge(s.status):'')+criticalBusBadge(c,v.id));
 }).join('')}</div>`+(!buses.length?'<p class="tap-caption">No matching buses in this garage.</p>':''),footer);
}
function busCheck(c,v){
 const i=scoped(c).find(i=>i.vehicle===v.id&&i.status==='In progress'),t=i?.templateSnapshot||templateFor(c.state),s=scheduleStatus(c.state,c.garage,v.id),id=encodeURIComponent(v.id);
 return frame(i?'Resume your check':'Start your check',`<div class="checks-bus-summary"><h2>${esc(v.name||v.id)}</h2><p>${esc([v.name?v.id:'',v.registration,v.model].filter(Boolean).join(' · '))}</p>${releaseBadge(c,v.id)}<p>Last completed: ${date(s.last)} · Next due: ${s.due?date(s.due):'Not scheduled'}</p>${s.due?badge(s.status):''}</div><div class="tap-grid jobs checks-start"><button type="button" class="tap-tile" data-work-start="${esc(v.id)}" ${c.openingCheck?'disabled aria-busy="true"':''}>${icon}<strong>${c.openingCheck?'Opening check…':i?'Resume check':'Start check'}</strong><small>${esc(t.title)}${i?' · '+Object.keys(i.answers).length+' answers saved':''}</small></button></div><p class="tap-caption">Draft PM3 mapping · technical review required. Completing a check does not release the bus.</p>`,backRoute('bus-checks')+go('bus-timeline/'+id,'Bus history'));
}
function records(c,v){
 if(c.page==='inspection-records'&&!manager(c.me))return frame('Administrator access required','<p class="tap-caption">Use My checks or choose a bus to view its history.</p>',go('my-checks','My checks'));
 const mine=c.page==='my-checks',l=listFor(c),rows=scoped(c).filter(i=>(!v||i.vehicle===v.id)&&(!mine||isMyInspection(i,c.me))&&[i.vehicle,i.craftworker,i.status].join(' ').toLowerCase().includes(l.query.toLowerCase())).sort((a,b)=>b.created.localeCompare(a.created)),footer=paging(l,rows.length);
 return frame(mine?'My bus inspections':v?v.id+' · Inspection history':'Inspection records',(mine?'':criticalStats(c,v?.id))+search(l,'Find bus, mechanic or status')+`<div class="tap-grid buses">${rows.slice(l.page*6,l.page*6+6).map(i=>tile('inspection-record/'+encodeURIComponent(i.id),i.vehicle,date(i.created)+' · '+i.craftworker,badge(i.status)+criticalCheckBadge(c.state,i))).join('')}</div>`+(!rows.length?'<p class="tap-caption">No matching inspections.</p>':''),(v?backRoute('checks/'+encodeURIComponent(v.id)):mine?'':backRoute('manage'))+footer);
}
function record(c,id,section){
 const i=scoped(c).find(i=>i.id===id);if(!i)return unavailable();
 const tasks=tasksFor(i),sections=[...new Set(tasks.map(t=>t.section))],root='inspection-record/'+encodeURIComponent(id),back=backRoute('checks/'+encodeURIComponent(i.vehicle)+'/history');
 if(section===undefined)return frame(i.vehicle+' · Inspection record',`<article class="checks-record-summary"><div class="row">${badge(i.status)}<span>${date(i.created)}</span></div><p>${esc(i.craftworker)}</p><p>${Object.keys(i.answers).length} answers saved · Template version ${i.templateSnapshot?.version||1}</p>${i.notes?`<p class="record-note">${esc(i.notes)}</p>`:''}${criticalCheckBadge(c.state,i)}<p class="tap-caption">Read-only inspection history</p></article><div class="inspection-section-list">${sections.map((s,n)=>({s,n,remaining:tasks.filter(t=>t.section===s&&!t.blocked&&(!i.answers[t.id]||i.answers[t.id].result==='Not completed')).length})).sort((a,b)=>b.remaining-a.remaining).map(({s,n,remaining})=>`<button type="button" class="section-row" data-go="${root}/${n}"><strong>${esc(s)}</strong><span>${remaining?remaining+' unfinished':tasks.filter(t=>t.section===s&&t.blocked).length?'Technical item blocked':'Answers recorded'}</span></button>`).join('')}</div>`,back+(manager(c.me)?go('inspection-admin/'+id,'Manage inspection'):'')+(reviewer(c.me)&&i.status==='Awaiting review'?go('reviews/inspections/'+id,'Review & sign off'):''));
 const n=Number(section);if(!Number.isInteger(n)||n<0||!sections[n])return unavailable();
 return frame(i.vehicle+' · '+sections[n],`<div class="checks-saved-answers">${tasks.filter(t=>t.section===sections[n]).map(t=>{const a=i.answers[t.id];return `<article class="checks-record-summary"><h2>${esc(t.question||t.text)}</h2>${criticalQuestionBadge(t)}${badge(t.blocked?'Blocked · technical review':a?.result||'Not recorded')}${a?`<p class="record-note">${esc(a.notes)}</p>${taskReadings(t).map((r,j)=>`<p>${esc(r[0])}: <strong>${esc(a.readings?.[j]||'Not recorded')}</strong>${r.length===4?' '+esc(r[1]):''}</p>`).join('')}${a.recheck?`<details><summary>Measurement recheck evidence</summary><p>First reading: ${esc(a.recheck.first.readings.join(' · '))} · ${esc(a.recheck.first.worker)} · ${date(a.recheck.first.at)}</p><p>Rechecked: ${esc(a.recheck.readings.join(' · '))} · ${esc(a.recheck.worker)}</p><p>${esc(a.recheck.note)}</p></details>`:''}<p class="help">${esc(a.worker)} · ${date(a.updated)}</p>`:''}<details><summary>Full instruction</summary><p>${esc(t.text)}</p><p>Source page ${t.page} · item ${esc(t.number)}</p></details></article>`;}).join('')}</div>`,backRoute(root)+(n<sections.length-1?go(root+'/'+(n+1),'Next section') :''));
}
export function checksFlowView(c){
 let p;try{p=c.page.split('/').map(decodeURIComponent);}catch{return unavailable();}
 if(p[0]==='inspection-record')return record(c,p[1],p[2]);
 if(['my-checks','inspection-records'].includes(p[0]))return records(c);
 if(p[0]==='bus-checks')return busPicker(c);
 if(!p[1])return frame('Checks',(manager(c.me)?criticalStats(c):'')+`<div class="tap-grid jobs checks-hub">${tile('bus-checks','Bus inspections','Choose a bus')}${tile('checklists','Garage checklists','Complete workshop checks','',checklistIcon)}</div>`);
 const v=c.state.vehicles.find(v=>v.id===p[1]&&v.garage===c.garage);if(!v)return unavailable();
 return p[2]==='history'?records(c,v):busCheck(c,v);
}
export function setupChecks(h){host=h;
 document.addEventListener('click',e=>{const el=e.target.closest('[data-checks-page]'),c=host.context();if(!el||!isChecksRoute(c.page))return;listFor(c).page+=Number(el.dataset.checksPage);host.render();});
 document.addEventListener('input',e=>{if(e.target.id!=='checks-search')return;const l=listFor(host.context()),pos=e.target.selectionStart;l.query=e.target.value;l.page=0;host.render();const input=document.querySelector('#checks-search');input.focus();try{input.setSelectionRange(pos,pos);}catch{}});
}
