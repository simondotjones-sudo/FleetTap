import test from 'node:test';
import assert from 'node:assert/strict';
import {menuSections,menuView} from '../src/navigation.js';
import {checksFlowView} from '../src/checks-flow.js';
import {actionsView,scopedAction} from '../src/actions-flow.js';
import {myActionCount,visibleActionState} from '../src/action-assignment.js';
import {seed} from '../src/model.js';
import {roadmapView,setupRoadmap} from '../src/roadmap-ui.js';

test('menu offers each role reachable work and management sections without home duplicates',()=>{
 for(const role of ['platform_admin','organisation_admin','garage_manager','supervisor','mechanic']){
  const me={role},sections=menuSections(me),html=menuView(me,'actions');
  const manage=['platform_admin','organisation_admin','garage_manager'].includes(role);
  assert.equal(sections.some(s=>s.title==='My Garage'),manage);
  assert.equal(sections.some(s=>s.title==='Platform Admin'),role==='platform_admin');
  assert.deepEqual(sections.find(s=>s.title==='My Work').items.map(i=>i[0]),role==='supervisor'?['my-jobs','required-instructions','my-checks','actions','reviews']:['my-jobs','required-instructions','my-checks','actions']);
  assert.match(html,/data-go="actions" aria-current="page">My Actions/);
  assert.doesNotMatch(html,/data-go="(?:report|sops|checks|checklists|faults)"/);
  if(manage)assert.deepEqual(sections[0].items.map(i=>i[0]),['garage-today','performance','manage','fleet']);
  const hub=checksFlowView({state:seed(),garage:'demo-north',me,page:'checks'});
  assert.match(hub,/data-go="bus-checks"/);assert.match(hub,/data-go="checklists"/);assert.doesNotMatch(hub,/data-go="reviews"/);
 }
 assert.match(menuView({role:'garage_manager'},'garage-actions/123'),/data-go="manage" aria-current="page"/);
 assert.match(menuView({role:'supervisor'},'reviews/actions/123'),/data-go="reviews" aria-current="page"/);
});

test('personal actions use account assignment, keep counts scoped, and deny non-owner deep links',()=>{
 const me={id:'alex-account',role:'mechanic',name:'Alex'},state=seed();
 state.actions=[
  {id:'mine',garage:'demo-north',assignedTo:me.id,title:'My repair',status:'Open'},
  {id:'review',garage:'demo-north',assignedTo:me.id,title:'My review',status:'Awaiting review'},
  {id:'closed',garage:'demo-north',assignedTo:me.id,title:'My closed work',status:'Closed'},
  {id:'namesake',garage:'demo-north',assignedTo:'another-alex',owner:'Alex',title:'Other person task',status:'Open'},
  {id:'unassigned',garage:'demo-north',owner:'Supervisor',title:'Shared queue',status:'Open'},
  {id:'other-garage',garage:'demo-south',assignedTo:me.id,title:'Other garage task',status:'Open'}
 ];
 const c={state,garage:'demo-north',me,page:'actions'},html=actionsView(c);
 assert.match(html,/My repair/);assert.doesNotMatch(html,/Other person task|Shared queue|Other garage task/);
 assert.equal(myActionCount(state,c.garage,me),2);
 c.page='actions/namesake';assert.equal(scopedAction(c),null);assert.match(actionsView(c),/Action unavailable/);
 c.page='garage-actions';assert.match(actionsView(c),/Manager access required/);
 assert.ok(visibleActionState(state,me).actions.every(a=>a.assignedTo===me.id));
 assert.equal(state.actions.length,6);
 c.me={id:'manager',role:'garage_manager'};assert.match(actionsView(c),/Shared queue/);assert.doesNotMatch(actionsView(c),/Other garage task/);
 c.page='actions';assert.doesNotMatch(actionsView(c),/Shared queue|My repair/);assert.equal(myActionCount(state,c.garage,c.me),0);
 c.page='garage-actions/unassigned';assert.match(actionsView(c),/data-action-assign/);
});

test('garage managers can filter sample Garage Today without gaining Roadmap access',()=>{
 const listeners={};globalThis.document={addEventListener:(k,f)=>listeners[k]=f};globalThis.window={addEventListener:()=>{}};
 const c={me:{role:'garage_manager'},page:'garage-today'};let html='';
 setupRoadmap({context:()=>c,render:()=>{html=roadmapView(c);}});
 listeners.click({target:{closest:()=>({dataset:{garageFilter:'Awaiting parts'}})}});
 assert.match(html,/data-garage-filter="Awaiting parts" aria-pressed="true"/);
 assert.match(html,/Sample data/);assert.match(html,/Show all buses/);
 listeners.click({target:{closest:()=>({dataset:{garageFilter:'All'}})}});
 c.page='roadmap';assert.match(roadmapView(c),/Platform Admin access required/);
});
