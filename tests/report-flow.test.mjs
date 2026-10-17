import test from 'node:test';
import assert from 'node:assert/strict';
import {setupReportFlow,reportFlowView,newReportDraft,recordValues,reportBusy,reportBack} from '../src/report-flow.js';
import {seed,addRecord,savedRecordRequest} from '../src/model.js';
test('record values require a description and fault vehicle; request identity is stable',()=>{
 const d=newReportDraft('faults');d.type='Brakes';assert.throws(()=>recordValues(d));d.description='Damaged';assert.throws(()=>recordValues(d));d.vehicle='DEMO-271';assert.equal(recordValues(d).requestId,recordValues(d).requestId);assert.equal(recordValues(d).title,'Brakes · Damaged');
});
test('guided fault flow with location details retains draft on lost response and retries without duplicate record',async()=>{
 const listeners={};globalThis.document={addEventListener:(k,f)=>listeners[k]=f};globalThis.window={addEventListener:()=>{}};
 let page='faults',html='',loseResponse=true,calls=0;const state=seed(),garage='demo-north',notices=[];const context=()=>({page,state,garage,me:{id:'worker',role:'mechanic'}});const render=()=>{html=reportFlowView(context());};
 setupReportFlow({context,render,notify:s=>notices.push(s),records:()=>{},reload:async()=>{},mutation:async(action,values,{kind})=>{
  calls++;const prior=savedRecordRequest(state,kind,garage,'worker',values.requestId);const r=prior||addRecord(state,kind,{...values,garage,createdBy:'worker'});if(loseResponse){loseResponse=false;throw Error('Connection lost');}return r;
 }});render();assert.match(html,/What needs attention/);assert.equal(reportBack(),false);
 const click=async dataset=>{const el={dataset,hasAttribute:k=>Object.hasOwn(dataset,k.replace(/^data-/,'').replace(/-([a-z])/g,(_,x)=>x.toUpperCase()))};await listeners.click({target:{closest:()=>el}});};
 await click({reportType:'Brakes'});assert.match(html,/Which bus/);await click({reportBus:'DEMO-315'});assert.ok(notices.includes('Choose a bus in this garage.'));
 await click({reportBus:'DEMO-271'});await click({reportSymptom:'Damaged'});assert.match(html,/Where is the problem/);await click({reportNext:''});assert.ok(notices.includes('Say or type a short description.'));listeners.input({target:{id:'report-text',dataset:{reportField:'description'},value:'Nearside front brake hose is damaged.'}});await click({reportNext:''});await click({reportResponse:'Reported to supervisor'});await click({reportResponse:'Stopped using equipment'});await click({reportNext:''});await click({reportNext:''});assert.match(html,/Ready to send/);assert.match(html,/Damaged/);
 assert.equal(reportBack(),true);assert.match(html,/Add photos/);await click({reportNext:''});
 await click({reportEdit:'description'});assert.match(html,/Nearside front brake hose is damaged/);assert.equal(reportBack(),true);assert.match(html,/Ready to send/);
 await click({reportEdit:'type'});assert.equal(reportBack(),true);assert.match(html,/Ready to send/);assert.doesNotMatch(html,/data-report-back|← Back/);
 const before=state.faults.length;await click({reportSave:''});assert.equal(reportBusy(),false);assert.match(html,/Connection lost/);assert.match(html,/Damaged/);await click({reportSave:''});assert.match(html,/Fault saved/);assert.equal(state.faults.length,before+1);assert.equal(calls,2);assert.equal(reportBack(),false);
 const saved=state.faults[0];assert.equal(savedRecordRequest(state,'faults',garage,'other',saved.requestId),null);assert.equal(savedRecordRequest(state,'faults','demo-south','worker',saved.requestId),null);
 page='report';render();await click({reportType:'Near miss'});await click({reportBus:''});assert.match(html,/Tell us what happened/);assert.match(html,/Tap to talk/);await click({reportNext:''});assert.ok(notices.includes('Say or type a short description.'));
 listeners.input({target:{id:'report-text',dataset:{reportField:'description'},value:'A tool fell beside the workbench.'}});await click({reportNext:''});await click({reportResponse:'Area made safe'});await click({reportNext:''});await click({reportNext:''});await click({reportSave:''});assert.equal(state.reports[0].description,'A tool fell beside the workbench.');assert.equal(state.reports[0].vehicle,'');assert.match(html,/Report saved/);
});
