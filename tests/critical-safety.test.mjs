import test from 'node:test';
import assert from 'node:assert/strict';
import {pm3} from '../src/pm3.js';
import {seed,submitAction} from '../src/model.js';
import {startInspection,saveAnswer} from '../src/inspections.js';
import {editTemplate,templateFor} from '../src/templates.js';
import {saveContent,checklistCommand} from '../src/content-model.js';
import {closeRecord} from '../src/reviews.js';
import {manageInspection} from '../src/inspection-admin.js';
import {releaseAssessment,releaseCommand} from '../src/bus-release.js';
import {criticalTask,isCriticalFault,criticalSummary,criticalCheckBlocked,safetyResolved} from '../src/critical-safety.js';
import {faultCSV,garageExport,managerRecordsView} from '../src/manager-records.js';
import {performanceReport} from '../src/performance-model.js';
import {reportCSV} from '../src/performance-ui.js';
import {reviewView,reviewReady} from '../src/review-ui.js';
import {fleetFlowView} from '../src/fleet-flow.js';
import {checksFlowView} from '../src/checks-flow.js';
import {today,addInterval} from '../src/scheduling.js';
const g='demo-north',worker='Mechanic',supervisor={id:'sup',name:'Supervisor',role:'supervisor'},repair={notes:'Repair checked and approved',repairEvidence:'Replaced failed component',recheckEvidence:'Functional test passed with readings in tolerance',safetyVerified:'yes'};
function fixture(){const s=seed();s.faults=[];s.actions=[];s.inspectionTemplate={id:'pm3',version:1,title:'Synthetic safety validation',tasks:[{id:'1-2',section:'Brake Test',number:'2',page:1,text:'Check brake performance',criticalSafety:true,fields:[]}]};const i=startInspection(s,'DEMO-271',g,worker);return {s,i};}
function fail(s,i){saveAnswer(s,i.id,g,'1-2',{result:'Defect',notes:'Brake performance failed',readings:[],worker});return s.faults[0];}
function closeActions(s,f){for(const a of s.actions.filter(a=>a.source===f.id)){submitAction(s,a.id,'Component repaired and tested','work',worker);closeRecord(s,g,'actions',a.id,{notes:'Work evidence reviewed'},'Supervisor');}}
function makeOtherwiseReady(s,i){i.status='Completed';i.completedBy='Supervisor';i.completedDate=today();s.vehicles.find(b=>b.id===i.vehicle).due=addInterval(today(),7,'days');s.vehicles.find(b=>b.id===i.vehicle).roadDocuments={cvrt:{expires:addInterval(today(),30,'days'),reference:'CVRT'},tax:{expires:addInterval(today(),30,'days'),reference:'Tax'}};}
test('pilot flags cover recommended systems and exclude routine service labels and blocked regeneration',()=>{
 assert.equal(pm3.filter(criticalTask).length,79);
 for(const id of ['1-2','1-3','3-4','4-8','5-7','6-1','7-3','7-4','8-4','9-2','10-8','11-1.7','12-2.3','15-5.3','16-3','17-1'])assert.equal(criticalTask(pm3.find(t=>t.id===id)),true,id);
 for(const id of ['2-1','2-6','8-8','10-5','11-1.6','16-8'])assert.equal(criticalTask(pm3.find(t=>t.id===id)),false,id);
 assert.equal(pm3.find(t=>t.id==='2-6').blocked,true);
});
test('critical fault classification is server-derived, idempotent and frozen across template edits',()=>{
 const {s,i}=fixture(),f=fail(s,i);assert.equal(f.criticalSafety,true);assert.equal(f.safetySource.item,'1-2');fail(s,i);assert.equal(s.faults.length,1);
 editTemplate(s,{operation:'question',id:'1-2',section:'Brake Test',question:'Amended',instruction:'Amended full instruction',page:1,criticalSafety:false},'Org admin');
 assert.equal(templateFor(s).tasks[0].criticalSafety,false);assert.equal(i.templateSnapshot.tasks[0].criticalSafety,true);assert.equal(isCriticalFault(s,f),true);
 assert.throws(()=>saveAnswer(s,i.id,g,'1-2',{result:'OK',notes:'Override',worker,readings:[]}),/linked defect/);
 assert.throws(()=>editTemplate(s,{operation:'question',id:'1-2',section:'Brake Test',question:'A',instruction:'B',page:1,criticalSafety:'false'},'Org admin'),/valid critical/);
});
test('critical closure requires linked work, repair evidence, recheck and explicit verification',()=>{
 const {s,i}=fixture(),f=fail(s,i);assert.throws(()=>closeRecord(s,g,'faults',f.id,repair,'Supervisor'),/linked actions/);closeActions(s,f);
 for(const values of [{notes:'Deferred until next week'},{...repair,safetyVerified:'no'},{...repair,repairEvidence:''},{...repair,recheckEvidence:''}])assert.throws(()=>closeRecord(s,g,'faults',f.id,values,'Supervisor'),/Critical Safety Fault/);
 assert.throws(()=>closeRecord(s,'other','faults',f.id,repair,'Supervisor'),/unavailable/);
 closeRecord(s,g,'faults',f.id,repair,'Supervisor');assert.equal(safetyResolved(f),true);assert.equal(f.safetyResolution.actor,'Supervisor');assert.equal(criticalSummary(s,g).open,0);
 assert.equal(criticalSummary(s,g).total,1);
});
test('closure, deletion, supervisor hold clearance and missing records cannot bypass critical repair',()=>{
 const {s,i}=fixture(),f=fail(s,i);makeOtherwiseReady(s,i);closeActions(s,f);
 f.status='Closed';assert.equal(releaseAssessment(s,g,i.vehicle).eligible,false);assert.match(releaseAssessment(s,g,i.vehicle).blockers.join(' '),/Critical Safety Fault/);
 f.deletedAt=new Date().toISOString();i.deletedAt=new Date().toISOString();assert.equal(releaseAssessment(s,g,i.vehicle).criticalSafetyFaults,1);delete f.deletedAt;delete i.deletedAt;
 releaseCommand(s,g,supervisor,'bus_hold',{notes:'Hold for investigation'},i.vehicle);releaseCommand(s,g,supervisor,'bus_clear_hold',{notes:'Supervisor hold cleared'},i.vehicle);
 assert.throws(()=>releaseCommand(s,g,supervisor,'bus_release',{notes:'All ready',confirm:'yes'},i.vehicle),/Critical Safety Fault/);
 s.faults=[];assert.equal(criticalCheckBlocked(s,i),true);assert.equal(releaseAssessment(s,g,i.vehicle).eligible,false);
});
test('successful repair allows inspection sign-off but release stays a separate authorised decision',()=>{
 const {s,i}=fixture(),f=fail(s,i);closeActions(s,f);i.status='Awaiting review';assert.equal(reviewReady({state:s,garage:g},'inspections',i),false);assert.throws(()=>manageInspection(s,g,i.id,{operation:'complete',reason:'Reviewed evidence',date:today()},'Supervisor'),/Critical Safety/);
 closeRecord(s,g,'faults',f.id,repair,'Supervisor');manageInspection(s,g,i.id,{operation:'complete',reason:'Reviewed evidence',date:today()},'Supervisor');makeOtherwiseReady(s,i);
 assert.equal(releaseAssessment(s,g,i.vehicle).status,'Awaiting release');releaseCommand(s,g,supervisor,'bus_release',{notes:'Verified all release requirements',confirm:'yes'},i.vehicle);assert.equal(releaseAssessment(s,g,i.vehicle).status,'Released for service');
 i.status='In progress';fail(s,i);assert.equal(s.faults.length,2);assert.equal(criticalSummary(s,g).open,1);assert.equal(releaseAssessment(s,g,i.vehicle).eligible,false);
});
test('legacy open PM3 defects inherit pilot flags without rewriting closed historical faults',()=>{
 const {s,i}=fixture(),f=fail(s,i);delete f.criticalSafety;delete i.templateSnapshot.tasks[0].criticalSafety;assert.equal(isCriticalFault(s,f),true);
 f.status='Closed';assert.equal(isCriticalFault(s,f),false);assert.equal(criticalCheckBlocked(s,i),false);
 f.status='Open';closeActions(s,f);closeRecord(s,g,'faults',f.id,repair,'Supervisor');assert.equal(f.criticalSafety,true);assert.equal(safetyResolved(f),true);
});
test('custom checklists require a bus, snapshot flags, preserve failed critical answers and verify repair',()=>{
 const s=seed(),content={checklists:[]},t=saveContent(content,'checklists',{title:'Safety checks',steps:'Check steering\nClean cab',instructions:'Inspect safely',criticalSafetySteps:[0]},'Org admin');
 assert.throws(()=>checklistCommand(s,g,'checklist_start',{template:t.id},null,content,worker),/Choose a bus/);
 const run=checklistCommand(s,g,'checklist_start',{template:t.id,vehicle:'DEMO-271'},null,content,worker);
 saveContent(content,'checklists',{id:t.id,title:t.title,steps:'Check steering\nClean cab',instructions:t.instructions,criticalSafetySteps:[]},'Org admin');assert.deepEqual(run.template.criticalSafetySteps,[0]);
 checklistCommand(s,g,'checklist_answer',{item:0,result:'Fault',notes:'Excessive play'},run.id,content,worker);const f=s.faults.find(f=>f.id===run.answers[0].fault);assert.equal(f.criticalSafety,true);
 assert.throws(()=>checklistCommand(s,g,'checklist_answer',{item:0,result:'OK'},run.id,content,worker),/linked fault/);
 checklistCommand(s,g,'checklist_answer',{item:1,result:'OK'},run.id,content,worker);checklistCommand(s,g,'checklist_submit',{},run.id,content,worker);
 assert.throws(()=>checklistCommand(s,g,'checklist_signoff',{notes:'Reviewed'},run.id,content,'Supervisor'),/Critical Safety Fault/);
 closeActions(s,f);closeRecord(s,g,'faults',f.id,repair,'Supervisor');checklistCommand(s,g,'checklist_signoff',{notes:'Verified repair and all answers'},run.id,content,'Supervisor');assert.equal(run.status,'Completed');
 assert.throws(()=>saveContent(content,'checklists',{id:t.id,title:t.title,steps:'Check steering',instructions:t.instructions,criticalSafetySteps:[5]},'Org admin'),/valid critical/);
});
test('counts deduplicate buses/checks, respect garages and expose repair evidence in exports',()=>{
 const {s,i}=fixture(),f=fail(s,i);s.faults.push({...f,id:'second'}, {...f,id:'foreign',garage:'other',vehicle:'SECRET'});const sum=criticalSummary(s,g);assert.equal(sum.open,2);assert.equal(sum.busesHeld,1);assert.equal(sum.checksAffected,1);
 const c={state:s,garage:g,me:{role:'garage_manager'},page:'records/faults?severity=critical'};const csv=faultCSV(c);assert.match(csv,/Critical Safety Fault/);assert.doesNotMatch(csv,/SECRET/);assert.equal(garageExport(c).criticalSafety.open,2);
 assert.match(managerRecordsView(c),/Open critical/);assert.match(fleetFlowView({...c,page:'fleet'}),/Buses held/);assert.match(checksFlowView({...c,page:'inspection-records'}),/2 critical faults/);
 const f2=s.faults.find(f=>f.id==='second');f2.created='2026-09-01T12:00:00Z';f.created='2026-10-17T12:00:00Z';
 const report=performanceReport(s,g,{}, {from:'2026-10-01',to:'2026-10-17'},new Date('2026-10-17T16:00:00Z'));assert.equal(report.totals.criticalRaised,1);assert.equal(report.totals.criticalOpen,2);assert.equal(report.totals.criticalBusesHeld,1);assert.match(reportCSV(report),/Critical faults open now/);
});
test('review form exposes verification only to reviewers; routine faults retain normal closure',()=>{
 const {s,i}=fixture(),f=fail(s,i);closeActions(s,f);const c={state:s,garage:g,me:supervisor,page:'reviews/faults/'+f.id};assert.match(reviewView(c),/name="safetyVerified"/);assert.match(reviewView(c),/name="recheckEvidence"/);assert.doesNotMatch(reviewView({...c,me:{role:'mechanic'}}),/name="safetyVerified"/);
 const routine={id:'routine',garage:g,vehicle:i.vehicle,status:'Open',criticalSafety:false};s.faults.push(routine);closeRecord(s,g,'faults',routine.id,{notes:'Routine repair complete'},'Supervisor');assert.equal(routine.status,'Closed');
});
