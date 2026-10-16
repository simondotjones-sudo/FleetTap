import {manager} from './roles.js';
import {esc} from './api.js';

export function menuSections(user){
 const sections=[];
 if(manager(user))sections.push({title:'My Garage',items:[['garage-today','Garage Today'],['performance','Management visibility'],['manage','Manage FleetTap'],['fleet','Fleet']]});
 sections.push({title:'My Work',items:[['my-jobs','My Jobs'],['required-instructions','Required instructions'],['my-checks','My Checks'],['actions','My Actions'],...(user?.role==='supervisor'?[['reviews','Review & sign off']]:[])]});
 if(user?.role==='platform_admin')sections.push({title:'Platform Admin',items:[['roadmap','Roadmap']]});
 return sections;
}
export function menuView(user,page){
 const current=page.split('/')[0];
 const managed=['manage','garage-actions','admin','schedules','submitted-reports','inspection-records','inspection-admin','template-admin','bus-edit','content','org-sop',...(manager(user)?['reviews']:[])];
 return menuSections(user).map(({title,items},i)=>`<section class="menu-section" aria-labelledby="menu-section-${i}"><h3 id="menu-section-${i}">${esc(title)}</h3><div class="menu-section-links">${items.map(([route,label])=>`<button type="button" data-go="${route}"${(route==='manage'?managed.includes(current):route===current)?' aria-current="page"':''}>${esc(label)}</button>`).join('')}</div></section>`).join('');
}
