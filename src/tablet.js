import {taskCopy,hasExtraInstruction} from './question-copy.js';
import {questionReferences,repairEvidence} from './question-evidence-ui.js';
import {photoGallery} from './photos.js';
import {criticalQuestionNotice,criticalCheckBadge} from './critical-safety-ui.js';
import {WorkDraftMap} from './work-drafts.js';
import {checksFlowView} from './checks-flow.js';
import {tasksFor,isPM3} from './templates.js';
import {manager} from './admin-ui.js';
import {photoPicker,uploadPhotos} from './photos.js';
import {pm3} from './pm3.js';
import {readings,revision,outOfRange,sections,taskReadings} from './inspections.js';
import {esc} from './api.js';
export const available=pm3.filter(t=>!t.blocked);
const availableFor=i=>tasksFor(i).filter(t=>!t.blocked);
export const firstPending=i=>{const available=availableFor(i);const n=available.findIndex(t=>!i.answers[t.id]);return n<0?available.length:n;};
export {taskCopy} from './question-copy.js';
export const taskTitle=t=>taskCopy(t).text.split(/\s*\(/)[0].replace(/\s*\[.*$/,'').replace(/\.$/,'');
export const needsInstruction=t=>t.requiresAcknowledgement===true;
const paths={bus:'M5 4h14v15H5zM5 11h14M9 4v7M15 4v7M8 19v2M16 19v2M8 15h1M15 15h1',check:'M5 12l4 4L19 6',fault:'M14 6a5 5 0 0 0-6 6L3 17l4 4 5-5a5 5 0 0 0 6-6l-4 4-4-4z',pause:'M8 5v14M16 5v14',clock:'M12 7v5l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',back:'M19 12H5M11 6l-6 6 6 6',book:'M4 4h6l2 2 2-2h6v16h-6l-2 2-2-2H4zM12 6v16',list:'M5 5h14M5 12h14M5 19h14',next:'M5 12h14M13 6l6 6-6 6',edit:'M4 20l1-5L17 3l4 4L9 19z'};
const icon=k=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[k]||paths.check}"/></svg>`;
const tile=(attrs,label,type='check',sub='')=>`<button type="button" class="tap-tile" ${attrs}>${icon(type)}<strong>${label}</strong>${sub?`<small>${sub}</small>`:''}</button>`;
const route=(page,label,type='check',sub='')=>tile(`data-go="${esc(page)}"`,label,type,sub);
const routeFor=(id,n,i)=>n>=availableFor(i).length?'inspection/'+id+'/review':'inspection/'+id+'/item/'+n;
const drafts=new WorkDraftMap('inspections');let busy=false,host;
const photoURLs=new WeakMap();
const localPhoto=file=>{if(!photoURLs.has(file))photoURLs.set(file,URL.createObjectURL(file));return photoURLs.get(file);};
const releasePhotos=files=>(files||[]).forEach(file=>{if(photoURLs.has(file)){URL.revokeObjectURL(photoURLs.get(file));photoURLs.delete(file);}});
export function draftFor(i,t){const key=i.id+':'+t.id;if(!drafts.has(key)){const a=i.answers[t.id],pending=i.rechecks?.[t.id]&&!i.rechecks[t.id].resolvedAt;drafts.set(key,{result:a?.result||'',readings:[...(a?.readings||[])],notes:a?.notes||'',repair:a?.repair?{...a.repair,confirmed:false}:{defect:'',work:'',recheck:'',confirmed:false},failureType:a?.failureType||'visual',step:pending?'recheck':'question',recheckConfirmed:false,recheckNote:'',field:0,dirty:false,ack:false,error:'',base:a?.updated||null});}return drafts.get(key);}
export const resumeIndex=i=>{const n=availableFor(i).findIndex(t=>drafts.get(i.id+':'+t.id)?.dirty);return n<0?firstPending(i):n;};
export function resultStep(task,result){if(result==='Fixed')return 'repair';if(result==='Not due')return 'history';if(result!=='OK')return 'reason';return taskReadings(task).length?'reading':'save';}
function frame(title,content,footer='',extra=''){return `<section class="tap-screen ${extra}"><div class="tap-heading"><h1 tabindex="-1">${title}</h1></div><div class="tap-content">${content}</div>${footer?`<footer class="tap-footer">${footer}</footer>`:''}</section>`;}
const small=(attrs,label)=>`<button type="button" class="tap-small" ${attrs}>${label}</button>`;
const safety=t=>t.section==='Engine and Transmission'?'<p class="tap-warning">High-pressure fuel: never open pipes with the engine running or cranking. Clean engine before servicing.</p>':'';
const reasonOptions={Defect:['Damaged','Loose','Leaking','Not working','Outside tolerance','Other'], 'Not completed':['Awaiting parts','Equipment unavailable','Access blocked','Needs specialist','Time / shift handover','Other']};
function fieldView(t,d){const r=taskReadings(t)[d.field],value=d.readings[d.field]??'',choice=r[1]==='Yes/No'?['Yes','No']:r[1]==='choice'?['Remove clip (leaving one clip), refit pipe','Remove last clip, refit pipe','No clip present, fit new pipe']:null;
 if(choice)return `<div class="tap-grid choices">${choice.map(v=>tile(`data-reading-choice="${esc(v)}"`,esc(v),v==='No'?'fault':'check')).join('')}</div>`;
 if(r.length===4)return `<div class="tap-number"><label for="tap-reading">${esc(r[0])} <span>${esc(r[1])}</span></label><input id="tap-reading" inputmode="decimal" type="text" value="${esc(value)}" autocomplete="off" aria-label="${esc(r[0]+' '+r[1])}"><div class="tap-keypad">${['1','2','3','4','5','6','7','8','9','−','0','.'].map(v=>`<button type="button" data-number="${v}">${v}</button>`).join('')}</div><div class="tap-number-tools">${small('data-number="clear"','Clear')}${small('data-number="delete"','⌫')}</div></div>`;
 const quick=t.id==='4-9'?['No play detected']:t.id==='4-12'?['No water / corrosion found']:[];
 return `<form id="tap-text-form"><label>${esc(r[0])}<input id="tap-reading" value="${esc(value)}" maxlength="300" autocomplete="off" required></label>${quick.map(v=>small(`data-reading-choice="${esc(v)}"`,esc(v))).join('')}<button class="tap-primary">Continue</button></form>`;
}
const returned=i=>i.status==='In progress'&&i.returnNotes?'<p class="notice"><strong>Work still required:</strong> '+esc(i.returnNotes)+'</p>':'';
function overview(c,i,page=0){const available=availableFor(i),sections=[...new Set(available.map(t=>t.section))];const pageCount=Math.ceil(sections.length/6),p=Math.min(Math.max(0,page||0),pageCount-1);return frame('Choose a section',`${returned(i)}${criticalCheckBadge(c.state,i)}<div class="tap-grid buses">${sections.slice(p*6,p*6+6).map(s=>{const ts=available.filter(t=>t.section===s),pending=ts.find(t=>i.rechecks?.[t.id]&&!i.rechecks[t.id].resolvedAt)||ts.find(t=>!i.answers[t.id]||i.answers[t.id].result==='Not completed')||ts[0];return route(routeFor(i.id,available.indexOf(pending),i),esc(s),'list',`${ts.filter(t=>i.answers[t.id]).length} / ${ts.length} saved · ${ts.filter(t=>!i.answers[t.id]||i.answers[t.id].result==='Not completed'||i.rechecks?.[t.id]&&!i.rechecks[t.id].resolvedAt).length} to finish`);}).join('')}</div>`,`${small(`data-go="inspection/${i.id}/sections/${p-1}" ${p===0?'disabled':''}`,'Previous')}<span>${p+1} / ${pageCount}</span>${small(`data-go="inspection/${i.id}/sections/${p+1}" ${p===pageCount-1?'disabled':''}`,'Next')}`);}
function review(c,i){const available=availableFor(i);const pending=resumeIndex(i),done=Object.keys(i.answers).length,locked=i.status!=='In progress';return frame(locked?'Sent for review':pending<available.length?'Keep going?':'Ready for review',`${returned(i)}${criticalCheckBadge(c.state,i)}<div class="tap-summary"><strong>${done} / ${available.length}</strong><p>checks saved</p></div><p class="tap-warning">${tasksFor(i).some(t=>t.blocked)?'Regeneration remains blocked. ':''}Submitting a check does not release the bus for service.</p><div class="tap-grid jobs">${!locked&&pending<available.length?route(routeFor(i.id,pending,i),'Continue check','check'):''}${!locked&&pending===available.length?tile(`data-work-submit="${i.id}"`,'Send for review','check'):''}${route('inspection/'+i.id+'/sections','View checks','list')}${!locked?route((c.state.jobs||[]).find(j=>j.inspectionId===i.id)?(manager(c.me)?'garage-today/':'my-jobs/')+c.state.jobs.find(j=>j.inspectionId===i.id).id:'my-jobs','Finish later','pause'):''}${c.me&&manager(c.me)?route('inspection-admin/'+i.id,'Manage inspection','edit'):''}</div>`);}
export const isTabletSaving=()=>busy;
export function tabletView(c){if(busy)return frame('Saving…','<p class="tap-saving" role="status">Please wait</p>');const p=c.page.split('/');if(['fleet','start','checks','vehicle'].includes(p[0]))return checksFlowView({...c,page:'checks'+(p[1]?'/'+p[1]:'')});
 const i=c.state.inspections.find(i=>i.id===p[1]&&i.garage===c.garage&&isPM3(i)&&!i.deletedAt);if(!i)return frame('Check unavailable',route('checks','Choose a bus','bus'));
 const available=availableFor(i);
 if(p[2]==='sections')return overview(c,i,Number(p[3]));
 const n=p[2]==='item'?Number(p[3]):firstPending(i);if(p[2]==='review'||!Number.isInteger(n)||n<0||n>=availableFor(i).length)return review(c,i);
 const t=available[n],copy=taskCopy(t),references=questionReferences(c,t),d=draftFor(i,t),locked=i.status!=='In progress',fields=taskReadings(t);
 const bar=`${c.me&&manager(c.me)?small(`data-go="inspection-admin/${i.id}"`,'Manage inspection'):''}${small(`data-go="inspection/${i.id}/sections"`,'Sections')}${small(`data-go="inspection/${i.id}/review"`,'Pause')}`;
 const sectionTasks=available.filter(item=>item.section===t.section),checkHeading=`Check ${sectionTasks.findIndex(item=>item.id===t.id)+1} of ${sectionTasks.length}`;
 let title=taskTitle(t),content='',footer=bar;
 if(d.step==='instruction'){return frame('Task instruction',`<div class="tap-instruction">${safety(t)}<p>${esc(t.text)}</p><small>Template version ${i.templateSnapshot?.version||1} · page ${t.page}, item ${t.number}</small></div>`,'','instruction-screen');}
 if(locked){return frame(checkHeading,`${criticalQuestionNotice(t)}<p class="tap-task-text">${esc(copy.text)}</p>${references}<div class="tap-summary"><strong>${esc(i.answers[t.id]?.result||'No result')}</strong></div><p>${esc(i.answers[t.id]?.notes||'')}</p>${repairEvidence(i.answers[t.id]?.repair)}<p>${esc((i.answers[t.id]?.readings||[]).join(' · '))}</p><p class="tap-caption">${esc(i.answers[t.id]?.worker||'')} · locked for review</p>`,bar+small(`data-go="${routeFor(i.id,n+1,i)}"`,'Next'));}
 if(busy)return frame('Saving…','<p class="tap-saving" role="status">Please wait</p>');
 if(d.error){return frame('Not saved yet',`<p class="tap-error" role="alert">${esc(d.error)}</p><p>Your entry is still here.</p><div class="tap-grid jobs">${tile('data-work-retry','Try again','check')}${tile('data-work-edit','Review entry','edit')}${d.conflict?tile('data-work-refresh','Get latest record','list'):''}</div>`,bar);}
 if(d.step==='conflict'){return frame('This check changed',`<p>Someone else saved this check. Choose which entry to keep.</p><div class="tap-compare"><p><strong>Saved:</strong> ${esc(i.answers[t.id]?.result||'None')} · ${esc(i.answers[t.id]?.notes||'')} · ${esc((i.answers[t.id]?.readings||[]).join(' / '))}</p><p><strong>Yours:</strong> ${esc(d.result)} · ${esc(d.notes)} · ${esc(d.readings.join(' / '))}</p></div><div class="tap-grid jobs">${tile('data-use-saved','Use saved entry','check')}${tile('data-keep-entry','Save my entry','edit')}</div>`,bar);}
 if(d.step==='recheck'){title='Stop — recheck required';content=`<div class="control-stop" role="alert"><h2>Reading outside tolerance</h2><p>First reading saved: ${esc((i.rechecks?.[t.id]?.readings||[]).join(' · '))}</p><p>${taskReadings(t).map(r=>esc(r[0]+(r.length===4?' · '+(r[2]===r[3]?'target '+r[2]:'source range '+r[2]+'–'+r[3])+' '+r[1]:r[1]==='Yes/No'?' · required: Yes':''))).join('<br>')}</p><p>Check the measurement and take fresh readings. Do not continue work if unsafe.</p></div><div class="toolbar"><button type="button" class="tap-primary" data-recheck-start>Take fresh readings</button><button type="button" class="tap-small" data-repair-start>I fixed it</button></div>`;}
 else if(d.step==='recheck-note'){title='Explain the recheck';content=`<form id="tap-recheck-form"><p>${outOfRange(t,d)?'Still outside tolerance. A fault will be recorded.':'Reading now within tolerance. Explain the difference.'}</p><label>Recheck evidence<textarea id="recheck-note" minlength="5" maxlength="2000" required>${esc(d.recheckNote)}</textarea></label><button class="tap-primary">Save recheck</button></form>`;}
 else if(d.step==='repair'){title='What did you fix?';content=`<form id="tap-repair-form"><label>Fault found<textarea name="defect" minlength="5" maxlength="4000" required placeholder="What was wrong?">${esc(d.repair?.defect||d.notes)}</textarea></label><label>Repair completed<textarea name="work" minlength="5" maxlength="4000" required placeholder="What did you repair, replace or adjust?">${esc(d.repair?.work)}</textarea></label><label>Successful recheck<textarea name="recheck" minlength="5" maxlength="4000" required placeholder="How did you check that the repair worked?">${esc(d.repair?.recheck)}</textarea></label><label class="toggle-label"><input type="checkbox" name="confirmed" ${d.repair?.confirmed?'checked':''} required> I completed the repair and a successful recheck.</label><p class="tap-caption">Your repair goes to the supervisor for review.${fields.length?' Record fresh readings next.':''}</p><button class="tap-primary">Continue</button></form>`;}
 else if(d.step==='photos'){const required=t.visualDefectPhotoRequired===true&&d.failureType!=='tolerance',existing=c.state.faults.find(f=>f.id===i.answers[t.id]?.fault)?.photos||[];title=required?'Photo of the visual fault':'Add a photo?';content=photoPicker(d.photoIds?.length||d.files?.length||0)+`<p class="tap-caption">${required?'Required for this question':'Optional'} · up to 3 photos${d.result==='Fixed'?' · include the repaired area':''}</p>${existing.length?'<p class="tap-caption">Existing fault photos retained</p>'+photoGallery(existing,c.garage):''}${d.files?.length?'':photoGallery(d.photoIds,c.garage)}<div class="inspection-photo-list">${(d.files||[]).map((f,n)=>`<p><img src="${esc(localPhoto(f))}" alt="Selected fault evidence"><span>${esc(f.name)}</span> ${small('data-inspection-photo-remove="'+n+'"','Remove')}</p>`).join('')}</div>`;footer=bar+'<button type="button" class="tap-primary" data-photo-next>Continue →</button>';}
 else if(d.step==='reading'){title=fields[d.field][0];content=`<p class="tap-caption">Reading ${d.field+1} of ${fields.length}</p>${fieldView(t,d)}`;footer=bar+(fields[d.field].length===4?'<button type="button" class="tap-primary" data-reading-next>Continue →</button>':'');}
 else if(d.step==='reason'){title=d.result==='Defect'?'What is wrong?':'Why can’t you finish?';content=`<div class="tap-grid reasons">${reasonOptions[d.result].map(v=>tile(`data-reason="${esc(v)}"`,v,v==='Other'?'edit':'fault')).join('')}</div>`;}
 else if(d.step==='note'||d.step==='history'){title=d.step==='history'?'Which service record?':'Add a short note';content=`<form id="tap-note-form"><label class="sr-only" for="tap-note">${title}</label><textarea id="tap-note" maxlength="4000" required placeholder="${d.step==='history'?'Date or maintenance record reference':'What needs attention?'}">${esc(d.notes)}</textarea><p class="tap-caption">${d.step==='history'?'Unknown history cannot be marked not due.':''}</p><button class="tap-primary">Continue →</button></form>`;}
 else{content=`${criticalQuestionNotice(t)}${safety(t)}<div class="question-copy"><p class="tap-task-text">${esc(copy.text)}</p>${references}</div>${needsInstruction(t)?hasExtraInstruction(t)?`<p class="tap-caption">Read the full instruction before recording a result.</p>${small('data-work-instruction',icon('book')+' View instruction')}`:small('data-work-acknowledge',d.ack?'Instruction read ✓':'I have read this instruction'):''}${d.result&&i.answers[t.id]?`<p class="tap-caption">Previously saved: ${esc(i.answers[t.id].result==='Fixed'?'Repair reported':i.answers[t.id].result)}</p>`:''}<div class="tap-grid answers">${[['Defect','Fault','fault'],['Not completed','Can’t complete','pause'],...(t.conditional&&t.id!=='2-20'?[['Not due','Not due','clock']]:[]),['Fixed','I fixed it','fault'],['OK','OK','check']].map(([value,label,ic])=>tile(`data-result="${value}" ${needsInstruction(t)&&!d.ack?'disabled':''}`,label,ic)).join('')}</div>${!needsInstruction(t)&&hasExtraInstruction(t)?`<details class="inline-instruction"><summary>Full instruction</summary><p class="record-note">${esc(t.text)}</p></details>`:''}`;title=checkHeading;}

 return frame(esc(title),content,footer,'question-screen question-step-'+d.step);
}
function context(){const c=host.context(),p=c.page.split('/'),i=p[0]==='inspection'&&c.state.inspections.find(i=>i.id===p[1]&&i.garage===c.garage&&isPM3(i)&&!i.deletedAt);const n=p[2]==='item'?Number(p[3]):i?firstPending(i):-1,t=i?availableFor(i)[n]:null;return {...c,i,n,t,d:i&&t?draftFor(i,t):null};}
export function tabletBack(){
 if(!host||!host.context().page.startsWith('inspection/'))return false;
 if(busy)return true;
 const c=context(),part=c.page.split('/')[2];if(!c.d||['sections','review'].includes(part))return false;
 const {d,i,n}=c;d.error='';
 if(d.step==='instruction'){d.ack=true;d.step='question';host.render();}
 else if(d.step!=='question'){if(d.step==='reading'&&d.field>0)d.field--;else d.step=d.step==='photos'?(d.result==='Fixed'?'repair':'reason'):d.step==='note'?'reason':d.step==='reading'&&['Defect','Fixed'].includes(d.result)?'photos':'question';host.render();}
 else host.go(n>0?routeFor(i.id,n-1,i):'checks/'+encodeURIComponent(i.vehicle));
 return true;
}
export function setupTablet(h){host=h;

 async function save(){
  const c=context();if(!c.d||busy)return;const {i,t,d,n}=c;d.error='';busy=true;
  const feedback=document.querySelector('[data-result="OK"], [data-reading-next], #tap-text-form .tap-primary'),caption=feedback?.querySelector('strong')||feedback;
  if(feedback){feedback.setAttribute('aria-busy','true');if(caption)caption.textContent='Saving…';}
  try{
   if(outOfRange(t,d)&&!d.recheckConfirmed){await host.mutation('reading_check',{readings:d.readings},{id:i.id,item:t.id});if(d.result==='OK')d.failureType='tolerance';d.step='recheck';busy=false;host.render();return;}
   const failed=['Defect','Fixed'].includes(d.result);
   if(failed&&t.visualDefectPhotoRequired===true&&d.failureType!=='tolerance'&&!d.files?.length&&!d.photoIds?.length&&!c.state.faults.find(f=>f.id===i.answers[t.id]?.fault)?.photos?.length){d.step='photos';busy=false;host.render();return;}
   if(failed&&d.files?.length&&!d.photoIds?.length)d.photoIds=await uploadPhotos(d.files,c.garage);
   await host.mutation('answer',{result:d.result,readings:d.readings,notes:d.notes,failureType:d.failureType,repair:d.result==='Fixed'?d.repair:null,recheckConfirmed:d.recheckConfirmed,recheckNote:d.recheckNote,photos:failed?(d.photoIds||[]):[]},{id:i.id,item:t.id});
   releasePhotos(d.files);drafts.delete(i.id+':'+t.id);
   if(feedback){feedback.removeAttribute('aria-busy');feedback.classList.add('tap-save-success');if(caption)caption.textContent=d.result==='OK'?'OK ✓':'Saved ✓';feedback.setAttribute('aria-label','Saved successfully');await new Promise(resolve=>setTimeout(resolve,650));}
   busy=false;host.go(routeFor(i.id,n+1,i));host.notify(d.result==='Fixed'?'Repair sent for review ✓':'Saved ✓');
  }catch(e){busy=false;d.error=e.message;d.conflict=e.status===409;host.render();}
 }
 async function afterReason(){const {d}=context();if(['Defect','Fixed'].includes(d.result)){d.step='photos';host.render();}else await beginReadings();}
 async function beginReadings(){const {t,d}=context();if(taskReadings(t).length&&['OK','Defect','Fixed'].includes(d.result)){d.step='reading';d.field=0;host.render();}else await save();}
 async function nextReading(value){
  const {t,d}=context();if(value===undefined)value=document.querySelector('#tap-reading')?.value;
  if(!String(value??'').trim()){host.notify('Enter a reading.');return;}const r=taskReadings(t)[d.field];if(r.length===4&&!Number.isFinite(Number(value))){host.notify('Enter a valid number.');return;}
  d.readings[d.field]=value;d.dirty=true;if(d.field+1<taskReadings(t).length){d.field++;host.render();return;}
  if(!d.recheckConfirmed&&outOfRange(t,d)){await save();return;}
  if(d.recheckConfirmed){
   if(outOfRange(t,d)){
    if(d.result==='Fixed'){d.notes='Repair attempted: '+d.repair.work+' · Recheck remains outside tolerance.';d.repair=null;}
    d.result='Defect';
   }
   if(d.result==='Fixed'){d.recheckNote=d.repair.recheck;await save();return;}
   d.step='recheck-note';host.render();return;
  }
  await save();
 }
 function startRepair(){const {d,i,t}=context();d.result='Fixed';d.dirty=true;d.error='';d.step='repair';d.repair??={defect:d.notes||'',work:'',recheck:'',confirmed:false};d.repair.confirmed=false;d.recheckConfirmed=!!(i.rechecks?.[t.id]&&!i.rechecks[t.id].resolvedAt);host.render();}
 document.addEventListener('click',async e=>{const el=e.target.closest('button');if(!el)return;if(busy&&el.closest('.tap-screen'))return;const c=context();try{
 if(el.dataset.workStart){busy=true;host.render();const i=await host.mutation('start',{vehicle:el.dataset.workStart});busy=false;host.go(routeFor(i.id,resumeIndex(i),i));}
 if(el.dataset.workSubmit){busy=true;el.disabled=true;await host.mutation('submit',{notes:'Submitted via tablet workflow. See individual check results.'},{id:el.dataset.workSubmit});busy=false;const c=host.context(),j=(c.state.jobs||[]).find(j=>j.inspectionId===el.dataset.workSubmit);if(j)host.go((manager(c.me)?'garage-today/':'my-jobs/')+j.id);else host.render();host.notify(j?'Inspection sent. Submit the job when its work is complete.':'Inspection sent for review.');}
 if(!c.d)return;const {d,t,i,n}=c;
 if(el.hasAttribute('data-recheck-start')){d.recheckConfirmed=true;d.result=d.result||'OK';d.readings=[];d.field=0;d.step='reading';d.dirty=true;host.render();}
 if(el.hasAttribute('data-repair-start'))startRepair();
 if(el.hasAttribute('data-work-acknowledge')){d.ack=true;host.render();}
 if(el.hasAttribute('data-work-instruction')){d.step='instruction';host.render();}
 if(el.dataset.result){if(needsInstruction(t)&&!d.ack)return;if(el.dataset.result==='Fixed'){startRepair();return;}d.failureType=el.dataset.result==='Defect'?'visual':null;d.result=el.dataset.result;d.dirty=true;d.notes='';d.error='';d.step=resultStep(t,d.result);d.field=0;if(d.step==='save')await save();else host.render();}
 if(el.dataset.reason){d.notes=el.dataset.reason;d.dirty=true;if(d.notes==='Other'){d.notes='';d.step='note';host.render();}else await afterReason();}
 if(el.hasAttribute('data-photo-next')){const required=t.visualDefectPhotoRequired===true&&d.failureType!=='tolerance',existing=c.state.faults.find(f=>f.id===i.answers[t.id]?.fault)?.photos?.length;if(required&&!d.files?.length&&!d.photoIds?.length&&!existing){host.notify('Add a photo of the visual fault.');return;}await beginReadings();}
 if(el.hasAttribute('data-inspection-photo-remove')){releasePhotos(d.files.splice(Number(el.dataset.inspectionPhotoRemove),1));d.photoIds=null;d.dirty=true;host.render();}
 if(el.hasAttribute('data-reading-choice'))await nextReading(el.dataset.readingChoice);
 if(el.hasAttribute('data-reading-next'))await nextReading();
 if(el.hasAttribute('data-number')){const input=document.querySelector('#tap-reading'),v=el.dataset.number;let val=input.value;if(v==='clear')val='';else if(v==='delete')val=val.slice(0,-1);else if(v==='−')val=val.startsWith('-')?val.slice(1):'-'+val;else if(v!=='.'||!val.includes('.'))val+=v;input.value=val.slice(0,20);d.readings[d.field]=input.value;d.dirty=true;}
 if(el.hasAttribute('data-work-retry')||el.hasAttribute('data-keep-entry'))await save();
 if(el.hasAttribute('data-work-edit')){d.error='';d.step='question';host.render();}
 if(el.hasAttribute('data-work-refresh')){await host.reload();const fresh=context();d.error='';d.step=(fresh.i?.answers[t.id]?.updated||null)!==d.base?'conflict':'question';host.render();}
 if(el.hasAttribute('data-use-saved')){drafts.delete(i.id+':'+t.id);host.render();}
 }catch(error){busy=false;if(el.dataset.workSubmit)el.disabled=false;host.render();host.notify(error.message);}});
 document.addEventListener('submit',async e=>{if(!['tap-text-form','tap-note-form','tap-recheck-form','tap-repair-form'].includes(e.target.id))return;e.preventDefault();if(busy)return;if(e.target.id==='tap-repair-form'){const {d}=context(),v=Object.fromEntries(new FormData(e.target));d.repair={defect:v.defect.trim(),work:v.work.trim(),recheck:v.recheck.trim(),confirmed:v.confirmed==='on'};d.notes=d.repair.defect;d.readings=[];d.recheckNote=d.repair.recheck;d.dirty=true;await afterReason();return;}if(e.target.id==='tap-recheck-form'){const {d}=context();d.recheckNote=document.querySelector('#recheck-note').value.trim();if(d.result==='Defect')d.notes=(d.notes?d.notes+' · ':'')+'Recheck: '+d.recheckNote;await save();return;}if(e.target.id==='tap-text-form'){await nextReading();return;}const {d}=context();d.notes=document.querySelector('#tap-note').value.trim();if(!d.notes){host.notify('Add a short note.');return;}d.dirty=true;await afterReason();});
 document.addEventListener('input',e=>{const {d}=context();if(!d)return;if(e.target.closest?.('#tap-repair-form')){d.repair??={};d.repair[e.target.name]=e.target.name==='confirmed'?e.target.checked:e.target.value;d.dirty=true;}if(e.target.id==='recheck-note'){d.recheckNote=e.target.value;d.dirty=true;}if(e.target.id==='tap-reading'){d.readings[d.field]=e.target.value;d.dirty=true;}if(e.target.id==='tap-note'){d.notes=e.target.value;d.dirty=true;}});
 document.addEventListener('change',e=>{if(e.target.name==='photos'){const {d}=context();if(d){const added=[...e.target.files],all=[...(d.files||[]),...added];if(all.length>3){host.notify('Choose up to three photos.');return;}d.files=all;d.photoIds=null;d.photosNeedReattach=false;d.dirty=true;host.render();}}});
 window.addEventListener('beforeunload',e=>{if(busy||[...drafts.values()].some(d=>d.dirty)){e.preventDefault();e.returnValue='';}});
}
