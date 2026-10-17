import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/model.js';
import {startInspection,saveAnswer,recordRecheck} from '../src/inspections.js';
import {editTemplate} from '../src/templates.js';
import {closeRecord} from '../src/reviews.js';
import {criticalCheckBlocked} from '../src/critical-safety.js';
import {releaseAssessment} from '../src/bus-release.js';
import {taskCopy,hasExtraInstruction,documentReferences,referenceDocument} from '../src/question-copy.js';
import {questionReferences} from '../src/question-evidence-ui.js';
import {tabletView} from '../src/tablet.js';
import {reviewView} from '../src/review-ui.js';
import {faultCSV} from '../src/manager-records.js';
import {busTimeline} from '../src/bus-timeline.js';
import {today,addInterval} from '../src/scheduling.js';
const garage='demo-north',worker='Mechanic',repair={defect:'Loose wheel fitting',work:'Replaced and torqued fitting',recheck:'Torque and functional check passed',confirmed:true};
function setup(extra={}){const state=seed();state.faults=[];state.actions=[];state.inspectionTemplate={id:'pm3',title:'Synthetic test',version:1,tasks:[{id:'q',section:'Test',number:'1',page:1,text:'Check fitting. Adjust if loose.',criticalSafety:true,fields:[],...extra}]};return {state,run:startInspection(state,'DEMO-271',garage,worker)};}
const fixed=(extra={})=>({result:'Fixed',notes:repair.defect,readings:[],repair,worker,...extra});
test('references move out of questions without losing measurements or follow-on work',()=>{
 const copy=taskCopy({text:'Check play (0.20 mm maximum) as per S.I. 335 issued on 6th. Dec. ’16. Replace if incorrect. Follow SOP#12.'});
 assert.match(copy.text,/0.20 mm maximum/);assert.match(copy.text,/Replace if incorrect/);assert.doesNotMatch(copy.text,/335|issued|Dec|SOP/);
 assert.deepEqual(copy.documentRefs.map(r=>r.label),['SI 335','SOP 12']);
 assert.deepEqual(documentReferences('S.I. - 294 / SI#288 / SOP No. 12').map(r=>r.key),['SI:294','SI:288','SOP:12']);
 assert.equal(hasExtraInstruction({text:'Check the hub. ',question:'Check the hub'}),false);
 assert.equal(hasExtraInstruction({text:'Check the hub. Tighten to 50 Nm.',question:'Check the hub.'}),true);
});
test('only unambiguous published matching source documents are clickable',()=>{
 const ref=documentReferences('SI 288')[0],docs=[{id:'doc',reference:'SI 288',title:'Fuel safety',status:'Published',sourceId:'source'}];
 assert.equal(referenceDocument(ref,docs).id,'doc');assert.equal(referenceDocument(ref,[{...docs[0],status:'Draft'}]),null);
 assert.equal(referenceDocument(ref,[{...docs[0],reference:'SI 2880'}]),null);assert.equal(referenceDocument(ref,[...docs,{...docs[0],id:'duplicate'}]),null);
 const html=questionReferences({garage,content:{sops:docs}},{text:'Check fuel as per SI 288. Follow SOP 12.'});
 assert.match(html,/sop-documents\?garage=demo-north&amp;id=source/);assert.match(html,/<span>SOP 12<\/span>/);assert.doesNotMatch(html,/href="[^"]*12/);
});
test('question screen hides duplicate instructions and offers a recorded repair',()=>{
 const {state,run}=setup(),html=tabletView({state,garage,page:'inspection/'+run.id+'/item/0'});
 assert.doesNotMatch(html,/Full instruction/);assert.match(html,/data-result="Fixed"/);assert.match(html,/I fixed it/);
 run.templateSnapshot.tasks[0].requiresAcknowledgement=true;
 const ack=tabletView({state,garage,page:'inspection/'+run.id+'/item/0'});assert.match(ack,/I have read this instruction/);assert.doesNotMatch(ack,/View instruction/);
});
test('repair evidence creates review work and never clears a critical hold',()=>{
 const {state,run}=setup(),answer=saveAnswer(state,run.id,garage,'q',fixed()),fault=state.faults[0],action=state.actions[0];
 assert.equal(answer.result,'Fixed');assert.equal(answer.repair.actor,worker);assert.equal(fault.status,'Open');assert.equal(action.status,'Awaiting review');assert.equal(criticalCheckBlocked(state,run),true);assert.equal(releaseAssessment(state,garage,run.vehicle).eligible,false);
 assert.throws(()=>saveAnswer(state,run.id,garage,'q',{result:'OK',worker,readings:[]}),/linked defect/);
 closeRecord(state,garage,'actions',action.id,{notes:'Repair evidence reviewed'},'Supervisor');
 const html=reviewView({state,garage,me:{role:'supervisor'},page:'reviews/faults/'+fault.id});assert.match(html,/Replaced and torqued fitting/);assert.match(html,/name="safetyVerified"/);
 assert.throws(()=>closeRecord(state,garage,'faults',fault.id,{notes:'Assume fixed'},'Supervisor'),/Critical Safety Fault/);
 closeRecord(state,garage,'faults',fault.id,{notes:'Inspected and verified',repairEvidence:repair.work,recheckEvidence:repair.recheck,safetyVerified:'yes'},'Supervisor');assert.equal(criticalCheckBlocked(state,run),false);
 run.status='Completed';run.completedBy='Supervisor';run.completedDate=today();const bus=state.vehicles.find(v=>v.id===run.vehicle);bus.due=addInterval(today(),7,'days');bus.roadDocuments={cvrt:{expires:bus.due,reference:'CVRT'},tax:{expires:bus.due,reference:'Tax'}};
 assert.equal(releaseAssessment(state,garage,run.vehicle).status,'Awaiting release');
 assert.match(faultCSV({state,garage,page:'records/faults'}),/Replaced and torqued fitting/);assert.ok(busTimeline(state,garage,run.vehicle).some(e=>e.notes.includes(repair.work)));
});
test('repair cannot omit evidence or accept failed post-repair measurements',()=>{
 const {state,run}=setup({fields:[['Clearance','mm',0,.2]]});
 for(const r of [{...repair,work:''},{...repair,recheck:''},{...repair,confirmed:false}])assert.throws(()=>saveAnswer(state,run.id,garage,'q',fixed({readings:['.1'],repair:r})),/Record the fault|Confirm/);
 recordRecheck(state,run.id,garage,'q',['.5'],worker);
 assert.throws(()=>saveAnswer(state,run.id,garage,'q',fixed({readings:['.4'],recheckConfirmed:true,recheckNote:'Still loose'})),/outside the source tolerance/);
 const a=saveAnswer(state,run.id,garage,'q',fixed({readings:['.1'],recheckConfirmed:true,recheckNote:repair.recheck,failureType:'tolerance'}));
 assert.deepEqual(a.repair.beforeReadings,['.5']);assert.deepEqual(a.repair.readings,['.1']);assert.equal(a.failureType,'tolerance');assert.equal(a.recheck.first.readings[0],'.5');
});
test('required visual photos cannot be bypassed by a client flag or later template edits',()=>{
 const {state,run}=setup({visualDefectPhotoRequired:true});
 for(const result of ['Defect','Fixed'])assert.throws(()=>saveAnswer(state,run.id,garage,'q',fixed({result,failureType:'tolerance',visualDefectPhotoRequired:false})),/photo is required/);
 editTemplate(state,{operation:'question',id:'q',section:'Test',question:'Check fitting',instruction:'Check fitting',page:1,visualDefectPhotoRequired:false},'Admin');
 assert.equal(run.templateSnapshot.tasks[0].visualDefectPhotoRequired,true);
 const a=saveAnswer(state,run.id,garage,'q',fixed({photos:['validated-photo-id']}));assert.deepEqual(state.faults[0].photos,['validated-photo-id']);assert.equal(a.failureType,'visual');
 saveAnswer(state,run.id,garage,'q',fixed());assert.equal(state.faults.length,1);assert.equal(state.actions.length,1);
 assert.throws(()=>editTemplate(state,{operation:'question',id:'q',section:'Test',question:'Check fitting',instruction:'Check fitting',page:1,visualDefectPhotoRequired:'no'},'Admin'),/valid visual fault photo/);
});
test('tolerance evidence can replace a visual photo only when recorded readings prove it',()=>{
 const {state,run}=setup({visualDefectPhotoRequired:true,fields:[['Clearance','mm',0,.2]]});
 assert.throws(()=>saveAnswer(state,run.id,garage,'q',fixed({readings:['.1'],failureType:'tolerance'})),/photo is required/);
 recordRecheck(state,run.id,garage,'q',['.5'],worker);
 const a=saveAnswer(state,run.id,garage,'q',fixed({readings:['.1'],failureType:'tolerance',recheckConfirmed:true,recheckNote:repair.recheck}));assert.equal(a.failureType,'tolerance');
});
test('reporting a repair does not overwrite another mechanics assigned action',()=>{
 const {state,run}=setup();saveAnswer(state,run.id,garage,'q',{result:'Defect',notes:'Loose fitting',worker,readings:[]});const existing=state.actions[0];existing.assignedTo='other';existing.evidence='Other mechanics handover';
 saveAnswer(state,run.id,garage,'q',fixed());assert.equal(existing.status,'Open');assert.equal(existing.evidence,'Other mechanics handover');assert.equal(state.actions.length,2);assert.equal(state.actions[0].status,'Awaiting review');
});
