import {manager} from './roles.js';
import {esc} from './api.js';

// Keep a deep-link fallback for the floating Back control without adding a page button.
export const backRoute=page=>`<template data-back-route="${esc(page)}"></template>`;
export function preparePageNavigation(workspace){
 delete workspace.dataset.backRoute;
 for(const marker of workspace.querySelectorAll('template[data-back-route]')){
  workspace.dataset.backRoute ||= marker.dataset.backRoute;
  const parent=marker.parentElement;marker.remove();
  if(parent.matches('.tap-footer,.toolbar')&&!parent.children.length&&!parent.textContent.trim())parent.remove();
 }
}

export function menuSections(user){
 const sections=[];
 if(manager(user))sections.push({title:'My Garage',items:[['garage-today','Garage Today'],['performance','Performance'],['manage','Manage FleetTap'],['fleet','Fleet']]});
 sections.push({title:'My Work',items:[['my-jobs','My day'],['required-instructions','Required instructions'],['actions','My Actions'],...(user?.role==='supervisor'?[['reviews','Review & sign off']]:[])]});
 sections.push({title:'My Records',items:[['my-jobs/records','Job records'],['my-checks','Inspection records']]});
 if(user?.role==='platform_admin')sections.push({title:'Platform Admin',items:[['roadmap','Roadmap']]});
 return sections;
}
export function menuView(user,page){
 const current=page.split('/')[0];
 const managed=['manage','garage-actions','admin','schedules','submitted-reports','inspection-records','inspection-admin','template-admin','bus-edit','content','org-sop',...(manager(user)?['reviews']:[])];
 return menuSections(user).map(({title,items},i)=>`<section class="menu-section" aria-labelledby="menu-section-${i}"><h3 id="menu-section-${i}">${esc(title)}</h3><div class="menu-section-links">${items.map(([route,label])=>`<button type="button" data-go="${route}"${(route==='manage'?managed.includes(current):route==='my-jobs/records'?page==='my-jobs/records':route==='my-jobs'?current==='my-jobs'&&page!=='my-jobs/records':route===current)?' aria-current="page"':''}>${esc(label)}</button>`).join('')}</div></section>`).join('');
}
