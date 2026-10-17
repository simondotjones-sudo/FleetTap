import {esc} from './api.js';
export const docketFaultTypes=['Brakes','Tyres & wheels','Engine','Lights & electrics','Doors & ramp','Other'];
export const docketFields={reference:100,reportedDate:100,driver:160,route:100};
export function cleanDocketFields(value){
 const result={};for(const [key,max] of Object.entries(docketFields)){
  if(typeof value?.[key]!=='string'||value[key].length>max)throw Error('Check the docket details.');
  result[key]=value[key].trim();
 }return result;
}
const identifier=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function matchDocketBus(extracted,vehicles,garage){
 if(extracted.vehicleUnclear)return {vehicle:'',warning:'Check the handwritten bus number and choose the bus.'};
 const fleet=identifier(extracted.fleetNumber),registration=identifier(extracted.registration),rows=vehicles.filter(v=>v.garage===garage);
 const matches=rows.filter(v=>(fleet&&[v.id,v.fleetNumber].some(id=>identifier(id)===fleet))||(registration&&identifier(v.registration)===registration));
 if(matches.length===1){const v=matches[0];
  if((fleet&&![v.id,v.fleetNumber].some(id=>identifier(id)===fleet))||(registration&&identifier(v.registration)!==registration))return {vehicle:'',warning:'The fleet number and registration do not match one bus. Choose the correct bus.'};
  return {vehicle:v.id,warning:''};
 }
 return {vehicle:'',warning:matches.length?'More than one bus matches. Choose the correct bus.':'Choose the bus from this garage.'};
}
export function docketSourceView(docket){
 if(!docket)return '';
 const labels={reference:'Docket',reportedDate:'Reported',driver:'Driver',route:'Route'};
 return `<details class="docket-source"><summary>Driver docket</summary>${Object.entries(labels).filter(([key])=>docket[key]).map(([key,label])=>`<p><strong>${label}:</strong> ${esc(docket[key])}</p>`).join('')}<p class="help">Photo details reviewed by ${esc(docket.reviewedByName||'garage staff')} before saving.</p></details>`;
}
