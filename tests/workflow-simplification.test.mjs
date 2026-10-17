import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,addRecord,submitAction} from '../src/model.js';
import {startInspection} from '../src/inspections.js';
import {operationsCommand} from '../src/garage-operations.js';
import {returnAction} from '../src/reviews.js';
import {releaseCommand,releaseAssessment} from '../src/bus-release.js';
import {busTimeline,groupTimeline} from '../src/bus-timeline.js';
import {saveContent,visibleContent} from '../src/content-model.js';
import {contentView} from '../src/content-ui.js';
import {checklistCommand} from '../src/content-model.js';
import {returnInspection} from '../src/inspections.js';
import {tabletView,needsInstruction} from '../src/tablet.js';
import {WorkDraftMap,setDraftUser,preserveWorkDrafts,clearWorkDrafts} from '../src/work-drafts.js';
const garage='demo-north',manager={id:'manager',name:'Manager',role:'garage_manager'},worker={id:'worker',name:'Mechanic',role:'mechanic'};
test('handover keeps work open, review returns preserve evidence, and resubmission remains distinct from closure',()=>{
 const s=seed(),r=addRecord(s,'faults',{garage,vehicle:'DEMO-271',title:'Ramp interlock',description:'Fails to engage'}),a=s.actions[0];
 assert.equal(a.title,r.title);assert.equal(a.owner,'Unassigned');assert.ok(a.created);
 submitAction(s,a.id,'Replacement needed','handover','Mechanic');assert.equal(a.status,'Open');assert.equal(a.nextStep,'Replacement needed');
 submitAction(s,a.id,'Replacement fitted and tested','work','Mechanic');assert.equal(a.status,'Awaiting review');
 assert.throws(()=>returnAction(s,'other',a.id,{notes:'Check interlock again'},'Supervisor'));
 returnAction(s,garage,a.id,{notes:'Check emergency release too'},'Supervisor');assert.equal(a.status,'Open');assert.equal(a.evidence,'Replacement fitted and tested');assert.equal(a.audit.at(-1).previous.status,'Awaiting review');
 submitAction(s,a.id,'Emergency release tested','work','Mechanic');assert.equal(a.status,'Awaiting review');assert.equal(a.nextStep,undefined);assert.equal(a.returnNotes,undefined);assert.equal(s.vehicles[0].status,'Awaiting inspection');
});
test('new inspection jobs reuse open inspections and fault jobs allocate only unassigned linked actions',()=>{
 const s=seed();s.vehicles[0].due='2026-10-16';const i=startInspection(s,'DEMO-271',garage,'Mechanic');
 const base={vehicle:'DEMO-271',title:'Safety inspection',date:'2026-10-16',priority:'Normal',type:'Scheduled inspection'};
 const j=operationsCommand(s,garage,manager,'job_create',base,'',worker);assert.equal(j.inspectionId,i.id);assert.equal(s.inspections.length,1);
 const f=addRecord(s,'faults',{garage,vehicle:'DEMO-271',title:'Door fault',description:'Interlock problem'});const unassigned=s.actions[0];s.actions.push({...unassigned,id:'already-owned',assignedTo:'other',owner:'Other mechanic'});
 operationsCommand(s,garage,manager,'job_create',{...base,title:'Door repair',type:'Repair',faultId:f.id},'',worker);
 assert.equal(unassigned.assignedTo,worker.id);assert.equal(s.actions.find(a=>a.id==='already-owned').assignedTo,'other');assert.ok(unassigned.audit.length);
});
test('CVRT and tax can be saved independently without allowing release with missing evidence',()=>{
 const s=seed();releaseCommand(s,garage,manager,'road_documents',{document:'cvrt',cvrtExpires:'2030-12-31',cvrtReference:'Certificate',notes:'Verified certificate'},'DEMO-271');
 assert.equal(s.vehicles[0].roadDocuments.cvrt.reference,'Certificate');assert.equal(s.vehicles[0].roadDocuments.tax,undefined);assert.equal(releaseAssessment(s,garage,'DEMO-271').eligible,false);
 releaseCommand(s,garage,manager,'road_documents',{document:'tax',taxExpires:'2030-12-31',taxReference:'Disc',notes:'Verified tax disc'},'DEMO-271');assert.equal(s.vehicles[0].roadDocuments.cvrt.reference,'Certificate');assert.equal(s.vehicles[0].roadDocuments.tax.reference,'Disc');
});
test('draft revisions keep published content and acknowledgements stable until an approved publication',()=>{
 const data={},v={title:'Published instruction',summary:'Summary',instructions:'Full instruction',steps:'First step',status:'Published',approved:'yes'},x=saveContent(data,'sops',v,'Author'),version=x.version;
 saveContent(data,'sops',{...v,id:x.id,title:'Private revision',status:'Draft'},'Author');
 const visible=visibleContent(data).sops[0];assert.equal(visible.title,v.title);assert.equal(visible.version,version);assert.equal(visible.draftRevision,undefined);
 assert.throws(()=>saveContent(data,'sops',{...v,id:x.id,approved:'no'},'Author'),/approve/);
 saveContent(data,'sops',{...v,id:x.id,title:'Published revision'},'Approver');assert.equal(visibleContent(data).sops[0].version,version+2);assert.equal(visibleContent(data).sops[0].title,'Published revision');
});
test('instruction acknowledgement follows the explicit requirement, never instruction length',()=>{
 assert.equal(needsInstruction({text:'A'.repeat(5000)}),false);assert.equal(needsInstruction({text:'Read this.',requiresAcknowledgement:true}),true);
});
test('history groups a complete inspection while retaining individual readings with units',()=>{
 const s=seed(),i=startInspection(s,'DEMO-271',garage,'Mechanic');i.audit.push({item:'1-1',at:'2026-10-16T10:00:00Z',value:{result:'OK',readings:[2],worker:'Mechanic'}});
 const events=busTimeline(s,garage,'DEMO-271');assert.match(events.find(e=>e.notes.includes('Side slip')).notes,/Side slip 2 m\/km/);
 const group=groupTimeline(events).find(e=>e.type==='Inspection');assert.equal(group.events.length,2);assert.ok(group.events.some(e=>e.title.includes('OK')));
});
test('tab drafts recover words, omit file bodies, isolate accounts and clear only the signed-out user',()=>{
 const store=new Map();globalThis.sessionStorage={get length(){return store.size},key:n=>[...store.keys()][n],getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 setDraftUser('first');const drafts=new WorkDraftMap('test');drafts.set('report',{dirty:true,step:'review',description:'Draft words',files:[{name:'test.jpg',privateBytes:'not persisted'}],photoIds:null});preserveWorkDrafts();drafts.clear();assert.equal(drafts.get('report').description,'Draft words');assert.equal(drafts.get('report').step,'photos');assert.doesNotMatch([...store.values()][0],/privateBytes/);
 setDraftUser('second');assert.equal(drafts.get('report'),undefined);drafts.set('report',{dirty:true,description:'Second user',files:[]});preserveWorkDrafts();clearWorkDrafts();assert.equal(drafts.get('report'),undefined);
 setDraftUser('first');assert.equal(drafts.get('report').description,'Draft words');clearWorkDrafts();assert.equal(store.size,0);delete globalThis.sessionStorage;
});

test('returned checklist and inspection reasons appear where the worker resumes',()=>{
 const s=seed(),i=startInspection(s,'DEMO-271',garage,'Mechanic');i.status='Awaiting review';returnInspection(s,i.id,garage,{notes:'Check the front wheel measurement'},'Supervisor');
 const c={state:s,garage,me:worker,page:'inspection/'+i.id+'/sections'};assert.match(tabletView(c),/Check the front wheel measurement/);
 s.checklistRuns=[{id:'checklist',garage,template:{title:'End of day',steps:['Tools stored'],instructions:'Check tools',version:1},status:'Awaiting review',answers:{0:{result:'OK'}}}];checklistCommand(s,garage,'checklist_return',{notes:'Verify the tool cabinet'},'checklist',{},'Supervisor');
 c.page='checklists/run/checklist';const html=contentView(c);assert.match(html,/Verify the tool cabinet/);assert.match(html,/Ready for review/);assert.doesNotMatch(html,/Question 1 of/);
});
