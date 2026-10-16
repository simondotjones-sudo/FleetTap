import {vehicleModelType,fleetModel} from './fleet-models.js';
import {manager,workerName} from './roles.js';
import {today} from './scheduling.js';
export function controlFields(values,old={}){
 const required=values.required===undefined?!!old?.required:values.required==='yes';
 const target=String(values.target??old?.target??'all');
 const model=String(values.targetModel??old?.targetModel??'');
 const fleets=[...new Set(String(values.targetFleets??old?.targetFleets?.join(',')??'').toUpperCase().split(/[\s,]+/).filter(Boolean))];
 const kind=(values.controlKind??old?.controlKind)==='toolbox'?'toolbox':'instruction';
 const video=String(values.video??old?.video??'').trim();
 if(!['all','model','fleet'].includes(target)||target==='model'&&!fleetModel(model)||target==='fleet'&&(!fleets.length||fleets.length>500||fleets.some(x=>!/^[A-Z0-9-]{1,40}$/.test(x))))throw Error('Choose all buses, a catalogue model or valid fleet IDs.');
 if(video){let url;try{url=new URL(video);}catch{}if(!url||url.protocol!=='https:'||url.username||url.password||video.length>2000)throw Error('Use an HTTPS toolbox talk link.');}
 // Draft requirements remain inactive; an existing published revision stays active until replaced.
 if(required&&(!String(values.reference||'').trim()||!String(values.revision||'').trim()))throw Error('Required controls need a document reference and revision.');
 if(required&&kind==='toolbox'&&!video)throw Error('Add the toolbox talk video link.');
 return {required,target,targetModel:model,targetFleets:fleets,controlKind:kind,video};
}
export const applies=(x,b)=>x.required&&x.status==='Published'&&(x.target==='all'||x.target==='model'&&vehicleModelType(b)===x.targetModel||x.target==='fleet'&&[b.id,...(b.audit||[]).map(a=>a.previous?.id)].some(id=>x.targetFleets?.includes(id)));
export function requiredControls(content,b){return (content.sops||[]).filter(x=>applies(x,b));}
export function acknowledgement(s,g,u,x){return (s.instructionAcks||[]).find(a=>a.garage===g&&a.userId===u&&a.instructionId===x.id&&a.version===x.version);}
export function pendingControls(s,g,user,content,vehicle){
 const b=s.vehicles.find(b=>b.id===vehicle&&b.garage===g);if(!b)throw Error('Bus unavailable in this garage.');
 return requiredControls(content,b).filter(x=>x.reviewDate&&x.reviewDate<today()||!acknowledgement(s,g,user,x));
}
export function requireControls(s,g,u,content,vehicle){if(!vehicle)return;const pending=pendingControls(s,g,u.id,content,vehicle);if(pending.length)throw Error('Work blocked: read and acknowledge current instructions in Required instructions. '+pending.map(x=>x.title).join('; '));}
export function acknowledgeControl(s,g,u,content,v){
 const x=content.sops?.find(x=>x.id===v.instructionId&&x.required&&x.status==='Published');
 if(!x||x.version!==Number(v.version))throw Error('Instruction changed. Reload and read the current version.');
 if(x.reviewDate&&x.reviewDate<today())throw Error('This instruction is overdue for review. Contact your Organisation Admin.');
 if(!s.vehicles.some(b=>b.garage===g&&applies(x,b)))throw Error('Instruction does not apply to this garage fleet.');
 if(v.understood!=='yes'||x.controlKind==='toolbox'&&v.watched!=='yes')throw Error('Confirm you understand the instruction and have watched any required toolbox talk.');
 const prior=acknowledgement(s,g,u.id,x);if(prior)return prior;
 const {audit,draftRevision,...snapshot}=x;
 const a={id:crypto.randomUUID(),garage:g,userId:u.id,actor:workerName(u),instructionId:x.id,version:x.version,at:new Date().toISOString(),understood:true,watched:x.controlKind==='toolbox',snapshot:structuredClone(snapshot)};
 (s.instructionAcks??=[]).push(a);return a;
}
export function visibleControls(s,u){return manager(u)?s:{...s,instructionAcks:(s.instructionAcks||[]).filter(a=>a.userId===u.id)};}
