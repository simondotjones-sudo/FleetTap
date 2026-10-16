import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/model.js';
import {startInspection} from '../src/inspections.js';
import {checksFlowView,isMyInspection} from '../src/checks-flow.js';
import {draftFor,resumeIndex,available} from '../src/tablet.js';

const me={role:'mechanic',name:'Alex',email:'alex@example.test'};
const context=()=>({state:seed(),garage:'demo-north',me,page:'bus-checks'});
test('Checks selects a scoped bus before starting and does not expose administration',()=>{
 const c=context(),html=checksFlowView(c);
 assert.match(html,/data-go="checks\/DEMO-271"/);
 assert.doesNotMatch(html,/DEMO-315|data-work-start|Templates|data-mode|Previous|Next/);
 c.page='checks/DEMO-315';assert.match(checksFlowView(c),/Check unavailable/);
 c.page='checks/DEMO-271';assert.match(checksFlowView(c),/data-work-start="DEMO-271"/);
 assert.match(checksFlowView(c),/Inspection history|Last completed|Next due/);
 startInspection(c.state,'DEMO-271',c.garage,'Alex (alex@example.test)');
 assert.match(checksFlowView(c),/Resume check/);
 c.page='inspection-records';assert.match(checksFlowView(c),/Administrator access required/);
 c.me={...me,role:'garage_manager'};assert.match(checksFlowView(c),/Inspection records/);
});
test('My checks uses signed-in attribution, including contributions, not matching names',()=>{
 const c=context(),i=startInspection(c.state,'DEMO-271',c.garage,'Alex (another@example.test)');
 assert.equal(isMyInspection(i,me),false);
 c.page='my-checks';assert.doesNotMatch(checksFlowView(c),new RegExp(i.id));
 i.answers['1-1']={worker:'Previous name (alex@example.test)',result:'OK',readings:['0']};
 assert.equal(isMyInspection(i,me),true);assert.match(checksFlowView(c),new RegExp(i.id));
 const hidden=startInspection(c.state,'DEMO-315','demo-south','Alex (alex@example.test)');
 assert.doesNotMatch(checksFlowView(c),new RegExp(hidden.id));
 i.deletedAt=new Date().toISOString();assert.doesNotMatch(checksFlowView(c),new RegExp(i.id));
});
test('History is read-only even for an open inspection and uses its saved question version',()=>{
 const c=context(),i=startInspection(c.state,'DEMO-271',c.garage,'Alex (alex@example.test)');
 i.templateSnapshot.tasks[0].question='Saved <question>';
 i.answers['1-1']={worker:'Alex (alex@example.test)',result:'OK',notes:'Saved <note>',readings:['0']};
 const before=JSON.stringify(c.state);c.page='inspection-record/'+i.id+'/0';
 const html=checksFlowView(c);
 assert.match(html,/Saved &lt;question&gt;|Saved &lt;note&gt;|Side slip/);
 assert.doesNotMatch(html,/data-result|data-work-start|data-work-submit|data-admin|<form|Manage inspection/);
 assert.equal(JSON.stringify(c.state),before);
 c.garage='demo-south';assert.match(checksFlowView(c),/Check unavailable/);
});
test('Resume returns to an unfinished entry even when earlier questions remain unanswered',()=>{
 const c=context(),i=startInspection(c.state,'DEMO-271',c.garage,'Alex (alex@example.test)');
 const d=draftFor(i,available[4]);d.result='Defect';d.notes='Keep this note';d.step='note';d.dirty=true;
 assert.equal(resumeIndex(i),4);assert.equal(draftFor(i,available[4]).notes,'Keep this note');
 d.dirty=false;assert.equal(resumeIndex(i),0);
});
