import {manager} from './roles.js';
import {esc} from './api.js';

const menuPaths={
 'garage-today':'M3 21V7l9-4 9 4v14M7 21V10h10v11M7 14h10M7 18h10',
 performance:'M4 3v17h17M8 15l4-5 4 2 5-7',
 manage:'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
 fleet:'M5 4h14v15H5zM5 11h14M9 4v7M15 4v7M8 19v2M16 19v2M8 15h1M15 15h1',
 'my-jobs':'M4 5h16v16H4zM4 10h16M8 2v6M16 2v6M8 15l2 2 5-4',
 'required-instructions':'M4 4h6l2 2 2-2h6v16h-6l-2 2-2-2H4zM12 6v16',
 actions:'M9 5h11M9 12h11M9 19h11M3 5l1 1 2-2M3 12l1 1 2-2M3 19l1 1 2-2',
 reviews:'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM7 12l3 3 6-6',
 'my-jobs/records':'M3 7h6l2 2h10v11H3zM3 7V4h6l2 3h10v2M7 13h10M7 16h7',
 'my-checks':'M9 4H5v17h14V4h-4M9 2h6v5H9zM8 12l2 2 5-4M8 18h8',
 roadmap:'M6 21V3M6 5h12l-3 3 3 3H6M6 15h8l-3 3 3 3H6'
};
const menuIcon=route=>`<svg class="menu-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${menuPaths[route]}"/></svg>`;

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
 const managed=['manage','admin','submitted-reports','inspection-records','inspection-admin','template-admin','content','org-sop'];
 return menuSections(user).map(({title,items},i)=>`<section class="menu-section" aria-labelledby="menu-section-${i}"><h3 id="menu-section-${i}">${esc(title)}</h3><div class="menu-section-links">${items.map(([route,label])=>`<button type="button" data-go="${route}"${(route==='manage'?managed.includes(current):route==='garage-today'?['garage-today','garage-actions',...(manager(user)?['reviews']:[])].includes(current):route==='fleet'?['fleet','schedules','bus-edit'].includes(current):route==='my-jobs/records'?page==='my-jobs/records':route==='my-jobs'?current==='my-jobs'&&page!=='my-jobs/records':route===current)?' aria-current="page"':''}>${menuIcon(route)}<span>${esc(label)}</span></button>`).join('')}</div></section>`).join('');
}
