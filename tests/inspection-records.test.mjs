import test from 'node:test';
import assert from 'node:assert/strict';
import {filterInspectionRecords,emptyRecordFilters,recordDateError,mechanicName,inspectionRecordCard,recordFilters} from '../src/inspection-records.js';
import {checksFlowView} from '../src/checks-flow.js';

const vehicles=[{id:'SG1',garage:'north',modelType:'SG',registration:'REG-101'},
 {id:'WS1',garage:'north',modelType:'WS'},{id:'OLD1',garage:'north',model:'Older bus'},
 {id:'SG1',garage:'south',modelType:'AH',registration:'SECRET'}];
const run=(id,vehicle,created,status='In progress',extra={})=>({id,vehicle,created,status,garage:'north',templateId:'pm3',craftworker:'Alex Morgan (alex@example.test)',answers:{},...extra});
const rows=[run('first','SG1','2026-10-15T00:00:00Z'),run('last','SG1','2026-10-16T23:59:59Z','Completed'),
 run('next','WS1','2026-10-17T00:00:00Z','Awaiting review'),run('old','OLD1','2026-10-14T12:00:00Z'),
 run('deleted','SG1','2026-10-18T12:00:00Z','Completed',{deletedAt:'2026-10-18'}),
 run('foreign','SG1','2026-10-18T12:00:00Z','Completed',{garage:'south'}),
 run('checklist','SG1','2026-10-18T12:00:00Z','Completed',{templateId:'workshop',templateSnapshot:{id:'workshop'}})];
const filter=f=>filterInspectionRecords(rows,vehicles,'north',{...emptyRecordFilters(),...f}).map(i=>i.id);
const context=()=>({state:{vehicles,inspections:rows,faults:[],actions:[]},garage:'north',me:{role:'garage_manager',email:'alex@example.test'},garages:[{id:'north',name:'North garage'}],page:'inspection-records'});

test('Inspection filters combine model, status and inclusive started dates within the garage',()=>{
 assert.deepEqual(filter({}),['next','last','first','old']);
 assert.deepEqual(filter({model:'SG',from:'2026-10-15',to:'2026-10-16'}),['last','first']);
 assert.deepEqual(filter({model:'SG',status:'Completed',from:'2026-10-16',to:'2026-10-16'}),['last']);
 assert.deepEqual(filter({model:'AH'}),[]);
 assert.deepEqual(filter({model:'other'}),['old']);
 assert.deepEqual(filter({model:'WS',status:'Completed'}),[]);
 assert.deepEqual(filter({from:'2026-10-17',to:'2026-10-15'}),[]);
 assert.match(recordDateError({from:'2026-10-17',to:'2026-10-15'}),/end date/);
});
test('Inspection search retains email and registration matching without using another garage vehicle',()=>{
 assert.deepEqual(filter({query:'  REG-101  '}),['last','first']);
 assert.deepEqual(filter({query:'alex@EXAMPLE.test',model:'WS'}),['next']);
 assert.deepEqual(filter({query:'SECRET'}),[]);
 assert.deepEqual(filter({query:'awaiting review'}),['next']);
});
test('Cards show readable, escaped names while full attribution remains on the record',()=>{
 const c=context(),i={...rows[0],craftworker:'Alex <Morgan> (alex@example.test)'};
 const html=inspectionRecordCard(c,i);
 assert.match(html,/Alex &lt;Morgan&gt;/);assert.doesNotMatch(html,/@example.test/);
 assert.match(html,/REG-101/);assert.doesNotMatch(html,/SECRET/);
 assert.equal(mechanicName('Alex (Night shift)'), 'Alex (Night shift)');
 assert.equal(mechanicName('worker@example.test'),'worker@example.test');
 c.page='inspection-record/first';assert.match(checksFlowView(c),/Alex Morgan \(alex@example.test\)/);
});
test('Records expose only available garage options and keep My checks attribution restricted',()=>{
 const c=context(),html=recordFilters(c,emptyRecordFilters(),rows.filter(i=>i.garage==='north'));
 assert.match(html,/id="records-garage" disabled/);assert.doesNotMatch(html,/value="south"/);
 c.page='my-checks';c.me.email='another@example.test';
 assert.doesNotMatch(checksFlowView(c),/data-go="inspection-record\//);
 c.page='inspection-records';c.me.role='mechanic';assert.match(checksFlowView(c),/Administrator access required/);
});
