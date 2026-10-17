// Display-only citation extraction: original instructions and measurements stay intact.
const refPattern=String.raw`\b(?:(?:Standard\s+Instruction\s+)?S\.?\s*I\.?|S\.?\s*O\.?\s*P\.?|Standard\s+Instruction)\s*(?:No\.?\s*|number\s*|[#:\-]\s*)?([A-Z]?\d+(?:[/-][A-Z0-9]+)?)\b`;
export function documentReferences(text=''){
 const refs=new Map();
 for(const m of String(text).matchAll(new RegExp(refPattern,'gi'))){const kind=/^S\.?\s*O/i.test(m[0])?'SOP':'SI',number=m[1].toUpperCase(),key=kind+':'+number;refs.set(key,{key,kind,number,label:kind+' '+number});}
 return [...refs.values()];
}
export function taskCopy(t){
 const refs=[],source=String(t.question||t.text||'');
 const documentRefs=documentReferences([source,t.text||'',t.section==='Engine and Transmission'?'SI 288':''].join('\n'));
 const referenceOnly=s=>documentReferences(s).length&&/^(?:[\[(]\s*)?(?:(?:see|ref\.?|as per|refer to)\s+)?(?:Standard Instruction\s+)?S\.?\s*(?:I|O\.?\s*P)/i.test(s)&&!/(?:\d\s*(?:mm|bar|kg|Nm|seconds)|\b(?:check|replace|adjust|tighten)\b)/i.test(s);
 let text=source.replace(/\([^)]*\)|\[[^\]]*\]/g,m=>{if(/^\(SAP\s+Codes?\s+/i.test(m)){refs.push(m);return '';}return referenceOnly(m)?'':m;});
 text=text.replace(new RegExp(String.raw`\s*(?:as per|in accordance with|refer to|see|follow)\s+${refPattern}(?:\s+issued on\s+[^‘’'\n]*[‘’']\d{2})?\.?`,'gi'),m=>m.endsWith('.')?'. ':'')
  .replace(new RegExp(refPattern,'gi'),'')
  .replace(/\s+([.,;])/g,'$1').replace(/\.{2,}/g,'.').replace(/\.([A-Z])/g,'. $1').replace(/\(\s*\)|\[\s*\]/g,'').replace(/\s{2,}/g,' ').trim();
 return {text,refs,documentRefs};
}
const normal=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').replace(/[.\s]+$/,'').trim();
export const hasExtraInstruction=t=>normal(taskCopy({text:t.text,section:t.section}).text)!==normal(taskCopy(t).text)&&!!normal(t.text);

// Match the document's own reference, never a citation buried in its instructions.
export function referenceDocument(ref,sops=[]){
 const matches=sops.filter(s=>!s.deletedAt&&(!s.status||s.status==='Published')&&s.sourceId&&documentReferences(s.reference||s.title).some(r=>r.key===ref.key));
 return matches.length===1?matches[0]:null;
}
