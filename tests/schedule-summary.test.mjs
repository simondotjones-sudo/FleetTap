import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleRows,scheduleSummary,schedulesView,setupScheduleUI} from '../src/schedule-ui.js';

test('four schedule totals partition every bus, with active PM3 inspections taking priority',()=>{
 const garage='north',state={vehicles:[],inspections:[],schedules:[]};
 const cases=[['Overdue','2026-10-14'],['Due today','2026-10-15'],['Due soon','2026-10-22'],['Upcoming','2026-12-01'],['Not scheduled',''],['Paused','']];
 for(const [index,[status,due]] of cases.entries())for(const active of [false,true]){
  const id=`BUS-${index}-${active}`;
  state.vehicles.push({id,garage,due});
  if(status==='Paused')state.schedules.push({vehicle:id,garage,templateId:'pm3',enabled:false});
  if(active)for(let n=0;n<2;n++)state.inspections.push({id:`${id}-${n}`,garage,vehicle:id,templateId:'pm3',status:'In progress'});
  else state.inspections.push(
   {garage:'south',vehicle:id,templateId:'pm3',status:'In progress'},
   {garage,vehicle:id,templateId:'pm3',status:'In progress',deletedAt:'2026-10-14'},
   {garage,vehicle:id,templateId:'other',status:'In progress'},
   {garage,vehicle:id,templateId:'pm3',status:'Awaiting review'},
   {garage,vehicle:id,templateId:'pm3',status:'Completed'}
  );
 }
 state.vehicles.push({id:'BUS-0-false',garage:'south',due:'2026-10-14'});
 state.inspections.push({garage,vehicle:'REMOVED-BUS',templateId:'pm3',status:'In progress'});
 const original=JSON.stringify(state),rows=scheduleRows({state,garage},'2026-10-15'),totals=scheduleSummary(rows);
 assert.equal(rows.length,12);
 assert.deepEqual(totals,{'Overdue':1,'Scheduled':3,'Not scheduled':2,'In progress':6});
 assert.equal(Object.values(totals).reduce((sum,n)=>sum+n,0),rows.length);
 for(const [index,[status,due]] of cases.entries())for(const active of [false,true]){
  const row=rows.find(r=>r.v.id===`BUS-${index}-${active}`);
  assert.equal(row.status,status);
  assert.equal(row.due,due);
  assert.equal(row.inProgress,active);
 }
 assert.equal(JSON.stringify(state),original);
 assert.deepEqual(scheduleSummary(scheduleRows({state,garage:'empty'},'2026-10-15')),{'Overdue':0,'Scheduled':0,'Not scheduled':0,'In progress':0});
});

test('In progress filter retains overdue context and leaves fleet totals independent of filters',()=>{
 const garage='schedule-summary-filter',state={
  vehicles:[{id:'ACTIVE',garage,due:'2020-01-01'},{id:'IDLE',garage,due:'2020-01-01'},{id:'FUTURE',garage,due:'2099-01-01'},{id:'PRIVATE',garage:'south'}],
  inspections:[{garage,vehicle:'ACTIVE',template:'TO-PMS 035 legacy',status:'In progress'}]
 };
 const c={garage,state,page:'schedules',me:{role:'garage_manager'}},listeners={};let html=schedulesView(c);
 globalThis.document={addEventListener:(type,fn)=>listeners[type]=fn,querySelector:()=>({focus(){}})};
 try{
  setupScheduleUI({context:()=>c,render:()=>{html=schedulesView(c);}},()=>false);
  const summary=()=>html.match(/<div class="schedule-summary">(.*?)<\/div>\s*\n/s)[0];
  const before=summary();
  listeners.change({target:{dataset:{scheduleFilter:'status'},value:'In progress'}});
  assert.match(html,/1–1 of 1 buses/);
  assert.match(html,/>ACTIVE</);
  assert.doesNotMatch(html,/>IDLE<|>FUTURE<|PRIVATE/);
  assert.match(html,/<td><span class="pill status-neutral">In progress<\/span><small><span class="pill critical">Overdue/);
  assert.equal(summary(),before);
  listeners.change({target:{dataset:{scheduleFilter:'status'},value:'Overdue'}});
  assert.match(html,/>IDLE</);
  assert.doesNotMatch(html,/>ACTIVE</);
  assert.equal(summary(),before);
 }finally{delete globalThis.document;}
});
