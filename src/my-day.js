import {esc} from './api.js';
import {today} from './scheduling.js';
import {displayDate} from './display.js';
import {garageJobs,jobOpen,dayShift} from './garage-operations.js';
import {myActions} from './action-assignment.js';
import {applies,acknowledgement} from './active-controls.js';
import {isMyInspection} from './checks-flow.js';

const paths={instruction:'M4 4h6l2 2 2-2h6v16h-6l-2 2-2-2H4zM12 6v16',action:'M14 6a5 5 0 0 0-6 6L3 17l4 4 5-5a5 5 0 0 0 6-6l-4 4-4-4z'};
const icon=kind=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[kind]}"/></svg>`;
const overdue=x=>x.reviewDate&&x.reviewDate<today();
const section=(title,body)=>body?`<section class="my-day-section"><h2>${title}</h2><div class="my-day-list">${body}</div></section>`:'';
const dateOrder=(a,b)=>a.date.localeCompare(b.date)||(a.time||'99').localeCompare(b.time||'99');
const jobOrder=(a,b)=>(a.status==='In progress'?0:1)-(b.status==='In progress'?0:1)||dateOrder(a,b);

export function myDayWork(c){
 const {state,garage,me}=c,date=today(),allJobs=garageJobs(state,garage);
 const jobs=allJobs.filter(j=>j.assigneeId===me.id&&['Assigned','In progress','Waiting'].includes(j.status)&&j.date<=date).sort(jobOrder);
 const actions=myActions(state,garage,me).filter(a=>a.status==='Open');
 const inspections=(state.inspections||[]).filter(i=>i.garage===garage&&!i.deletedAt&&i.status==='In progress'&&isMyInspection(i,me)&&!allJobs.some(j=>j.inspectionId===i.id&&jobOpen(j)));
 const workBuses=new Set([...jobs,...actions,...inspections].map(x=>x.vehicle).filter(Boolean));
 const buses=state.vehicles.filter(b=>b.garage===garage);
 const instructions=(c.content?.sops||[]).filter(x=>(overdue(x)||!acknowledgement(state,garage,me.id,x))&&buses.some(b=>applies(x,b)&&(x.target==='all'||workBuses.has(b.id))));
 return {jobs,actions,inspections,instructions};
}

function personalJob(c,j,instructions=[],record=false){
 const bus=c.state.vehicles.find(b=>b.garage===c.garage&&b.id===j.vehicle),blocked=instructions.some(x=>bus&&applies(x,bus));
 const meta=[record?displayDate(j.date):j.date<today()?'Carried over · '+displayDate(j.date):'',j.time||'',j.priority&&j.priority!=='Normal'?j.priority:''].filter(Boolean);
 const status=j.status==='Waiting'?j.waitingReason||'Waiting':j.status;
 return `<button type="button" class="my-day-card my-day-job" data-go="my-jobs/${esc(j.id)}"><span class="my-day-card-top"><strong>${esc(j.vehicle)}</strong><span class="ops-badge ${j.status==='In progress'?'working':j.status==='Waiting'?'waiting':j.status==='Completed'?'done':''}">${esc(status)}</span></span><span class="my-day-title">${esc(j.title)}</span>${meta.length?`<span class="my-day-meta">${esc(meta.join(' · '))}</span>`:''}<span class="my-day-next ${blocked?'my-day-blocked':''}">${record?'View job':blocked?'Read required instructions first':j.status==='In progress'?'Continue job':'Open job'} <span aria-hidden="true">→</span></span></button>`;
}

export function myDayView(c){
 const active=dayShift(c.state,c.garage,c.me.id),{jobs,actions,inspections,instructions}=myDayWork(c);
 const briefing=(c.state.briefings||[]).find(b=>b.garage===c.garage&&b.date===today());
 const before=(briefing?`<article class="my-day-briefing"><h3>Garage briefing</h3><p>${esc(briefing.note)}</p></article>`:'')+instructions.map(x=>`<button type="button" class="my-day-card my-day-instruction" data-go="required-instructions/${esc(x.id)}?return=my-jobs">${icon('instruction')}<span><strong>${esc(x.title)}</strong><span class="my-day-next">${overdue(x)?'Review overdue · contact your manager':'Read & acknowledge'} <span aria-hidden="true">→</span></span></span></button>`).join('');
 const jobCards=jobs.map(j=>personalJob(c,j,instructions)).join('');
 const inspectionCards=inspections.map(i=>`<button type="button" class="my-day-card my-day-job" data-go="inspection/${esc(i.id)}"><span class="my-day-card-top"><strong>${esc(i.vehicle)}</strong><span class="ops-badge working">In progress</span></span><span class="my-day-title">Bus inspection</span><span class="my-day-next">Continue inspection <span aria-hidden="true">→</span></span></button>`).join('');
 const actionCards=actions.map(a=>`<button type="button" class="my-day-card my-day-action" data-go="actions/${esc(a.id)}">${icon('action')}<span>${a.vehicle?`<span class="my-day-meta">${esc(a.vehicle)}</span>`:''}<strong>${esc(a.title)}</strong><span class="my-day-next">${a.returnNotes?'Returned · update action':'Update action'} <span aria-hidden="true">→</span></span></span></button>`).join('');
 const noWork=!jobs.length&&!actions.length&&!inspections.length&&!instructions.length;
 return `<section class="ops-page my-day"><h1>My day</h1><button type="button" class="my-day-toggle ${active?'secondary':''}" data-operation="${active?'end_day':'shift_start'}">${active?'End day':'Start day'}</button>${section('Before you start',before)}${section('Assigned jobs',jobCards)}${section('Continue inspections',inspectionCards)}${section('Assigned actions',actionCards)}${noWork?'<p class="my-day-empty">Nothing assigned right now. New work will appear here.</p>':''}</section>`;
}

export function myJobRecordsView(c){
 const jobs=garageJobs(c.state,c.garage).filter(j=>j.assigneeId===c.me.id),date=today();
 const groups=[['Current jobs',j=>['Assigned','In progress','Waiting'].includes(j.status)&&j.date<=date],['Upcoming jobs',j=>jobOpen(j)&&j.date>date],['Awaiting sign-off',j=>j.status==='Awaiting sign-off'&&j.date<=date],['Completed jobs',j=>j.status==='Completed'],['Cancelled jobs',j=>j.status==='Cancelled']];
 return `<section class="ops-page my-day"><h1>My job records</h1>${groups.map(([title,match])=>section(title,jobs.filter(match).sort((a,b)=>title==='Current jobs'?jobOrder(a,b):title==='Upcoming jobs'?dateOrder(a,b):b.date.localeCompare(a.date)).map(j=>personalJob(c,j,[],true)).join(''))).join('')}${jobs.length?'':'<p class="my-day-empty">No job records yet.</p>'}<div class="toolbar"><button type="button" class="secondary" data-go="my-jobs">Back to my day</button></div></section>`;
}
