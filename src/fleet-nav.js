import {manager} from './admin-ui.js';
export function fleetNav(c,selected){
 const canManage=manager(c.me),items=canManage?[['fleet','Overview'],['fleet/list','Buses'],['fleet/models','Models'],['schedules','Schedules']]:[['fleet','Overview'],['fleet/list','Buses']];
 return `<div class="fleet-navigation"><div class="report-switch fleet-flow-tabs" role="group" aria-label="Fleet view">${items.map(([p,t])=>`<button type="button" data-go="${p}" aria-pressed="${selected===p}">${t}</button>`).join('')}</div>${canManage?'<button type="button" class="fleet-add-bus" data-go="fleet/new"><span aria-hidden="true">+</span> Add bus</button>':''}</div>`;
}
