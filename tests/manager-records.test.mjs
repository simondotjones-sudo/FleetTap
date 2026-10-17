import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/model.js';
import {adminToolsView} from '../src/admin-tools.js';
import {garageExport,managerRecordsView} from '../src/manager-records.js';

const context=()=>({state:seed(),garage:'demo-north',me:{role:'garage_manager'},page:'manage'});
test('manager hub and submitted reports stay role and garage scoped',()=>{
 const c=context();
 const hub=adminToolsView(c);assert.equal((hub.match(/class="tap-tile admin-tile"/g)||[]).length,4);
 assert.match(hub,/data-go="manage\/records"/);assert.match(hub,/People &amp; access/);assert.doesNotMatch(hub,/data-go="reviews"|data-go="garage-actions"|data-go="schedules"/);c.page="manage/records";assert.match(adminToolsView(c),/id="export"/);
 assert.doesNotMatch(hub,/>Administration<|← Back/);
 c.state.reports.push({id:'same',garage:'demo-north',title:'Saved <report>',status:'Open',description:'North entry',created:'2026-10-15T12:00:00Z'},{id:'private',garage:'demo-south',title:'Private report',status:'Closed',description:'Hidden',created:'2026-10-15T12:00:00Z'});
 c.page='submitted-reports';assert.match(managerRecordsView(c),/Saved &lt;report&gt;/);assert.doesNotMatch(managerRecordsView(c),/Private report/);
 c.page='submitted-reports/reports/private';assert.match(managerRecordsView(c),/Report unavailable/);
 c.page='submitted-reports/reports/same';assert.match(managerRecordsView(c),/North entry/);assert.match(managerRecordsView(c),/>Open</);
 c.me.role='mechanic';assert.match(managerRecordsView(c),/Manager access required/);assert.match(adminToolsView(c),/Administrator access required/);
});
test('export includes only the selected depot and refuses staff access',()=>{
 const c=context();c.state.schedules=[{garage:'demo-south',vehicle:'private'},{garage:'demo-north',vehicle:'visible'}];
 c.state.unrelatedAccountData={secret:'not exported'};
 const output=garageExport(c);assert.ok(output.vehicles.length);assert.ok(output.vehicles.every(v=>v.garage==='demo-north'));
 assert.equal(output.schedules.length,1);assert.equal(output.schedules[0].vehicle,'visible');assert.equal(output.unrelatedAccountData,undefined);
 output.vehicles[0].id='changed';assert.notEqual(c.state.vehicles[0].id,'changed');
 c.me.role='mechanic';assert.throws(()=>garageExport(c),/Manager access required/);
});
