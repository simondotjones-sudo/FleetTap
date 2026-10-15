import test from 'node:test';
import assert from 'node:assert/strict';
import {adminView} from '../src/admin-ui.js';
import {adminToolsView} from '../src/admin-tools.js';
import {reviewView} from '../src/review-ui.js';
import {contentView} from '../src/content-ui.js';
import {roleKeys} from '../src/roles.js';
import {saveContent,checklistCommand} from '../src/content-model.js';
import {seed} from '../src/model.js';

test('role screens enforce UI boundaries and show configurable escaped role labels',()=>{
 const state=seed(),data={organisations:[{id:'o',name:'Demo',active:true,role_names:{mechanic:'Technician <custom>'},login_code:'ORG'}],garages:[{id:'demo-north',organisation_id:'o',name:'North'}],users:[{id:'staff',name:'Staff',role:'mechanic',employee_id:'EMP1',garage_id:'demo-north',organisation_id:'o',active:true}]};
 const c={state,garage:'demo-north',organisation:'o',content:{sops:[],checklists:[]},page:'manage'};
 for(const role of roleKeys){c.me={id:role,role,organisation_id:'o',garage_id:'demo-north'};const html=adminView(c.me,data);
  if(['supervisor','mechanic'].includes(role)){assert.match(html,/Administrator access required/);assert.match(adminToolsView(c),/Administrator access required/);}else {assert.match(html,/Technician &lt;custom&gt;/);assert.match(html,/Staff registration/);}
  c.page='reviews';assert.equal(reviewView(c).includes('Supervisor access required'),role==='mechanic');
  c.page='content/sops';assert.equal(contentView(c).includes('Organisation Admin access required'),!['platform_admin','organisation_admin'].includes(role));c.page='manage';
 }
 const manager=adminView({id:'manager',role:'garage_manager'},data);assert.doesNotMatch(manager,/Save role names|Create demo accounts|Add organisation/);assert.match(manager,/Update role/);
 const supervisor={...c,me:{role:'supervisor'},page:'reviews/faults/FT-F-DEMO'};assert.match(reviewView(supervisor),/Review and close each linked action first/);assert.doesNotMatch(reviewView(supervisor),/Confirm closure/);
});
test('custom checklist preserves published question snapshot and corrective action evidence across edits',()=>{
 const content={sops:[],checklists:[]},state=seed(),garage='demo-north';
 const template=saveContent(content,'checklists',{title:'Workshop',steps:'Check exit',instructions:'Full original instruction'},'Org admin');
 const run=checklistCommand(state,garage,'checklist_start',{template:template.id,vehicle:'DEMO-271'},null,content,'Staff');
 saveContent(content,'checklists',{id:template.id,title:'Changed',steps:'New question',instructions:'New instruction'},'Org admin');
 assert.equal(run.template.title,'Workshop');assert.equal(run.template.steps[0],'Check exit');assert.equal(run.template.version,1);
 checklistCommand(state,garage,'checklist_answer',{item:0,result:'Fault',notes:'Exit obstructed'},run.id,content,'Staff');const fault=run.answers[0].fault;
 checklistCommand(state,garage,'checklist_answer',{item:0,result:'OK'},run.id,content,'Staff');assert.equal(run.answers[0].fault,fault);assert.equal(state.faults.find(r=>r.id===fault).status,'Open');
 checklistCommand(state,garage,'checklist_submit',{},run.id,content,'Staff');assert.throws(()=>checklistCommand(state,garage,'checklist_answer',{item:0,result:'OK'},run.id,content,'Staff'),/locked/);
 const html=contentView({state,garage,content,page:'checklists/run/'+run.id,me:{role:'mechanic'}});assert.match(html,/Full original instruction/);assert.doesNotMatch(html,/data-content-form|Review & sign off/);
});
