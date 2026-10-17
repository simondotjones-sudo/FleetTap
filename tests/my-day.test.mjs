import test from 'node:test';
import assert from 'node:assert/strict';
import {today} from '../src/scheduling.js';
import {myDayWork,myDayView,myJobRecordsView} from '../src/my-day.js';
import {menuView} from '../src/navigation.js';
import {operationsView} from '../src/garage-operations-ui.js';
import {acknowledgeControl,requireControls} from '../src/active-controls.js';
const date=today(),garage='north',me={id:'mechanic',name:'Alex',email:'alex@example.com',role:'mechanic'};
const job=(id,extra={})=>({id,garage,assigneeId:me.id,assigneeName:me.name,vehicle:'BUS-1',title:id,date,time:'',priority:'Normal',status:'Assigned',...extra});
const action=(id,extra={})=>({id,garage,assignedTo:me.id,vehicle:'BUS-1',title:id,status:'Open',...extra});
const control=(id,extra={})=>({id,title:id,status:'Published',required:true,target:'fleet',targetFleets:['BUS-1'],version:2,...extra});
const fixture=()=>({garage,me,page:'my-jobs',state:{vehicles:[{id:'BUS-1',garage},{id:'BUS-2',garage},{id:'BUS-3',garage:'south'}],jobs:[],actions:[],inspections:[],instructionAcks:[]},content:{sops:[]}});

test('my day shows only actionable personal work; pending review, future and completed jobs remain in records',()=>{
 const c=fixture();c.state.jobs=[job('current'),job('progress',{status:'In progress'}),job('waiting',{status:'Waiting'}),job('future',{date:'2099-01-01'}),job('review',{status:'Awaiting sign-off'}),job('completed',{status:'Completed'}),job('cancelled',{status:'Cancelled'}),job('other-person',{assigneeId:'someone'}),job('other-garage',{garage:'south'})];
 c.state.actions=[action('my-action'),action('closed-action',{status:'Closed'}),action('review-action',{status:'Awaiting review'}),action('deleted-action',{deletedAt:'now'}),action('foreign-action',{garage:'south'}),action('namesake-action',{assignedTo:'someone',owner:me.name})];
 const work=myDayWork(c);assert.deepEqual(work.jobs.map(j=>j.id),['progress','current','waiting']);assert.deepEqual(work.actions.map(a=>a.id),['my-action']);
 const html=myDayView(c);assert.doesNotMatch(html,/future|completed|cancelled|closed-action|review-action|other-person|namesake-action|Time flexible|Normal|Demo|Refresh|ops-day/);assert.ok(html.indexOf('Assigned jobs')<html.indexOf('Assigned actions'));assert.doesNotMatch(html,/My bus inspections|Completed jobs/);
 const records=myJobRecordsView(c);for(const id of ['current','future','review','completed','cancelled'])assert.ok(records.includes('my-jobs/'+id));assert.doesNotMatch(records,/other-person|other-garage/);
 assert.equal(operationsView({...c,page:'my-jobs/records'}),records);
 assert.match(menuView(me,'my-jobs/records'),/data-go="my-jobs\/records" aria-current="page"/);assert.doesNotMatch(menuView(me,'my-jobs/records'),/data-go="my-jobs" aria-current="page"/);
});

test('required instructions precede jobs, respect bus scope and only disappear after current-version acknowledgement',()=>{
 const c=fixture();c.state.jobs=[job('current')];c.content.sops=[control('read-me'),control('other-bus',{targetFleets:['BUS-2']}),control('foreign',{targetFleets:['BUS-3']}),control('draft',{status:'Draft'}),control('optional',{required:false}),control('fleet-wide',{target:'all'})];
 assert.deepEqual(myDayWork(c).instructions.map(x=>x.id),['read-me','fleet-wide']);
 let html=myDayView(c);assert.ok(html.indexOf('Before you start')<html.indexOf('Assigned jobs'));assert.match(html,/required-instructions\/read-me\?return=my-jobs/);assert.match(html,/Read required instructions first/);
 c.state.instructionAcks.push({garage,userId:me.id,instructionId:'read-me',version:1},{garage,userId:'someone',instructionId:'read-me',version:2});assert.ok(myDayWork(c).instructions.some(x=>x.id==='read-me'));
 assert.throws(()=>requireControls(c.state,garage,me,c.content,'BUS-1'),/Work blocked/);
 for(const instructionId of ['read-me','fleet-wide'])acknowledgeControl(c.state,garage,me,c.content,{instructionId,version:2,understood:'yes'});
 assert.deepEqual(myDayWork(c).instructions,[]);requireControls(c.state,garage,me,c.content,'BUS-1');html=myDayView(c);assert.doesNotMatch(html,/Before you start|read-me|Read required instructions first/);assert.match(html,/Open job/);
 c.content.sops[0].reviewDate='2020-01-01';html=myDayView(c);assert.match(html,/Review overdue · contact your manager/);assert.throws(()=>requireControls(c.state,garage,me,c.content,'BUS-1'),/Work blocked/);
});

test('instructions apply to actions and ongoing inspections without duplicating inspections already attached to a job',()=>{
 const c=fixture();const own='Alex (alex@example.com)';
 c.state.inspections=[{id:'unplanned',garage,vehicle:'BUS-2',status:'In progress',craftworker:own},{id:'linked',garage,vehicle:'BUS-1',status:'In progress',craftworker:own},{id:'someone-else',garage,vehicle:'BUS-2',status:'In progress',craftworker:'Alex (other@example.com)'}];
 c.state.jobs=[job('planned',{inspectionId:'linked'})];c.content.sops=[control('bus-two',{targetFleets:['BUS-2']})];
 let work=myDayWork(c);assert.deepEqual(work.inspections.map(i=>i.id),['unplanned']);assert.deepEqual(work.instructions.map(x=>x.id),['bus-two']);
 c.state.inspections=[];c.state.jobs=[];c.state.actions=[action('repair',{vehicle:'BUS-2'})];assert.equal(myDayWork(c).instructions.length,1);
});

test('day toggle stays compact and empty lists do not produce empty panels',()=>{
 const c=fixture();let html=myDayView(c);assert.match(html,/data-operation="shift_start">Start day/);assert.match(html,/Nothing assigned right now/);assert.doesNotMatch(html,/Assigned jobs|Assigned actions|Before you start|Completed jobs|Required instructions|Refresh|Alex/);
 c.state.shifts=[{garage,userId:me.id,date,startedAt:new Date().toISOString(),endedAt:null}];html=myDayView(c);assert.match(html,/data-operation="end_day">End day/);assert.doesNotMatch(html,/Day started|\d{4}-\d{2}-\d{2}|Start day/);
 c.state.briefings=[{garage,date,note:'Wear <eye protection>'}];html=myDayView(c);assert.match(html,/Wear &lt;eye protection&gt;/);assert.match(html,/Garage briefing/);
 c.state.jobs=[job('unsafe',{title:'<script>bad</script>',vehicle:'<BUS>'})];c.state.actions=[action('action',{title:'<img onerror=bad>'})];html=myDayView(c);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script>|<img/);
});
