import test from 'node:test';
import assert from 'node:assert/strict';
import {saveContent,visibleContent} from '../src/content-model.js';
import {saveBulletin,stageDocumentBulletin,currentDocument,partLookup,bulletinRequired,documentKind,publicBulletin} from '../src/bulletins.js';
import {learningCommand,publicLearning} from '../src/instruction-learning.js';
import {pendingControls,acknowledgement} from '../src/active-controls.js';
import {recallCommand,seedRecallCases,recallsFor} from '../src/recalls.js';
import {releaseAssessment,releaseCommand} from '../src/bus-release.js';
import {transferBus} from '../src/fleet-transfer.js';
import {editVehicle} from '../src/inspection-admin.js';
import {today,addInterval} from '../src/scheduling.js';
import {bulletinsView,documentLibrary,instructionHub} from '../src/bulletins-ui.js';
import {downtimeAttribution} from '../src/downtime-attribution.js';

const mechanic={id:'worker',name:'Mechanic',role:'mechanic'},supervisor={id:'reviewer',name:'Supervisor',role:'supervisor'},admin={id:'admin',name:'Admin',role:'organisation_admin',organisation_id:'org'};
const base={title:'Source change',reference:'TSB-1',sourceReference:'MAN-1',issuer:'Manufacturer',summary:'What changed',action:'Required action',target:'model',targetModels:['SG'],effectiveDate:today(),status:'Published',approved:'yes'};
const part=(old,replacement,extra={})=>({old,replacement,manufacturer:'Maker',description:'Component',stock:'unspecified',...extra});
function publish(data={},v={}){return saveBulletin(data,{...base,type:'parts',parts:[part('A','B')],...v},'Author');}
function ready(){return {vehicles:[{id:'SG1',garage:'north',modelType:'SG',model:'Synthetic SG',registration:'TEST',due:addInterval(today(),10,'days'),roadDocuments:{cvrt:{expires:'2099-01-01',reference:'Test CVRT'},tax:{expires:'2099-01-01',reference:'Test Tax'}}}],faults:[],reports:[],actions:[],jobs:[],downtime:[],checklistRuns:[],releaseEvents:[],inspections:[{id:'i',garage:'north',vehicle:'SG1',templateId:'pm3',status:'Completed',created:'2020-01-01T00:00:00Z',completedDate:'2020-01-01',completedBy:'Reviewer',templateSnapshot:{tasks:[{id:'q',section:'Test',text:'Synthetic approved check'}]},answers:{q:{result:'OK'}}}]};}
test('SOP/SI publication is paired with a source-backed bulletin; future revisions preserve the current instructions',()=>{
 const data={sops:[]},values={documentType:'si',title:'SI procedure',reference:'SI-7',revision:'1',summary:'Original',instructions:'Original method',steps:'Original method',status:'Draft'};
 let doc=saveContent(data,'sops',values,'Author'),draft=stageDocumentBulletin(data,doc,'Author');assert.equal(visibleContent(data).sops.length,0);assert.equal(documentKind(doc),'si');
 assert.throws(()=>saveBulletin(data,{id:draft.id,status:'Published'},'Impostor'),/Review/);
 const first=saveBulletin(data,{id:draft.id,...base,type:'document'},'Approver');assert.equal(visibleContent(data).sops[0].instructions,'Original method');assert.equal(first.documents[0].version,doc.version);assert.equal(first.documents[0].snapshot.approvedBy,'Approver');assert.equal(data.sops[0].required,false);
 const revision=saveContent(data,'sops',{...values,id:doc.id,revision:'2',instructions:'New method',summary:'New method'},'Author');draft=stageDocumentBulletin(data,revision,'Author');
 const next=addInterval(today(),2,'days'),second=saveBulletin(data,{id:draft.id,...base,reference:'TSB-2',type:'document',effectiveDate:next},'Approver');
 assert.equal(currentDocument(data.sops[0]).instructions,'Original method');assert.equal(currentDocument(data.sops[0],next).instructions,'New method');
 assert.equal(bulletinRequired(first,data,{id:'SG1',modelType:'SG'}),true);assert.equal(bulletinRequired(second,data,{id:'SG1',modelType:'SG'}),false);
 assert.equal(bulletinRequired(first,data,{id:'SG1',modelType:'SG'},next),false);assert.equal(bulletinRequired(second,data,{id:'SG1',modelType:'SG'},next),true);
 assert.equal(first.documents[0].snapshot.instructions,'Original method');assert.throws(()=>saveBulletin(data,{id:first.id,title:'Overwrite'},'Author'),/locked/);
});
test('stale linked drafts cannot publish; source/approver IDs cannot be supplied by a browser',()=>{
 const data={},v={title:'SOP',reference:'SOP1',revision:'1',summary:'Read',instructions:'Method',steps:'Step',status:'Draft'};
 const doc=saveContent(data,'sops',v,'Author'),draft=stageDocumentBulletin(data,doc,'Author');saveContent(data,'sops',{...v,id:doc.id,instructions:'Changed draft'},'Author');
 assert.throws(()=>saveBulletin(data,{...base,id:draft.id,type:'document'},'Author'),/changed/);assert.equal(visibleContent(data).sops.length,0);
 const parts=publish({}, {sourceId:'forged',publishedBy:'forged'});assert.equal(parts.sourceId,null);assert.equal(parts.publishedBy,'Author');
});
test('parts lookup follows conditional replacement chains and exposes conflicts without guessing applicability',()=>{
 const data={},a=publish(data,{parts:[part('A','B',{conditions:'SG chassis from source range',associated:'Adapter K',stock:'quarantine'})]});publish(data,{reference:'TSB-2',parts:[part('B','C')]});
 let result=partLookup(data,'a',{id:'SG1',modelType:'SG'})[0];assert.equal(result.current,'C');assert.equal(result.chain.length,2);assert.equal(result.conditional,true);assert.equal(result.chain[0].stock,'quarantine');assert.equal(partLookup(data,'A',{id:'EW1',modelType:'EW'}).length,0);assert.equal(partLookup(data,'A')[0].needsBus,true);
 publish(data,{reference:'TSB-3',parts:[part('A','D')]});result=partLookup(data,'A',{id:'SG1',modelType:'SG'})[0];assert.equal(result.ambiguous,true);assert.equal(result.current,null);
 assert.throws(()=>publish(data,{reference:'TSB-cycle',parts:[part('C','A')]}),/cycle/);assert.equal(a.parts[0].replacement,'B');
 publish(data,{reference:'TSB-future',parts:[part('FUTURE','X')],effectiveDate:addInterval(today(),1,'days')});assert.equal(partLookup(data,'FUTURE').length,0);
});
test('video progress and quiz completion are independent, server-graded prerequisites for acknowledgement',()=>{
 const data={},x=publish(data,{completion:'video_quiz',video:'https://example.com/talk.mp4',videoSeconds:10,videoReviewed:'yes',quiz:[1,2,3].map(n=>({question:'Question '+n,options:['Wrong','Right'],correct:1,explanation:'Use the approved method.'}))});
 const now=new Date('2026-10-17T10:00:00Z'),call=(r,a,v={},seconds=0)=>learningCommand(r,x,mechanic,a,{version:x.version,...v},new Date(+now+seconds*1000));
 assert.throws(()=>call(null,'acknowledge',{understood:'yes'}),/Watch/);let {record:r,result}=call(null,'video_begin');const session=result.session;
 assert.throws(()=>call(r,'video_progress',{session,position:10},.1),/confirmed/);
 r=call(r,'video_progress',{session,position:5},5).record;assert.throws(()=>call(r,'quiz',{answers:[1,1,1]},5),/Finish/);
 r=call(r,'video_progress',{session,position:10},10).record;
 let attempt=call(r,'quiz',{answers:[0,1,1]},11);assert.equal(attempt.result.passed,false);r=attempt.record;
 assert.throws(()=>call(r,'acknowledge',{understood:'yes'},12),/Watch/);
 r=call(r,'quiz',{answers:[1,1,1]},12).record;assert.throws(()=>call(r,'acknowledge',{},13),/Confirm/);
 const completion=call(r,'acknowledge',{understood:'yes',userId:'forged'},13).record;assert.equal(completion.completion.userId,mechanic.id);assert.equal(completion.attempts.length,2);
 assert.equal(publicBulletin(x).quiz[0].correct,undefined);assert.equal(publicLearning(completion,true).completion.snapshot.quiz[0].correct,undefined);assert.equal(publicLearning(completion,true).attempts[0].answers,undefined);
 assert.throws(()=>learningCommand(r,x,mechanic,'acknowledge',{version:x.version+1,understood:'yes'}),/changed/);
});
test('acknowledgements cover each person and version across garages; unrelated models stay available',()=>{
 const content={},x=publish(content),s=ready();assert.equal(pendingControls(s,'north',mechanic.id,content,'SG1').length,1);
 const r=learningCommand(null,x,mechanic,'acknowledge',{version:x.version,understood:'yes'}).record;s.instructionLearning=[r];assert.equal(pendingControls(s,'north',mechanic.id,content,'SG1').length,0);assert.equal(pendingControls(s,'north','other',content,'SG1').length,1);
 s.vehicles.push({id:'SG2',garage:'south',modelType:'SG'});assert.equal(pendingControls(s,'south',mechanic.id,content,'SG2').length,0);
 s.organisationAcks=[{organisationWide:true,userId:'worker',instructionId:'old',version:2,garage:'north'}];assert.ok(acknowledgement(s,'south','worker',{id:'old',version:2}));
});
test('recall acknowledgement cannot release a bus; remedy, verification, reopen and explicit release remain distinct',()=>{
 const content={},x=publish(content,{type:'recall',recallScope:'All selected SG buses per source',remedy:'Replace and test source-specified component',recallMode:'stop'}),s=ready();s.activeRecalls=[publicBulletin(x)];seedRecallCases(s,'north',content);
 const values={vehicle:'SG1',bulletinId:x.id,version:x.version,notes:'Source work checked',reference:'Repair record 12',completedDate:today()};
 assert.equal(releaseAssessment(s,'north','SG1').eligible,false);s.instructionLearning=[learningCommand(null,x,mechanic,'acknowledge',{version:x.version,understood:'yes'}).record];assert.equal(releaseAssessment(s,'north','SG1').eligible,false);
 recallCommand(s,'north',mechanic,content,'recall_report',values);assert.throws(()=>recallCommand(s,'north',mechanic,content,'recall_verify',{...values,confirm:'yes'}),/Supervisor/);
 recallCommand(s,'north',supervisor,content,'recall_verify',{...values,confirm:'yes'});assert.equal(releaseAssessment(s,'north','SG1').status,'Awaiting release');
 releaseCommand(s,'north',supervisor,'bus_release',{notes:'Reviewed all source evidence',confirm:'yes'},'SG1');assert.equal(releaseAssessment(s,'north','SG1').status,'Released for service');
 recallCommand(s,'north',supervisor,content,'recall_reopen',values);assert.equal(releaseAssessment(s,'north','SG1').eligible,false);assert.equal(s.recallCases[0].audit.length,3);assert.equal(s.downtime.length,0);
});
test('uncertain recall scope requires an admin decision; corrections and garage transfers preserve the requirement',()=>{
 const content={},x=publish(content,{type:'recall',recallScope:'Check component serial range against source',remedy:'Source remedy',needsAssessment:'yes'}),s=ready();s.activeRecalls=[x];seedRecallCases(s,'north',content);
 const v={vehicle:'SG1',bulletinId:x.id,version:x.version,notes:'Serial number checked against source'};
 assert.equal(recallsFor(s,'north','SG1')[0].status,'Assess applicability');assert.throws(()=>recallCommand(s,'north',supervisor,content,'recall_assess',{...v,applicability:'unaffected'}),/Organisation/);
 editVehicle(s,'north','SG1',{id:'EW99',model:'Corrected',modelType:'EW'},'Admin');assert.equal(recallsFor(s,'north','EW99')[0].held,true);
 const dest={vehicles:[],inspections:[],faults:[],reports:[],actions:[],activeRecalls:[x]};transferBus(s,dest,{id:'north',name:'North',organisation_id:'org'},{id:'south',name:'South',organisation_id:'org'},admin,'EW99',{reason:'Garage transfer',confirm:'yes'});assert.equal(recallsFor(dest,'south','EW99')[0].held,true);assert.equal(dest.recallCases[0].vehicle,'EW99');
 recallCommand(dest,'south',admin,content,'recall_assess',{...v,vehicle:'EW99',applicability:'unaffected'});assert.equal(recallsFor(dest,'south','EW99')[0].held,false);
});
test('dated and next-service recalls become due without inventing downtime, and linked jobs need sign-off',()=>{
 const content={},future=addInterval(today(),3,'days'),x=publish(content,{type:'recall',recallScope:'Model selected',remedy:'Source remedy',recallMode:'date',recallDue:future}),s=ready();s.activeRecalls=[x];assert.equal(recallsFor(s,'north','SG1')[0].held,false);assert.equal(recallsFor(s,'north','SG1',future)[0].held,true);
 const y=publish(content,{reference:'TSB-service',type:'recall',recallScope:'Selected models',remedy:'Source remedy',recallMode:'service'});s.activeRecalls=[y];assert.equal(recallsFor(s,'north','SG1')[0].held,false);s.vehicles[0].due=today();assert.equal(recallsFor(s,'north','SG1')[0].held,true);
 const v={vehicle:'SG1',bulletinId:y.id,version:y.version,notes:'Source remedy planned',date:today()};const planned=recallCommand(s,'north',admin,content,'recall_plan',v);assert.ok(planned.jobId);assert.equal(recallCommand(s,'north',admin,content,'recall_plan',v).jobId,planned.jobId);assert.equal(s.jobs.length,1);
 recallCommand(s,'north',supervisor,content,'recall_report',{...v,completedDate:today(),reference:'Manufacturer invoice 3'});assert.throws(()=>recallCommand(s,'north',supervisor,content,'recall_verify',{...v,confirm:'yes'}),/sign off/);
});
test('TSB attribution validates same-bus applicability and preserves explicit evidence',()=>{
 const content={},x=publish(content),s=ready();s.activeBulletins=[x];const linked=downtimeAttribution(s,'north','SG1',{bulletinId:x.id});assert.equal(linked.bulletinSnapshot.reference,x.reference);
 assert.throws(()=>downtimeAttribution(s,'north','SG1',{bulletinId:'foreign'}),/applying/);
});
test('instruction UI separates SOPs/SIs and safely renders notices, parts, recall evidence and required training',()=>{
 const content={},x=publish(content,{title:'<img src=x onerror=alert(1)>'}),s=ready(),c={state:s,content,garage:'north',organisation:'org',me:admin,page:'tsbs/'+x.id};s.activeRecalls=[];
 assert.match(instructionHub(c),/SOPs/);assert.match(instructionHub(c),/SIs/);assert.match(instructionHub(c),/Parts lookup/);
 const html=bulletinsView(c);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);assert.match(html,/Acknowledge & continue/);
 assert.match(bulletinsView({...c,page:'parts?q=A&bus=SG1'}),/Current listed replacement/);
 content.sops=[{id:'sop',documentType:'sop',status:'Published',title:'Procedure',reference:'SOP1',version:1},{id:'si',documentType:'si',status:'Published',title:'Instruction',reference:'SI1',version:1}];assert.doesNotMatch(documentLibrary(c,'sop'),/SI1/);assert.match(documentLibrary(c,'si'),/SI1/);
 assert.match(bulletinsView({...c,page:'tsbs/new',me:mechanic}),/Organisation Admin access required/);
});
