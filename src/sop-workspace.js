import {esc} from './api.js';
import {author} from './roles.js';
import {sopPublished} from './content-model.js';

const paths={book:'M4 4h6l2 2 2-2h6v16h-6l-2 2-2-2H4zM12 6v16',add:'M12 5v14M5 12h14',edit:'M4 16l12-12 4 4L8 20H4zM13 7l4 4',upload:'M12 16V3M7 8l5-5 5 5M4 16v5h16v-5',list:'M5 3h14v18H5zM8 8h8M8 12h8M8 16h5',pdf:'M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h5',steps:'M4 5h2M10 5h10M4 12h2M10 12h10M4 19h2M10 19h10'};
export const sopIcon=k=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[k]||paths.book}"/></svg>`;
export const sopTile=(page,title,sub,icon='book')=>`<button type="button" class="tap-tile sop-tile" data-go="${esc(page)}">${sopIcon(icon)}<strong>${esc(title)}</strong><small>${esc(sub)}</small></button>`;
export const sopPDFTile=(url,sub='Open the original document')=>`<a class="tap-tile sop-tile" href="${esc(url)}" target="_blank" rel="noopener">${sopIcon('pdf')}<strong>View source PDF</strong><small>${esc(sub)} · opens in a new tab</small></a>`;
const go=(page,text)=>`<button class="tap-small" type="button" data-go="${esc(page)}">${esc(text)}</button>`;
const frame=(title,body,back='content/sops',caption='')=>`<section class="admin-tools content-work sop-workspace"><div class="tap-heading"><h1>${esc(title)}</h1>${caption?`<p>${esc(caption)}</p>`:''}</div>${body}<div class="toolbar">${go(back,'← Back')}</div></section>`;
const tag=x=>`<span class="pill ${sopPublished(x)?'status-neutral':'attention'}">${sopPublished(x)?'Published':'Draft'}</span>`;
const docURL=(c,x)=>'/.netlify/functions/sop-documents?'+new URLSearchParams({garage:c.garage,id:x.sourceId});
const pdf=(c,x)=>x.sourceId?sopPDFTile(docURL(c,x),x.sourceName||'Original document'):'';
const field=(label,name,value='',max=200)=>`<label>${label}<input name="${name}" maxlength="${max}" value="${esc(value)}"></label>`;
const text=(label,name,value='',max=20000,rows=5)=>`<label>${label}<textarea name="${name}" maxlength="${max}" rows="${rows}">${esc(value)}</textarea></label>`;

export function sopWorkspaceView(c){
 const p=c.page.split('/'),sops=c.content?.sops||[],x=sops.find(x=>x.id===p[2]);
 if(p[0]==='org-sop')return reader(c,sops.find(x=>x.id===p[1]),p[2]);
 if(!author(c.me))return frame('Organisation Admin access required','','sops');
 if(!c.organisation)return frame('Choose a garage','<p>Select a garage to author SOPs for its organisation.</p>','sops');
 if(!p[2]){
  const drafts=sops.filter(x=>!sopPublished(x)).length;
  return frame('Organisation SOPs',`<div class="sop-hub-grid">${sopTile('content/sops/new','Create SOP','Write a procedure in the standard format','add')}${sopTile('content/sops/library','SOP library',(sops.length-drafts)+' organisation SOPs · source guides','book')}${sopTile('content/sops/drafts','Drafts',drafts+' awaiting review and publication','edit')}${sopTile('content/sops/generate','Upload & generate','Coming soon · create a draft from a document','upload')}${sopTile('content/checklists','Checklists','Create and manage garage checklists','list')}${sopTile('template-admin','PM3 template','Questions and the original inspection PDF','pdf')}</div>`,'manage','Create, review and share procedures across your organisation.');
 }
 if(p[2]==='generate')return frame('Generate from a document',`<div class="sop-panel"><span class="pill status-neutral">Coming soon</span><h2>From source document to reviewed SOP</h2><ol class="sop-generation-steps"><li><strong>Upload the source</strong><p>Add the original PDF or Word document.</p></li><li><strong>Create a structured draft</strong><p>FleetTap will organise the source into a summary, scope, precautions and clear steps. Missing details and conflicting instructions will be flagged.</p></li><li><strong>Review and approve</strong><p>An Organisation Admin checks the draft against the source, corrects it and confirms approval.</p></li><li><strong>Publish to staff</strong><p>Staff see the summary, guided steps and original document.</p></li></ol><p class="help">Document generation is not enabled yet. You can write a draft and attach its source PDF now.</p>${go('content/sops/new','Create a draft')}</div>`);
 if(['library','drafts'].includes(p[2])){
  const draft=p[2]==='drafts',list=sops.filter(x=>sopPublished(x)!==draft);
  return frame(draft?'Draft SOPs':'SOP library',`<div class="toolbar">${go('content/sops/new','Create SOP')}</div><div class="sop-hub-grid">${list.map(x=>sopTile('org-sop/'+x.id,x.title,(x.revision||'Version '+x.version)+' · '+(sopPublished(x)?'Published':'Draft'),'book')).join('')}${!draft?sopTile('sops/to01','Shift diagnostics','TO 01 · draft guide')+sopTile('sops/pm3','PM3 inspections','Source specification')+sopTile('sops/regeneration','Parked regeneration','Technical review pending'):''}</div>${draft&&!list.length?'<div class="sop-empty"><h2>No drafts yet</h2><p>Create a draft to start a new procedure.</p></div>':''}`);
 }
 if(p[2]!=='new'&&!x)return frame('SOP unavailable','<p>This SOP may have changed. Return to the library.</p>');
 if(p[3]==='source')return frame('Source PDF',`<div class="sop-panel"><h2>${esc(x.title)}</h2>${x.sourceId?`<p>Attached: ${esc(x.sourceName)}</p><a class="tap-small document-link" href="${esc(docURL(c,x))}" target="_blank" rel="noopener">View current PDF</a>`:'<p>Attach the original procedure for reference alongside the guided steps.</p>'}${sopPublished(x)?`<p class="tap-warning">Save this SOP as a draft before changing its source. This removes it from staff access until you publish it again.</p>${go('content/sops/'+x.id,'Edit SOP')}`:`<form data-sop-upload="${esc(x.id)}"><label class="sop-upload-zone">${sopIcon('upload')}<strong>${x.sourceId?'Replace source PDF':'Choose source PDF'}</strong><span>PDF · up to 4 MB</span><input type="file" name="source" accept="application/pdf,.pdf" required></label><p class="help">The original is retained privately for this organisation. Uploading does not generate any content.</p><p class="form-error" role="alert"></p><button class="tap-primary">Attach PDF</button></form>`}</div>`,'org-sop/'+x.id);
 return frame(x?'Edit SOP':'Create SOP',`<form data-content-form="save" data-kind="sops" data-id="${esc(x?.id||'')}" class="sop-editor">
  <section class="sop-panel"><h2>1. Overview</h2><label>Title<input name="title" required maxlength="160" value="${esc(x?.title)}" placeholder="e.g. Workshop shift handover"></label>${text('Short summary','summary',x?.summary,1200,3)}<div class="sop-field-grid">${field('Document reference','reference',x?.reference)}${field('Source revision','revision',x?.revision,80)}</div></section>
  <section class="sop-panel"><h2>2. Before you start</h2>${text('Who and what this applies to','scope',x?.scope,2000,3)}${text('Safety precautions, PPE and stop conditions','precautions',x?.precautions,4000,4)}</section>
  <section class="sop-panel"><h2>3. Procedure</h2>${text('Guided steps · one per line','steps',x?.steps.join('\n'),50000,7)}<p class="help">Each line becomes one step for staff. Keep the technical detail in the full instructions.</p>${text('Full instructions','instructions',x?.instructions,20000,8)}</section>
  <section class="sop-panel"><h2>4. Review and publish</h2><label>Next review date<input type="date" name="reviewDate" value="${esc(x?.reviewDate)}"></label><fieldset class="sop-publish-options"><legend>Save as</legend><label><input type="radio" name="status" value="Draft" checked><span><strong>Draft</strong><small>Only Organisation and Platform Admins can view it.</small></span></label><label><input type="radio" name="status" value="Published"><span><strong>Published</strong><small>Available to staff across this organisation.</small></span></label></fieldset><label class="toggle-label"><input type="checkbox" name="approved" value="yes"><span>I have reviewed this SOP against its source and approve it for publication.</span></label>${x&&sopPublished(x)?'<p class="tap-warning">Saving as a draft removes this SOP from staff access until it is published again.</p>':''}<p class="help">${x?.sourceId?'Source PDF attached: '+esc(x.sourceName):'Save a draft first, then attach the original PDF from its overview.'}</p><p class="form-error" role="alert"></p><button class="tap-primary">Save SOP</button></section>
 </form>`,x?'org-sop/'+x.id:'content/sops');
}
function reader(c,x,step){
 if(!x||(!author(c.me)&&!sopPublished(x)))return frame('SOP unavailable',go('sops','SOPs'),'sops');
 const root='org-sop/'+x.id,back=author(c.me)?'content/sops':'sops';
 const meta=[x.reference,x.revision||'Version '+x.version,x.reviewDate?'Review due '+x.reviewDate:''].filter(Boolean).map(esc).join(' · ');
 if(step==='full')return frame(x.title,`<article class="sop-panel sop-full"><p>${meta}</p>${x.scope?`<h2>Scope</h2><p>${esc(x.scope)}</p>`:''}${x.precautions?`<h2>Before you start</h2><p>${esc(x.precautions)}</p>`:''}<h2>Full instructions</h2><p>${esc(x.instructions||'No instructions added yet.')}</p></article>${pdf(c,x)?`<div class="sop-hub-grid sop-action-grid">${pdf(c,x)}</div>`:''}`,root);
 if(step!==undefined){const n=Number(step);if(!Number.isInteger(n)||n<0||!x.steps[n])return frame('Step unavailable','',root);
  return frame(x.title,`<p class="tap-caption">Step ${n+1} of ${x.steps.length}</p><article class="sop-panel sop-step-panel"><h2>${esc(x.steps[n])}</h2></article><div class="toolbar sop-step-nav">${n?go(root+'/'+(n-1),'Previous step'):''}${go(root+'/full','View full SOP')}${go(n<x.steps.length-1?root+'/'+(n+1):root,n<x.steps.length-1?'Next step':'Done')}</div>`,root);
 }
 return frame(x.title,`<article class="sop-panel sop-overview">${tag(x)}<p class="sop-summary">${esc(x.summary||x.steps[0]||'Add a summary before publishing this SOP.')}</p><p class="help">${meta}</p>${x.scope?`<h2>Applies to</h2><p class="record-note">${esc(x.scope)}</p>`:''}${x.precautions?`<div class="sop-precautions"><h2>Before you start</h2><p class="record-note">${esc(x.precautions)}</p></div>`:''}${!sopPublished(x)?'<p class="help">Draft · visible to Organisation and Platform Admins only.</p>':''}</article><div class="sop-hub-grid sop-action-grid">${x.steps.length?sopTile(root+'/0','Start guide',x.steps.length+' steps','steps'):''}${sopTile(root+'/full','Full instructions','Read the complete procedure','book')}${pdf(c,x)}${author(c.me)?sopTile('content/sops/'+x.id,'Edit SOP','Update, review and publish','edit')+sopTile('content/sops/'+x.id+'/source',x.sourceId?'Source document':'Attach PDF',x.sourceId?'View or replace the original':'Keep the original alongside the guide','upload'):''}</div>${!x.sourceId?'<p class="tap-caption">No source PDF attached yet.</p>':''}`,back);
}

let uploading=false;
export const sopUploadBusy=()=>uploading;
export function setupSOPDocuments(host){document.addEventListener('submit',async e=>{
 const f=e.target;if(!f.hasAttribute('data-sop-upload'))return;e.preventDefault();if(uploading)return;
 const file=f.elements.source.files[0],error=f.querySelector('.form-error'),button=f.querySelector('button');
 if(!file||file.size>4*1024*1024||!/\.pdf$/i.test(file.name)){error.textContent='Choose a PDF under 4 MB.';return;}
 const c=host.context();uploading=true;button.disabled=true;error.textContent='';
 try{
  const q=new URLSearchParams({garage:c.garage,sop:f.dataset.sopUpload,version:c.contentVersion,name:file.name});
  const response=await fetch('/.netlify/functions/sop-documents?'+q,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/pdf'},body:file});
  const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'Unable to attach the document.'),{status:response.status});
  await host.reload();host.go('org-sop/'+f.dataset.sopUpload);host.notify('Source PDF attached.');
 }catch(err){error.textContent=err.message;if(err.status===401)window.dispatchEvent(new Event('session-expired'));if(err.status===409)await host.reload();}finally{uploading=false;button.disabled=false;}
 });}
