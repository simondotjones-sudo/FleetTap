import test from 'node:test';import assert from 'node:assert/strict';
import {releaseAssessment,releaseCommand,refreshReleaseHolds,withReleaseStatus,visibleRelease,serviceHistoryCommand} from '../src/bus-release.js';
import {busTimeline,timelineCSV} from '../src/bus-timeline.js';
import {busReleaseView} from '../src/bus-release-ui.js';
import {editVehicle} from '../src/inspection-admin.js';
import {today,addInterval} from '../src/scheduling.js';
const g='g',u={id:'sup',name:'Supervisor',role:'supervisor'},m={id:'m',name:'Manager',role:'garage_manager'};
function ready(){return {vehicles:[{id:'BUS1',garage:g,model:'Test bus',registration:'TEST',due:addInterval(today(),7,'days'),roadDocuments:{cvrt:{expires:addInterval(today(),30,'days'),reference:'Certificate 1'},tax:{expires:addInterval(today(),30,'days'),reference:'Disc 1'}}}],inspections:[{id:'i1',templateId:'pm3',garage:g,vehicle:'BUS1',created:today()+'T08:00:00Z',status:'Completed',completedDate:today(),completedAt:today()+'T09:00:00Z',completedBy:'Supervisor',templateSnapshot:{tasks:[{id:'q',text:'Synthetic test question'}]},answers:{q:{result:'OK',worker:'Mechanic'}},audit:[]}],faults:[],actions:[],jobs:[],downtime:[],checklistRuns:[],releaseEvents:[]};}
const release=s=>releaseCommand(s,g,u,'bus_release',{notes:'Reviewed all vehicle evidence',confirm:'yes'},'BUS1');
test('release requires evidence and authorised decision, survives JSONB key ordering',()=>{
 const s=ready();assert.equal(releaseAssessment(s,g,'BUS1').status,'Awaiting release');assert.throws(()=>releaseCommand(s,g,{...u,role:'mechanic'},'bus_release',{notes:'Reviewed',confirm:'yes'},'BUS1'),/Supervisor/);assert.throws(()=>releaseCommand(s,'foreign',u,'bus_release',{},'BUS1'),/garage/);
 release(s);assert.equal(releaseAssessment(s,g,'BUS1').status,'Released for service');const jsonb=JSON.parse(JSON.stringify(s,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v));assert.equal(releaseAssessment(jsonb,g,'BUS1').status,'Released for service');
 assert.equal(visibleRelease(withReleaseStatus(s,g),{role:'mechanic'}).releaseEvents[0].evidence,undefined);assert.equal(s.releaseEvents[0].actorId,u.id);
});
test('new faults invalidate release permanently, and closure needs fresh sign-off',()=>{
 const s=ready();release(s);s.faults.push({id:'f',garage:g,vehicle:'BUS1',status:'Open'});assert.equal(releaseAssessment(s,g,'BUS1').status,'Off road');refreshReleaseHolds(s,g,m);assert.equal(s.releaseEvents.at(-1).type,'invalidated');s.faults[0].status='Closed';assert.equal(releaseAssessment(s,g,'BUS1').status,'Awaiting release');release(s);assert.equal(releaseAssessment(s,g,'BUS1').status,'Released for service');
 releaseCommand(s,g,u,'bus_hold',{notes:'Stop pending investigation'},'BUS1');assert.throws(()=>release(s),/hold/);releaseCommand(s,g,u,'bus_clear_hold',{notes:'Investigation complete'},'BUS1');assert.equal(releaseAssessment(s,g,'BUS1').status,'Awaiting release');
});
test('missing/expired docs, inspections, due dates, conflicts and unfinished work fail closed',()=>{
 const mutations=[s=>delete s.vehicles[0].roadDocuments,s=>s.vehicles[0].roadDocuments.tax.expires='2020-01-01',s=>s.inspections=[],s=>s.vehicles[0].due=today(),s=>s.inspections[0].templateSnapshot.tasks[0].blocked=true,s=>s.inspections[0].rechecks={q:{at:'today'}},s=>s.jobs.push({garage:g,vehicle:'BUS1',status:'In progress',date:today()}),s=>s.actions.push({garage:g,vehicle:'BUS1',status:'Awaiting review'}),s=>s.downtime.push({garage:g,vehicle:'BUS1',startedAt:'2026-01-01'}),s=>s.checklistRuns.push({garage:g,vehicle:'BUS1',status:'In progress'})];
 for(const mutate of mutations){const s=ready();mutate(s);assert.equal(releaseAssessment(s,g,'BUS1').eligible,false);assert.throws(()=>release(s),/blocked/);}
 const s=ready();s.jobs.push({garage:g,vehicle:'BUS1',status:'Assigned',date:addInterval(today(),7,'days')});assert.equal(releaseAssessment(s,g,'BUS1').eligible,true);
 s.vehicles[0].roadDocuments.tax.expires=today();assert.equal(releaseAssessment(s,g,'BUS1').eligible,true);assert.equal(releaseAssessment(s,g,'BUS1',addInterval(today(),1,'days')).eligible,false);
});
test('document corrections, bus identity edits and historical corrections retain audit',()=>{
 const s=ready();release(s);releaseCommand(s,g,m,'road_documents',{cvrtExpires:addInterval(today(),60,'days'),cvrtReference:'New certificate',taxExpires:addInterval(today(),30,'days'),taxReference:'Tax disc',notes:'Verified original documents'},'BUS1');refreshReleaseHolds(s,g,m);assert.equal(s.releaseEvents.at(-1).type,'invalidated');
 serviceHistoryCommand(s,g,u,'service_add',{vehicle:'BUS1',date:today(),notes:'Oil changed and checked',reference:'Archive 9',performedBy:'Workshop A'});const sid=s.serviceHistory[0].id;serviceHistoryCommand(s,g,u,'service_void',{notes:'Incorrect reference supplied'},sid);assert.ok(s.serviceHistory[0].voidedAt);
 editVehicle(s,g,'BUS1',{id:'BUS2',model:'Test bus'},'Manager');assert.equal(s.releaseEvents[0].vehicle,'BUS2');assert.equal(s.releaseEvents[0].evidence.bus.id,'BUS1');assert.equal(s.serviceHistory[0].vehicle,'BUS2');
 const rows=busTimeline(s,g,'BUS2');assert.ok(rows.some(r=>r.type==='Release'));assert.ok(rows.some(r=>r.type==='Historical service'&&r.title.includes('voided')));assert.ok(rows.some(r=>r.type==='Documents'));assert.match(timelineCSV([{title:'=1+1',notes:'"text"'}]),/'=1\+1/);
 const html=busReleaseView({state:withReleaseStatus(s,g),garage:g,me:u,page:'bus-release/BUS2'});assert.match(html,/Release requirements|Ready for supervisor/);assert.doesNotMatch(html,/Save document evidence/);
});
