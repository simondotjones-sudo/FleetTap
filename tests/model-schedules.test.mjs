import test from 'node:test';
import assert from 'node:assert/strict';
import {fleetModels,vehicleModelType} from '../src/fleet-models.js';
import {saveVehicle} from '../src/inspections.js';
import {editVehicle} from '../src/inspection-admin.js';
import {saveSchedule,scheduleStatus,individualSchedule,modelSchedule} from '../src/scheduling.js';
import {fleetFlowView} from '../src/fleet-flow.js';
import {adminToolsView} from '../src/admin-tools.js';
import {scheduleRows,scheduleValues,schedulePreview,setupScheduleUI} from '../src/schedule-ui.js';
const garage='north',actor='Verified manager';
const seed=()=>({vehicles:[{id:'SG271',garage,model:'Existing bus description'},{id:'SG621',garage,model:'Existing bus description'},{id:'PA1',garage,model:'Hybrid'},{id:'SG271',garage:'south',model:'Other garage'}],inspections:[],faults:[],actions:[],reports:[]});
const rule=(s,extra={})=>saveSchedule(s,garage,{scope:'model',modelType:'SG',interval:1,unit:'months',basis:'history',firstDue:'2026-10-31',...extra},actor);
const complete=(s,vehicle,completedDate,extra={})=>s.inspections.push({id:crypto.randomUUID(),garage,vehicle,templateId:'pm3',status:'Completed',completedDate,completedAt:completedDate+'T12:00:00Z',...extra});

test('catalogue preserves all 12 supplied prefixes, deterministic legacy inference and explicit overrides',()=>{
 assert.deepEqual(fleetModels.map(m=>m.id),['AX','EV','EA','VG','VT','GT','SG','AH','PA','WS','EW','WH']);
 for(const id of ['SG271','sg 621','SG-621'])assert.equal(vehicleModelType({id}),'SG');
 assert.equal(vehicleModelType({id:'SGA1'}),'');
 assert.equal(vehicleModelType({id:'DEMO-271',model:'SG271+ demonstration vehicle'}),'SG');
 assert.equal(vehicleModelType({id:'SG271',modelType:'PA'}),'PA');
 assert.equal(vehicleModelType({id:'SG271',modelType:''}),'');
 const s=seed();assert.throws(()=>saveVehicle(s,garage,{id:'NEW1',model:'Bus',modelType:'INVALID'}),/catalogue/);
 assert.throws(()=>editVehicle(s,garage,'SG271',{id:'SG271',model:'Bus',modelType:'INVALID'},actor),/catalogue/);
 assert.equal(s.vehicles[0].model,'Existing bus description');
});

test('model rule reaches current and future matching buses, preserves separate histories and garage scope',()=>{
 const s=seed();complete(s,'SG271','2026-01-31');complete(s,'SG621','2026-02-05');
 assert.equal(rule(s).count,2);
 assert.equal(scheduleStatus(s,garage,'SG271').due,'2026-02-28');
 assert.equal(scheduleStatus(s,garage,'SG621').due,'2026-03-05');
 assert.equal(scheduleStatus(s,garage,'PA1').due,'');
 assert.equal(scheduleStatus(s,'south','SG271').due,'');
 saveVehicle(s,garage,{id:'SG999',model:'Bus'});
 assert.equal(scheduleStatus(s,garage,'SG999').due,'2026-10-31');
 assert.equal(scheduleStatus(s,garage,'SG999').source,'model');
 rule(s,{interval:3});assert.equal(scheduleStatus(s,garage,'SG999').schedule.interval,3);
 const i=s.inspections[0];i.deletedAt='2026-10-15';assert.equal(scheduleStatus(s,garage,'SG271').due,'2026-10-31');
 delete i.deletedAt;i.status='Awaiting review';assert.equal(scheduleStatus(s,garage,'SG271').due,'2026-10-31');
 i.status='In progress';assert.equal(scheduleStatus(s,garage,'SG271').due,'2026-10-31');
 assert.equal(scheduleStatus(s,'south','SG999').schedule,null);
});

test('individual exceptions, pause, model replacement and return to inheritance retain audit and evidence',()=>{
 const s=seed();saveSchedule(s,garage,{vehicle:'SG271',interval:2,unit:'months',lastDate:'2026-01-31',reference:'Service book'},actor);
 rule(s);assert.equal(scheduleStatus(s,garage,'SG271').due,'2026-03-31');
 assert.equal(scheduleStatus(s,garage,'SG271').source,'bus');
 rule(s,{replaceOverrides:true});assert.equal(scheduleStatus(s,garage,'SG271').due,'2026-02-28');
 assert.equal(individualSchedule(s,garage,'SG271'),undefined);
 assert.equal(s.schedules[0].audit.at(-1).previous.reference,'Service book');
 saveSchedule(s,garage,{vehicle:'SG271',interval:1,unit:'weeks',firstDue:'2026-10-31',enabled:false},actor);
 assert.equal(scheduleStatus(s,garage,'SG271').status,'Paused');
 rule(s,{replaceOverrides:false});assert.equal(scheduleStatus(s,garage,'SG271').status,'Paused');
 saveSchedule(s,garage,{operation:'inherit',vehicle:'SG271'},actor);
 assert.equal(scheduleStatus(s,garage,'SG271').source,'model');
 rule(s,{enabled:false});assert.equal(scheduleStatus(s,garage,'SG621').status,'Paused');
 assert.equal(scheduleStatus(s,garage,'SG621').due,'');
 assert.doesNotThrow(()=>JSON.stringify(s));
});

test('first-due model rules advance only with subsequent valid completed inspections and survive interval edits',()=>{
 const s=seed();complete(s,'SG271','2026-01-01');rule(s,{basis:'first'});
 assert.equal(scheduleStatus(s,garage,'SG271').due,'2026-10-31');
 complete(s,'SG271','2026-10-30',{completedAt:'2099-01-01T00:00:00Z'});
 assert.equal(scheduleStatus(s,garage,'SG271').due,'2026-11-30');
 rule(s,{basis:'first',interval:3});assert.equal(scheduleStatus(s,garage,'SG271').due,'2027-01-30');
 saveSchedule(s,garage,{vehicle:'SG271',interval:2,unit:'months',basis:'first',firstDue:'2026-10-31'},actor);
 assert.equal(scheduleStatus(s,garage,'SG271').due,'2026-12-30');
 rule(s,{basis:'first',interval:1,firstDue:'2026-12-01'});
 // Completion dates and first-due precedence remain independent for the other bus.
 assert.equal(scheduleStatus(s,garage,'SG621').due,'2026-12-01');
});

test('empty model rules, changing class and renaming keep rules attached to the correct buses',()=>{
 const s=seed();assert.equal(rule(s,{modelType:'EW'}).count,0);
 saveVehicle(s,garage,{id:'CUSTOM',model:'Electric bus',modelType:'EW'});
 assert.equal(scheduleStatus(s,garage,'CUSTOM').source,'model');
 editVehicle(s,garage,'CUSTOM',{id:'EW10',model:'Electric bus',modelType:'EW'},actor);
 assert.equal(scheduleStatus(s,garage,'EW10').source,'model');
 editVehicle(s,garage,'EW10',{id:'EW10',model:'Custom',modelType:''},actor);
 assert.equal(scheduleStatus(s,garage,'EW10').source,'');
 assert.throws(()=>rule(s,{modelType:'NO'}),/catalogue/);
 assert.throws(()=>saveSchedule(s,garage,{vehicle:'PRIVATE',operation:'inherit'},actor),/garage/);
 const before=JSON.stringify(s);assert.throws(()=>rule(s,{firstDue:'2026-02-30',replaceOverrides:true}),/date/);assert.equal(JSON.stringify(s),before);
});

test('whole-garage schedules are scoped on the server and older individual requests still work',()=>{
 const s=seed();saveSchedule(s,garage,{scope:'all',vehicles:['PRIVATE'],interval:4,unit:'weeks',firstDue:'2026-10-31'},actor);
 assert.equal(s.schedules.length,3);assert.ok(s.schedules.every(r=>r.garage===garage));
 assert.throws(()=>saveSchedule(s,'south',{vehicles:['SG621'],interval:1,unit:'months',firstDue:'2026-10-31'},actor),/garage/);
 saveSchedule(s,garage,{vehicles:['SG271','PA1'],interval:1,unit:'months',lastDate:'2026-01-31',reference:'Workshop register'},actor);
 assert.equal(scheduleStatus(s,garage,'PA1').due,'2026-02-28');
});

test('Fleet opens on Overview, Schedules opens on the list, and model controls remain garage-scoped',()=>{
 const c={state:seed(),garage,me:{role:'garage_manager'},page:'fleet'};rule(c.state);
 const html=fleetFlowView(c);assert.match(html,/<h1>Fleet overview<\/h1>/);assert.doesNotMatch(html,/<p>Fleet<\/p>/);assert.match(html,/data-go="fleet" aria-pressed="true">Overview/);
 c.page='fleet/list';assert.match(fleetFlowView(c),/<h1>Choose a bus/);
 c.page='fleet/models';assert.match(fleetFlowView(c),/>SG</);assert.match(fleetFlowView(c),/Show all models/);assert.doesNotMatch(fleetFlowView(c),/>AX</);
 c.page='fleet/model/SG';assert.doesNotMatch(fleetFlowView(c),/PA1|Other garage/);
 c.page='schedules';let schedules=adminToolsView(c);assert.doesNotMatch(schedules,/Create schedule/);c.me.role='organisation_admin';schedules=adminToolsView(c);assert.match(schedules,/Create schedule/);assert.doesNotMatch(schedules,/data-admin-form="schedule"|<p>Administration<\/p>/);assert.match(schedules,/SG model/);
 c.page='schedules/new';assert.match(adminToolsView(c),/data-admin-form="schedule"/);
 c.page='schedules/model/SG';assert.match(adminToolsView(c),/Future SG buses inherit/);
 c.page='schedules/vehicle/SG271';assert.match(adminToolsView(c),/Saving here creates an individual exception/);
 c.me.role='mechanic';assert.match(adminToolsView(c),/Administrator access required/);
});

test('schedule list paginates and filters model/status/search without exposing another garage',()=>{
 const s=seed();for(let n=1;n<=55;n++)saveVehicle(s,garage,{id:'AX'+n,model:'Bus'});
 const c={state:s,garage:'filter-test',page:'schedules',me:{role:'garage_manager'}};
 for(const v of s.vehicles)if(v.garage===garage)v.garage=c.garage;
 let html='',focus='';const listeners={};globalThis.document={addEventListener:(type,fn)=>listeners[type]=fn,querySelector:()=>({focus(){focus='yes';},setSelectionRange(){}})};
 setupScheduleUI({context:()=>c,render:()=>{html=adminToolsView(c);}},()=>false);
 html=adminToolsView(c);assert.match(html,/1–25 of 58 buses/);
 listeners.change({target:{dataset:{scheduleFilter:'model'},value:'AX'}});assert.match(html,/1–25 of 55 buses/);assert.equal(focus,'yes');
 const b={dataset:{schedulePage:'1'}};listeners.click({target:{closest:()=>b}});assert.match(html,/26–50 of 55 buses/);
 listeners.input({target:{dataset:{scheduleFilter:'query'},value:'AX55',selectionStart:4}});assert.match(html,/1–1 of 1 buses/);assert.doesNotMatch(html,/SG271/);
 assert.equal(scheduleRows(c).length,58);
 delete globalThis.document;
});

test('schedule form preview uses bus histories and builds a validated model command',()=>{
 const s=seed();complete(s,'SG271','2026-01-31');complete(s,'SG621','2026-02-05');
 const values={scope:'model',modelType:'SG',vehicle:'',interval:'1',unit:'months',basis:'history',date:'2026-10-31',reference:'',enabled:'on',replaceOverrides:'on'};
 const elements=Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value,checked:value==='on',removeAttribute(){}}]));
 const nodes=new Map();const form={elements,querySelector:selector=>{if(!nodes.has(selector))nodes.set(selector,{firstChild:{textContent:''}});return nodes.get(selector);},querySelectorAll:()=>[]};
 const original=JSON.stringify(s);schedulePreview(form,{state:s,garage});assert.equal(JSON.stringify(s),original);assert.match(nodes.get('[data-schedule-preview]').textContent,/28 Feb 2026 – 5 Mar 2026/);
 assert.match(nodes.get('[data-schedule-coverage]').textContent,/2 buses in this garage selected/);
 const command=scheduleValues(values);saveSchedule(s,garage,command,actor);
 assert.equal(modelSchedule(s,garage,'SG').basis,'history');assert.equal(scheduleStatus(s,garage,'SG621').due,'2026-03-05');
 elements.scope.value='bus';elements.vehicle.value='PA1';schedulePreview(form,{state:s,garage});assert.equal(elements.modelType.disabled,true);assert.equal(elements.vehicle.required,true);
 elements.date.value='2026-02-30';schedulePreview(form,{state:s,garage});assert.match(nodes.get('[data-schedule-preview]').textContent,/valid date/);
});
