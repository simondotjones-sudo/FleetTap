import {today,validDate} from './scheduling.js';
import {vehicleModelType,fleetModel} from './fleet-models.js';

export const bulletinTypes=[['document','SOP / SI update'],['parts','Parts supersession'],['recall','Safety recall']];
export const stockRules=[['unspecified','Not specified — confirm before use'],['use','Existing stock may be used'],['return','Return existing stock'],['quarantine','Quarantine — do not fit']];
export const documentKind=x=>x.documentType==='si'?'si':'sop';
export const documentLabel=x=>documentKind(x)==='si'?'SI':'SOP';
export const snapshot=x=>{const {audit,draftRevision,...value}=x;return structuredClone(value);};
const text=(v,max=2000)=>{const s=String(v??'').trim();if(s.length>max)throw Error('Text exceeds '+max+' characters.');return s;};
const list=v=>Array.isArray(v)?v:String(v||'').split(/[\s,]+/).filter(Boolean);
const url=v=>{const s=text(v,2000);if(s){let u;try{u=new URL(s);}catch{}if(!u||u.protocol!=='https:'||u.username||u.password)throw Error('Use a public HTTPS link without credentials.');}return s;};
export const partNumber=v=>String(v||'').trim().replace(/\s+/g,' ').toUpperCase();
export function currentDocument(x,date=today()){
 if(!x||x.status==='Draft')return null;
 const versions=[x,...(x.audit||[]).map(a=>a.previous)].filter(d=>d&&(!d.status||d.status==='Published')&&(!d.effectiveDate||d.effectiveDate<=date));
 return versions.sort((a,b)=>b.version-a.version)[0]||null;
}
export function targetMatches(x,b,cases=[]){
 if(!b)return false;
 if(x.type==='recall'&&cases.some(c=>c.garage===b.garage&&c.vehicle===b.id&&c.bulletinId===x.id&&c.version===x.version))return true;
 return x.target==='all'||x.target==='model'&&(x.targetModels||[x.targetModel]).includes(vehicleModelType(b))||x.target==='fleet'&&[b.id,...(b.audit||[]).map(a=>a.previous?.id)].some(id=>x.targetFleets?.includes(id));
}
export function publishedBulletins(content){return (content?.tsbs||[]).filter(x=>x.status==='Published');}
export function bulletinActive(x,content,date=today()){
 if(x.status!=='Published'||x.effectiveDate>date)return false;
 if(x.type!=='document')return true;
 // An older document bulletin ceases to gate work only when every linked revision has been replaced.
 return x.documents.some(link=>{const doc=currentDocument(content.sops?.find(d=>d.id===link.id),date);return !doc||doc.version<=link.version;});
}
export const bulletinRequired=(x,content,b,date=today(),cases=[])=>bulletinActive(x,content,date)&&targetMatches(x,b,cases);
export const bulletinReviewOverdue=x=>(x.documents||[]).some(d=>d.snapshot?.reviewDate&&d.snapshot.reviewDate<today());
export function publicBulletin(x,canAuthor=false){
 if(canAuthor)return x;
 const safe=snapshot(x);safe.quiz=(safe.quiz||[]).map(({correct,explanation,...q})=>q);return safe;
}
export function stageDocumentBulletin(data,doc,actor){
 data.tsbs??=[];
 let b=data.tsbs.find(x=>x.status==='Draft'&&x.type==='document'&&x.documents?.some(d=>d.id===doc.id));
 const link={id:doc.id,version:doc.version,title:doc.title,reference:doc.reference,documentType:documentKind(doc),snapshot:snapshot(doc),pending:true};
 if(b){b.documents=b.documents.map(d=>d.id===doc.id?link:d);b.version++;b.updatedAt=new Date().toISOString();}
 else{b={id:crypto.randomUUID(),version:1,status:'Draft',type:'document',title:(doc.version>1?'Updated ':'New ')+documentLabel(doc)+' — '+doc.title,reference:'',sourceReference:doc.reference||'',issuer:'',summary:doc.summary||'',action:doc.instructions||'',target:doc.target||'all',targetModels:doc.targetModel?[doc.targetModel]:[],targetFleets:doc.targetFleets||[],effectiveDate:today(),completion:doc.controlKind==='toolbox'?'video_quiz':'read',video:doc.video||'',documents:[link],quiz:[],parts:[],createdBy:actor,createdAt:new Date().toISOString()};data.tsbs.push(b);}
 return b;
}
function parseArray(v,label){if(Array.isArray(v))return v;try{const x=JSON.parse(v||'[]');if(Array.isArray(x))return x;}catch{}throw Error('Check '+label+'.');}
export function saveBulletin(data,v,actor){
 const all=data.tsbs??=[],old=v.id?all.find(x=>x.id===v.id):null;
 if(v.id&&!old)throw Error('TSB unavailable.');
 if(old?.status==='Published')throw Error('Published TSBs are locked. Create a new bulletin to communicate a further change.');
 const pick=k=>v[k]===undefined?old?.[k]:v[k],publishing=v.status==='Published';
 const x={id:old?.id||crypto.randomUUID(),version:(old?.version||0)+1,status:publishing?'Published':'Draft',type:pick('type')||'document',title:text(pick('title'),160),reference:text(pick('reference'),200),sourceReference:text(pick('sourceReference'),200),issuer:text(pick('issuer'),200),summary:text(pick('summary'),4000),action:text(pick('action'),12000),sourceUrl:url(pick('sourceUrl')),sourceId:old?.sourceId||null,sourceName:old?.sourceName||null,target:pick('target')||'all',targetModels:[...new Set(list(pick('targetModels')))],targetFleets:[...new Set(list(pick('targetFleets')).map(partNumber))],effectiveDate:text(pick('effectiveDate'),10)||today(),completion:pick('completion')||'read',video:url(pick('video')),videoSeconds:Number(pick('videoSeconds')||0),createdBy:old?.createdBy||actor,createdAt:old?.createdAt||new Date().toISOString(),updatedBy:actor,updatedAt:new Date().toISOString(),documents:[],parts:[],quiz:[],audit:[...(old?.audit||[]),...(old?[{at:new Date().toISOString(),actor,previous:snapshot(old)}]:[])]};
 if(!x.title||!bulletinTypes.some(([id])=>id===x.type))throw Error('Enter a title and choose a TSB type.');
 if(!['all','model','fleet'].includes(x.target)||x.targetModels.some(m=>!fleetModel(m))||x.targetFleets.length>500||x.targetFleets.some(id=>!/^[A-Z0-9-]{1,40}$/.test(id)))throw Error('Choose valid models or fleet IDs.');
 if(!validDate(x.effectiveDate))throw Error('Choose a valid effective date.');
 if(!['read','video_quiz'].includes(x.completion))throw Error('Choose how staff complete this bulletin.');
 const links=parseArray(pick('documents'),'linked documents');
 if(new Set(links.map(d=>d.id)).size!==links.length)throw Error('Select one revision per linked document.');
 if(links.length>20)throw Error('Link up to 20 documents.');
 for(const link of links){
  const doc=data.sops?.find(d=>d.id===link.id),working=link.pending?(doc?.draftRevision||doc):currentDocument(doc,x.effectiveDate);
  if(!working||working.version!==Number(link.version))throw Error('A linked document changed. Refresh the linked revisions before publishing.');
  if(!link.pending&&working.status==='Draft')throw Error('Choose a published document or its prepared draft revision.');
  x.documents.push({id:doc.id,version:working.version,title:working.title,reference:working.reference,documentType:documentKind(working),snapshot:snapshot(working),pending:!!link.pending});
 }
 if(x.type==='parts'){
  x.parts=parseArray(pick('parts'),'part replacements').map(p=>({old:partNumber(p.old),replacement:partNumber(p.replacement),description:text(p.description,500),manufacturer:text(p.manufacturer,200),conditions:text(p.conditions,2000),associated:text(p.associated,1000),stock:p.stock||'unspecified',stockNotes:text(p.stockNotes,1000)}));
  if(x.parts.length>30)throw Error('Use up to 30 part replacements per TSB.');
  for(const p of x.parts)if(!p.old||!p.replacement||p.old===p.replacement||p.old.length>100||p.replacement.length>100||!stockRules.some(([k])=>k===p.stock))throw Error('Enter distinct old and replacement part numbers and a valid stock instruction.');
  if(new Set(x.parts.map(p=>p.old)).size!==x.parts.length)throw Error('Each old part number may appear once in this bulletin.');
 }
 if(x.type==='recall'){
  x.recall={mode:pick('recallMode')||old?.recall?.mode||'stop',dueDate:text(pick('recallDue')??old?.recall?.dueDate,10),scopeNotes:text(pick('recallScope')??old?.recall?.scopeNotes,4000),needsAssessment:(pick('needsAssessment')??(old?.recall?.needsAssessment?'yes':'no'))==='yes',remedy:text(pick('remedy')??old?.recall?.remedy,8000)};
  if(!['stop','date','service'].includes(x.recall.mode)||x.recall.dueDate&&!validDate(x.recall.dueDate))throw Error('Choose a valid recall action and deadline.');
 }
 if(x.completion==='video_quiz'){
  x.quiz=parseArray(pick('quiz'),'quiz questions').map((q,i)=>({id:'q'+(i+1),question:text(q.question,1000),options:(q.options||[]).map(o=>text(o,500)),correct:Number(q.correct),explanation:text(q.explanation,2000)}));
  if(x.quiz.length>10)throw Error('Use up to 10 quiz questions.');
 }
 if(publishing){
  if(v.approved!=='yes')throw Error('Review the source, applicability and completion requirements before publishing.');
  if(!x.reference||!x.sourceReference||!x.summary||!x.action)throw Error('Add a TSB reference, source reference, what changed and what staff must do.');
  if(all.some(b=>b.id!==x.id&&b.status==='Published'&&b.reference.toLowerCase()===x.reference.toLowerCase()))throw Error('This TSB reference is already published. Use a new reference.');
  if(x.target==='model'&&!x.targetModels.length||x.target==='fleet'&&!x.targetFleets.length)throw Error('Select the affected models or fleet IDs.');
  if(x.type==='document'&&!x.documents.length)throw Error('Link the SOP or SI revision being communicated.');
  if(x.type==='parts'&&(!x.parts.length||x.parts.some(p=>!p.manufacturer||!p.description)))throw Error('Add the part numbers, description and manufacturer for each replacement.');
  if(x.type==='recall'&&(!x.recall.remedy||!x.recall.scopeNotes||x.recall.mode==='date'&&!x.recall.dueDate))throw Error('Record the recall applicability, remedy and any required deadline.');
  if(x.recall?.dueDate&&x.recall.dueDate<x.effectiveDate)throw Error('The recall deadline cannot precede its effective date.');
  if(x.completion==='video_quiz'&&v.videoReviewed!=='yes')throw Error('Preview the video and confirm its complete duration before publishing.');
  if(x.completion==='video_quiz'&&(!x.video||!Number.isInteger(x.videoSeconds)||x.videoSeconds<5||x.videoSeconds>7200||x.quiz.length<3||x.quiz.some(q=>!q.question||q.options.length<2||q.options.length>5||q.options.some(o=>!o)||!Number.isInteger(q.correct)||q.correct<0||q.correct>=q.options.length||!q.explanation)))throw Error('Add a direct video link, duration (5–7200 seconds), and 3–10 complete quiz questions with answers and explanations.');
  for(const link of x.documents)if(link.pending){
   const doc=data.sops.find(d=>d.id===link.id),draft=doc.draftRevision||doc;
   if(draft.reviewDate&&draft.reviewDate<x.effectiveDate)throw Error('Review the linked document before its effective date.');
   if(!draft.summary||!draft.instructions||!draft.reference||!draft.revision)throw Error('Linked documents need a summary, full instructions, reference and revision.');
  }
  // Validate the replacement graph before any document is published. Ambiguous branches are shown as such in lookup.
  if(x.type==='parts')validatePartCycles([...publishedBulletins(data),x]);
  for(const link of x.documents)if(link.pending){
   const index=data.sops.findIndex(d=>d.id===link.id),doc=data.sops[index],draft=doc.draftRevision||doc;
   const published={...draft,status:'Published',effectiveDate:x.effectiveDate,required:false,tsbId:x.id,approvedBy:actor,approvedAt:x.updatedAt};delete published.draftRevision;
   published.audit=[...(draft.audit||[]),...(doc!==draft?[{action:'Published with TSB',at:x.updatedAt,actor,previous:snapshot(doc)}]:[])];
   data.sops[index]=published;link.snapshot=snapshot(published);delete link.pending;
  }
  x.publishedAt=x.updatedAt;x.publishedBy=actor;
 }
 if(old)all[all.indexOf(old)]=x;else all.push(x);return x;
}
function validatePartCycles(bulletins){
 const graph=new Map();for(const b of bulletins)for(const p of b.parts||[]){const key=p.manufacturer.toUpperCase()+'|'+p.old,next=p.manufacturer.toUpperCase()+'|'+p.replacement;graph.set(key,[...(graph.get(key)||[]),next]);}
 const visited=new Set(),active=new Set();const visit=k=>{if(active.has(k))throw Error('These part replacements create a cycle. Review the source part numbers.');if(visited.has(k))return;active.add(k);for(const n of graph.get(k)||[])visit(n);active.delete(k);visited.add(k);};for(const k of graph.keys())visit(k);
}
export function partLookup(content,query,bus=null,date=today()){
 const q=partNumber(query);if(!q)return [];
 const notices=publishedBulletins(content).filter(x=>x.type==='parts'&&x.effectiveDate<=date&&(!bus||targetMatches(x,bus)));
 const edges=notices.flatMap(b=>b.parts.map(p=>({...p,bulletin:b})));
 const found=edges.filter(p=>p.old.includes(q)||p.replacement.includes(q)||p.description.toUpperCase().includes(q));
 return found.map(start=>{const chain=[start],seen=new Set([start.old]);let ambiguous=false;
  while(chain.length<50){const last=chain.at(-1);if(seen.has(last.replacement)){ambiguous=true;break;}seen.add(last.replacement);
   const next=edges.filter(e=>e.old===last.replacement&&e.manufacturer.toUpperCase()===last.manufacturer.toUpperCase());if(!next.length)break;
   if(next.length!==1){ambiguous=true;break;}chain.push(next[0]);
  }
  const duplicates=edges.filter(e=>e.old===start.old&&e.manufacturer.toUpperCase()===start.manufacturer.toUpperCase());if(duplicates.length>1)ambiguous=true;
  return {old:start.old,current:ambiguous?null:chain.at(-1).replacement,chain,ambiguous,needsBus:!bus,conditional:chain.some(p=>p.conditions||p.associated)};
 });
}
