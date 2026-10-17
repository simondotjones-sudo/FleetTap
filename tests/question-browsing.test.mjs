import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/model.js';
import {startInspection} from '../src/inspections.js';
import {adjacentQuestion,sectionProgress,draftFor,tabletView,setupTablet,browseQuestion} from '../src/tablet.js';
import {setupQuestionSwipe} from '../src/question-swipe.js';
const garage='demo-north';
function setup(){const state=seed();state.inspectionTemplate={id:'pm3',version:1,tasks:[
 {id:'a1',section:'First',number:1,text:'Check first fitting',fields:[]},
 {id:'blocked',section:'First',number:2,text:'Blocked task',blocked:true,fields:[]},
 {id:'a2',section:'First',number:3,text:'Check second fitting',fields:[]},
 {id:'b1',section:'Second',number:1,text:'Check other section',fields:[]}
]};return {state,run:startInspection(state,'DEMO-271',garage,'Mechanic')};}
test('section completion requires saved checks without blocked work, unfinished entries or pending rechecks',()=>{
 const {state,run}=setup(),task=run.templateSnapshot.tasks.find(t=>t.id==='b1');
 assert.equal(sectionProgress(run,'Second').complete,false);
 run.answers.b1={result:'OK'};assert.equal(sectionProgress(run,'Second').complete,true);
 const html=tabletView({state,garage,page:`inspection/${run.id}/sections`});assert.doesNotMatch(html,/to finish/);assert.match(html,/data-section-complete="true"/);assert.match(html,/Checks completed/);
 run.answers.b1.result='Not completed';assert.equal(sectionProgress(run,'Second').complete,false);
 run.answers.b1.result='Defect';assert.equal(sectionProgress(run,'Second').complete,true); // Completion is recording the inspection, not closing faults.
 run.rechecks={b1:{readings:['.4']}};assert.equal(sectionProgress(run,'Second').complete,false);
 run.rechecks.b1.resolvedAt='2026-10-17';assert.equal(sectionProgress(run,'Second').complete,true);
 const d=draftFor(run,task);d.dirty=true;assert.equal(sectionProgress(run,'Second').complete,false);d.dirty=false;
 run.answers.a1={result:'OK'};run.answers.a2={result:'OK'};assert.equal(sectionProgress(run,'First').complete,false);assert.equal(sectionProgress(run,'First').blocked,true);
});
test('browsing stays in the section, skips blocked questions and preserves answers, drafts and rechecks without writes',()=>{
 globalThis.document={addEventListener:()=>{}};globalThis.window={addEventListener:()=>{}};
 const {state,run}=setup(),second=run.templateSnapshot.tasks.find(t=>t.id==='a2'),draft=draftFor(run,second);
 draft.step='repair';draft.result='Fixed';draft.dirty=true;draft.repair.defect='Loose bracket';draft.readings=['12'];draft.files=[{name:'evidence.jpg'}];
 let page=`inspection/${run.id}/item/0`,writes=0;
 setupTablet({context:()=>({state,garage,page}),go:p=>{page=p;},mutation:()=>{writes++;}});
 const before=structuredClone(run),beforeDraft=structuredClone(draft);
 assert.equal(adjacentQuestion(run,'a1',-1),-1);assert.equal(adjacentQuestion(run,'a1',1),1);assert.equal(adjacentQuestion(run,'a2',1),-1);
 assert.equal(browseQuestion(-1),false);assert.equal(browseQuestion(1),true);assert.equal(page,`inspection/${run.id}/item/1/browse`);
 const html=tabletView({state,garage,page});assert.match(html,/Check second fitting/);assert.match(html,/Continue entry/);assert.doesNotMatch(html,/id="tap-repair-form"/);
 assert.deepEqual(draft,beforeDraft);assert.equal(browseQuestion(1),false);assert.equal(browseQuestion(-1),true);assert.deepEqual(run,before);assert.equal(writes,0);
 run.rechecks={a2:{readings:['.4']}};assert.equal(browseQuestion(1),true);assert.match(tabletView({state,garage,page}),/Continue recheck/);assert.equal(run.rechecks.a2.resolvedAt,undefined);
 page=`inspection/${run.id}/item/1`;assert.equal(browseQuestion(-1),false); // Entry forms do not swipe.
});
test('touch browsing rejects scroll, form gestures, edge gestures and cancelled or multitouch input, and suppresses the answer click',()=>{
 const listeners={},moves=[];globalThis.document={addEventListener:(name,fn)=>{listeners[name]=fn;}};globalThis.window={innerWidth:390};
 setupQuestionSwipe(direction=>moves.push(direction));
 const screen={isConnected:true},target={closest:s=>s==='.question-browse'?screen:null};
 const event=(x,y,extra={})=>({target,pointerId:1,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,...extra});
 listeners.pointerdown(event(300,200));listeners.pointermove(event(200,205));listeners.pointerup(event(100,210));assert.deepEqual(moves,[1]);
 let prevented=false,stopped=false;listeners.click({detail:1,preventDefault:()=>{prevented=true;},stopImmediatePropagation:()=>{stopped=true;}});assert.equal(prevented,true);assert.equal(stopped,true);
 listeners.pointerdown(event(100,200));listeners.pointerup(event(300,210));assert.deepEqual(moves,[1,-1]);
 listeners.pointerdown(event(200,300));listeners.pointerup(event(200,300));prevented=false;listeners.click({detail:1,preventDefault:()=>{prevented=true;},stopImmediatePropagation:()=>{}});assert.equal(prevented,false);
 listeners.pointerdown(event(300,200));listeners.pointermove(event(290,250));listeners.pointerup(event(100,260));
 listeners.pointerdown(event(5,200));listeners.pointerup(event(200,210));
 listeners.pointerdown(event(300,200,{target:{closest:()=>screen}}));listeners.pointerup(event(100,210));
 listeners.pointerdown(event(300,200));listeners.pointercancel();listeners.pointerup(event(100,210));
 listeners.pointerdown(event(300,200));listeners.pointerdown(event(280,200,{pointerId:2,isPrimary:false}));listeners.pointerup(event(100,210));
 assert.deepEqual(moves,[1,-1]);
});
