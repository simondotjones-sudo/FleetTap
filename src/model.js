export const STORAGE_KEY='fleettap-demo-v1';
export const garages=[{id:'demo-north',name:'North Garage · sample'},{id:'demo-south',name:'South Garage · sample'}];
export const documents=[
 {id:'PM3',title:'SG271+ preventative maintenance',reference:'TO-PMS 035 · PM3 · Revision 8',date:'24 August 2026',status:'Mapping pending',summary:'Nine-page specification with readings, conditional component tasks, individual craftworker attribution and supervisor review.',note:'PM3 refers to SI 361 and operation 26052-3. Technical Office must resolve the conflict with SI 432 before the regeneration task is enabled.'},
 {id:'TO01',title:'Shift diagnostic check sheets',reference:'TO 01 · Revision 3 plus July edits',date:'22 July 2026',status:'Source received',summary:'Procedure for preparing, reviewing and communicating diagnostic sheets. Actual diagnostic check sheets have not yet been supplied.',note:'Defects covered by warranty follow manufacturer warranty reporting procedures rather than this shift check sheet process.'},
 {id:'SI432',title:'Parked regeneration · SG vehicles',reference:'SI 432 · Revision 0',date:'13 March 2026',status:'Technical review required',summary:'Controlled maintenance instruction, including safe systems of work, Techtool prerequisites and toolbox-talk communication.',note:'Explicitly supersedes SI 293 and SI 361. No executable regeneration procedure is enabled in this demonstration.'}
];
export function seed(){return {schema:1,vehicles:[
 {id:'DEMO-271',garage:'demo-north',model:'SG271+ demonstration vehicle',status:'Awaiting inspection',warranty:'Unknown',history:[]},
 {id:'DEMO-302',garage:'demo-north',model:'SG271+ demonstration vehicle',status:'Held for review',warranty:'Unknown',history:[]},
 {id:'DEMO-315',garage:'demo-south',model:'SG271+ demonstration vehicle',status:'Awaiting inspection',warranty:'Unknown',history:[]}
 ],reports:[],faults:[{id:'FT-F-DEMO',garage:'demo-north',vehicle:'DEMO-302',title:'Access ramp intermittently fails to deploy',description:'Fictional example for the garage walkthrough.',status:'Open',owner:'Demo supervisor',created:'2026-10-14T09:00:00Z'}],actions:[{id:'FT-A-DEMO',garage:'demo-north',vehicle:'DEMO-302',title:'Investigate intermittent ramp fault',source:'FT-F-DEMO',owner:'Demo supervisor',status:'Open',evidence:''}],inspections:[]};}
export function scoped(records,garage){return records.filter(r=>r.garage===garage);}
export function addRecord(state,kind,values){
 if(!['reports','faults'].includes(kind))throw Error('Unknown record type');
 if(!values.title?.trim()||!values.description?.trim())throw Error('Add a title and details.');
 const vehicle=state.vehicles.find(v=>v.id===values.vehicle&&v.garage===values.garage);
 if(kind==='faults'&&!vehicle)throw Error('Choose a vehicle in this garage.');
 if(values.vehicle&&!vehicle)throw Error('Vehicle does not belong to this garage.');
 const id=`FT-${kind==='faults'?'F':'R'}-${crypto.randomUUID().slice(0,8)}`;
 const record={...values,id,title:values.title.trim(),description:values.description.trim(),status:'Open',created:new Date().toISOString()};
 state[kind].unshift(record);
 state.actions.unshift({id:`FT-A-${crypto.randomUUID().slice(0,8)}`,garage:values.garage,vehicle:values.vehicle,title:`Review: ${record.title}`,source:id,owner:'Demo supervisor',status:'Open',evidence:''});
 return record;
}
export function submitAction(state,id,evidence){const action=state.actions.find(a=>a.id===id);if(!action)throw Error('Action not found');if(!evidence.trim())throw Error('Describe the work completed.');action.evidence=evidence.trim();action.status='Awaiting review';}
