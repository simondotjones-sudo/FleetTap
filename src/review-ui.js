import {isCriticalFault,criticalCheckBlocked} from './critical-safety.js';
import {criticalFaultBadge,criticalFaultNotice,criticalRepairFields,criticalCheckBadge} from './critical-safety-ui.js';
import {backRoute} from './navigation.js';
import {esc} from './api.js';
import {reviewer,manager} from './roles.js';
import {tasksFor} from './templates.js';
import {photoGallery} from './photos.js';
import {today} from './scheduling.js';
const go=(p,t)=>`<button type="button" class="tap-small" data-go="${esc(p)}">${esc(t)}</button>`;
const frame=(title,body)=>`<section class="admin-tools"><h1>${esc(title)}</h1>${body}${backRoute('reviews')}</section>`;
const kinds=['actions','faults','reports','inspections','checklistRuns','jobs'];
const labels={actions:'Actions',faults:'Faults',reports:'Reports',inspections:'Inspections',checklistRuns:'Checklists',jobs:'Jobs'};
const rows=(c,k)=>(c.state[k]||[]).filter(r=>r.garage===c.garage&&!r.deletedAt);
const open=r=>!['Closed','Completed','Cancelled'].includes(r.status);
export function reviewReady(c,k,r){
 if(k==='jobs')return r.status==='Awaiting sign-off';
 if(['faults','reports'].includes(k))return open(r)&&!rows(c,'actions').some(a=>a.source===r.id&&a.status!=='Closed');
 if(['inspections','checklistRuns'].includes(k)&&criticalCheckBlocked(c.state,r))return false;
 return r.status==='Awaiting review';
}
const reviewLink=(c,k,r)=>k==='jobs'?(manager(c.me)?'garage-today/':'my-jobs/')+r.id:'reviews/'+k+'/'+r.id;
function nextWork(c,vehicle,exclude){return kinds.flatMap(k=>rows(c,k).filter(r=>r.vehicle===vehicle&&r.id!==exclude&&reviewReady(c,k,r)).map(r=>({k,r})));}
const form=(kind,id,label,extra='')=>`<form class="card" data-review-form data-kind="${kind}" data-id="${esc(id)}"><h2>${label}</h2><label>${kind.endsWith('_return')?'Work still required':'Review notes'}<textarea name="notes" required minlength="5" maxlength="4000"></textarea></label>${extra}<p class="form-error" role="alert"></p><button>${label}</button></form>`;
export function reviewView(c){
 if(!reviewer(c.me))return frame('Supervisor access required','');
 const [,kind,id]=c.page.split('/');
 if(!kind)return frame('Review & sign off',`<div class="manager-hub-grid">${kinds.map(k=>{const all=rows(c,k).filter(open),ready=all.filter(r=>reviewReady(c,k,r));return `<button class="tap-tile" type="button" data-go="reviews/${k}"><strong>${labels[k]}</strong><small>${ready.length} ready for review${all.length>ready.length?' · '+(all.length-ready.length)+' still in progress':''}</small></button>`;}).join('')}</div>`);
 if(!kinds.includes(kind))return frame('Record unavailable','');
 const records=rows(c,kind);
 if(!id){const ready=records.filter(r=>reviewReady(c,kind,r)),waiting=records.filter(r=>open(r)&&!reviewReady(c,kind,r));const card=r=>`<article class="card"><h2>${esc(r.title||r.template?.title||r.vehicle)}</h2>${criticalFaultBadge(c.state,r)}${['inspections','checklistRuns'].includes(kind)?criticalCheckBadge(c.state,r):''}<p>${esc(r.vehicle||'Garage')} · ${esc(r.status)}</p>${go(reviewLink(c,kind,r),reviewReady(c,kind,r)?'Review':'View outstanding work')}</article>`;return frame(labels[kind],`<h2>Ready for review (${ready.length})</h2>${ready.map(card).join('')||'<p>Nothing ready for review.</p>'}${waiting.length?`<details class="card"><summary>Still in progress (${waiting.length})</summary>${waiting.map(card).join('')}</details>`:''}`);}
 const r=records.find(r=>r.id===id);if(!r)return frame('Record unavailable','');
 if(kind==='jobs')return frame(r.title,go(reviewLink(c,kind,r),'Open job for sign-off'));
 const inspection=kind==='inspections',checklist=kind==='checklistRuns',blocked=inspection&&tasksFor(r).some(t=>t.blocked||!r.answers[t.id]||r.answers[t.id].result==='Not completed'),unfinished=checklist&&Object.values(r.answers).some(a=>a.result==='Not completed');
 const links=['faults','reports'].includes(kind)?rows(c,'actions').filter(a=>a.source===id):[];
 const source=kind==='actions'?[...rows(c,'faults'),...rows(c,'reports')].find(x=>x.id===r.source):null;
 const sourceKind=source&&rows(c,'faults').some(x=>x.id===source.id)?'faults':'reports';
 const safetyBlocked=(inspection||checklist)&&criticalCheckBlocked(c.state,r),canClose=reviewReady(c,kind,r)&&!blocked&&!unfinished&&!safetyBlocked,next=nextWork(c,r.vehicle,r.id);
 return frame(r.title||r.template?.title||r.vehicle,`<article class="card">${criticalFaultBadge(c.state,r)}${['inspections','checklistRuns'].includes(kind)?criticalCheckBadge(c.state,r):''}<p>${esc(r.vehicle||'Garage')} · ${esc(r.status)}</p>${criticalFaultNotice(c.state,source||r)}${source?`<h2>Original issue</h2><p class="record-note">${esc(source.description)}</p>${photoGallery(source.photos,c.garage)}${go('records/'+sourceKind+'/'+source.id,'Open original '+sourceKind.slice(0,-1))}`:''}${[r.description,r.evidence,r.notes,r.closureNotes,r.reviewNotes].filter(Boolean).map(p=>`<p class="record-note">${esc(p)}</p>`).join('')}${photoGallery(r.photos,c.garage)}${inspection?go('inspection-record/'+r.id,'View inspection answers'):''}${checklist?go('checklists/run/'+r.id,'View checklist answers'):''}${links.map(a=>`<p>${go('reviews/actions/'+a.id,a.title+' · '+a.status)}</p>`).join('')}${r.closedBy||r.completedBy?`<p>Signed by ${esc(r.closedBy||r.completedBy)}</p>`:''}</article>${safetyBlocked?'<p class="safety-notice">Repair and verify the linked Critical Safety Faults before sign-off.</p>':''}${blocked||unfinished?'<p class="notice">Unfinished tasks or technical instruction conflicts prevent sign-off.</p>':''}${links.some(a=>a.status!=='Closed')?'<p class="notice">Close the linked actions before closing this record.</p>':''}${canClose?form(kind,r.id,inspection||checklist?'Confirm sign-off':'Confirm closure',kind==='faults'&&isCriticalFault(c.state,r)?criticalRepairFields():inspection?`<label>Completed on<input type="date" name="date" required min="${r.created.slice(0,10)}" max="${today()}" value="${today()}"></label>`:''):''}${['actions','inspections','checklistRuns'].includes(kind)&&r.status==='Awaiting review'?`<details class="card"><summary>Return for more work</summary>${form(kind==='actions'?'action_return':inspection?'inspection_return':'checklist_return',r.id,'Return for more work')}</details>`:''}${!open(r)?`<section class="card"><h2>Next step</h2>${next.length?next.map(({k,r:x})=>go(reviewLink(c,k,x),labels[k]+' · '+(x.title||x.vehicle))).join(''):r.vehicle?go('bus-release/'+encodeURIComponent(r.vehicle),'Check release requirements'):'<p>No further reviews for this record.</p>'}</section>`:''}`);
}
export function setupReviews(host){let busy=false;document.addEventListener('submit',async e=>{const f=e.target;if(!f.hasAttribute('data-review-form'))return;e.preventDefault();if(busy)return;busy=true;const b=f.querySelector('button[type=submit],button:not([type])'),v=Object.fromEntries(new FormData(f)),kind=f.dataset.kind;b.disabled=true;try{const returning=kind.endsWith('_return');await host.mutation(returning?kind:kind==='inspections'?'inspection_manage':kind==='checklistRuns'?'checklist_signoff':'close_record',kind==='inspections'?{operation:'complete',reason:v.notes,date:v.date}:v,{kind,id:f.dataset.id});const target=kind==='action_return'?'actions':kind==='inspection_return'?'inspections':kind==='checklist_return'?'checklistRuns':kind;host.go('reviews/'+target+(returning?'':'/'+f.dataset.id));host.notify(returning?'Returned for more work.':'Review saved.');}catch(err){f.querySelector('.form-error').textContent=err.message;if(err.status===409)await host.reload();}finally{busy=false;b.disabled=false;}});}
