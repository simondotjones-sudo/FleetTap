import {snapshot,publicBulletin,bulletinReviewOverdue} from './bulletins.js';
import {workerName} from './roles.js';

export const completionFor=(state,user,x)=>(state.instructionLearning||[]).find(r=>r.userId===user&&r.instructionId===x.id&&r.version===x.version)?.completion||null;
export const learningFor=(state,user,x)=>(state.instructionLearning||[]).find(r=>r.userId===user&&r.instructionId===x.id&&r.version===x.version);
export function publicLearning(r,own=false){
 const {session,attempts,...safe}=r;
 if(safe.completion?.snapshot)safe.completion={...safe.completion,snapshot:publicBulletin(safe.completion.snapshot)};
 return {...safe,attemptCount:attempts?.length||0,...(own?{attempts:(attempts||[]).map(({answers,...a})=>a)}:{})};
}
// Playback telemetry records elapsed, contiguous playback. It cannot prove attention;
// the quiz and personal understanding declaration remain separate requirements.
export function learningCommand(prior,x,u,action,v={},now=new Date()){
 if(x.status!=='Published'||Number(v.version)!==x.version)throw Error('This TSB changed. Reload the current published version.');
 const r=structuredClone(prior||{userId:u.id,instructionId:x.id,version:x.version,watchedSeconds:0,attempts:[],createdAt:now.toISOString()});
 if(r.userId!==u.id||r.instructionId!==x.id||r.version!==x.version)throw Error('Learning record unavailable.');
 if(bulletinReviewOverdue(x))throw Error('A linked instruction is overdue for review. Ask your Organisation Admin to publish its reviewed revision.');
 if(r.completion)return {record:r,result:{complete:true}};
 const at=now.toISOString();
 if(action==='video_begin'){
  if(x.completion!=='video_quiz')throw Error('This TSB does not require a video.');
  r.session={id:crypto.randomUUID(),at,position:r.watchedSeconds};
  return {record:r,result:{session:r.session.id,position:r.watchedSeconds,duration:x.videoSeconds}};
 }
 if(action==='video_progress'){
  if(x.completion!=='video_quiz'||!r.session||v.session!==r.session.id)throw Error('Restart the video to continue recorded playback.');
  const position=Number(v.position),elapsed=(now-new Date(r.session.at))/1000,advance=position-r.session.position;
  if(!Number.isFinite(position)||position<0||position>x.videoSeconds+2||elapsed<0||elapsed>45||(position>r.watchedSeconds+.1&&advance>Math.min(elapsed*1.1+.75,46)))throw Error('Playback could not be confirmed. Resume from the last recorded point.');
  r.watchedSeconds=Math.max(r.watchedSeconds,Math.min(position,x.videoSeconds));r.session={...r.session,at,position};
  return {record:r,result:{watchedSeconds:r.watchedSeconds,videoComplete:r.watchedSeconds>=x.videoSeconds-1}};
 }
 if(action==='quiz'){
  if(x.completion!=='video_quiz'||r.watchedSeconds<x.videoSeconds-1)throw Error('Finish the recorded video before taking the quiz.');
  if(!Array.isArray(v.answers)||v.answers.length!==x.quiz.length||v.answers.some((a,i)=>!Number.isInteger(a)||a<0||a>=x.quiz[i].options.length))throw Error('Answer every quiz question.');
  if(r.attempts.length>=200)throw Error('Ask your Organisation Admin to review this training requirement.');
  const result=x.quiz.map((q,i)=>({question:q.question,correct:v.answers[i]===q.correct,explanation:q.explanation})),score=result.filter(q=>q.correct).length,passed=score===x.quiz.length;
  r.attempts.push({at,score,total:x.quiz.length,passed,answers:v.answers});if(passed)r.passedAt=at;
  return {record:r,result:{score,total:x.quiz.length,passed,feedback:result}};
 }
 if(action==='acknowledge'){
  if(v.understood!=='yes')throw Error('Confirm you have read and understood this TSB and its linked instructions.');
  if(x.completion==='video_quiz'&&(!r.passedAt||r.watchedSeconds<x.videoSeconds-1))throw Error('Watch the video and pass the quiz before acknowledging.');
  r.completion={id:crypto.randomUUID(),userId:u.id,actor:workerName(u),instructionId:x.id,version:x.version,at,understood:true,watchedSeconds:r.watchedSeconds,quizPassedAt:r.passedAt||null,documents:(x.documents||[]).map(d=>({id:d.id,version:d.version,reference:d.reference})),snapshot:snapshot(x)};
  delete r.session;return {record:r,result:{complete:true}};
 }
 throw Error('Unknown learning action.');
}
