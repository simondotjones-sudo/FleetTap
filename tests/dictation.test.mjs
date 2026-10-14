import test from 'node:test';
import assert from 'node:assert/strict';
import {dictationButton,toggleDictation,stopDictation,dictationActive} from '../src/dictation.js';
test('dictation is optional, appends final speech, stops on navigation and handles denied permission',()=>{
 assert.match(dictationButton(),/Voice unavailable/);
 let instance,starts=0,aborts=0;class Recognition{constructor(){instance=this;}start(){starts++;}abort(){aborts++;}stop(){this.onend();}}
 globalThis.SpeechRecognition=Recognition;
 const label={textContent:''},button={setAttribute:()=>{},querySelector:()=>label},status={textContent:''};globalThis.document={querySelector:q=>q==='[data-report-mic]'?button:status};
 const input={value:'Existing detail.',maxLength:4000,readOnly:false};let draft='';assert.equal(starts,0);toggleDictation(input,v=>draft=v);assert.equal(starts,1);assert.equal(dictationActive(),true);
 instance.onresult({resultIndex:0,results:[Object.assign([{transcript:'Rear door damaged.'}],{isFinal:true})]});assert.equal(draft,'Existing detail. Rear door damaged.');stopDictation();assert.equal(input.readOnly,false);assert.equal(dictationActive(),false);assert.equal(aborts,1);
 instance.onresult({resultIndex:0,results:[Object.assign([{transcript:'Late result'}],{isFinal:true})]});assert.ok(!draft.includes('Late result'));
 toggleDictation(input,v=>draft=v);instance.onerror({error:'not-allowed'});assert.match(status.textContent,/permission denied/);assert.equal(dictationActive(),false);assert.equal(input.readOnly,false);
 delete globalThis.SpeechRecognition;
});
