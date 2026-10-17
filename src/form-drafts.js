import {dictationButton,toggleDictation} from './dictation.js';
// Tab-local drafts are scoped to the signed-in person, garage and page.
// Passwords, files and hidden server identifiers are never persisted.
let context=null,pending=null,restoring=false;
const memory=new Map();
const eligible=f=>f?.closest?.('#workspace')&&!['auth-form','password-form'].includes(f.id)&&!f.hasAttribute('data-timeline-filter')&&!f.hasAttribute('data-filter-form')&&!f.hasAttribute('data-fault-analysis-filters')&&!f.hasAttribute('data-fault-analysis-search')&&f.dataset.performanceForm!=='filters';
const key=f=>{const c=context?.();if(!c||!eligible(f))return null;return ['fleettap-draft',c.me.id,c.garage,c.page,f.id||f.dataset.operationForm||f.dataset.contentForm||f.dataset.adminForm||f.dataset.releaseForm||f.dataset.kind||'form',f.dataset.id||'',Array.from(f.parentNode.querySelectorAll('form')).indexOf(f)].join(':');};
function read(k){try{return memory.get(k)||JSON.parse(sessionStorage.getItem(k)||'null');}catch{return memory.get(k);}}
function write(k,v){memory.set(k,v);try{sessionStorage.setItem(k,JSON.stringify(v));}catch{}}
function fields(f,includeDisabled=false){return Array.from(f.elements||[]).filter(e=>e.name&&(!['password','file','hidden','submit','button'].includes(e.type)||['requestId','scope','result'].includes(e.name))&&(includeDisabled||!e.disabled));}
function indicator(f,text){let p=f.querySelector('[data-draft-status]');if(!p){p=document.createElement('p');p.dataset.draftStatus='';p.className='draft-status';p.setAttribute('role','status');f.append(p);}p.textContent=text;}
function save(f){if(restoring)return;const k=key(f);if(!k)return;const values=fields(f).map(e=>({name:e.name,type:e.type,value:e.value,checked:e.checked}));if(!values.length)return;write(k,values);f.dataset.draftKey=k;indicator(f,'Not saved · draft kept on this device');}
export function beginFormSave(){const f=pending;pending=null;return f?.dataset.draftKey||null;}
export function completeFormSave(k){if(!k)return;memory.delete(k);try{sessionStorage.removeItem(k);}catch{}for(const f of document.querySelectorAll('#workspace form'))if(f.dataset.draftKey===k){delete f.dataset.draftKey;indicator(f,'Saved');}}
export function restoreFormDrafts(){addDictation();for(const f of document.querySelectorAll('#workspace form')){const k=key(f),values=k&&read(k);if(!values)continue;restoring=true;for(const e of fields(f,true)){const v=values.find(v=>v.name===e.name&&v.type===e.type&&(!['radio','checkbox'].includes(e.type)||v.value===e.value));if(v){if(['radio','checkbox'].includes(e.type))e.checked=v.checked;else e.value=v.value;}}f.dispatchEvent(new CustomEvent('form-draft-restored',{bubbles:true,detail:values}));restoring=false;f.dataset.draftKey=k;indicator(f,'Not saved · draft restored');}}
export function clearUserDrafts(id){try{for(let n=sessionStorage.length-1;n>=0;n--){const k=sessionStorage.key(n);if(k?.startsWith('fleettap-draft:'+id+':'))sessionStorage.removeItem(k);}}catch{}memory.clear();}
export function setupFormDrafts(getContext){context=getContext;document.addEventListener('invalid',e=>{let p=e.target.parentElement;while(p){if(p.tagName==='DETAILS')p.open=true;p=p.parentElement;}},true);for(const event of ['input','change'])document.addEventListener(event,e=>{const f=e.target.closest?.('form');if(eligible(f))save(f);});document.addEventListener('submit',e=>{if(eligible(e.target)){pending=e.target;setTimeout(()=>{if(pending===e.target)pending=null;},0);}},true);window.addEventListener('beforeunload',()=>{for(const f of document.querySelectorAll('#workspace form[data-draft-key]'))save(f);});}

function addDictation(){
 if(!globalThis.SpeechRecognition&&!globalThis.webkitSpeechRecognition)return;
 for(const [n,input] of [...document.querySelectorAll('#workspace textarea')].entries()){
  if(input.readOnly||input.disabled||input.closest('.report-text-entry')||input.parentNode.querySelector('[data-dictate]'))continue;
  input.id ||= 'dictation-field-'+n;
  const holder=document.createElement('div');holder.className='voice-control';holder.innerHTML=dictationButton().replace('data-report-mic','data-dictate="'+input.id+'"').replace('id="voice-status"','id="voice-status-'+input.id+'"');input.insertAdjacentElement('beforebegin',holder);
 }
}
documentSafe();
function documentSafe(){if(typeof document==='undefined')return;document.addEventListener('click',e=>{const b=e.target.closest('[data-dictate]');if(!b)return;const input=document.getElementById(b.dataset.dictate);if(input)toggleDictation(input,value=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));},b,b.parentNode.querySelector('[role=status]'));});}
