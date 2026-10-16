import test from 'node:test';
import assert from 'node:assert/strict';
import {performanceCommand as command,performanceReport,coverage,saveWarrantyModel,instant,dublinTime,visiblePerformance} from '../src/performance-model.js';
import {performanceView,reportCSV} from '../src/performance-ui.js';
import {editVehicle} from '../src/inspection-admin.js';
const g='north',admin={id:'admin',name:'Manager',role:'garage_manager'},worker={id:'staff',name:'Worker',role:'mechanic'},now=new Date('2026-10-20T12:00:00Z');
const state=()=>({vehicles:[{id:'SG1',garage:g,modelType:'SG',model:'Volvo',warrantyStart:'2025-10-16'}],inspections:[],faults:[],reports:[],actions:[],jobs:[]});
const content=()=>({warrantyModels:[{id:'policy',modelType:'SG',months:12,repairHours:24,reference:'Test terms'}]});
const run=(s,a,v={},id='',c=content(),u=admin)=>command(s,g,u,a,v,id,c,now);
const period=(s,extra={})=>run(s,'downtime_save',{vehicle:'SG1',startedAt:'2026-10-15T00:00',endedAt:'2026-10-17T00:00',reason:'Door repair',changeReason:'Workshop log',...extra}).id;
const report=(s,c=content(),extra={})=>performanceReport(s,g,c,{from:'2026-10-15',to:'2026-10-16',...extra},now);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`);
test('model warranties inherit a start date, extensions include expiry day and never shorten terms',()=>{
 const s=state(),c=content();assert.equal(coverage(s.vehicles[0],c).end,'2026-10-16');
 run(s,'bus_warranty',{warrantyStart:'2025-10-16',warrantyExtendedUntil:'2026-10-16',reference:'Extension letter'},'SG1',c);
 assert.equal(coverage(s.vehicles[0],c).end,'2026-10-17');
 assert.throws(()=>run(s,'bus_warranty',{warrantyStart:'2025-10-16',warrantyExtendedUntil:'2026-10-01',reference:'Invalid'},'SG1',c),/cannot shorten/);
 saveWarrantyModel(c,{modelType:'SG',months:24,repairHours:24,reference:'Revised terms'},'Org admin');assert.equal(coverage(s.vehicles[0],c).end,'2027-10-16');
 assert.throws(()=>saveWarrantyModel(c,{modelType:'SG',months:'',reference:'x'},'x'),/duration/);
 assert.equal(coverage({id:'SG2',modelType:'SG'},c).known,false);
});
test('days and costs split at warranty expiry, manufacturer late time stops at repair, work dates deduplicate',()=>{
 const s=state(),id=period(s);
 run(s,'downtime_manufacturer',{notifiedAt:'2026-10-15T00:00',repairedAt:'2026-10-16T12:00',hours:24,reference:'Manufacturer case',confirm:'yes',changeReason:'Accepted under warranty'},id);
 run(s,'downtime_workday',{date:'2026-10-15',changeReason:'Workshop log'},id);
 s.jobs=[{vehicle:'SG1',garage:g,audit:[{event:'Started',at:instant('2026-10-15T08:00')},{event:'Started',at:instant('2026-10-15T10:00')}]}];
 const r=report(s);close(r.totals.days,2);close(r.totals.covered,1);close(r.totals.outside,1);close(r.totals.unknown,0);close(r.totals.late,.5);assert.equal(r.totals.mechanicDays,1);close(r.totals.cost,467);close(r.totals.lateCost,95);close(r.totals.outsideCost,190);
 const clipped=report(s,content(),{from:'2026-10-16'});close(clipped.totals.days,1);close(clipped.totals.outside,1);close(clipped.totals.mechanicDays,0);close(clipped.totals.late,.5);
 run(s,'downtime_manufacturer_clear',{changeReason:'Incorrect warranty case'},id);assert.equal(report(s).totals.late,0);assert.equal(s.downtime[0].audit.at(-1).event,'Manufacturer case removed');
});
test('unknown coverage is not counted as expired and explicit reassessment preserves earlier basis',()=>{
 const s=state();delete s.vehicles[0].warrantyStart;const id=period(s);assert.equal(report(s).totals.unknown,2);assert.equal(report(s).totals.outside,0);
 run(s,'bus_warranty',{warrantyStart:'2025-10-16',warrantyExtendedUntil:'2026-12-31',reference:'Fleet file'},'SG1');
 assert.equal(report(s).totals.unknown,2);
 run(s,'downtime_reassess',{changeReason:'Fleet dates verified'},id);assert.equal(report(s).totals.covered,2);assert.equal(report(s).totals.unknown,0);assert.equal(s.downtime[0].audit.at(-1).previous.known,false);
});
test('overlaps, future records, cross-garage IDs and staff writes are rejected',()=>{
 const s=state();period(s);
 assert.throws(()=>period(s),/overlapping/);
 assert.throws(()=>period(s,{startedAt:'2026-10-16T23:59',endedAt:'2026-10-18T00:00'}),/overlapping/);
 assert.throws(()=>period(s,{startedAt:'2026-11-01T00:00',endedAt:''}),/future/);
 assert.throws(()=>period(s,{vehicle:'FOREIGN'}),/this garage/);
 assert.throws(()=>run(s,'downtime_rates',{downtime:1,mechanic:2,changeReason:'Forged'},'',content(),worker),/Manager/);
 const hidden=visiblePerformance(s,worker);assert.equal(hidden.downtime[0].rates,undefined);assert.equal(hidden.downtime[0].warrantySnapshot,undefined);assert.equal(hidden.downtime[0].reason,'Door repair');
});
test('repeated same-day absences are separate visits but daily mechanic allowance is charged once',()=>{
 const s=state();period(s,{startedAt:'2026-10-15T08:00',endedAt:'2026-10-15T10:00'});period(s,{startedAt:'2026-10-15T12:00',endedAt:'2026-10-15T14:00'});
 s.jobs=[{vehicle:'SG1',garage:g,audit:[{event:'Started',at:instant('2026-10-15T09:00')},{event:'Started',at:instant('2026-10-15T13:00')}]}];const r=report(s);assert.equal(r.repeatVisits,1);assert.equal(r.totals.visits,2);assert.equal(r.totals.mechanicDays,1);close(r.totals.days,4/24);close(r.rows[0].longest,2/24);
});
test('current episodes cap at now, rates remain snapshots and invalid report ranges fail',()=>{
 const s=state();period(s,{startedAt:'2026-10-20T12:00',endedAt:''});const r=report(s,content(),{from:'2026-10-20',to:'2026-10-25'});close(r.totals.days,1/24);assert.equal(r.offRoad,1);
 run(s,'downtime_rates',{downtime:300,mechanic:100,changeReason:'New allowance'});assert.equal(s.downtime[0].rates.downtime,190);
 assert.throws(()=>report(s,content(),{from:'2026-10-20',to:'2026-10-19'}),/reporting period/);
});
test('Dublin boundaries handle DST and reject ambiguous times, and bus rename retains operations links',()=>{
 assert.equal(instant('2026-10-15T12:00'),'2026-10-15T11:00:00.000Z');assert.equal(dublinTime('2026-12-15T12:00:00Z'),'2026-12-15T12:00');assert.throws(()=>instant('2026-10-25T01:30'),/ambiguous/);assert.throws(()=>instant('2026-03-29T01:30'),/ambiguous/);
 const s=state();period(s);s.jobs=[{vehicle:'SG1',garage:g}];editVehicle(s,g,'SG1',{id:'SG2',model:'Volvo',modelType:'SG'},'Admin');assert.equal(s.downtime[0].vehicle,'SG2');assert.equal(s.jobs[0].vehicle,'SG2');assert.equal(s.vehicles[0].warrantyStart,'2025-10-16');
});
test('dashboard, warranty editor and CSV preserve scope and escape untrusted text',()=>{
 const s=state();period(s);const c={state:s,content:content(),garage:g,organisation:'org',me:admin,garages:[{id:g,name:'North garage'}],page:'performance'};
 assert.match(performanceView(c),/Management visibility/);assert.match(performanceView(c),/North garage/);c.page='performance/warranty/SG1';assert.match(performanceView(c),/Individual extension/);c.me=worker;assert.match(performanceView(c),/Manager access required/);
 const r=report(s);r.rows[0].bus.id='=FORMULA';assert.match(reportCSV(r),/"'=FORMULA"/);
});
test('elapsed reporting respects the 25-hour Dublin autumn clock-change day',()=>{
 const s=state(),c=content(),later=new Date('2026-11-01T12:00:00Z');
 command(s,g,admin,'downtime_save',{vehicle:'SG1',startedAt:'2026-10-25T00:00',endedAt:'2026-10-26T00:00',reason:'Repair',changeReason:'Shift log'},'',c,later);
 const r=performanceReport(s,g,c,{from:'2026-10-25',to:'2026-10-25'},later);close(r.totals.days,25/24);close(r.totals.cost,190*25/24);
});
