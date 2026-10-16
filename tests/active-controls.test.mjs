import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/model.js';
import {saveContent} from '../src/content-model.js';
import {applies,acknowledgeControl,requireControls,visibleControls,pendingControls} from '../src/active-controls.js';
import {startInspection,recordRecheck,saveAnswer,submitInspection} from '../src/inspections.js';
import {controlsView} from '../src/active-controls-ui.js';
const values={title:'Safe isolation',summary:'Approved source summary',instructions:'Isolate the vehicle following approved source.',steps:'Isolate\nVerify',status:'Published',approved:'yes',reference:'SI TEST',revision:'1',required:'yes',target:'model',targetModel:'SG'};
const user={id:'mechanic',name:'Mechanic',role:'mechanic'},garage='demo-north';
function fixture(){const s=seed(),content={sops:[]};s.vehicles[0].modelType='SG';const x=saveContent(content,'sops',values,'Admin');return {s,content,x,bus:s.vehicles[0]};}
test('required controls target buses and versions; acknowledgements cannot impersonate another user',()=>{
 const {s,content,x,bus}=fixture();assert.equal(applies(x,bus),true);assert.equal(applies(x,{id:'EW1',modelType:'EW'}),false);
 assert.throws(()=>requireControls(s,garage,user,content,bus.id),/Work blocked/);
 const a=acknowledgeControl(s,garage,user,content,{instructionId:x.id,version:x.version,understood:'yes',userId:'forged'});assert.equal(a.userId,user.id);requireControls(s,garage,user,content,bus.id);
 assert.equal(acknowledgeControl(s,garage,user,content,{instructionId:x.id,version:x.version,understood:'yes'}),a);
 assert.equal(visibleControls(s,{id:'other',role:'mechanic'}).instructionAcks.length,0);
 assert.throws(()=>requireControls(s,garage,{id:'other'},content,bus.id),/Work blocked/);
 const newer=saveContent(content,'sops',{...values,id:x.id,revision:'2'},'Admin');assert.equal(pendingControls(s,garage,user.id,content,bus.id).length,1);assert.equal(a.snapshot.revision,'1');
 assert.throws(()=>acknowledgeControl(s,garage,user,content,{instructionId:x.id,version:x.version,understood:'yes'}),/changed/);
 assert.equal(newer.version,2);
 assert.throws(()=>acknowledgeControl(s,'other',user,content,{instructionId:x.id,version:newer.version,understood:'yes'}),/garage/);
});
test('publication, toolbox attestation and overdue review fail closed',()=>{
 const {s,content,x}=fixture();assert.throws(()=>saveContent(content,'sops',{...values,id:x.id,status:'Draft'},'Admin'),/published/);
 assert.throws(()=>saveContent(content,'sops',{...values,controlKind:'toolbox',video:'javascript:alert(1)'},'Admin'),/HTTPS/);
 const talk=saveContent(content,'sops',{...values,controlKind:'toolbox',video:'https://example.com/approved-talk'},'Admin');
 assert.throws(()=>acknowledgeControl(s,garage,user,content,{instructionId:talk.id,version:talk.version,understood:'yes'}),/watched/);
 acknowledgeControl(s,garage,user,content,{instructionId:talk.id,version:talk.version,understood:'yes',watched:'yes'});
 const overdue=saveContent(content,'sops',{...values,reviewDate:'2020-01-01'},'Admin');assert.throws(()=>acknowledgeControl(s,garage,user,content,{instructionId:overdue.id,version:overdue.version,understood:'yes'}),/overdue/);
 assert.equal(applies({...x,target:'fleet',targetFleets:['SG1']},{id:'SG1'}),true);
 assert.equal(applies({...x,target:'fleet',targetFleets:['SG1']},{id:'SG2'}),false);
});
test('recheck preserves first reading, blocks skip/submission, records second result and creates persistent fault',()=>{
 const s=seed(),i=startInspection(s,'DEMO-271',garage,'Worker'),base={worker:'Worker',result:'OK',notes:'',readings:[20]};
 assert.throws(()=>saveAnswer(s,i.id,garage,'1-1',base),/first.*reading/);
 recordRecheck(s,i.id,garage,'1-1',[20],'First mechanic');recordRecheck(s,i.id,garage,'1-1',[30],'Other mechanic');assert.deepEqual(i.rechecks['1-1'].readings,['20']);
 assert.throws(()=>saveAnswer(s,i.id,garage,'1-1',{...base,readings:[1]}),/Recheck required/);
 assert.throws(()=>saveAnswer(s,i.id,garage,'1-1',{...base,result:'Not completed',notes:'Paused'}),/Recheck required/);
 assert.throws(()=>submitInspection(s,i.id,garage,''),/recheck/);
 const a=saveAnswer(s,i.id,garage,'1-1',{...base,readings:[1],recheckConfirmed:true,recheckNote:'Repositioned test equipment and measured again'});assert.equal(a.recheck.first.worker,'First mechanic');assert.deepEqual(a.recheck.readings,[1]);assert.equal(a.fault,null);
 recordRecheck(s,i.id,garage,'1-1',[21],'Worker');assert.throws(()=>saveAnswer(s,i.id,garage,'1-1',{...base,recheckConfirmed:true,recheckNote:'Still high'}),/tolerance/);
 const b=saveAnswer(s,i.id,garage,'1-1',{...base,result:'Defect',notes:'Still high',recheckConfirmed:true,recheckNote:'Repeat measurement still high'});assert.ok(b.fault);assert.throws(()=>saveAnswer(s,i.id,garage,'1-1',{...base,readings:[1]}),/linked defect/);
 assert.throws(()=>recordRecheck(s,i.id,'other','1-1',[20],'Worker'),/garage/);
});
test('controls screen escapes authored text and lists manager outstanding rechecks',()=>{
 const {s,content,x}=fixture();x.title='<img onerror=bad>';const html=controlsView({state:s,content,garage,me:{...user,role:'garage_manager'},assignees:[user],page:'required-instructions'});assert.match(html,/&lt;img/);assert.match(html,/Outstanding/);assert.match(html,/Unresolved measurement rechecks/);
});
