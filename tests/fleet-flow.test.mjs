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
 c.page='vehicle/DEMO-302';assert.match(fleetFlowView(c),/Next inspection: Unknown/);assert.match(fleetFlowView(c),/Off road/);
 c.page='history/DEMO-302/faults';assert.doesNotMatch(fleetFlowView(c),/Private south fault/);
 c.page='history/DEMO-302/fault/private-fault';assert.match(fleetFlowView(c),/Record unavailable/);
 c.page='history/DEMO-271/checks';startInspection(state,'DEMO-271','demo-north','Mechanic');assert.match(fleetFlowView(c),/In progress/);
 c.page='history/DEMO-271/maintenance';assert.match(fleetFlowView(c),/History not imported/);
 assert.throws(()=>vehicleValues({id:'bad/id',model:'Bus',registration:'',due:''}));
 assert.throws(()=>vehicleValues({id:'DEMO-901',model:'Bus',registration:'',due:'2026-02-30'}));
 assert.equal(vehicleValues({id:'demo 901',model:'Bus',registration:'',due:''}).due,'');
});

test('guided Add bus preserves entries after a failed save and blocks duplicate submissions',async()=>{
 const listeners={};globalThis.document={addEventListener:(k,f)=>listeners[k]=f};globalThis.window={addEventListener:()=>{}};
 const c={state:seed(),garage:'demo-north',me:{role:'garage_manager'},page:'fleet/new'};let html='',fail=true,calls=0,release;const notices=[],render=()=>{html=fleetFlowView(c);};
 setupFleet({context:()=>c,render,notify:m=>notices.push(m),reload:async()=>{},mutation:async(action,values)=>{assert.equal(action,'vehicle');calls++;if(fail)throw Error('Connection lost');await new Promise(r=>release=r);return saveVehicle(c.state,c.garage,values);}});
 const click=async dataset=>{const el={dataset,hasAttribute:k=>Object.hasOwn(dataset,k.replace(/^data-/,'').replace(/-([a-z])/g,(_,x)=>x.toUpperCase()))};await listeners.click({target:{closest:()=>el}});};
 const input=(field,value)=>listeners.input({target:{id:'fleet-value',dataset:{fleetField:field},value}});
 render();assert.match(html,/Tap to talk/);input('id','DEMO-271');await click({fleetNext:''});assert.ok(notices.includes('This fleet number already exists.'));
 input('id','demo 901');await click({fleetNext:''});await click({fleetSkip:''});await click({fleetModel:'SG271+ demonstration vehicle'});await click({fleetUnknown:''});assert.match(html,/Ready to add this bus/);
 await click({fleetSave:''});assert.match(html,/Connection lost/);assert.match(html,/DEMO-901/);assert.equal(fleetBusy(),false);
 fail=false;const pending=click({fleetSave:''});assert.equal(fleetBusy(),true);await click({fleetSave:''});assert.equal(calls,2);release();await pending;
 const saved=c.state.vehicles.find(v=>v.id==='DEMO-901');assert.equal(saved.status,'Awaiting inspection');assert.equal(saved.warranty,'Unknown');assert.equal(saved.due,'');assert.deepEqual(saved.history,[]);assert.match(html,/Bus added/);
 c.me.role='mechanic';await click({fleetSave:''});assert.equal(calls,2);
});

test('Add bus reconciles a saved bus after a lost response without creating a duplicate',async()=>{
 const listeners={};globalThis.document={addEventListener:(k,f)=>listeners[k]=f};globalThis.window={addEventListener:()=>{}};
 const c={state:seed(),garage:'demo-north',me:{role:'garage_manager'},page:'fleet/new'};const serverState=seed();let html='',calls=0;const render=()=>{html=fleetFlowView(c);};
 setupFleet({context:()=>c,render,notify:()=>{},reload:async()=>{c.state=serverState;},mutation:async(_action,values)=>{calls++;saveVehicle(serverState,c.garage,values);throw Object.assign(Error('Refresh the garage.'),{status:409});}});
 const click=async dataset=>{const el={dataset,hasAttribute:k=>Object.hasOwn(dataset,k.replace(/^data-/,'').replace(/-([a-z])/g,(_,x)=>x.toUpperCase()))};await listeners.click({target:{closest:()=>el}});};
 await click({fleetAnother:''});listeners.input({target:{id:'fleet-value',dataset:{fleetField:'id'},value:'DEMO-902'}});await click({fleetNext:''});await click({fleetSkip:''});await click({fleetModel:'SG271+ demonstration vehicle'});await click({fleetUnknown:''});await click({fleetSave:''});assert.match(html,/Get latest records/);
 await click({fleetRefresh:''});assert.match(html,/Bus added/);assert.equal(calls,1);assert.equal(c.state.vehicles.filter(v=>v.id==='DEMO-902').length,1);
});
