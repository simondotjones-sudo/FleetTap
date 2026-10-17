import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,submitAction,addRecord} from '../src/model.js';
import {startInspection,saveAnswer,recordRecheck,submitInspection} from '../src/inspections.js';
import {editTemplate,templateFor} from '../src/templates.js';
import {manageInspection} from '../src/inspection-admin.js';
import {closeRecord} from '../src/reviews.js';
import {categoryPages,inspectionSequence,sectionRulesFor} from '../src/section-sequencing.js';
import {tabletView,setupTablet,browseSections} from '../src/tablet.js';
import {releaseAssessment} from '../src/bus-release.js';
const garage='demo-north',worker='Test mechanic';
const task=(id,section,extra={})=>({id,section,text:'Check '+section,number:'1',page:1,fields:[],...extra});
function setup(extra=[]){const s=seed();s.faults=[];s.actions=[];s.inspectionTemplate={id:'pm3',version:1,tasks:[task('a','Mechanical check'),task('b','Body check',{conditional:true}),...extra,task('17-1','Test Drive',{criticalSafety:true})]};const i=startInspection(s,'DEMO-271',garage,worker);return {s,i};}
function answer(s,i,id,result='OK',extra={}){const t=i.templateSnapshot.tasks.find(t=>t.id===id);return saveAnswer(s,i.id,garage,id,{result,notes:result==='OK'?'':'Work record reference',readings:[],worker,prerequisiteEvidence:inspectionSequence(s,i).evidence(t.section),...extra});}
function closeFault(s,f){for(const a of s.actions.filter(a=>a.source===f.id&&a.status!=='Closed')){if(a.status==='Open')submitAction(s,a.id,'Repair and recheck completed','work',worker);closeRecord(s,garage,'actions',a.id,{notes:'Verified repair work'},'Supervisor');}closeRecord(s,garage,'faults',f.id,{notes:'Repair and recheck verified',repairEvidence:'Replacement installed',recheckEvidence:'Rechecked successfully',safetyVerified:'yes'},'Supervisor');}
test('pilot categories preserve all 17 sections, six cards per page, blocked-only work and legacy sequencing',()=>{
 const s=seed(),i=startInspection(s,'DEMO-271',garage,worker),pages=categoryPages(i);
 assert.deepEqual(pages.map(p=>[p.name,p.sections.length]),[['Mechanical',6],['Body & access',4],['Fire safety',6],['Final checks',1]]);
 assert.equal(inspectionSequence(s,i).gate('Test Drive').ready,false);
 assert.match(inspectionSequence(s,i).gate('Test Drive').reasons.map(r=>r.text).join(' '),/technical review pending/);
 delete i.templateSnapshot.sectionRules;assert.equal(inspectionSequence(s,i).gate('Test Drive').ready,true);
 const {s:state,i:run}=setup([task('blocked','Blocked only',{blocked:true})]);assert.ok(categoryPages(run).flatMap(p=>p.sections).some(r=>r.name==='Blocked only'));
 assert.equal(inspectionSequence(state,run).status('Blocked only').passed,false);
});
test('server gates direct answers and readings until required work passes, accepting evidenced Not due',()=>{
 const {s,i}=setup();const before=structuredClone(i);
 assert.throws(()=>answer(s,i,'17-1'),/locked/);assert.throws(()=>recordRecheck(s,i.id,garage,'17-1',[],worker),/locked/);assert.deepEqual(i,before);
 answer(s,i,'a');answer(s,i,'b','Not completed');assert.equal(inspectionSequence(s,i).gate('Test Drive').ready,false);
 answer(s,i,'b','Not due');assert.equal(inspectionSequence(s,i).gate('Test Drive').ready,true);
 assert.throws(()=>saveAnswer(s,i.id,garage,'17-1',{result:'OK',worker,readings:[],sequenceEvidence:'forged'}),/fresh check/);
 answer(s,i,'17-1');assert.equal(inspectionSequence(s,i).status('Test Drive').passed,true);assert.equal(s.vehicles[0].status,'Awaiting inspection');
 assert.throws(()=>answer(s,{...i,id:i.id},'a','Not due'),/cannot be marked not due/);
});
test('reported repairs require supervisor verification before green pass and test drive, independent of inspection signoff',()=>{
 const {s,i}=setup();answer(s,i,'a','Fixed',{repair:{defect:'Loose fitting',work:'Replaced',recheck:'Recheck passed',confirmed:true}});answer(s,i,'b');
 let seq=inspectionSequence(s,i);assert.equal(seq.status('Mechanical check').complete,true);assert.equal(seq.status('Mechanical check').passed,false);assert.equal(seq.gate('Test Drive').ready,false);assert.equal(i.status,'In progress');
 const html=tabletView({state:s,garage,page:`inspection/${i.id}/sections`});assert.match(html,/data-section-state="attention"/);
 const f=s.faults[0];assert.throws(()=>closeRecord(s,garage,'faults',f.id,{notes:'Reviewed repair'},'Supervisor'),/linked actions/);closeFault(s,f);
 seq=inspectionSequence(s,i);assert.equal(seq.status('Mechanical check').passed,true);assert.equal(seq.gate('Test Drive').ready,true);answer(s,i,'17-1');
});
test('critical faults from other work and supervisor holds gate test drive; other garages are isolated',()=>{
 const {s,i}=setup();answer(s,i,'a');answer(s,i,'b');
 const f=addRecord(s,'faults',{garage,vehicle:i.vehicle,title:'Brake fault',description:'Critical fault from other work',criticalSafety:true});
 assert.throws(()=>answer(s,i,'17-1'),/Critical Safety Fault/);closeFault(s,f);assert.equal(inspectionSequence(s,i).gate('Test Drive').ready,true);
 s.faults.push({id:'elsewhere',garage:'other',vehicle:i.vehicle,criticalSafety:true,status:'Open'});assert.equal(inspectionSequence(s,i).gate('Test Drive').ready,true);
 s.releaseEvents=[{id:'hold',garage,vehicle:i.vehicle,type:'hold',notes:'Inspection concern'}];assert.throws(()=>answer(s,i,'17-1'),/Supervisor hold/);
 s.releaseEvents.push({id:'clear',garage,vehicle:i.vehicle,type:'hold_cleared'});answer(s,i,'17-1');
});
test('changed prerequisites invalidate prior drive evidence, reject stale submissions and signoff, and retain audit',()=>{
 const {s,i}=setup();answer(s,i,'a');answer(s,i,'b');answer(s,i,'17-1');const previous=structuredClone(i.answers['17-1']),proof=inspectionSequence(s,i).evidence('Test Drive');
 answer(s,i,'a');assert.equal(inspectionSequence(s,i).current(i.templateSnapshot.tasks.at(-1)),false);assert.deepEqual(i.answers['17-1'],previous);
 assert.throws(()=>saveAnswer(s,i.id,garage,'17-1',{result:'OK',worker,readings:[],prerequisiteEvidence:proof}),/fresh check/);
 assert.throws(()=>submitInspection(s,i.id,garage,''),/fresh check/);i.status='Awaiting review';
 assert.throws(()=>manageInspection(s,garage,i.id,{operation:'complete',reason:'Inspection completed',date:'2026-10-17'},'Supervisor'),/fresh check/);
 assert.ok(releaseAssessment(s,garage,i.vehicle).blockers.some(b=>b.includes('prerequisites changed')));
 i.status='In progress';answer(s,i,'17-1');assert.equal(inspectionSequence(s,i).status('Test Drive').passed,true);assert.deepEqual(i.audit.at(-1).previous,previous);
});
test('a repaired and verified failed test drive can be retested successfully without creating another fault',()=>{
 const {s,i}=setup();answer(s,i,'a');answer(s,i,'b');answer(s,i,'17-1','Defect');const f=s.faults[0];assert.equal(inspectionSequence(s,i).gate('Test Drive').ready,false);
 closeFault(s,f);assert.equal(inspectionSequence(s,i).current(i.templateSnapshot.tasks.at(-1)),false);answer(s,i,'17-1');assert.equal(s.faults.length,1);assert.equal(i.answers['17-1'].fault,f.id);assert.equal(inspectionSequence(s,i).status('Test Drive').passed,true);
});
test('org-admin rules use stable identities, validate cycles/references, and affect only future snapshots',()=>{
 const {s,i}=setup(),original=structuredClone(i.templateSnapshot);let rules=templateFor(s).sectionRules;
 const a=rules.find(r=>r.name==='Mechanical check'),b=rules.find(r=>r.name==='Body check'),final=rules.find(r=>r.final);
 const edit=(rule,values)=>editTemplate(s,{operation:'section_rule',sectionId:rule.id,category:rule.category,mode:'selected',requirement:'completed',prerequisites:[a.id],...values},'Org admin');
 edit(b,{category:'body'});assert.deepEqual(i.templateSnapshot,original);
 assert.throws(()=>edit(a,{prerequisites:[b.id]}),/circular/);assert.throws(()=>edit(b,{prerequisites:[b.id]}),/other existing/);assert.throws(()=>edit(b,{prerequisites:['missing']}),/other existing/);assert.throws(()=>edit(b,{prerequisites:[]}),/at least one/);
 assert.throws(()=>edit(final,{mode:'any'}),/Test Drive requires/);
 assert.throws(()=>editTemplate(s,{operation:'delete_section',section:a.name},'Admin'),/prerequisite/);
 editTemplate(s,{operation:'section',section:a.name,name:'Renamed mechanical'},'Admin');rules=templateFor(s).sectionRules;assert.equal(rules.find(r=>r.id===a.id).name,'Renamed mechanical');assert.deepEqual(rules.find(r=>r.id===b.id).prerequisites,[a.id]);
 i.status='Awaiting review';const next=startInspection(s,i.vehicle,garage,worker);assert.equal(inspectionSequence(s,next).gate('Body check').ready,false);
 answer(s,next,'a','Defect');assert.equal(inspectionSequence(s,next).gate('Body check').ready,true);assert.equal(inspectionSequence(s,next).gate('Test Drive').ready,false);
});
test('transitive sequencing requires fresh downstream checks and rejects removal of referenced last questions',()=>{
 const {s,i}=setup();const rules=templateFor(s).sectionRules,a=rules[0],b=rules[1];
 editTemplate(s,{operation:'section_rule',sectionId:b.id,category:'body',mode:'selected',requirement:'passed',prerequisites:[a.id]},'Admin');
 assert.throws(()=>editTemplate(s,{operation:'delete_question',id:'a'},'Admin'),/prerequisite/);
 i.status='Awaiting review';const run=startInspection(s,i.vehicle,garage,worker);answer(s,run,'a');answer(s,run,'b');answer(s,run,'17-1');
 answer(s,run,'a');const seq=inspectionSequence(s,run);assert.equal(seq.status('Body check').stale,1);assert.equal(seq.gate('Test Drive').ready,false);answer(s,run,'b');answer(s,run,'17-1');assert.equal(inspectionSequence(s,run).status('Test Drive').passed,true);
});
test('category arrows preserve entries and bounds, and locked questions are readable without answer controls',()=>{
 globalThis.document={addEventListener:()=>{}};globalThis.window={addEventListener:()=>{}};
 const s=seed(),i=startInspection(s,'DEMO-271',garage,worker);let page=`inspection/${i.id}/sections`,writes=0;
 setupTablet({context:()=>({state:s,garage,page}),go:p=>{page=p;},mutation:()=>writes++});
 assert.equal(browseSections(-1),false);for(let n=1;n<=3;n++){assert.equal(browseSections(1),true);assert.equal(page,`inspection/${i.id}/sections/${n}`);}assert.equal(browseSections(1),false);assert.equal(browseSections(-1),true);assert.equal(writes,0);
 const html=tabletView({state:s,garage,page:`inspection/${i.id}/item/123/browse`});assert.match(html,/Undertake a test drive/);assert.match(html,/Test Drive locked/);assert.match(html,/View outstanding checks/);assert.doesNotMatch(html,/data-result=/);
});
