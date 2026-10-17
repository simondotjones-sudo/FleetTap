import {pm3} from './pm3.js';
import {isCriticalFault,safetyResolved,openCriticalFaults} from './critical-safety.js';

export const sectionCategories=[
 {id:'mechanical',name:'Mechanical',icon:'mechanical'},
 {id:'body',name:'Body & access',icon:'body'},
 {id:'fire',name:'Fire safety',icon:'fire'},
 {id:'final',name:'Final checks',icon:'final'}
];
const categoryFor=tasks=>{const source=tasks.map(t=>Number(String(t.id).split('-')[0])).filter(n=>n>=1&&n<=17);const n=source[0];return n===17?'final':n>=11?'fire':n>=7?'body':'mechanical';};
// Section identities survive renaming and reordering. Old inspection snapshots keep
// their original unrestricted sequence; only future templates receive pilot gates.
export function sectionRulesFor(template={},pilotDefault=false){
 const tasks=template.tasks||pm3,existing=template.sectionRules||[];
 return [...new Set(tasks.map(t=>t.section))].map(name=>{
  const group=tasks.filter(t=>t.section===name),saved=existing.find(r=>r.name===name);
  if(saved)return {...saved,prerequisites:[...(saved.prerequisites||[])]};
  const final=group.some(t=>t.id==='17-1');
  return {id:'section:'+group[0].id,name,category:categoryFor(group),mode:pilotDefault&&final?'all':'any',requirement:pilotDefault&&final?'passed':'completed',prerequisites:[],final:pilotDefault&&final};
 });
}
export const dependencies=(rules,rule)=>rule.mode==='all'?rules.filter(r=>r.id!==rule.id).map(r=>r.id):rule.mode==='selected'?rule.prerequisites:[];
export function validateSectionRules(rules){
 const ids=new Set(rules.map(r=>r.id));
 if(ids.size!==rules.length)throw Error('Section identities must be unique.');
 for(const r of rules){
  if(!sectionCategories.some(c=>c.id===r.category)||!['any','selected','all'].includes(r.mode)||!['completed','passed'].includes(r.requirement))throw Error('Choose a valid category and sequencing rule.');
  if(!Array.isArray(r.prerequisites)||r.prerequisites.some(id=>!ids.has(id)||id===r.id)||new Set(r.prerequisites).size!==r.prerequisites.length)throw Error('Choose other existing sections as prerequisites.');
  if(r.mode==='selected'&&!r.prerequisites.length)throw Error('Select at least one prerequisite section.');
  if(r.final&&(r.mode==='any'||r.requirement!=='passed'))throw Error('Test Drive requires passed prerequisites. Critical safety holds cannot be bypassed.');
 }
 const visited=new Set(),visiting=new Set();
 function visit(id){if(visiting.has(id))throw Error('These prerequisites create a circular sequence. Choose an earlier independent section.');if(visited.has(id))return;visiting.add(id);for(const dep of dependencies(rules,rules.find(r=>r.id===id)))visit(dep);visiting.delete(id);visited.add(id);}
 rules.forEach(r=>visit(r.id));
}
export function categoryPages(inspection){
 const rules=sectionRulesFor(inspection.templateSnapshot),pages=[];
 for(const category of sectionCategories){const sections=rules.filter(r=>r.category===category.id);for(let n=0;n<sections.length;n+=6)pages.push({...category,sections:sections.slice(n,n+6)});}
 return pages;
}
const tasksFor=i=>i.templateSnapshot?.tasks||pm3;
const faultFor=(state,i,id)=>(state.faults||[]).find(f=>f.id===id&&f.garage===i.garage&&f.vehicle===i.vehicle);
export function verifiedInspectionFault(state,i,id){
 const f=faultFor(state,i,id);
 return !!f&&!f.deletedAt&&f.status==='Closed'&&!!f.closedBy&&!!f.closureNotes?.trim()&&(!isCriticalFault(state,f)||safetyResolved(f))&&!(state.actions||[]).some(a=>a.garage===i.garage&&a.source===id&&a.status!=='Closed');
}
export function inspectionSequence(state,i){
 const tasks=tasksFor(i),rules=sectionRulesFor(i.templateSnapshot),statuses=new Map(),gates=new Map(),visiting=new Set();
 const ruleFor=name=>rules.find(r=>r.name===name);
 const ancestors=rule=>{const found=new Set();function walk(r){for(const id of dependencies(rules,r)){if(id===rule.id||found.has(id))continue;found.add(id);const next=rules.find(x=>x.id===id);if(next)walk(next);}}walk(rule);return found;};
 function evidence(name){
  const r=ruleFor(name);if(!r||r.mode==='any')return null;
  const ids=ancestors(r),names=new Set(rules.filter(r=>ids.has(r.id)).map(r=>r.name));
  // Revision tokens keep the receipt small even when every answer has long notes.
  // Fault and recheck timestamps are server-owned; no private action assignments
  // enter this receipt, so mechanics and reviewers see the same evidence.
  const faultEvidence=f=>f?[f.id,f.status,f.closedAt||null,f.safetyResolution?.at||null,f.safetyResolution?.verified===true]:null;
  const entries=tasks.filter(t=>names.has(t.section)).map(t=>{const a=i.answers?.[t.id],check=i.rechecks?.[t.id];return [t.id,a?.revision||a?.updated||(a?JSON.stringify([a.result,a.notes,a.readings]):null),check?[check.at,check.resolvedAt||null]:null,faultEvidence(faultFor(state,i,a?.fault))];});
  const critical=r.final?(state.faults||[]).filter(f=>f.garage===i.garage&&f.vehicle===i.vehicle&&f.inspection===i.id&&isCriticalFault(state,f)).map(faultEvidence):[];
  return JSON.stringify([entries,critical]);
 }
 function current(task){const a=i.answers?.[task.id];return !!a&&(ruleFor(task.section)?.mode==='any'||a.sequenceEvidence===evidence(task.section));}
 function status(name){
  if(statuses.has(name))return statuses.get(name);
  if(visiting.has(name))return {complete:false,passed:false,blocked:true,unfinished:1,faults:0,stale:0};
  visiting.add(name);
  const group=tasks.filter(t=>t.section===name),available=group.filter(t=>!t.blocked);
  const unfinished=available.filter(t=>!i.answers?.[t.id]||i.answers[t.id].result==='Not completed'||i.rechecks?.[t.id]&&!i.rechecks[t.id].resolvedAt).length;
  const stale=available.filter(t=>i.answers?.[t.id]&&!current(t)).length;
  const faults=available.filter(t=>(i.answers?.[t.id]?.fault||['Defect','Fixed'].includes(i.answers?.[t.id]?.result))&&!verifiedInspectionFault(state,i,i.answers[t.id].fault)).length;
  const blocked=group.some(t=>t.blocked),locked=!gate(name).ready;
  const complete=available.length>0&&!blocked&&!unfinished&&!stale&&!locked;
  const passed=complete&&!faults&&available.every(t=>{const a=i.answers[t.id];return a.result==='OK'&&(!a.fault||verifiedInspectionFault(state,i,a.fault))||a.result==='Not due'&&t.conditional&&t.id!=='2-20'&&!!a.notes?.trim()||['Defect','Fixed'].includes(a.result)&&verifiedInspectionFault(state,i,a.fault);});
  const result={complete,passed,blocked,unfinished,faults,stale,locked,saved:available.filter(t=>i.answers?.[t.id]).length,total:available.length};
  visiting.delete(name);statuses.set(name,result);return result;
 }
 function gate(name){
  if(gates.has(name))return gates.get(name);
  const r=ruleFor(name),reasons=[];
  if(!r)return {ready:false,reasons:[{text:'Section unavailable.'}]};
  for(const id of dependencies(rules,r)){
   const dep=rules.find(x=>x.id===id);if(!dep){reasons.push({text:'A prerequisite section is unavailable.'});continue;}
   const s=status(dep.name);
   if(!(r.requirement==='passed'?s.passed:s.complete))reasons.push({section:dep.name,text:dep.name+' — '+(s.blocked?'technical review pending':s.stale?'repeat check required':s.unfinished?'checks unfinished':s.faults?'repair verification outstanding':s.locked?'prerequisites outstanding':'not yet passed')});
  }
  if(r.final){
   const critical=openCriticalFaults(state,i.garage,i.vehicle);
   if(critical.length)reasons.push({text:`${critical.length} Critical Safety Fault${critical.length===1?'':'s'} — bus held until repaired and verified.`});
   const last=(state.releaseEvents||[]).filter(e=>e.garage===i.garage&&e.vehicle===i.vehicle).at(-1);
   if(last?.type==='hold')reasons.push({text:'Supervisor hold — '+last.notes});
  }
  const result={ready:!reasons.length,reasons};gates.set(name,result);return result;
 }
 return {rules,ruleFor,status,gate,evidence,current};
}
export function requireSectionReady(state,i,task){const seq=inspectionSequence(state,i),gate=seq.gate(task.section);if(!gate.ready)throw Error(task.section+' is locked: '+gate.reasons.map(r=>r.text).join(' '));return seq;}
export function requireCurrentSequence(state,i){const seq=inspectionSequence(state,i);for(const t of tasksFor(i).filter(t=>!t.blocked&&seq.ruleFor(t.section)?.mode!=='any')){requireSectionReady(state,i,t);if(!seq.current(t))throw Error(t.section+' requires a fresh check because its prerequisites changed.');}}
