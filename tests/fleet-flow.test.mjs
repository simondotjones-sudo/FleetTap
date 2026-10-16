import test from 'node:test';
import assert from 'node:assert/strict';
import {fleetFlowView,setupFleet,fleetBusy,vehicleValues} from '../src/fleet-flow.js';
import {seed} from '../src/model.js';
import {saveVehicle,startInspection} from '../src/inspections.js';

test('Fleet navigation and history retain garage scope, unknown dates and manager-only creation',()=>{
 const state=seed(),c={state,garage:'demo-north',me:{role:'mechanic'},page:'fleet'};
 state.faults.push({id:'private-fault',garage:'demo-south',vehicle:'DEMO-302',title:'Private south fault',status:'Open'});
 assert.doesNotMatch(fleetFlowView(c),/DEMO-315|Add bus/);
 c.page='fleet/new';assert.match(fleetFlowView(c),/Manager access required/);
 c.page='vehicle/DEMO-315';assert.match(fleetFlowView(c),/Bus unavailable/);
 c.page='vehicle/DEMO-302';assert.match(fleetFlowView(c),/Next inspection: Unknown/);assert.match(fleetFlowView(c),/Unavailable for service/);
 c.page='history/DEMO-302/faults';assert.doesNotMatch(fleetFlowView(c),/Private south fault/);
 c.page='history/DEMO-302/fault/private-fault';assert.match(fleetFlowView(c),/Record unavailable/);
 c.page='history/DEMO-271/checks';startInspection(state,'DEMO-271','demo-north','Mechanic');assert.match(fleetFlowView(c),/In progress/);
 c.page='history/DEMO-271/maintenance';assert.match(fleetFlowView(c),/History not imported/);
 assert.throws(()=>vehicleValues({id:'bad/id',model:'Bus',registration:'',due:''}));
 assert.throws(()=>vehicleValues({id:'DEMO-901',model:'Bus',registration:'',due:'2026-02-30'}));
 assert.equal(vehicleValues({id:'demo 901',model:'Bus',registration:'',due:''}).due,'');
});

function harness(c,mutation,reload=async()=>{}){
 const listeners={};globalThis.document={addEventListener:(k,f)=>listeners[k]=f};globalThis.window={addEventListener:()=>{}};
 const messages=[],button={disabled:false},error={textContent:''};
 setupFleet({context:()=>c,mutation,reload,render:()=>{},go:p=>c.page=p,notify:m=>messages.push(m)});
 const form={hasAttribute:k=>k==='data-fleet-create',querySelector:s=>s==='.form-error'?error:button};
 const NativeFormData=globalThis.FormData;globalThis.FormData=class{constructor(){return new Map(Object.entries({id:'DEMO-901',registration:'',modelType:'SG',model:'',due:''}));}};
 return {submit:()=>listeners.submit({target:form,preventDefault(){}}),error,button,messages,restore:()=>globalThis.FormData=NativeFormData};
}
test('compact Add bus retains the form after failure and prevents duplicate submissions',async()=>{
 const c={state:seed(),garage:'demo-north',me:{role:'garage_manager'},page:'fleet/new'};let fail=true,calls=0,release;
 const h=harness(c,async(action,values)=>{assert.equal(action,'vehicle');calls++;if(fail)throw Error('Connection lost');await new Promise(r=>release=r);return saveVehicle(c.state,c.garage,values);});
 try{
  const html=fleetFlowView(c);assert.match(html,/Fleet number/);assert.match(html,/Inspection planning/);assert.doesNotMatch(html,/Ready to add this bus|Step [0-9]/);
  await h.submit();assert.equal(h.error.textContent,'Connection lost');assert.equal(c.page,'fleet/new');assert.equal(fleetBusy(),false);
  fail=false;const pending=h.submit();assert.equal(fleetBusy(),true);assert.equal(h.button.disabled,true);await h.submit();assert.equal(calls,2);release();await pending;
  const saved=c.state.vehicles.find(v=>v.id==='DEMO-901');assert.equal(saved.status,'Awaiting inspection');assert.equal(saved.warranty,'Unknown');assert.equal(saved.due,'');assert.deepEqual(saved.history,[]);assert.equal(c.page,'vehicle/DEMO-901');
  c.me.role='mechanic';await h.submit();assert.equal(calls,2);
 }finally{h.restore();}
});
test('Add bus reconciles a saved bus after a lost response without creating a duplicate',async()=>{
 const c={state:seed(),garage:'demo-north',me:{role:'garage_manager'},page:'fleet/new'},server=seed();let calls=0;
 const h=harness(c,async(_action,values)=>{calls++;saveVehicle(server,c.garage,values);throw Object.assign(Error('Refresh the garage.'),{status:409});},async()=>c.state=server);
 try{await h.submit();assert.equal(c.page,'vehicle/DEMO-901');assert.equal(calls,1);assert.equal(c.state.vehicles.filter(v=>v.id==='DEMO-901').length,1);assert.match(h.messages[0],/saved/);}finally{h.restore();}
});
