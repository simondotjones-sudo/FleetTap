import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/model.js';
import {startInspection,saveAnswer,readings} from '../src/inspections.js';
import {available,firstPending,resultStep,needsInstruction,draftFor,setupTablet,tabletView,isTabletSaving} from '../src/tablet.js';
test('tablet requires reasons and readings before save; excludes blocked tasks',()=>{
 assert.equal(available.length,124);assert.ok(available.every(t=>!t.blocked));
 for(const t of available){assert.equal(resultStep(t,'Defect'),'reason');assert.equal(resultStep(t,'Not completed'),'reason');assert.equal(resultStep(t,'Not due'),'history');assert.equal(resultStep(t,'OK'),readings[t.id]?.length?'reading':'save');}
});
test('save failure retains answer and position; retry advances; failed start recovers',async()=>{
 const listeners={};globalThis.document={addEventListener:(k,f)=>listeners[k]=f};globalThis.window={addEventListener:()=>{}};
 const state=seed(),i=startInspection(state,'DEMO-271','demo-north','Mechanic');
 const n=available.findIndex(t=>!readings[t.id]?.length&&!needsInstruction(t)),t=available[n];
 let page=`inspection/${i.id}/item/${n}`,fail=true,renders=0,notices=[];
 const context=()=>({state,garage:'demo-north',page});
 setupTablet({context,render:()=>renders++,go:p=>page=p,notify:m=>notices.push(m),reload:async()=>{},mutation:async(action,values,extra)=>{if(fail)throw Object.assign(new Error('Connection lost'),{status:503});return saveAnswer(state,extra.id,'demo-north',extra.item,{...values,worker:'Mechanic'});}});
 const click=async(dataset)=>{const el={dataset,hasAttribute:k=>Object.hasOwn(dataset,k.replace(/^data-/,'').replace(/-([a-z])/g,(_,x)=>x.toUpperCase())),closest:()=>true};await listeners.click({target:{closest:()=>el}});};
 await click({result:'OK'});assert.equal(page,`inspection/${i.id}/item/${n}`);assert.equal(i.answers[t.id],undefined);assert.equal(draftFor(i,t).result,'OK');assert.equal(isTabletSaving(),false);assert.match(tabletView(context()),/Not saved yet/);
 fail=false;await click({workRetry:''});assert.equal(i.answers[t.id].result,'OK');assert.equal(page,`inspection/${i.id}/item/${n+1}`);assert.ok(notices.includes('Saved ✓'));assert.equal(firstPending(i),0);
 fail=true;page='vehicle/DEMO-271';const before=renders;await click({workStart:'DEMO-271'});assert.equal(isTabletSaving(),false);assert.ok(renders>=before+2);assert.match(tabletView(context()),/What are you doing/);
});
