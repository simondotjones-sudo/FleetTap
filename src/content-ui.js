import {api,esc} from './api.js';
import {author,reviewer} from './roles.js';
import {sopWorkspaceView,setupSOPDocuments,sopTile,contentFrame} from './sop-workspace.js';
const go=(p,t)=>`<button class="tap-small" type="button" data-go="${esc(p)}">${esc(t)}</button>`;
const frame=(t,b)=>`<section class="admin-tools content-work"><h1>${esc(t)}</h1>${b}</section>`;
const full=x=>`<details class="card"><summary>Full instructions · version ${x.version}</summary><p class="record-note">${esc(x.instructions)}</p></details>`;
export function contentView(c){
 if(c.page==='content/sops'||c.page.startsWith('content/sops/')||c.page.startsWith('org-sop/'))return sopWorkspaceView(c);
 const p=c.page.split('/'),content=c.content||{sops:[],checklists:[]};
 if(p[0]==='content'){
  if(!author(c.me))return contentFrame('Organisation Admin access required','','sops');
  if(!c.organisation)return contentFrame('Choose a garage','<p>Select a garage to author content for its organisation.</p>','content/sops');
  const list=content.checklists||[],entry=list.find(x=>x.id===p[2]);
  if(!p[2])return contentFrame('Organisation Checklists',`<div class="sop-hub-grid">${sopTile('content/checklists/new','Create checklist','Build a set of questions','add')}${sopTile('content/checklists/library','Checklist library',list.length+' checklists available','book')}${sopTile('checklists','Run checklists','Complete checks & view records','steps')}${sopTile('content/sops','SOPs','Procedures & source documents','book')}${sopTile('template-admin','PM3 template','Inspection questions & PDF','pdf')}${sopTile('reviews','Review & sign off','Check submitted work','list')}</div>`,'content/sops',true);
  if(p[2]==='library')return contentFrame('Checklist library',`<div class="toolbar">${go('content/checklists/new','Create checklist')}</div>${list.length?`<div class="sop-hub-grid">${list.map(x=>sopTile('content/checklists/'+x.id,x.title,x.steps.length+' questions · version '+x.version,'list')).join('')}</div>`:'<div class="sop-empty"><h2>No checklists yet</h2><p>Create a checklist to share it across your organisation.</p></div>'}`,'content/checklists');
  if(p[2]!=='new'&&!entry)return contentFrame('Checklist unavailable','<p>Return to the library to choose a checklist.</p>','content/checklists/library');
  return contentFrame(entry?'Edit checklist':'Create checklist',`<form class="sop-editor" data-content-form="save" data-kind="checklists" data-id="${esc(entry?.id||'')}"><section class="sop-panel"><h2>Checklist details</h2><label>Title<input name="title" required maxlength="160" value="${esc(entry?.title)}"></label><label>Questions · one per line<textarea name="steps" rows="8" required>${esc(entry?.steps.join('\n'))}</textarea></label><label>Full instructions<textarea name="instructions" rows="8" required maxlength="20000">${esc(entry?.instructions)}</textarea></label><p class="help">Shared across this organisation. Existing checklist records keep their saved question version.</p><p class="form-error" role="alert"></p><button class="tap-primary">Save checklist</button></section></form>`,'content/checklists/library');
 }
 if(p[0]!=='checklists')return '';
 if(p[1]==='run'){
  const run=(c.state.checklistRuns||[]).find(r=>r.garage===c.garage&&r.id===p[2]);if(!run)return frame('Checklist unavailable',go('checklists','Checklists'));
  const t=run.template,n=p[3]===undefined?Math.max(0,t.steps.findIndex((_,i)=>!run.answers[i])):Number(p[3]),locked=run.status!=='In progress';
  if(locked)return frame(t.title,`<p>${esc(run.vehicle||'Garage')} · ${esc(run.status)}</p>${t.steps.map((step,i)=>`<article class="card"><h2>${esc(step)}</h2><strong>${esc(run.answers[i]?.result||'Not recorded')}</strong><p class="record-note">${esc(run.answers[i]?.notes)}</p><small>${esc(run.answers[i]?.actor)}</small></article>`).join('')}${full(t)}<div class="toolbar">${go('checklists','Checklists')}${reviewer(c.me)&&run.status==='Awaiting review'?go('reviews/checklistRuns/'+run.id,'Review & sign off'):''}</div>`);
  if(!Number.isInteger(n)||n<0||n>=t.steps.length)return frame('Question unavailable',go('checklists/run/'+run.id,'Resume'));
  const a=run.answers[n],all=t.steps.every((_,i)=>run.answers[i]);
  return frame(t.title,`<p>${esc(run.vehicle||'Garage')} · Question ${n+1} of ${t.steps.length}</p><form class="card" data-content-form="answer" data-id="${run.id}"><input type="hidden" name="item" value="${n}"><h2>${esc(t.steps[n])}</h2><div class="checklist-choices">${['OK','Fault','Not completed'].map(r=>`<label><input type="radio" name="result" value="${r}" ${a?.result===r?'checked':''} required>${r}</label>`).join('')}</div><label>Notes<textarea name="notes" maxlength="4000">${esc(a?.notes)}</textarea></label><p class="help">Fault answers create a linked fault or garage report with a repair action.</p><p class="form-error" role="alert"></p><button>Save answer</button></form>${full(t)}<div class="toolbar">${go('checklists','Pause')}${n?go('checklists/run/'+run.id+'/'+(n-1),'Previous question'):''}${n<t.steps.length-1?go('checklists/run/'+run.id+'/'+(n+1),'Next question'):''}</div>${all?`<form class="card" data-content-form="submit" data-id="${run.id}"><p>All answers saved. Send to your supervisor for review.</p><p class="form-error" role="alert"></p><button>Submit for review</button></form>`:''}`);
 }
 if(p[1]==='start'){
  const x=content.checklists.find(x=>x.id===p[2]);if(!x)return frame('Checklist unavailable',go('checklists','Checklists'));
  return frame(x.title,`${full(x)}<form class="card" data-content-form="start"><input type="hidden" name="template" value="${x.id}"><label>Bus (optional)<select name="vehicle"><option value="">Garage check</option>${c.state.vehicles.filter(v=>v.garage===c.garage).map(v=>`<option value="${esc(v.id)}">${esc(v.name||v.id)}</option>`).join('')}</select></label><p>${x.steps.length} questions</p><p class="form-error" role="alert"></p><button>Start checklist</button></form>`);
 }
 return frame('Checklists',`<div class="toolbar">${go('bus-checks','Bus inspections')}${author(c.me)?go('content/checklists','Create & edit'):''}</div><div class="manager-hub-grid">${content.checklists.map(x=>`<button type="button" class="tap-tile" data-go="checklists/start/${x.id}"><strong>${esc(x.title)}</strong><small>${x.steps.length} questions</small></button>`).join('')}</div><h2>Checklist records</h2>${(c.state.checklistRuns||[]).filter(r=>r.garage===c.garage).map(r=>`<article class="card"><h3>${esc(r.template.title)}</h3><p>${esc(r.vehicle||'Garage')} · ${esc(r.status)}</p>${go('checklists/run/'+r.id,r.status==='In progress'?'Resume':'View record')}</article>`).join('')||'<p>No checklist records yet.</p>'}`);
}
let busy=false;
export const contentBusy=()=>busy;
export function setupContent(host){setupSOPDocuments(host);document.addEventListener('submit',async e=>{const f=e.target;if(!f.dataset.contentForm)return;e.preventDefault();if(busy)return;busy=true;const b=f.querySelector('button'),v=Object.fromEntries(new FormData(f)),c=host.context();b.disabled=true;try{
 const action=f.dataset.contentForm;
 if(action==='save'){const result=await api('content',{kind:f.dataset.kind,organisation_id:c.organisation,version:c.contentVersion,values:{...v,id:f.dataset.id}});await host.reload();host.go(f.dataset.kind==='sops'?'org-sop/'+result.id:'content/checklists/library');}
 else{const r=await host.mutation('checklist_'+action,v,{id:f.dataset.id});if(action==='start')host.go('checklists/run/'+r.id);else if(action==='answer'){const run=host.context().state.checklistRuns.find(r=>r.id===f.dataset.id),next=Math.min(Number(v.item)+1,run.template.steps.length-1);host.go('checklists/run/'+r.id+'/'+next);}else host.go('checklists/run/'+f.dataset.id);}
 host.notify('Saved.');
 }catch(err){f.querySelector('.form-error').textContent=err.message;if(err.status===409)await host.reload();}finally{busy=false;b.disabled=false;}});}
