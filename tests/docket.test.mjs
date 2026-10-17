import test from 'node:test';
import assert from 'node:assert/strict';
import {analyseDocket,validateDocketExtraction,docketRecordSource} from '../server/docket.mjs';
import {matchDocketBus,docketSourceView} from '../src/docket.js';
import {seed,addRecord,savedRecordRequest} from '../src/model.js';
import {WorkDraftMap,setDraftUser,preserveWorkDrafts} from '../src/work-drafts.js';
import {setupReportFlow,reportFlowView,reportBack,newReportDraft,recordValues} from '../src/report-flow.js';

const id='11111111-1111-4111-8111-111111111111',garage='garage-a',user={id:'worker-a',name:'Test worker'};
const extracted={isDocket:true,multipleDockets:false,vehicleUnclear:false,fleetNumber:'SG 271',registration:'',reference:'D-001',reportedDate:'17/10/26',driver:'Driver 42',route:'15',type:'Doors & ramp',description:'Front door fails to close when warm.\nWarning light does not stay on.',immediate:'Driver informed depot.',warnings:[]};
const jpeg=Uint8Array.from([255,216,255,224,0,0,0,0,0,0,0,0]);
const photos={getMetadata:async()=>({metadata:{garage,uploader:user.id}}),getWithMetadata:async()=>({metadata:{garage,uploader:user.id},data:jpeg.buffer})};
const completion=value=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});

test('docket analysis sends only authorised uploaded images, uses structured output and refuses unreadable or incomplete results',async()=>{
 let calls=0;const fetchImpl=async(url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.input[0].content.length,2);assert.match(body.input[0].content[1].image_url,/^data:image\/jpeg;base64,/);assert.doesNotMatch(options.body,/worker-a|garage-a/);return Response.json(completion(extracted));};
 const options={photoIds:[id],garage,user,photos,apiKey:'synthetic-key',fetchImpl};
 assert.deepEqual((await analyseDocket(options)).extracted,extracted);assert.equal(calls,1);
 await assert.rejects(analyseDocket({...options,photoIds:[]}),/one to three/);
 await assert.rejects(analyseDocket({...options,photoIds:Array(4).fill(id)}),/three photos/);
 await assert.rejects(analyseDocket({...options,photos:{...photos,getMetadata:async()=>({metadata:{garage:'other',uploader:user.id}})}}),/Photo unavailable/);
 await assert.rejects(analyseDocket({...options,photos:{...photos,getMetadata:async()=>({metadata:{garage,uploader:'other'}})}}),/Photo unavailable/);
 assert.equal(calls,1);
 await assert.rejects(analyseDocket({...options,apiKey:''}),/not switched on/);
 await assert.rejects(analyseDocket({...options,fetchImpl:async()=>{throw Error('secret-network-error');}}),e=>e.status===503&&!e.message.includes('secret'));
 await assert.rejects(analyseDocket({...options,fetchImpl:async()=>Response.json({error:{message:'secret'}},{status:429})}),/busy/);
 for(const data of [{...completion(extracted),status:'incomplete'},completion({...extracted,description:''}),{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'No'}]}]},completion({...extracted,multipleDockets:true})])await assert.rejects(analyseDocket({...options,fetchImpl:async()=>Response.json(data)}));
 assert.throws(()=>validateDocketExtraction({...extracted,driver:{unexpected:true}}));
});

test('bus matching requires one exact garage-scoped match and does not guess ambiguous handwriting',()=>{
 const rows=[{id:'SG271',garage,registration:'161-D-123'},{id:'SG272',garage,registration:'161-D-456'},{id:'SG273',garage:'other'}];
 assert.equal(matchDocketBus(extracted,rows,garage).vehicle,'SG271');
 assert.equal(matchDocketBus({...extracted,fleetNumber:'',registration:'161 D 123'},rows,garage).vehicle,'SG271');
 for(const data of [{fleetNumber:'271'},{fleetNumber:'SG273'},{vehicleUnclear:true},{registration:'161-D-456'}])assert.equal(matchDocketBus({...extracted,...data},rows,garage).vehicle,'');
 assert.equal(matchDocketBus(extracted,[...rows,{id:'SG 271',garage}],garage).vehicle,'');
});

test('docket evidence binds the server extraction to the same user, garage and photos; reviewed edits do not rewrite the extraction',async()=>{
 const entry={garage,uploader:user.id,photos:[id],extracted,model:'test-model',created:'2026-10-17T00:00:00Z'},store={get:async()=>entry};
 const values={docketAnalysisId:id,docketReviewed:true,docket:{reference:'D-001 corrected',reportedDate:'17/10/26',driver:'Driver 42',route:'15'}};
 const result=await docketRecordSource(values,[id],garage,user,store);
 assert.equal(result.source,'driver_docket');assert.equal(result.docket.reference,'D-001 corrected');assert.equal(result.docket.extracted.reference,'D-001');assert.equal(result.docket.reviewedBy,user.id);
 for(const [v,p,g,u] of [[{...values,docketReviewed:false},[id],garage,user],[values,[],garage,user],[values,[id],'other',user],[values,[id],garage,{id:'other'}]])await assert.rejects(docketRecordSource(v,p,g,u,store));
 assert.doesNotMatch(docketSourceView({...result.docket,reference:'<script>alert(1)</script>'}),/<script>/);
 const state=seed(),record=addRecord(state,'faults',{garage:'demo-north',vehicle:'DEMO-271',title:'Door fault',description:extracted.description,photos:[id],...result});
 assert.equal(record.status,'Open');assert.equal(state.actions[0].source,record.id);assert.deepEqual(record.photos,[id]);
});

test('docket draft keeps uploaded photo IDs after reload and asks to reattach unsent photos',()=>{
 const storage=new Map();globalThis.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};setDraftUser('docket-recovery');
 const drafts=new WorkDraftMap('docket-recovery'),draft={...newReportDraft('faults'),dirty:true,step:'docket-review',photoIds:[id],files:[{name:'new.jpg',docketPreview:'do-not-store'}],docket:{id:'',fields:{}}};drafts.set('one',draft);preserveWorkDrafts();const saved=JSON.parse(storage.get(drafts.key('one')));
 assert.equal(saved.step,'docket-photos');assert.deepEqual(saved.photoIds,[id]);assert.deepEqual(saved.files,[]);assert.match(saved.error,/attach/);assert.ok(!JSON.stringify(saved).includes('do-not-store'));
});

test('scan review requires bus confirmation, permits edits and retries a lost save without duplicating the fault',async()=>{
 const storage=new Map(),key='fleettap-workdraft:docket-ui:reports:docket-ui:demo-north:faults:';
 globalThis.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};setDraftUser('docket-ui');
 const draft={...newReportDraft('faults'),step:'docket-photos',dirty:true,photoIds:[id],docket:{id:'',fields:{},warnings:[]}};storage.set(key,JSON.stringify(draft));
 const listeners={};globalThis.document={addEventListener:(k,f)=>listeners[k]=f};globalThis.window={addEventListener:()=>{}};
 const state=seed(),notices=[];let html='',loseResponse=true,scans=0;const context=()=>({page:'faults',garage:'demo-north',me:{id:'docket-ui'},state});const render=()=>{html=reportFlowView(context());};
 setupReportFlow({context,render,notify:s=>notices.push(s),analyseDocket:async()=>{scans++;if(scans===1)throw Error('Scan unavailable');return {id,extracted,vehicle:'',warnings:['Choose the bus.']};},mutation:async(action,values,{kind})=>{const r=savedRecordRequest(state,kind,'demo-north','docket-ui',values.requestId)||addRecord(state,kind,{...values,garage:'demo-north',createdBy:'docket-ui'});if(loseResponse){loseResponse=false;throw Error('Lost response');}return r;}});render();
 const click=async dataset=>listeners.click({target:{closest:()=>({dataset,hasAttribute:k=>Object.hasOwn(dataset,k.replace(/^data-/,'').replace(/-([a-z])/g,(_,x)=>x.toUpperCase()))})}});
 assert.match(html,/Scan driver docket/);await click({docketAnalyse:''});assert.match(html,/Scan unavailable/);assert.match(html,new RegExp(id));await click({docketAnalyse:''});assert.match(html,/Check the docket/);await click({reportSave:''});assert.ok(notices.includes('Choose a bus.'));
 await click({reportEdit:'vehicle'});assert.match(html,/Which bus/);await click({reportBus:'DEMO-271'});assert.match(html,/Check the docket/);
 listeners.input({target:{id:'report-text',dataset:{reportField:'description'},value:'Front door intermittently fails to close.'}});listeners.input({target:{dataset:{docketMeta:'reference'},value:'D-001 corrected'}});
 const before=state.faults.length;await click({reportSave:''});assert.match(html,/Lost response/);await click({reportSave:''});assert.match(html,/Fault saved/);assert.equal(state.faults.length,before+1);assert.equal(state.faults[0].description,'Front door intermittently fails to close.');assert.equal(state.faults[0].docket.reference,'D-001 corrected');assert.deepEqual(state.faults[0].photos,[id]);assert.equal(reportBack(),false);
 const incomplete={...draft,type:'Other',vehicle:'DEMO-271',description:'A defect'};assert.throws(()=>recordValues(incomplete),/Scan the docket/);
});

test('camera shots accumulate up to three and removing a photo permits a replacement',async()=>{
 setDraftUser('docket-camera');const listeners={};globalThis.document={addEventListener:(k,f)=>listeners[k]=f,createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,preview'})};globalThis.window={addEventListener:()=>{}};globalThis.createImageBitmap=async()=>({width:100,height:200,close(){}});
 let html='';const c={page:'faults',garage:'demo-north',me:{id:'docket-camera'},state:seed()},render=()=>{html=reportFlowView(c);};setupReportFlow({context:()=>c,render,notify:()=>{}});render();
 const click=async dataset=>listeners.click({target:{closest:()=>({dataset,hasAttribute:k=>Object.hasOwn(dataset,k.replace(/^data-/,'').replace(/-([a-z])/g,(_,x)=>x.toUpperCase()))})}});
 const photo=n=>({name:n+'.jpg',size:100});const add=async files=>listeners.change({target:{name:'docket-photos',files}});
 await click({reportScan:''});await add([photo(1)]);assert.match(html,/Remove photo 1/);await add([photo(2)]);assert.match(html,/Remove photo 2/);await add([photo(3)]);assert.match(html,/Remove photo 3/);assert.doesNotMatch(html,/name="docket-photos"/);
 await add([photo(4)]);assert.match(html,/three photos in total/);assert.doesNotMatch(html,/Remove photo 4/);await click({docketRemove:'1'});assert.match(html,/name="docket-photos"/);await add([photo(4)]);assert.match(html,/Remove photo 3/);assert.doesNotMatch(html,/three photos in total/);
 await click({docketManual:''});assert.match(html,/What needs attention/);
});
