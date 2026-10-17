import {publishedBulletins,targetMatches} from './bulletins.js';
import {completionFor} from './instruction-learning.js';
import {backRoute} from './navigation.js';
import {esc} from './api.js';
import {manager,author} from './roles.js';
import {applies,acknowledgement,pendingControls} from './active-controls.js';
import {today} from './scheduling.js';
import {tasksFor} from './templates.js';
import {taskReadings} from './inspections.js';
const go=(p,t)=>`<button type="button" class="tap-small" data-go="${esc(p)}">${esc(t)}</button>`;
const stamp=at=>new Date(at).toLocaleString('en-IE',{dateStyle:'medium',timeStyle:'short'});
export function controlsView(c){
 const buses=c.state.vehicles.filter(b=>b.garage===c.garage),all=(c.content.sops||[]).filter(x=>buses.some(b=>applies(x,b))),id=c.page.split('?')[0].split('/')[1],x=all.find(x=>x.id===id);
 const returnTo=new URLSearchParams(c.page.split('?')[1]||'').get('return'),next=returnTo&&/^(inspection|my-jobs|garage-today|checklists|checks)\//.test(returnTo)?returnTo:'my-jobs';
 const due=x=>x.reviewDate&&x.reviewDate<today(),ackFor=x=>acknowledgement(c.state,c.garage,c.me.id,x);
 const scope=x=>{const selected=buses.filter(b=>applies(x,b));return `<details><summary>${x.target==='model'?esc(x.targetModel)+' · ':''}${selected.length} applicable buses</summary><p>${selected.map(b=>esc(b.id)).join(', ')}</p></details>`;};
 const tsbs=publishedBulletins(c.content).filter(x=>buses.some(b=>targetMatches(x,b,c.state.recallCases)));
 let body='',title='Required instructions';
 if(id==='rechecks'){
  title='Measurement rechecks';
  body=c.state.inspections.filter(i=>i.garage===c.garage&&!i.deletedAt).flatMap(i=>Object.entries(i.rechecks||{}).filter(([,r])=>!r.resolvedAt).map(([task,r])=>{const t=tasksFor(i).find(t=>t.id===task),n=tasksFor(i).filter(t=>!t.blocked).findIndex(t=>t.id===task);return `<article class="card"><h2>${esc(i.vehicle)} · ${esc(t?.question||t?.text||'Inspection reading')}</h2><p>${esc(r.worker)}</p><p>${(t?taskReadings(t):[]).map((f,j)=>esc(f[0]+': '+r.readings[j]+' '+f[1])).join(' · ')}</p>${go('inspection/'+i.id+'/item/'+n,'Open recheck')}</article>`;})).join('')||'<p>No outstanding rechecks.</p>';
 }else if(id==='team'){
  if(!manager(c.me))return '<section class="card"><h1>Manager access required</h1></section>';
  title='Team instructions';body=all.map(x=>`<details class="card"><summary>${esc(x.title)} · ${due(x)?'Review overdue':(c.assignees||[]).filter(u=>acknowledgement(c.state,c.garage,u.id,x)).length+' / '+(c.assignees||[]).length+' acknowledged'}</summary>${(c.assignees||[]).map(u=>{const a=acknowledgement(c.state,c.garage,u.id,x);return `<p><strong>${esc(u.name)}</strong> · ${due(x)?'Review overdue':a?'Acknowledged '+esc(stamp(a.at)):'Outstanding'}</p>`;}).join('')}</details>`).join('')||'<p>No required instructions for this fleet.</p>';
  body+=`<details class="card"><summary>Acknowledgement history</summary>${(c.state.instructionAcks||[]).filter(a=>a.garage===c.garage).slice().reverse().map(a=>`<p>${esc(a.actor)} · ${esc(a.snapshot.title)} · version ${a.version} · ${esc(stamp(a.at))}</p>`).join('')||'<p>No acknowledgements recorded.</p>'}</details>`;
 }else if(x){const ack=ackFor(x);body=`<article class="card"><h2>${esc(x.title)}</h2><p>${esc(x.reference)} · ${esc(x.revision)} · version ${x.version}</p>${scope(x)}<p class="record-note">${esc(x.summary)}</p>${x.precautions?`<h3>Precautions</h3><p class="record-note">${esc(x.precautions)}</p>`:''}<h3>Full instructions</h3><p class="record-note">${esc(x.instructions)}</p>${x.sourceId?`<a class="tap-small" target="_blank" rel="noopener" href="/.netlify/functions/sop-documents?${esc(new URLSearchParams({garage:c.garage,id:x.sourceId}).toString())}">Read source PDF</a>`:''}${x.video?`<p><a class="tap-small" href="${esc(x.video)}" target="_blank" rel="noopener">Open toolbox talk video</a></p>`:''}${due(x)?'<p class="control-stop" role="alert">Review overdue — work blocked. Ask your Organisation Admin to publish the reviewed instruction.</p>':ack?`<p class="pill">Acknowledged ${esc(stamp(ack.at))}</p>${next==='my-jobs'?'':`<div class="toolbar">${go(next,next.startsWith('inspection/')?'Continue inspection':next.startsWith('checklists/')?'Continue checklist':'Continue job')}</div>`}`:`<form data-control-ack="${esc(x.id)}"><input type="hidden" name="version" value="${x.version}">${x.controlKind==='toolbox'?'<label class="toggle-label"><input type="checkbox" name="watched" value="yes" required> I have watched the complete toolbox talk.</label>':''}<label class="toggle-label"><input type="checkbox" name="understood" value="yes" required> I have read and understood this version and its precautions. I will stop and ask my supervisor if unclear.</label><p class="form-error" role="alert"></p><button>Acknowledge this version</button></form>`}</article>`;
 }else if(!id||id==='acknowledged'){
  const list=all.filter(x=>id==='acknowledged'?ackFor(x)&&!due(x):!ackFor(x)||due(x));body=list.map(x=>`<article class="card"><h2>${esc(x.title)}</h2><p>${esc(x.reference)} · ${esc(x.revision)}${due(x)?' · Review overdue':''}</p>${scope(x)}${go('required-instructions/'+x.id,id==='acknowledged'?'Read instruction':'Read & acknowledge')}</article>`).join('')||`<p>${id==='acknowledged'?'No acknowledged instructions yet.':'No instructions waiting for your acknowledgement.'}</p>`;
 }else body='<p>Instruction unavailable.</p>';
 if(!id||id==='acknowledged')body=tsbs.filter(x=>id==='acknowledged'?completionFor(c.state,c.me.id,x):!completionFor(c.state,c.me.id,x)).map(x=>`<article class="card"><h2>${esc(x.title)}</h2><p>${esc(x.reference)} · TSB</p>${go('tsbs/'+x.id+'?return='+encodeURIComponent(next),id==='acknowledged'?'Read TSB':x.completion==='video_quiz'?'Watch & complete':'Read & acknowledge')}</article>`).join('')+body;
 if(id==='team')body=go('tsb-team','TSB team completion')+body;
 return `<section class="admin-tools"><h1>${title}</h1><div class="report-switch" aria-label="Instructions view">${go('required-instructions','To read')}${go('required-instructions/acknowledged','Acknowledged')}${manager(c.me)?go('required-instructions/team','Team status'):''}</div>${body}<div class="toolbar">${backRoute(next)}${author(c.me)?go('content/sops','Manage instructions'):''}</div></section>`;
}
export function controlsBanner(c){
 const p=c.page.split('?')[0].split('/');let bus;
 if(p[0]==='inspection')bus=c.state.inspections.find(i=>i.id===p[1]&&i.garage===c.garage)?.vehicle;
 if(['my-jobs','garage-today'].includes(p[0]))bus=c.state.jobs?.find(i=>i.id===p[1]&&i.garage===c.garage)?.vehicle;
 if(p[0]==='checklists'&&p[1]==='run')bus=c.state.checklistRuns?.find(i=>i.id===p[2]&&i.garage===c.garage)?.vehicle;
 if(p[0]==='actions'){const a=c.state.actions.find(a=>a.id===p[1]&&a.garage===c.garage);bus=a?.vehicle||[...c.state.faults,...c.state.reports].find(r=>r.garage===c.garage&&r.id===a?.source)?.vehicle;}
 if(!bus)return '';const list=pendingControls(c.state,c.garage,c.me.id,c.content,bus);
 return list.length?`<aside class="control-stop" role="alert"><strong>Before continuing on ${esc(bus)}</strong>${list.map(x=>go((x.isTSB?'tsbs/':'required-instructions/')+x.id+'?return='+encodeURIComponent(c.page),'Read & acknowledge: '+x.title)).join('')}</aside>`:'';
}
let busy=false;
export function setupControls(host){document.addEventListener('submit',async e=>{const f=e.target;if(!f.hasAttribute('data-control-ack'))return;e.preventDefault();if(busy)return;busy=true;const button=f.querySelector('button');button.disabled=true;try{await host.mutation('instruction_ack',{...Object.fromEntries(new FormData(f)),instructionId:f.dataset.controlAck});await host.reload();if(new URLSearchParams(host.context().page.split('?')[1]||'').get('return')==='my-jobs')host.go('my-jobs');else host.render();host.notify('Acknowledgement recorded.');}catch(err){f.querySelector('.form-error').textContent=err.message;if(err.status===409)await host.reload();}finally{busy=false;button.disabled=false;}});}
