import test from 'node:test';
import assert from 'node:assert/strict';
import {faultAnalysis,questionBreakdown,analysisCSV} from '../src/fault-analysis.js';
import {faultAnalysisView,analysisParams} from '../src/fault-analysis-ui.js';
import {performanceView} from '../src/performance-ui.js';
import {startInspection,saveAnswer} from '../src/inspections.js';
import {closeRecord} from '../src/reviews.js';

const g='north',now=new Date('2026-10-17T12:00:00Z');
const tasks=[{id:'1-2',section:'Brake Test',number:'2',text:'Check brake performance.',criticalSafety:true},
 {id:'door',section:'Doors',number:'1',text:'Check doors.',criticalSafety:false},
 {id:'conditional',section:'Servicing',number:'1',text:'Replace when due.',conditional:true},
 {id:'blocked',section:'Servicing',number:'2',text:'Unresolved instruction.',blocked:true}];
const base=()=>({vehicles:[{id:'SG1',garage:g,modelType:'SG',model:'Volvo'},{id:'EW2',garage:g,modelType:'EW',model:'Electric'},{id:'SG1',garage:'south',modelType:'SG'}],inspections:[],faults:[],actions:[],inspectionTemplate:{id:'pm3',version:1,tasks:structuredClone(tasks)}});
const period={from:'2026-10-01',to:'2026-10-17',window:'90'};
function inspect(s,id,created,answers={},extra={}){
 const i={id,templateId:'pm3',garage:g,vehicle:'SG1',created,status:'Completed',answers:Object.fromEntries(Object.entries(answers).map(([id,result])=>[id,{result,updated:created,worker:'Mechanic',notes:'Recorded finding'}])),audit:[],templateSnapshot:{version:1,tasks:structuredClone(tasks)},...extra};s.inspections.push(i);return i;
}
function fault(s,i,item='1-2',extra={}){
 const f={id:'F-'+i.id+'-'+item,garage:i.garage,vehicle:i.vehicle,inspection:i.id,item,created:i.created,status:'Open',description:'Brake issue',...extra};s.faults.push(f);return f;
}
const report=(s,filters={})=>faultAnalysis(s,g,{...period,...filters},now);
const q=r=>r.questions.find(q=>q.id==='1-2');

test('failure rate counts each inspected question once and retains fixed and amended failures',()=>{
 const s=base(),i=inspect(s,'i1','2026-10-02T10:00:00Z',{'1-2':'OK',door:'Fixed',conditional:'Not due',blocked:'Defect'});
 i.audit=[{item:'1-2',value:{result:'Defect',updated:i.created}},{item:'1-2',previous:{result:'Defect',updated:i.created},value:{result:'OK',updated:'2026-10-03T10:00:00Z'}},{action:'Reopen for amendment',previous:{answers:{'1-2':{result:'Defect',updated:i.created}}}}];
 fault(s,i,'1-2');fault(s,i,'1-2',{id:'second-fault'});
 inspect(s,'i2','2026-10-04T10:00:00Z',{'1-2':'OK',door:'Not completed',conditional:'Not due'});
 const before=structuredClone(s),r=report(s);assert.equal(q(r).checked,2);assert.equal(q(r).failures,1);assert.equal(q(r).rate,.5);assert.equal(q(r).repeats,0);
 assert.equal(r.questions.find(q=>q.id==='door').fixed,1);assert.equal(r.questions.find(q=>q.id==='conditional').checked,0);assert.equal(r.questions.find(q=>q.id==='conditional').rate,null);assert.equal(r.questions.find(q=>q.id==='blocked').checked,0);assert.deepEqual(s,before);
});

test('recurrences look outside reporting dates and distinguish prior closure from an unresolved fault',()=>{
 const s=base(),early=inspect(s,'earlier','2026-09-01T10:00:00Z',{'1-2':'Defect'});fault(s,early,'1-2',{status:'Closed',closedAt:'2026-09-03T10:00:00Z',closureNotes:'Repaired and retested'});
 const current=inspect(s,'current','2026-10-01T10:00:00Z',{'1-2':'Defect'});fault(s,current,'1-2',{status:'Closed',closedAt:'2026-10-10T10:00:00Z'});
 const next=inspect(s,'next','2026-10-05T10:00:00Z',{'1-2':'Defect'});fault(s,next);
 const r=report(s);assert.equal(q(r).failures,2);assert.equal(q(r).repeats,2);assert.equal(q(r).afterClosure,1);
 assert.equal(r.recurring.length,1);assert.equal(r.recurring[0].unresolved,1);assert.equal(r.recurring[0].open,1);assert.equal(r.recurring[0].history.length,3);
 assert.equal(report(s,{window:'30'}).totals.repeats,2);assert.equal(report(s,{from:'2026-10-05',window:'30'}).totals.repeats,1);
});

test('repeat windows exclude older findings and all-history comparisons remain explicit',()=>{
 const s=base();for(const [id,day] of [['old','2026-06-01'],['new','2026-10-01']])fault(s,inspect(s,id,day+'T12:00:00Z',{'1-2':'Defect'}));
 assert.equal(report(s).totals.repeats,0);assert.equal(report(s,{window:'all'}).totals.repeats,1);
 assert.throws(()=>report(s,{window:'0'}),/repeat window/);
});

test('same finding on different buses is a question trend, not a repeated fault on one bus',()=>{
 const s=base();fault(s,inspect(s,'one','2026-10-02T12:00:00Z',{'1-2':'Defect'}));fault(s,inspect(s,'two','2026-10-03T12:00:00Z',{'1-2':'Defect'},{vehicle:'EW2'}));
 inspect(s,'three','2026-10-04T12:00:00Z',{'1-2':'OK'},{vehicle:'EW2'});
 const r=report(s),d=questionBreakdown(r,'1-2');assert.equal(q(r).buses,2);assert.equal(q(r).repeats,0);assert.equal(q(r).rate,2/3);
 assert.equal(d.models.find(r=>r.name==='EW').rate,.5);assert.equal(d.models.find(r=>r.name==='SG').rate,1);assert.equal(d.months[0].checked,3);
 assert.equal(report(s,{model:'EW'}).totals.checked,2);assert.equal(report(s,{bus:'SG1'}).totals.checked,1);assert.equal(report(s,{section:'Doors'}).totals.checked,0);
});

test('known closure dates are required; no timestamp or no linked fault does not imply a repair',()=>{
 const s=base(),a=inspect(s,'a','2026-09-02T12:00:00Z',{'1-2':'Defect'});fault(s,a,'1-2',{status:'Closed'});
 fault(s,inspect(s,'b','2026-10-02T12:00:00Z',{'1-2':'Defect'}));
 const r=report(s);assert.equal(r.recurring[0].unknown,1);assert.equal(r.recurring[0].afterClosure,0);
 s.faults=[];assert.equal(report(s).recurring[0].unknown,1);assert.equal(report(s).totals.open,0);assert.equal(report(s).totals.unknown,1);
});

test('closure timestamps after the next failure do not count as a returned-after-closure event',()=>{
 const s=base(),a=inspect(s,'a','2026-09-02T12:00:00Z',{'1-2':'Defect'});fault(s,a,'1-2',{status:'Closed',closedAt:'2026-10-12T12:00:00Z'});
 fault(s,inspect(s,'b','2026-10-02T12:00:00Z',{'1-2':'Defect'}));assert.equal(report(s).recurring[0].unresolved,1);
 s.faults[0].closedAt='2026-10-02T12:00:00Z';assert.equal(report(s).recurring[0].unresolved,1);
});

test('question IDs retain meaning across renames and versions; identical wording on a new ID is separate',()=>{
 const s=base(),a=inspect(s,'a','2026-09-02T12:00:00Z',{'1-2':'Defect'});fault(s,a);
 const b=inspect(s,'b','2026-10-02T12:00:00Z',{'1-2':'Defect'});b.templateSnapshot.version=2;b.templateSnapshot.tasks[0].section='Brakes';b.templateSnapshot.tasks[0].text='Revised brake check';fault(s,b);
 const c=inspect(s,'c','2026-10-03T12:00:00Z',{'new-id':'Defect'});c.templateSnapshot.tasks=[{...tasks[0],id:'new-id'}];fault(s,c,'new-id');
 const r=report(s);assert.equal(q(r).repeats,1);assert.equal(r.questions.find(q=>q.id==='new-id').repeats,0);
 assert.equal(questionBreakdown(r,'1-2').history.find(o=>o.inspection.id==='b').task.text,'Revised brake check');
 assert.equal(report(s,{section:'Brakes'}).totals.repeats,1);
});

test('garage/bus linkage, deletion and future records cannot pollute analysis',()=>{
 const s=base(),a=inspect(s,'shared','2026-10-02T12:00:00Z',{'1-2':'OK'});
 fault(s,a,'1-2',{garage:'south'});fault(s,a,'1-2',{id:'wrong-bus',vehicle:'EW2'});
 const deleted=inspect(s,'deleted','2026-10-03T12:00:00Z',{'1-2':'Defect'},{deletedAt:'2026-10-04'});fault(s,deleted);
 fault(s,inspect(s,'future','2026-11-02T12:00:00Z',{'1-2':'Defect'}));
 fault(s,inspect(s,'foreign','2026-10-02T12:00:00Z',{'1-2':'Defect'},{garage:'south'}));
 fault(s,a,'1-2',{id:'deleted-fault',deletedAt:'2026-10-04'});
 const r=report(s);assert.equal(q(r).failures,0);assert.equal(q(r).checked,1);assert.equal(r.unlinked,2);assert.equal(r.recurring.length,0);
});

test('Dublin date boundaries use inspection start and exclude the next local day',()=>{
 const s=base();inspect(s,'a','2026-10-01T23:30:00Z',{'1-2':'OK'});inspect(s,'b','2026-10-02T23:30:00Z',{'1-2':'Defect'});
 const r=report(s,{from:'2026-10-02',to:'2026-10-02'});assert.equal(q(r).checked,1);assert.equal(q(r).failures,0);
 assert.throws(()=>report(s,{from:'bad'}),/start-date/);assert.throws(()=>report(s,{from:'2026-10-17',to:'2026-10-01'}),/start-date/);
});

test('unknown dates, simultaneous findings and repeated saves cannot manufacture recurrence order',()=>{
 const s=base();for(const id of ['a','b'])fault(s,inspect(s,id,'2026-10-02T12:00:00Z',{'1-2':'Defect'}));
 inspect(s,'missing','not a date',{'1-2':'Defect'});assert.equal(report(s).totals.repeats,0);assert.equal(report(s).missingDates,1);
});

test('CSV carries filters, meaningful denominator and linked evidence; formula text is escaped',()=>{
 const s=base();s.inspectionTemplate.tasks[0].text='=HYPERLINK("bad")';
 const a=inspect(s,'a','2026-09-02T12:00:00Z',{'1-2':'Defect'});fault(s,a);
 fault(s,inspect(s,'b','2026-10-02T12:00:00Z',{'1-2':'Defect'}));
 const r=report(s,{model:'SG',question:'1-2'}),csv=analysisCSV(r);assert.match(csv,/"'=HYPERLINK/);assert.match(csv,/Failure rate percent/);assert.match(csv,/"north","2026-10-01","2026-10-17","SG"/);
 assert.match(analysisCSV(r,'recurring'),/F-a-1-2/);assert.match(analysisCSV(r,'recurring'),/F-b-1-2/);
});

test('analysis view is manager-only, handles empty states, and escapes saved question and fault text',()=>{
 const s=base(),c={state:s,garage:g,me:{id:'manager',role:'garage_manager'},page:'performance/faults?from=2026-10-01&to=2026-10-17',garages:[{id:g,name:'North'}]};
 assert.match(performanceView(c),/No repeated findings/);assert.match(faultAnalysisView(c),/PM3 questions/);
 for(const role of ['mechanic','supervisor'])assert.match(faultAnalysisView({...c,me:{role}}),/Manager access required/);
 const i=inspect(s,'a','2026-10-02T12:00:00Z',{'1-2':'Defect'});i.templateSnapshot.tasks[0].text='<script>alert(1)</script>';fault(s,i,'1-2',{description:'<img src=x onerror=alert(1)>'});
 const detail=faultAnalysisView({...c,page:'performance/faults/question/1-2?from=&to=&window=all'});
 assert.doesNotMatch(detail,/<script>|<img src=x/);assert.match(detail,/&lt;script&gt;/);assert.match(detail,/records\/faults\/F-a-1-2/);assert.match(detail,/inspection-record\/a\/0/);
 assert.match(faultAnalysisView({...c,page:'performance/faults?from=wrong'}),/Reset analysis/);
 assert.equal(analysisParams('performance/faults?from=&to=',now).from,'');assert.equal(analysisParams('performance/faults',now).from,'2026-07-20');
});

test('actual saved PM3 failures, repair review and later checks feed recurrence without new writes',()=>{
 const s=base();s.inspectionTemplate.tasks=[tasks[0]];
 const i=startInspection(s,'SG1',g,'Mechanic'),first=saveAnswer(s,i.id,g,'1-2',{result:'Fixed',notes:'Brake performance failed',worker:'Mechanic',readings:[],repair:{defect:'Brake performance failed',work:'Adjusted brake assembly',recheck:'Brake performance passed',confirmed:true}});
 const action=s.actions.find(a=>a.source===first.fault);closeRecord(s,g,'actions',action.id,{notes:'Repair and recheck reviewed'},'Supervisor');
 closeRecord(s,g,'faults',first.fault,{notes:'Verified brake repaired',safetyVerified:'yes',repairEvidence:'Adjusted brake assembly',recheckEvidence:'Brake test passed'},'Supervisor');
 i.created='2026-09-01T10:00:00Z';i.status='Completed';i.answers['1-2'].updated=i.created;i.audit=[];
 const f=s.faults.find(f=>f.id===first.fault);f.created=i.created;f.closedAt='2026-09-02T10:00:00Z';
 const next=startInspection(s,'SG1',g,'Mechanic');saveAnswer(s,next.id,g,'1-2',{result:'Defect',notes:'Poor brake performance again',worker:'Mechanic',readings:[]});
 next.created='2026-10-02T10:00:00Z';next.answers['1-2'].updated=next.created;next.audit=[];s.faults.find(f=>f.inspection===next.id).created=next.created;
 const before=structuredClone(s),r=report(s);assert.equal(r.totals.afterClosure,1);assert.equal(r.totals.failures,1);assert.deepEqual(s,before);
});
