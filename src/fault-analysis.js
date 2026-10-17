import {isPM3,tasksFor,templateFor} from './templates.js';
import {vehicleModelType} from './fleet-models.js';
import {criticalTask} from './critical-safety.js';
import {taskCopy} from './question-copy.js';
import {validDate} from './scheduling.js';
import {dublinDate} from './performance-model.js';

const DAY=86400000;
const assessed=new Set(['OK','Defect','Fixed']);
const failed=new Set(['Defect','Fixed']);
const timestamp=value=>value&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
const alive=r=>!r.deletedAt&&!r.voidedAt;
const key=(...parts)=>JSON.stringify(parts);
const compare=(a,b)=>a.at-b.at||a.inspection.id.localeCompare(b.inspection.id);
export const questionLabel=id=>/^\d+-\d/.test(id)?id.replace('-', '.'):'Custom';
export const repeatLabels={closed:'After closure',open:'Still open at repeat',unknown:'Earlier closure unknown'};

export function validateAnalysisFilters(f){
 if((f.from&&!validDate(f.from))||(f.to&&!validDate(f.to))||(f.from&&f.to&&f.from>f.to))throw Error('Choose a valid inspection start-date range.');
 if(!['30','90','180','365','all'].includes(String(f.window??'90')))throw Error('Choose a valid repeat window.');
}

function answerHistory(i){
 const answers=new Map();
 const add=(id,a)=>{if(!a||typeof a!=='object')return;const list=answers.get(id)||[];list.push(a);answers.set(id,list);};
 for(const [id,a] of Object.entries(i.answers||{}))add(id,a);
 for(const audit of i.audit||[]){
  if(audit.item){add(audit.item,audit.value);add(audit.item,audit.previous);}
  // A reopened inspection retains its earlier answers in one audit snapshot.
  for(const [id,a] of Object.entries(audit.previous?.answers||{}))add(id,a);
 }
 return answers;
}

function closureAt(f){
 if(f.status!=='Closed')return null;
 return timestamp(f.closedAt)??timestamp(f.safetyResolution?.at)??
  (f.audit||[]).filter(a=>a.action==='Close').map(a=>timestamp(a.at)).filter(t=>t!==null).sort((a,b)=>b-a)[0]??null;
}

function priorState(previous,current){
 if(!previous.timeKnown||!current.timeKnown||!previous.faults.length)return 'unknown';
 const before=current.at;
 if(previous.faults.some(f=>f.status!=='Closed'||closureAt(f)!==null&&closureAt(f)>=before))return 'open';
 if(previous.faults.every(f=>closureAt(f)!==null&&closureAt(f)<before))return 'closed';
 return 'unknown';
}

const metrics=observations=>{
 const checked=observations.filter(o=>o.checked),failures=checked.filter(o=>o.failed);
 return {checked:checked.length,failures:failures.length,rate:checked.length?failures.length/checked.length:null,
  buses:new Set(failures.map(o=>o.bus.id)).size,repeats:failures.filter(o=>o.previous).length,
  afterClosure:failures.filter(o=>o.repeatState==='closed').length,
  open:failures.filter(o=>o.open).length,unknown:failures.filter(o=>o.closureUnknown).length,
  fixed:failures.filter(o=>o.fixed).length,notDue:observations.filter(o=>o.result==='Not due'&&!o.checked).length,
  unfinished:observations.filter(o=>!o.checked&&o.result!=='Not due').length};
};

// Read-only analysis of authorised garage records. Never changes a fault, hold or release.
// A check is one inspection/question, including earlier failed results retained in its audit.
export function faultAnalysis(state,garage,filters={},now=new Date()){
 const f={from:'',to:'',model:'',bus:'',section:'',question:'',window:'90',...filters};validateAnalysisFilters(f);
 const nowMs=Number(now),vehicles=(state.vehicles||[]).filter(v=>v.garage===garage&&alive(v));
 const buses=new Map(vehicles.map(v=>[v.id,v]));
 const scopedBus=v=>(!f.model||(vehicleModelType(v)||'OTHER')===f.model)&&(!f.bus||v.id===f.bus);
 const inspections=(state.inspections||[]).filter(i=>i.garage===garage&&alive(i)&&isPM3(i)&&buses.has(i.vehicle)&&timestamp(i.created)!==null&&timestamp(i.created)<=nowMs);
 const faults=(state.faults||[]).filter(r=>r.garage===garage&&alive(r)&&buses.has(r.vehicle)&&!(timestamp(r.created)>nowMs));
 const faultIndex=new Map();
 for(const fault of faults){const k=key(fault.inspection,fault.vehicle,fault.item),list=faultIndex.get(k)||[];list.push(fault);faultIndex.set(k,list);}
 const catalogue=new Map(),observations=[],linked=new Set();
 // Current names aid discovery; each drill-down retains the question as it was asked.
 const addQuestion=(task,version=1)=>{if(!catalogue.has(task.id))catalogue.set(task.id,{id:task.id,title:taskCopy(task).text,section:task.section,number:task.number,version});};
 for(const task of templateFor(state).tasks)addQuestion(task,state.inspectionTemplate?.version||1);
 for(const i of [...inspections].sort((a,b)=>String(b.created).localeCompare(String(a.created)))){
  const history=answerHistory(i),bus=buses.get(i.vehicle),started=dublinDate(i.created);
  for(const task of tasksFor(i)){
   addQuestion(task,i.templateSnapshot?.version||1);
   const entries=(history.get(task.id)||[]).filter(a=>!(timestamp(a.updated)>nowMs));
   const source=[...new Map((faultIndex.get(key(i.id,i.vehicle,task.id))||[]).map(r=>[r.id,r])).values()];
   const answer=i.answers?.[task.id],isFailure=entries.some(a=>failed.has(a.result))||source.length>0;
   const checked=!task.blocked&&(entries.some(a=>assessed.has(a.result))||isFailure);
   // Blocked instructions are never a performed check or a recurrence signal.
   if(task.blocked)continue;
   for(const fault of source)linked.add(fault.id);
   const times=[...source.map(r=>timestamp(r.created)),...entries.filter(a=>failed.has(a.result)).map(a=>timestamp(a.updated))].filter(t=>t!==null);
   const at=times.length?Math.min(...times):timestamp(i.created);
   observations.push({id:key(i.id,task.id),inspection:i,task,bus,started,model:vehicleModelType(bus)||'OTHER',
    at,timeKnown:times.length>0,checked,failed:checked&&isFailure,fixed:entries.some(a=>a.result==='Fixed'),
    result:answer?.result||'Not recorded',faults:source,answers:entries,critical:source.some(r=>r.criticalSafety===true)||criticalTask(task),
    open:source.some(r=>r.status!=='Closed'),closureUnknown:isFailure&&(!source.length||source.some(r=>r.status==='Closed'&&closureAt(r)===null)),
    selected:(!f.from||started>=f.from)&&(!f.to||started<=f.to)&&scopedBus(bus)&&(!f.section||task.section===f.section)&&(!f.question||task.id===f.question)});
  }
 }
 const histories=new Map();
 for(const o of observations.filter(o=>o.failed)){
  const k=key(o.bus.id,o.task.id),list=histories.get(k)||[];list.push(o);histories.set(k,list);
 }
 for(const list of histories.values()){
  list.sort(compare);
  for(let n=1;n<list.length;n++){
   const o=list[n],previous=list[n-1],days=(o.at-previous.at)/DAY;
   // A tie does not establish which finding happened first.
   if(days>0&&(f.window==='all'||days<=Number(f.window??90))){o.previous=previous;o.daysSincePrevious=days;o.repeatState=priorState(previous,o);}
  }
 }
 const selected=observations.filter(o=>o.selected),questionRows=[],byQuestion=new Map();
 for(const o of selected){const list=byQuestion.get(o.task.id)||[];list.push(o);byQuestion.set(o.task.id,list);}
 for(const q of catalogue.values()){
  const items=byQuestion.get(q.id)||[];
  if(f.question&&f.question!==q.id||f.section&&!items.length&&q.section!==f.section)continue;
  questionRows.push({...q,observations:items,...metrics(items)});
 }
 questionRows.sort((a,b)=>b.failures-a.failures||b.repeats-a.repeats||a.id.localeCompare(b.id,undefined,{numeric:true}));
 const recurring=[];
 for(const history of histories.values()){
  const events=history.filter(o=>o.selected),repeated=events.filter(o=>o.previous);
  if(!repeated.length)continue;
  const latest=events.at(-1),q=catalogue.get(latest.task.id);
  recurring.push({id:key(latest.bus.id,q.id),bus:latest.bus,model:latest.model,question:q,events,history,
   latest,repeats:repeated.length,afterClosure:repeated.filter(o=>o.repeatState==='closed').length,
   unresolved:repeated.filter(o=>o.repeatState==='open').length,unknown:repeated.filter(o=>o.repeatState==='unknown').length,
   open:events.filter(o=>o.open).length,critical:events.some(o=>o.critical)});
 }
 recurring.sort((a,b)=>b.repeats-a.repeats||b.latest.at-a.latest.at||a.bus.id.localeCompare(b.bus.id));
 const unlinked=faults.filter(r=>!linked.has(r.id)&&scopedBus(buses.get(r.vehicle))).filter(r=>{
  const t=timestamp(r.created);return t!==null&&(!f.from||dublinDate(t)>=f.from)&&(!f.to||dublinDate(t)<=f.to);
 });
 return {garage,filters:f,questions:questionRows,recurring,observations:selected,allObservations:observations,
  catalogue:[...catalogue.values()],vehicles,totals:metrics(selected),unlinked:unlinked.length,
  missingDates:(state.inspections||[]).filter(i=>i.garage===garage&&alive(i)&&isPM3(i)&&buses.has(i.vehicle)&&scopedBus(buses.get(i.vehicle))&&timestamp(i.created)===null).length};
}

export function questionBreakdown(report,id){
 const question=report.questions.find(q=>q.id===id);if(!question)return null;
 const split=field=>[...new Set(question.observations.map(o=>field(o)))].map(name=>({name,...metrics(question.observations.filter(o=>field(o)===name))}));
 const history=report.allObservations.filter(o=>o.failed&&o.task.id===id&&(!report.filters.bus||o.bus.id===report.filters.bus)&&(!report.filters.model||o.model===report.filters.model)&&(!report.filters.section||o.task.section===report.filters.section)).sort((a,b)=>compare(b,a));
 return {...question,models:split(o=>o.model).sort((a,b)=>b.failures-a.failures),
  busesByFailure:split(o=>o.bus.id).sort((a,b)=>b.repeats-a.repeats||b.failures-a.failures),
  months:split(o=>o.started.slice(0,7)).sort((a,b)=>a.name.localeCompare(b.name)),history};
}

const csvCell=value=>{let s=String(value??'');if(/^[\s]*[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
export function analysisCSV(report,view='questions'){
 const context=[report.garage,report.filters.from,report.filters.to,report.filters.model,report.filters.bus,report.filters.section,report.filters.question,report.filters.window];
 const header=['Garage','Inspection started from','Inspection started to','Model filter','Bus filter','Section filter','Question filter','Repeat window days'];
 let columns,rows;
 if(view==='recurring'){
  columns=['Bus','Model','Question ID','Question','Repeated findings in period','After closure','Still open at repeat','Earlier closure unknown','Open findings now','Latest finding','Current fault IDs','Previous fault IDs'];
  rows=report.recurring.map(r=>[r.bus.id,r.model,r.question.id,r.question.title,r.repeats,r.afterClosure,r.unresolved,r.unknown,r.open,new Date(r.latest.at).toISOString(),r.events.flatMap(o=>o.faults.map(f=>f.id)).join('; '),[...new Set(r.events.flatMap(o=>o.previous?.faults.map(f=>f.id)||[]))].join('; ')]);
 }else{
  columns=['Question ID','Section','Question','Checks assessed','Checks with faults','Failure rate percent','Affected buses','Repeated findings','After closure','Open findings now','Fixed during check','Not due','Not assessed'];
  rows=report.questions.map(q=>[q.id,q.section,q.title,q.checked,q.failures,q.rate===null?'':(q.rate*100).toFixed(2),q.buses,q.repeats,q.afterClosure,q.open,q.fixed,q.notDue,q.unfinished]);
 }
 return [[...header,...columns],...rows.map(row=>[...context,...row])].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
