import {manager} from './admin-ui.js';
export function fleetNav(c,selected){
 const items=manager(c.me)?[['fleet','Overview'],['fleet/list','Buses'],['fleet/models','Models'],['schedules','Schedules'],['fleet/new','Add bus']]:[['fleet','Overview'],['fleet/list','Buses']];
 return `<div class="report-switch fleet-flow-tabs" role="group" aria-label="Fleet view">${items.map(([p,t])=>`<button type="button" data-go="${p}" aria-pressed="${selected===p}">${t}</button>`).join('')}</div>`;
}
