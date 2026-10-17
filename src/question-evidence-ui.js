import {esc} from './api.js';
import {taskCopy,referenceDocument} from './question-copy.js';
export function questionReferences(c,t){
 const copy=taskCopy(t),items=copy.documentRefs.map(ref=>{const doc=referenceDocument(ref,c.content?.sops);return doc?`<a href="${esc('/.netlify/functions/sop-documents?'+new URLSearchParams({garage:c.garage,id:doc.sourceId}))}" target="_blank" rel="noopener" aria-label="Open ${esc(ref.label)} source PDF">${esc(ref.label)}</a>`:`<span>${esc(ref.label)}</span>`;});
 return items.length||copy.refs.length?`<div class="tap-references">${items.length?`<p class="question-document-references">${items.join('<span aria-hidden="true"> · </span>')}</p>`:''}${copy.refs.length?`<p>${copy.refs.map(esc).join(' · ')}</p>`:''}</div>`:'';
}
export function repairEvidence(repair){return repair?`<section class="repair-reported"><strong>Repair reported during check</strong><p><b>Fault found:</b> ${esc(repair.defect)}</p><p><b>Work completed:</b> ${esc(repair.work)}</p><p><b>Recheck:</b> ${esc(repair.recheck)}</p><small>${esc(repair.actor)} · ${esc(repair.at?.slice(0,10))}</small></section>`:'';}
