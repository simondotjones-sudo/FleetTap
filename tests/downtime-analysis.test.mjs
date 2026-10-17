import test from 'node:test';
import assert from 'node:assert/strict';
import {downtimeAnalysis,downtimePeriod,downtimeCSV,ageBand} from '../src/downtime-analysis.js';
import {downtimeAttribution} from '../src/downtime-attribution.js';
import {performanceCommand,instant,performanceReport} from '../src/performance-model.js';
import {downtimeView,downtimeParams} from '../src/downtime-ui.js';
const now=new Date('2026-10-17T12:00:00Z'),g='north',manager={id:'manager',role:'garage_manager',name:'Manager'};
const tasks=[{id:'door',section:'Doors',number:'1',text:'Check door operation'},{id:'brake',section:'Brakes',number:'1',text:'Check brakes'},{id:'blocked',section:'Blocked',number:'1',text:'Unapproved',blocked:true}];
const base=()=>({vehicles:[{id:'SG1',garage:g,modelType:'SG'},{id:'SG2',garage:g,modelType:'SG'},{id:'EW1',garage:g,modelType:'EW'},{id:'FOREIGN',garage:'south',modelType:'SG'}],downtime:[],faults:[],inspections:[],jobs:[],inspectionTemplate:{id:'pm3',version:1,tasks}});
const add=(s,id,bus,start,end,extra={})=>s.downtime.push({id,garage:g,vehicle:bus,startedAt:instant(start),endedAt:end?instant(end):null,reason:'Repair '+id,rates:{downtime:240,mechanic:87},...extra});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const report=(s,f={})=>downtimeAnalysis(s,g,{from:'2026-08-01',to:'2026-09-30',...f},now);
test('completed-month presets cross years and partial months are explicitly labelled',()=>{
 assert.deepEqual(downtimePeriod(6,now),{from:'2026-04-01',to:'2026-09-30'});
 assert.deepEqual(downtimePeriod(12,new Date('2026-01-10T00:00:00Z')),{from:'2025-01-01',to:'2025-12-31'});
 const s=base(),r=report(s,{from:'2026-08-10',to:'2026-10-31'});assert.deepEqual(r.trend.map(x=>x.complete),[false,true,false]);assert.equal(r.comparison,null);assert.equal(r.totals.average,null);
 assert.equal(downtimeParams('performance/downtime?view=bad&group=bad',now).view,'chart');
 assert.throws(()=>report(s,{from:'bad'}),/date range/);assert.throws(()=>report(s,{from:'2020-01-01'}),/36 months/);assert.throws(()=>report(s,{month:'2026-10'}),/within/);assert.throws(()=>report(s,{component:'invented'}),/component/);
});
test('spanning episodes split hours and rates across months, with distinct overall episode counts',()=>{
 const s=base();add(s,'span','SG1','2026-08-31T12:00','2026-09-02T12:00',{downtimeKind:'unplanned',component:'doors'});
 add(s,'planned','EW1','2026-09-04T00:00','2026-09-05T00:00',{downtimeKind:'planned',component:'brakes',rates:{downtime:480}});
 const r=report(s);assert.deepEqual(r.trend.map(m=>m.hours),[12,60]);assert.equal(r.totals.episodes,2);assert.deepEqual(r.trend.map(m=>m.episodes),[1,2]);close(r.totals.cost,960);close(r.trend.reduce((n,m)=>n+m.cost,0),r.totals.cost);assert.equal(r.components[0].id,'doors');close(r.totals.average,36);
 const clipped=report(s,{month:'2026-09'});assert.equal(clipped.totals.hours,60);close(clipped.totals.average,36);assert.equal(clipped.trend[0].hours,12);
 const old=performanceReport(s,g,{}, {from:'2026-08-01',to:'2026-09-30'},now);close(r.totals.hours,old.totals.days*24);close(r.totals.cost,old.totals.downtimeCost);
});
test('completed means ended in the period and uses full duration; ongoing age ignores chart dates',()=>{
 const s=base();add(s,'earlier','SG1','2026-07-30T00:00','2026-08-02T00:00');add(s,'open','SG2','2026-10-01T13:00','');
 const r=report(s);close(r.totals.hours,24);close(r.totals.average,72);assert.equal(r.open.length,1);close(r.open[0].age,16*24);assert.equal(r.aging.find(b=>b.id==='7plus').count,1);
 assert.equal(report(s,{age:'under1'}).open.length,0);assert.equal(report(s,{bus:'SG1'}).open.length,0);assert.equal(report(s,{month:'2026-09'}).open.length,1);
 assert.deepEqual([23.9,24,72,168].map(ageBand),['under1','1to3','3to7','7plus']);
});
test('Dublin clock changes count real elapsed hours and future/invalid records are excluded',()=>{
 const s=base();add(s,'spring','SG1','2026-03-29T00:00','2026-03-30T00:00');
 assert.equal(report(s,{from:'2026-03-29',to:'2026-03-29'}).totals.hours,23);
 add(s,'autumn','SG2','2026-10-25T00:00','2026-10-26T00:00');assert.equal(downtimeAnalysis(s,g,{from:'2026-10-25',to:'2026-10-25'},new Date('2026-11-01')).totals.hours,25);
 const before=report(s,{from:'2026-10-01',to:'2026-11-30'});assert.equal(before.totals.hours,0);assert.equal(before.invalid,1);
 s.downtime.push({id:'invalid',garage:g,vehicle:'SG1',startedAt:'bad'});assert.equal(report(s).invalid,2);
});
test('garage, bus, void and component/type/part/question filters cannot leak or double-count causes',()=>{
 const s=base();add(s,'door','SG1','2026-09-01T00:00','2026-09-02T00:00',{component:'doors',downtimeKind:'unplanned',part:' Door  Actuator ',questionId:'door'});
 add(s,'door2','SG2','2026-09-03T00:00','2026-09-04T00:00',{component:'doors',downtimeKind:'unplanned',part:'door actuator'});
 add(s,'legacy','EW1','2026-09-05T00:00','2026-09-06T00:00');
 for(const [id,extra] of [['foreign',{garage:'south'}],['foreign-bus',{vehicle:'FOREIGN'}],['void',{voidedAt:now.toISOString()}],['deleted',{deletedAt:now.toISOString()}]])add(s,id,'SG1','2026-09-07T00:00','2026-09-08T00:00',extra);
 const r=report(s);assert.equal(r.totals.hours,72);assert.equal(r.totals.unclassified,24);assert.equal(r.parts[0].hours,48);assert.equal(r.components.reduce((n,x)=>n+x.hours,0),72);
 assert.equal(report(s,{part:'door actuator'}).totals.hours,48);assert.equal(report(s,{part:'__missing__'}).totals.hours,24);assert.equal(report(s,{question:'door'}).totals.hours,24);assert.equal(report(s,{kind:'unclassified'}).totals.hours,24);assert.equal(report(s,{model:'SG',component:'doors'}).totals.hours,48);assert.equal(report(s,{bus:'FOREIGN'}).totals.hours,0);
});
test('comparisons only use consecutive complete months and never invent a percentage from zero',()=>{
 const s=base();add(s,'aug','SG1','2026-08-01T00:00','2026-08-03T00:00');add(s,'sep','SG1','2026-09-01T00:00','2026-09-02T00:00');
 assert.equal(report(s).comparison.percent,-50);assert.equal(report(s,{from:'2026-08-02'}).comparison,null);assert.equal(report(base()).comparison.percent,null);
 assert.equal(report(s,{to:'2026-10-17',month:'2026-10'}).comparison,null);
});
test('attribution commands validate links, retain original wording and audit amendments',()=>{
 const s=base();s.inspections.push({id:'i',garage:g,vehicle:'SG1',templateId:'pm3',templateSnapshot:{tasks}});s.faults.push({id:'f',garage:g,vehicle:'SG1',inspection:'i',item:'door',status:'Open'});
 const values={vehicle:'SG1',startedAt:'2026-09-01T00:00',endedAt:'2026-09-02T00:00',reason:'Door failed',changeReason:'Workshop log',downtimeKind:'unplanned',component:'doors',part:'Actuator',faultId:'f'};
 const id=performanceCommand(s,g,manager,'downtime_save',values,'',{},now).id;const e=s.downtime[0];assert.equal(e.questionId,'door');assert.equal(e.questionSnapshot.title,'Check door operation');
 assert.throws(()=>downtimeAttribution(s,g,'SG2',values),/belonging/);assert.throws(()=>downtimeAttribution(s,'south','SG1',values),/belonging/);assert.throws(()=>downtimeAttribution(s,g,'SG1',{...values,questionId:'brake'}),/match/);assert.throws(()=>downtimeAttribution(s,g,'SG1',{questionId:'blocked'}),/available/);
 assert.throws(()=>downtimeAttribution(s,g,'SG1',{component:'made-up'}),/component/);assert.throws(()=>downtimeAttribution(s,g,'SG1',{downtimeKind:'made-up'}),/maintenance type/);assert.throws(()=>downtimeAttribution(s,g,'SG1',{part:'a'.repeat(161)}),/160/);
 performanceCommand(s,g,manager,'downtime_save',{...values,component:'electrical',changeReason:'Confirmed wiring fault'},id,{},now);assert.equal(s.downtime[0].audit.at(-1).previous.component,'doors');assert.equal(s.downtime[0].component,'electrical');assert.equal(s.downtime[0].rates.downtime,190);
 const old={...s.downtime[0]};delete values.faultId;delete values.component;delete values.part;delete values.downtimeKind;performanceCommand(s,g,manager,'downtime_save',values,id,{},now);assert.equal(s.downtime[0].component,old.component);assert.equal(s.downtime[0].faultId,old.faultId);
});
test('old downtime remains unclassified; existing question snapshot survives template retirement',()=>{
 const s=base();const a=downtimeAttribution(s,g,'SG1',{});assert.equal(a.component,'unclassified');assert.equal(a.downtimeKind,'unclassified');
 const old={questionId:'retired',questionSnapshot:{id:'retired',title:'Historical question',section:'Old'}};assert.equal(downtimeAttribution(s,g,'SG1',{questionId:'retired'},old).questionSnapshot.title,'Historical question');
 assert.equal(downtimeAttribution(s,g,'SG1',{questionId:''},old).questionId,'');
 const retained={questionId:'door',questionSnapshot:{id:'door',title:'Original wording',section:'Doors'}};assert.equal(downtimeAttribution(s,g,'SG1',{questionId:'door'},retained).questionSnapshot.title,'Original wording');
});
test('read-only reports, escaped evidence and CSV preserve the selection and deny staff',()=>{
 const s=base();add(s,'record','SG1','2026-09-01T00:00','2026-09-02T00:00',{reason:' =HYPERLINK("bad")',part:'<script>bad</script>'});const before=JSON.stringify(s),r=report(s,{month:'2026-09'});
 const c={state:s,garage:g,me:manager,garages:[{id:g,name:'North'}],page:'performance/downtime?from=2026-08-01&to=2026-09-30&month=2026-09'};
 const html=downtimeView(c);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>bad/);assert.match(html,/data-dt-export="months"/);assert.match(downtimeView({...c,me:{role:'mechanic'}}),/Manager access required/);
 assert.match(downtimeCSV(r,'episodes'),/"' =HYPERLINK/);const csv=downtimeCSV(r);assert.match(csv,/Selected month/);assert.equal(csv.split('\r\n').length,2);assert.equal(JSON.stringify(s),before);
});
