import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/model.js';
import {startInspection,saveAnswer,submitInspection,taskReadings} from '../src/inspections.js';
import {editTemplate,templateFor,tasksFor} from '../src/templates.js';
import {editVehicle,manageInspection} from '../src/inspection-admin.js';
import {addInterval,saveSchedule,scheduleStatus,today} from '../src/scheduling.js';
import {adminToolsView} from '../src/admin-tools.js';
import {tabletView} from '../src/tablet.js';
import {fleetFlowView} from '../src/fleet-flow.js';
const garage='demo-north',worker='Verified Admin',why='Correct the original entry';
const newInspection=s=>startInspection(s,'DEMO-271',garage,worker);
const manage=(s,i,operation,extra={})=>manageInspection(s,garage,i.id,{operation,reason:why,...extra},worker);

test('renaming bus keeps linked records, schedules and audit history; rejects duplicates and other garages',()=>{
 const s=seed(),i=newInspection(s);saveAnswer(s,i.id,garage,'1-2',{result:'Defect',worker,notes:'Damaged',readings:[]});
 saveSchedule(s,garage,{vehicle:'DEMO-271',interval:1,unit:'months',firstDue:'2026-10-31'},worker);
 editVehicle(s,garage,'DEMO-271',{id:'DEMO-999',name:'Training bus',model:'SG271+',registration:'TEST'},worker);
 for(const key of ['inspections','faults','actions','schedules'])assert.ok(s[key].some(r=>r.vehicle==='DEMO-999'&&r.garage===garage));
 assert.equal(s.vehicles.find(v=>v.id==='DEMO-999').audit[0].previous.id,'DEMO-271');
 assert.throws(()=>editVehicle(s,garage,'DEMO-999',{id:'DEMO-302',model:'Bus'},worker));
 assert.throws(()=>editVehicle(s,'demo-south','DEMO-999',{id:'DEMO-888',model:'Bus'},worker));
});
test('new inspections snapshot edited questions, ordering and source; existing inspections keep their questions',()=>{
 const s=seed(),old=newInspection(s),original=tasksFor(old).find(t=>t.id==='1-2').text;
 editTemplate(s,{operation:'question',id:'1-2',section:'Brake Test',question:'Check test result',instruction:'Review the recorded brake results.',page:1,conditional:false},worker);
 assert.equal(tasksFor(old).find(t=>t.id==='1-2').text,original);
 old.status='Awaiting review';const next=newInspection(s);
 assert.equal(tasksFor(next).find(t=>t.id==='1-2').question,'Check test result');
 assert.equal(next.templateSnapshot.version,2);
 editTemplate(s,{operation:'delete_question',id:'1-2'},worker);
 saveAnswer(s,next.id,garage,'1-2',{result:'OK',worker,notes:'',readings:[]});
 assert.ok(next.answers['1-2']);
 assert.throws(()=>editTemplate(s,{operation:'delete_question',id:'2-6'},worker));
 assert.throws(()=>editTemplate(s,{operation:'delete_section',section:'Engine and Transmission'},worker));
 assert.throws(()=>editTemplate(s,{operation:'question',id:'2-6',section:'Engine and Transmission',question:'Bypass',instruction:'Bypass',page:2},worker));
});
test('template section rename/reorder and adding a new section reach the tablet without changing old snapshots',()=>{
 const s=seed();editTemplate(s,{operation:'section',section:'Brake Test',name:'Brake inspection'},worker);
 editTemplate(s,{operation:'move_section',section:'Brake inspection',direction:1},worker);
 editTemplate(s,{operation:'question',section:'Final checks',question:'Confirm workshop clean',instruction:'Leave the work area tidy.',page:1},worker);
 const i=newInspection(s),tasks=tasksFor(i).filter(t=>!t.blocked),n=tasks.findIndex(t=>t.section==='Final checks');
 const html=tabletView({state:s,garage,me:{role:'garage_manager'},page:`inspection/${i.id}/item/${n}`});
 assert.match(html,/Confirm workshop clean/);assert.match(html,/Manage inspection/);
 assert.equal(tasksFor(i)[0].section,'Engine and Transmission');assert.equal(taskReadings(tasksFor(i).find(t=>t.id==='1-1'))[0][3],14);
});
test('amend/delete/restore preserve evidence, keep faults open and do not complete an unsafe check',()=>{
 const s=seed(),i=newInspection(s);saveAnswer(s,i.id,garage,'1-2',{result:'Defect',worker,notes:'Damaged',readings:[]});
 for(const t of tasksFor(i).filter(t=>!t.blocked&&t.id!=='1-2'))saveAnswer(s,i.id,garage,t.id,{result:'Not completed',worker,notes:'Pending work',readings:[]});
 submitInspection(s,i.id,garage,'Original notes');const count=s.actions.length;
 assert.throws(()=>manage(s,i,'complete',{date:today()}),/blocked/);
 manage(s,i,'amend');assert.equal(i.status,'In progress');assert.equal(i.audit.find(a=>a.action==='Reopen for amendment').previous.answers['1-2'].result,'Defect');
 submitInspection(s,i.id,garage,'Corrected notes');assert.equal(s.actions.length,count);
 manage(s,i,'delete');assert.equal(i.status,'Deleted');assert.throws(()=>saveAnswer(s,i.id,garage,'1-2',{result:'OK',worker}));assert.equal(s.faults[0].status,'Open');
 const c={state:s,garage,me:{role:'garage_manager'},page:'history/DEMO-271/checks'};assert.doesNotMatch(fleetFlowView(c),new RegExp(i.id));
 c.page='manage';assert.match(adminToolsView(c),/Deleted inspections/);
 manage(s,i,'restore');assert.equal(i.status,'Awaiting review');assert.ok(!i.deletedAt);
});
test('schedule dates clamp calendar months and handle leap years, due boundaries and status changes',()=>{
 assert.equal(addInterval('2026-01-31',1,'months'),'2026-02-28');assert.equal(addInterval('2028-01-31',1,'months'),'2028-02-29');
 assert.equal(addInterval('2026-10-15',4,'weeks'),'2026-11-12');assert.throws(()=>addInterval('2026-02-30',1,'months'));
 const s=seed();saveSchedule(s,garage,{vehicle:'DEMO-271',interval:1,unit:'months',lastDate:'2026-01-31',reference:'Workshop register'},worker);
 assert.equal(scheduleStatus(s,garage,'DEMO-271','2026-02-21').status,'Due soon');
 assert.equal(scheduleStatus(s,garage,'DEMO-271','2026-02-28').status,'Due today');
 assert.equal(scheduleStatus(s,garage,'DEMO-271','2026-03-01').status,'Overdue');
 const i=newInspection(s);i.status='Awaiting review';i.submitted='2026-02-27T12:00:00Z';assert.equal(scheduleStatus(s,garage,i.vehicle).due,'2026-02-28');
 i.status='Completed';i.completedDate='2026-02-27';assert.equal(scheduleStatus(s,garage,i.vehicle).due,'2026-03-27');
 manage(s,i,'delete');assert.equal(scheduleStatus(s,garage,i.vehicle).due,'2026-02-28');manage(s,i,'restore');assert.equal(scheduleStatus(s,garage,i.vehicle).due,'2026-03-27');
 manage(s,i,'amend');assert.equal(scheduleStatus(s,garage,i.vehicle).due,'2026-02-28');
 assert.throws(()=>saveSchedule(s,garage,{vehicle:'DEMO-315',interval:1,unit:'months',firstDue:'2026-01-01'},worker));
 assert.throws(()=>saveSchedule(s,garage,{vehicle:'DEMO-271',interval:1,unit:'months',lastDate:'2026-01-01'},worker),/reference/);
});
test('admin routes escape content, expose all requested controls and deny mechanics',()=>{
 const s=seed(),i=newInspection(s),c={state:s,garage,me:{role:'garage_manager'},page:'manage'};
 for(const page of ['manage','bus-edit/DEMO-271','inspection-admin/'+i.id,'template-admin','template-admin/question/1-1','template-admin/question/new','schedules','schedules/DEMO-271']){c.page=page;assert.ok(adminToolsView(c).length>300);}
 s.vehicles[0].name='<script>alert(1)</script>';c.page='bus-edit/DEMO-271';assert.match(adminToolsView(c),/&lt;script&gt;/);assert.doesNotMatch(adminToolsView(c),/<script>/);
 c.me.role='mechanic';assert.match(adminToolsView(c),/Administrator access required/);
});
