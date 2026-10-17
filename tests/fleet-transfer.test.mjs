import test from 'node:test';
import assert from 'node:assert/strict';
import {transferBus,busRecordKeys} from '../src/fleet-transfer.js';
import {saveSchedule,scheduleStatus} from '../src/scheduling.js';
const from={id:'north',name:'North',organisation_id:'org'},to={id:'south',name:'South',organisation_id:'org'},user={id:'oa',name:'Org admin',role:'organisation_admin',organisation_id:'org'};
const empty=()=>({vehicles:[],...Object.fromEntries(busRecordKeys.map(k=>[k,[]]))});
function seed(){const s=empty();s.vehicles=[{id:'SG1',garage:'north',modelType:'SG',model:'Bus',warrantyStart:'2024-01-01',roadDocuments:{registration:'valid'}}];for(const k of busRecordKeys)s[k].push({id:k+'-1',garage:'north',vehicle:'SG1',status:k==='jobs'?'In progress':'Open',audit:[]});s.jobs[0].assigneeId='old';s.jobs[0].date='2026-10-16';s.inspections[0].answers={};s.actions[0].assignedTo='old';s.actions[0].source='faults-1';delete s.actions[0].vehicle;s.faults[0].photos=['photo'];s.schedules=[];saveSchedule(s,'north',{scope:'model',modelType:'SG',interval:4,unit:'weeks',basis:'first',firstDue:'2026-11-01'},'Admin');return s;}
test('transfer retains bus, complete linked history and media, preserves cadence and marks unfinished work',()=>{
 const s=seed(),d=empty(),before=structuredClone(s),due=scheduleStatus(s,'north','SG1').due;
 const r=transferBus(s,d,from,to,user,'SG1',{reason:'Route change',confirm:'yes'},new Date('2026-10-17T10:00:00Z'));
 assert.equal(r.openJobs,1);assert.equal(r.openActions,1);assert.equal(s.vehicles.length,0);assert.equal(d.vehicles[0].warrantyStart,'2024-01-01');assert.deepEqual(d.vehicles[0].roadDocuments,before.vehicles[0].roadDocuments);
 for(const k of busRecordKeys){assert.equal(s[k].length,0,k);assert.equal(d[k].length,1,k);assert.equal(d[k][0].garage,'south',k);}
 assert.equal(scheduleStatus(d,'south','SG1').due,due);assert.equal(d.jobs[0].status,'Unassigned');assert.equal(d.jobs[0].assigneeId,null);assert.equal(d.jobs[0].date,'2026-10-17');assert.equal(d.jobs[0].transferReview.from,'North');assert.equal(d.actions[0].assignedTo,null);assert.equal(d.actions[0].vehicle,'SG1');
 assert.equal(d.attachmentOrigins.photos.photo,'north');assert.equal(s.vehicleTransferArchive[0].state.jobs[0].assigneeId,'old');assert.ok(s.vehicleTransferArchive[0].state.inspections[0].templateSnapshot);assert.equal(d.vehicleTransfers[0].actorId,'oa');assert.equal(d.vehicles[0].audit.at(-1).action,'Garage transfer');
 // A second move keeps the original media source and does not duplicate the inherited exception.
 transferBus(d,s,to,from,user,'SG1',{reason:'Return to original route',confirm:'yes'});assert.equal(s.attachmentOrigins.photos.photo,'north');assert.equal(s.schedules.length,1);assert.equal(s.vehicleTransferArchive.length,1);assert.equal(d.vehicleTransferArchive.length,1);
});
test('transfer rejects other roles, organisations, missing handover and duplicate IDs without mutations',()=>{
 for(const change of [{u:{...user,role:'platform_admin'}},{u:{...user,role:'garage_manager'}},{to:{...to,organisation_id:'foreign'}},{to:from},{v:{reason:'Route change',confirm:''}},{duplicate:true},{collision:true}]){
  const s=seed(),d=empty();if(change.duplicate)d.vehicles=[{id:'SG1',garage:'south'}];if(change.collision)d.faults=[{id:'faults-1',garage:'south'}];const before=JSON.stringify([s,d]);assert.throws(()=>transferBus(s,d,from,change.to||to,change.u||user,'SG1',change.v||{reason:'Route change',confirm:'yes'}));assert.equal(JSON.stringify([s,d]),before);
 }
});
test('review-ready and completed work retain their status and completed assignee',()=>{
 const s=seed(),d=empty();s.jobs[0].status='Awaiting sign-off';s.jobs.push({...s.jobs[0],id:'closed',status:'Completed'});s.actions[0].status='Awaiting review';transferBus(s,d,from,to,user,'SG1',{reason:'Route change',confirm:'yes'});assert.equal(d.jobs[0].status,'Awaiting sign-off');assert.equal(d.jobs[1].status,'Completed');assert.equal(d.jobs[1].assigneeId,'old');assert.equal(d.actions[0].status,'Awaiting review');
});
