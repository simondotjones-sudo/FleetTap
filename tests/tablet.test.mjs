import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/model.js';
import {startInspection,saveAnswer,readings} from '../src/inspections.js';
import {taskCopy,available,firstPending,resultStep,needsInstruction,draftFor,setupTablet,tabletView,tabletBack,isTabletSaving} from '../src/tablet.js';
test('tablet requires reasons and readings before save; excludes blocked tasks',()=>{
 assert.equal(available.length,124);assert.ok(available.every(t=>!t.blocked));
 for(const t of available){assert.equal(resultStep(t,'Defect'),'reason');assert.equal(resultStep(t,'Not completed'),'reason');assert.equal(resultStep(t,'Not due'),'history');assert.equal(resultStep(t,'OK'),readings[t.id]?.length?'reading':'save');}
});
test('save failure retains answer and position; retry advances; failed start recovers',async()=>{
 const listeners={},caption={textContent:'OK'},classes=[];const feedback={querySelector:()=>caption,setAttribute:()=>{},removeAttribute:()=>{},classList:{add:name=>classes.push(name)}};globalThis.document={addEventListener:(k,f)=>listeners[k]=f,querySelector:()=>feedback};globalThis.window={addEventListener:()=>{}};
 const state=seed(),i=startInspection(state,'DEMO-271','demo-north','Mechanic');
 const n=available.findIndex(t=>!readings[t.id]?.length&&!needsInstruction(t)),t=available[n];
 let page=`inspection/${i.id}/item/${n}`,fail=true,renders=0,notices=[],screens=[];
 const context=()=>({state,garage:'demo-north',page});
 setupTablet({context,render:()=>{renders++;screens.push(tabletView(context()));},go:p=>page=p,notify:m=>notices.push(m),reload:async()=>{},mutation:async(action,values,extra)=>{if(fail)throw Object.assign(new Error('Connection lost'),{status:503});return saveAnswer(state,extra.id,'demo-north',extra.item,{...values,worker:'Mechanic'});}});
 const click=async(dataset)=>{const el={dataset,hasAttribute:k=>Object.hasOwn(dataset,k.replace(/^data-/,'').replace(/-([a-z])/g,(_,x)=>x.toUpperCase())),closest:()=>true};await listeners.click({target:{closest:()=>el}});};
 await click({result:'OK'});assert.equal(page,`inspection/${i.id}/item/${n}`);assert.equal(i.answers[t.id],undefined);assert.equal(draftFor(i,t).result,'OK');assert.equal(isTabletSaving(),false);assert.match(tabletView(context()),/Not saved yet/);
 assert.ok(!classes.includes('tap-save-success'));assert.ok(!screens.some(s=>s.includes('saved-screen')));fail=false;await click({workRetry:''});assert.equal(i.answers[t.id].result,'OK');assert.equal(page,`inspection/${i.id}/item/${n+1}`);assert.ok(notices.includes('Saved ✓'));assert.ok(classes.includes('tap-save-success'));assert.equal(caption.textContent,'OK ✓');assert.ok(!screens.some(s=>s.includes('saved-screen')));assert.equal(firstPending(i),0);
 fail=true;page='vehicle/DEMO-271';const before=renders;await click({workStart:'DEMO-271'});assert.equal(isTabletSaving(),false);assert.ok(renders>=before+2);assert.match(tabletView(context()),/Resume your check/);
});

test('reference codes follow instruction button and OK is last',()=>{
 const state=seed(),i=startInspection(state,'DEMO-271','demo-north','Mechanic'),n=available.findIndex(t=>t.id==='2-3'),t=available[n],copy=taskCopy(t);
 assert.ok(!copy.text.includes('SAP Code'));assert.ok(!copy.text.includes('S.I.'));assert.ok(copy.refs.some(r=>r.includes('138071')));
 const html=tabletView({state,garage:'demo-north',page:`inspection/${i.id}/item/${n}`});
 assert.ok(html.indexOf('View instruction')<html.indexOf('138071'));
 assert.ok(html.indexOf('data-result="OK"')>html.indexOf('data-result="Not due"'));
 assert.ok(html.indexOf('data-result="OK"')>html.indexOf('data-result="Defect"'));
 assert.ok(taskCopy({text:'Adjust valve (inlet 0.40 mm) [S.I. - 294].'}).text.includes('(inlet 0.40 mm)'));
});
test('question hides instruction citations while retaining measurements and follow-on tasks',()=>{
 const ride=available.find(t=>t.id==='6-5'),steering=available.find(t=>t.id==='4-8'),extinguisher=available.find(t=>t.id==='16-1');
 assert.ok(!taskCopy(ride).text.includes('issued'));assert.ok(taskCopy(ride).text.includes('233 - 241 mm'));assert.ok(ride.text.includes('S.I. 335'));
 assert.ok(taskCopy(steering).text.includes('Spray slit at bottom'));assert.ok(!taskCopy(steering).text.includes('Standard Instruction'));
 assert.ok(taskCopy(extinguisher).text.includes('5 years or more, replace'));assert.ok(taskCopy(extinguisher).text.includes('spring balance'));
});


test('floating Back preserves inspection drafts and returns from instructions and reading steps',()=>{
 globalThis.document={addEventListener:()=>{}};globalThis.window={addEventListener:()=>{}};
 const state=seed(),i=startInspection(state,'DEMO-271','demo-north','Mechanic'),n=1,t=i.templateSnapshot.tasks.filter(t=>!t.blocked)[n];t.requiresAcknowledgement=true;
 let page=`inspection/${i.id}/item/${n}`;const context=()=>({state,garage:'demo-north',page});
 setupTablet({context,render:()=>{},go:p=>page=p});
 const d=draftFor(i,t);d.step='instruction';assert.equal(d.ack,false);assert.equal(tabletBack(),true);assert.equal(d.step,'question');assert.equal(d.ack,true);
 d.step='reading';d.field=1;d.readings=['12','24'];d.notes='Keep my note';d.dirty=true;
 assert.equal(tabletBack(),true);assert.equal(d.field,0);assert.deepEqual(d.readings,['12','24']);assert.equal(d.notes,'Keep my note');
 assert.equal(tabletBack(),true);assert.equal(d.step,'question');assert.equal(d.dirty,true);
 assert.equal(tabletBack(),true);assert.equal(page,`inspection/${i.id}/item/${n-1}`);
 page=`inspection/${i.id}/sections`;assert.equal(tabletBack(),false);
 page=`inspection/${i.id}/review`;assert.equal(tabletBack(),false);
 page='home';assert.equal(tabletBack(),false);
});
