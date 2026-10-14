import {esc} from './api.js';
import {photoPicker,uploadPhotos} from './photos.js';
import {dictationButton,dictationActive,stopDictation,toggleDictation} from './dictation.js';
export const reportTypes=['Near miss','Safety concern','Injury','Vehicle damage','Spill','Other'];
export const faultTypes=['Brakes','Tyres & wheels','Engine','Lights & electrics','Doors & ramp','Other'];
export const faultSymptoms=['Not working','Damaged','Leaking','Unusual noise','Warning light','Describe it'];
const responses=['Reported to supervisor','Stopped using equipment','Area made safe','No action yet','Other action'];
const paths={report:'M12 5v14M5 12h14',fault:'M14 6a5 5 0 0 0-6 6L3 17l4 4 5-5a5 5 0 0 0 6-6l-4 4-4-4z',bus:'M5 4h14v15H5zM5 11h14M9 4v7M15 4v7M8 19v2M16 19v2',alert:'M12 3L2 21h20zM12 9v5M12 17v1',person:'M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0M5 22v-5a7 7 0 0 1 14 0v5',wheel:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 3v18M3 12h18',light:'M8 16c0-3-3-3-3-7a7 7 0 0 1 14 0c0 4-3 4-3 7zM8 20h8M10 23h4',drop:'M12 2S4 11 4 15a8 8 0 0 0 16 0c0-4-8-13-8-13z',door:'M5 22V2h14v20M15 12h1',check:'M4 12l5 5L20 5',edit:'M4 20l1-5L17 3l4 4L9 19z',list:'M5 5h14M5 12h14M5 19h14'};
const icon=k=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[k]||paths.report}"/></svg>`;
const tile=(attr,label,k='report',sub='')=>`<button type="button" class="tap-tile" ${attr}>${icon(k)}<strong>${esc(label)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</button>`;
const button=(attr,label)=>`<button type="button" class="tap-small" ${attr}>${esc(label)}</button>`;
const drafts=new Map();let host,busy=false;
export const reportBusy=()=>busy;
export const isReportRoute=page=>['report','faults','defect'].includes(page.split('/')[0]);
export function newReportDraft(kind,vehicle=''){return {kind,vehicle,type:'',description:'',immediate:'',files:[],photoIds:null,step:'type',trail:[],dirty:false,error:'',query:'',busPage:0,requestId:crypto.randomUUID(),saved:null};}
function active(){const c=host.context(),kind=c.page==='report'?'reports':'faults',vehicle=c.page.startsWith('defect/')?decodeURIComponent(c.page.slice(7)):'',key=c.garage+':'+kind+':'+vehicle;if(!drafts.has(key))drafts.set(key,newReportDraft(kind,vehicle));return {...c,d:drafts.get(key),key};}
export function recordValues(d){if(!d.type||!d.description.trim())throw Error('Add a short description.');if(d.kind==='faults'&&!d.vehicle)throw Error('Choose a bus.');return {vehicle:d.vehicle,type:d.type,title:d.kind==='faults'?d.type+' fault':d.type,description:d.description.trim(),immediate:d.immediate.trim(),photos:d.photoIds||[],requestId:d.requestId};}
function move(d,step){stopDictation();d.trail.push(d.step);d.step=step;d.error='';host.render();}
const choices=(values,key,icons=[])=>`<div class="tap-grid reasons">${values.map((v,n)=>tile(`data-report-${key}="${esc(v)}"`,v,icons[n]||'check')).join('')}</div>`;
function textEntry(d,field,title){return `<div class="report-text-entry">${dictationButton()}<label class="sr-only" for="report-text">${esc(title)}</label><textarea id="report-text" data-report-field="${field}" maxlength="${field==='immediate'?2000:4000}" placeholder="${field==='immediate'?'What action did you take?':'What happened? Where on the bus or in the garage?'}">${esc(d[field])}</textarea></div>`;}
export function reportFlowView(c){const {d}=active(),fault=d.kind==='faults';let title='',content='',footer='';
 if(d.saved){title=fault?'Fault saved':'Report saved';content=`<div class="report-done">${icon('check')}<p>Added to this garage’s records.</p></div><div class="tap-grid jobs">${tile('data-report-new','Report another','report')}${tile('data-report-records','View records','list')}${tile('data-go="home"','Home','check')}</div>`;}
 else if(d.step==='type'){title=fault?'What needs attention?':'What happened?';content=choices(fault?faultTypes:reportTypes,'type',fault?['wheel','wheel','fault','light','door','edit']:['alert','alert','person','bus','drop','edit']);footer=button('data-report-records','View records');}
 else if(d.step==='vehicle'){title='Which bus?';const vehicles=c.state.vehicles.filter(v=>v.garage===c.garage&&[v.id,v.registration,v.model].join(' ').toLowerCase().includes(d.query.toLowerCase())),size=fault?6:5,pages=Math.max(1,Math.ceil(vehicles.length/size));d.busPage=Math.max(0,Math.min(d.busPage,pages-1));content=`<label class="sr-only" for="report-bus-search">Find a bus</label><input id="report-bus-search" class="tap-search" type="search" placeholder="Find bus number" value="${esc(d.query)}"><div class="tap-grid buses">${!fault?tile('data-report-bus=""','Garage / no bus','report'):''}${vehicles.slice(d.busPage*size,(d.busPage+1)*size).map(v=>tile(`data-report-bus="${esc(v.id)}"`,v.id,'bus',v.registration||'')).join('')}</div>${!vehicles.length?'<p class="tap-caption">No matching buses.</p>':''}`;footer=button('data-report-back','← Back')+button(`data-report-page="-1" ${d.busPage===0?'disabled':''}`,'Previous')+`<span>${d.busPage+1} / ${pages}</span>`+button(`data-report-page="1" ${d.busPage===pages-1?'disabled':''}`,'Next');}
 else if(d.step==='symptom'){title='What is wrong?';content=choices(faultSymptoms,'symptom',['fault','fault','drop','alert','light','edit']);}
 else if(d.step==='description'){title=fault?'Describe the fault':'Tell us what happened';content=textEntry(d,'description',title);footer=button('data-report-back','← Back')+'<button type="button" class="tap-primary" data-report-next>Continue →</button>';}
 else if(d.step==='response'){title='What did you do?';content=choices(responses,'response',['person','fault','check','alert','edit']);}
 else if(d.step==='immediate'){title='What action did you take?';content=textEntry(d,'immediate',title);footer=button('data-report-back','← Back')+'<button type="button" class="tap-primary" data-report-next>Continue →</button>';}
 else if(d.step==='photos'){title='Add photos?';content=photoPicker(d.files.length)+'<p class="tap-caption">Optional · up to 3 photos</p>'+(d.files.length?button('data-report-clear-photos','Remove photos'):'');footer=button('data-report-back','← Back')+'<button type="button" class="tap-primary" data-report-next>Continue →</button>';}
 else if(d.step==='review'){title='Ready to send?';content=`<div class="report-review"><p><strong>${esc(d.type)}</strong><span>${esc(d.vehicle||'Garage / no bus')}</span></p><p class="report-review-detail">${esc(d.description)}</p><p>${esc(d.immediate)}</p><p class="tap-caption">${d.files.length} photo${d.files.length===1?'':'s'}</p></div><div class="report-edit">${button('data-report-edit="description"','Add / edit details')}${button('data-report-edit="response"','Change action')}${button('data-report-edit="photos"','Change photos')}</div>`;footer=button('data-report-back','← Back')+`<button type="button" class="tap-primary" data-report-save ${busy?'disabled':''}>${busy?'Saving…':fault?'Save fault':'Save report'}</button>`;}
 if(!footer&&!d.saved)footer=button('data-report-back','← Back');
 if(d.error)content=`<p class="tap-error" role="alert">${esc(d.error)}</p>${d.conflict?button('data-report-refresh','Get latest records'):''}`+content;
 return `<section class="tap-screen report-screen"><div class="tap-heading"><p>${fault?'Faults':'Report'}${d.type?' · '+esc(d.type):''}${d.vehicle?' · '+esc(d.vehicle):''}</p><h1>${title}</h1></div><div class="tap-content">${content}</div>${footer?`<footer class="tap-footer">${footer}</footer>`:''}</section>`;
}
export function setupReportFlow(h){host=h;
 document.addEventListener('click',async e=>{const el=e.target.closest('button');if(!el||!isReportRoute(host.context().page)||busy)return;const {d,key,garage,state}=active();try{
 if(el.hasAttribute('data-report-mic')){toggleDictation(document.querySelector('#report-text'),value=>{d[document.querySelector('#report-text').dataset.reportField]=value;d.dirty=true;});return;}
 if(el.hasAttribute('data-report-type')){d.type=el.dataset.reportType;d.dirty=true;move(d,d.vehicle?(d.kind==='faults'?'symptom':'description'):'vehicle');}
 if(el.hasAttribute('data-report-bus')){const id=el.dataset.reportBus;if(id&&!state.vehicles.some(v=>v.id===id&&v.garage===garage))throw Error('Choose a bus in this garage.');if(!id&&d.kind==='faults')throw Error('Choose a bus.');d.vehicle=id;d.dirty=true;move(d,d.kind==='faults'?'symptom':'description');}
 if(el.hasAttribute('data-report-symptom')){const value=el.dataset.reportSymptom;d.description=value==='Describe it'?'':value;d.dirty=true;move(d,value==='Describe it'?'description':'response');}
 if(el.hasAttribute('data-report-response')){const value=el.dataset.reportResponse;d.immediate=value==='Other action'?'':value;d.dirty=true;move(d,value==='Other action'?'immediate':'photos');}
 if(el.hasAttribute('data-report-next')){if(dictationActive())throw Error('Tap Stop talking, then review your words.');if(['description','immediate'].includes(d.step)&&!d[d.step].trim())throw Error('Say or type a short description.');if(d.step==='photos'&&d.files.length>3)throw Error('Choose up to three photos.');move(d,d.step==='description'?'response':d.step==='immediate'?'photos':'review');}
 if(el.hasAttribute('data-report-edit'))move(d,el.dataset.reportEdit);
 if(el.hasAttribute('data-report-back')){stopDictation();d.step=d.trail.pop()||'type';d.error='';host.render();}
 if(el.hasAttribute('data-report-page')){d.busPage+=Number(el.dataset.reportPage);host.render();}
 if(el.hasAttribute('data-report-clear-photos')){d.files=[];d.photoIds=null;host.render();}
 if(el.hasAttribute('data-report-records')){stopDictation();host.records(d.kind);}
 if(el.hasAttribute('data-report-new')){stopDictation();drafts.delete(key);host.render();}
 if(el.hasAttribute('data-report-refresh')){await host.reload();d.error='';d.conflict=false;host.render();}
 if(el.hasAttribute('data-report-save')){recordValues(d);busy=true;d.error='';host.render();try{if(!d.photoIds)d.photoIds=await uploadPhotos(d.files,garage);d.saved=await host.mutation('record',recordValues(d),{kind:d.kind});d.dirty=false;d.files=[];busy=false;host.render();host.notify('Saved ✓');}catch(error){busy=false;d.error=error.message;d.conflict=error.status===409;host.render();}}
 }catch(error){host.notify(error.message);}});
 document.addEventListener('input',e=>{if(!isReportRoute(host.context().page)||busy)return;const {d}=active();if(e.target.id==='report-text'){d[e.target.dataset.reportField]=e.target.value;d.dirty=true;}if(e.target.id==='report-bus-search'){d.query=e.target.value;d.busPage=0;host.render();const input=document.querySelector('#report-bus-search');input.focus();}});
 document.addEventListener('change',e=>{if(!isReportRoute(host.context().page)||e.target.name!=='photos'||busy)return;const {d}=active();d.files=[...e.target.files];d.photoIds=null;d.dirty=true;});
 window.addEventListener('beforeunload',e=>{if(busy||[...drafts.values()].some(d=>d.dirty)){e.preventDefault();e.returnValue='';}});
 window.addEventListener('pagehide',stopDictation);
}
