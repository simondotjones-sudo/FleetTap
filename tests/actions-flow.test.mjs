import test from 'node:test';
import assert from 'node:assert/strict';
import {actionsView,setupActions,scopedAction,actionEvidence,actionsBusy,actionBack} from '../src/actions-flow.js';
import {seed as baseSeed,submitAction} from '../src/model.js';

const me={id:'assigned-worker',role:'mechanic',name:'Worker'};
const seed=()=>{const state=baseSeed();state.actions[0].assignedTo=me.id;return state;};

test('action selection and linked details stay within the current garage',()=>{
 const state=seed();state.actions.push({id:'elsewhere',garage:'demo-south',title:'Private south task',status:'Open'});
 const c={state,garage:'demo-north',page:'actions',me};
 assert.doesNotMatch(actionsView(c),/Private south task/);
 c.page='actions/elsewhere';assert.equal(scopedAction(c),null);assert.match(actionsView(c),/Action unavailable/);
 c.page='actions/%not-an-id';assert.equal(scopedAction(c),null);
 c.page='actions/FT-A-DEMO';state.faults[0].garage='demo-south';assert.doesNotMatch(actionsView(c),/Fictional example/);
 assert.throws(()=>actionEvidence({kind:'work',text:' '}));
 assert.ok(actionEvidence({kind:'handover',text:'x'.repeat(5000)}).length<=4000);
});

test('action updates preserve draft after failure, block duplicate submits and await review',async()=>{
 const listeners={};globalThis.document={addEventListener:(k,f)=>listeners[k]=f};globalThis.window={addEventListener:()=>{}};
 const state=seed(),garage='demo-north';let page='actions/FT-A-DEMO',html='',calls=0,fail=true,release;
 const notices=[],context=()=>({state,garage,page,me}),render=()=>{html=actionsView(context());};
 setupActions({context,render,notify:m=>notices.push(m),reload:async()=>{},mutation:async(action,values,{id})=>{calls++;assert.equal(action,'action');if(fail)throw Error('Connection lost');await new Promise(r=>release=r);submitAction(state,id,values.evidence);}});
 const click=async dataset=>{const el={dataset,hasAttribute:k=>Object.hasOwn(dataset,k.replace(/^data-/,'').replace(/-([a-z])/g,(_,x)=>x.toUpperCase()))};await listeners.click({target:{closest:()=>el}});};
 render();assert.equal(actionBack(),false);await click({actionKind:'handover'});assert.match(html,/Tap to talk/);
 await click({actionNext:''});assert.ok(notices.includes('Say or type a short update.'));
 listeners.input({target:{id:'action-note',value:'Awaiting a replacement ramp switch. Keep the bus held.'}});
 await click({actionNext:''});assert.equal(actionBack(),true);assert.match(html,/replacement ramp switch/);assert.equal(actionBack(),true);assert.match(html,/What would you like to record/);await click({actionKind:'handover'});assert.match(html,/replacement ramp switch/);await click({actionNext:''});assert.doesNotMatch(html,/data-action-back|← Back/);await click({actionSave:''});assert.match(html,/Connection lost/);assert.match(html,/replacement ramp switch/);assert.equal(actionsBusy(),false);
 fail=false;const pending=click({actionSave:''});assert.equal(actionsBusy(),true);await click({actionSave:''});assert.equal(calls,2);release();await pending;
 assert.equal(state.actions[0].status,'Awaiting review');assert.match(state.actions[0].evidence,/^Shift handover:\nAwaiting a replacement/);assert.equal(state.vehicles[1].status,'Held for review');assert.match(html,/Update sent/);
 page='actions';render();assert.doesNotMatch(html,/data-go="actions\/FT-A-DEMO"/);await click({actionFilter:'Awaiting review'});assert.match(html,/data-go="actions\/FT-A-DEMO"/);page='actions/FT-A-DEMO';render();assert.match(html,/Recorded update/);assert.doesNotMatch(html,/data-action-kind/);
});

test('refresh after a lost response reconciles the saved update without submitting again',async()=>{
 const listeners={};globalThis.document={addEventListener:(k,f)=>listeners[k]=f};globalThis.window={addEventListener:()=>{}};
 const state=seed();state.actions[0].id='lost-response';const garage='demo-north',page='actions/lost-response';let html='',calls=0,evidence='';
 const context=()=>({state,garage,page,me}),render=()=>{html=actionsView(context());};
 setupActions({context,render,notify:()=>{},mutation:async(_action,values)=>{calls++;evidence=values.evidence;throw Object.assign(Error('Refresh the garage and retry.'),{status:409});},reload:async()=>{submitAction(state,'lost-response',evidence);}});
 const click=async dataset=>{const el={dataset,hasAttribute:k=>Object.hasOwn(dataset,k.replace(/^data-/,'').replace(/-([a-z])/g,(_,x)=>x.toUpperCase()))};await listeners.click({target:{closest:()=>el}});};
 await click({actionKind:'work'});listeners.input({target:{id:'action-note',value:'Inspected the ramp wiring.'}});await click({actionNext:''});await click({actionSave:''});assert.match(html,/Get latest records/);
 await click({actionRefresh:''});assert.match(html,/Update sent/);assert.equal(calls,1);assert.equal(state.vehicles[1].status,'Held for review');
});
