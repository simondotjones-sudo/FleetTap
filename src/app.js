import {busReleaseView,busReleaseRoute,busReleaseBusy,setupBusRelease} from './bus-release-ui.js';
import {controlsView,controlsBanner,setupControls} from './active-controls-ui.js';
import {performanceView,setupPerformance,performanceRoute,performanceBusy} from './performance-ui.js';
import {operationsView,setupOperations,operationsRoute,operationsBusy,endDay} from './garage-operations-ui.js';
import {dayShift,garageJobs} from './garage-operations.js';
import {menuView} from './navigation.js';
import {myActionCount} from './action-assignment.js';
import {roadmapView,setupRoadmap,roadmapRoute,roadmapBusy} from './roadmap-ui.js';
import {sopUploadBusy} from './sop-workspace.js';
import {reviewView,setupReviews} from './review-ui.js';
import {contentView,setupContent,contentBusy} from './content-ui.js';
import {reviewer,author,roleLabel} from './roles.js';
import {garageExport} from './manager-records.js';
import {adminToolsView,setupAdminTools,adminRoute,adminBusy} from './admin-tools.js';
import {fleetFlowView,setupFleet,fleetBusy,isFleetRoute} from './fleet-flow.js';
import {actionsView,setupActions,actionsBusy,isActionsRoute} from './actions-flow.js';
import {FLEETTAP_APP_VERSION} from './version.js';
import {sopView} from './sop-guide.js';
import {reportFlowView,setupReportFlow,reportBusy,isReportRoute} from './report-flow.js';
import {stopDictation} from './dictation.js';
import {photoGallery,previewPhotos,setupPhotoPicker} from './photos.js';
import {tabletView,setupTablet,isTabletSaving} from './tablet.js';
import {api} from './api.js';
import {adminView,manager,syncUserScope,setupAccess} from './admin-ui.js';
import {checksFlowView,setupChecks,isChecksRoute} from './checks-flow.js';
import {readings} from './inspections.js';
import {scoped} from './model.js';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let boot=await api('workspace');
let state=boot.state||{schema:1,vehicles:[],reports:[],faults:[],actions:[],inspections:[]},garages=boot.garages,me=boot.user,version=boot.version;
let assignees=boot.assignees||[];
let content=boot.content||{sops:[],checklists:[]},contentVersion=boot.contentVersion||0,organisation=boot.organisation||'';
let garage=boot.garage||'',overlay='',profile=false,mode='list',adminData=null;
async function reloadWorkspace(selected=garage){let data;try{data=await api('workspace',null,selected?'?garage='+encodeURIComponent(selected):'');}catch(e){if(e.status!==403||!selected)throw e;data=await api('workspace');}state=data.state||{schema:1,vehicles:[],reports:[],faults:[],actions:[],inspections:[]};garages=data.garages;me=data.user;version=data.version;garage=data.garage||'';content=data.content||{sops:[],checklists:[]};contentVersion=data.contentVersion||0;organisation=data.organisation||'';assignees=data.assignees||[];}
async function mutation(action,values={},extra={}){const data=await api('workspace',{action,values,...extra,garage,version});state=data.state;version=data.version;return data.result;}
async function loadAdmin(){adminData=await api('admin');if(current()==='admin')render();}
const paths={report:'M12 5v14M5 12h14',sops:'M4 4h6l2 2 2-2h6v16h-6l-2 2-2-2H4zM12 6v16',checks:'M5 3h14v18H5zM8 11l2 2 5-5',faults:'M14 6a5 5 0 0 0-6 6L3 17l4 4 5-5a5 5 0 0 0 6-6l-4 4-4-4z',actions:'M5 5h14M5 12h14M5 19h14',fleet:'M5 4h14v15H5zM5 11h14M9 4v7M15 4v7M8 19v2M16 19v2M8 15h1M15 15h1',back:'M19 12H5 M10 7l-5 5 5 5',home:'M3 10l9-7 9 7v10H3z M9 20v-7h6v7',menu:'M4 6h16 M4 12h16 M4 18h16',spark:'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z',bell:'M5 17h14l-2-3V8a5 5 0 0 0-10 0v6z M10 21h4',close:'M6 6l12 12 M18 6L6 18'};
Object.assign(paths,{
 refresh:'M20 7v5h-5M4 17v-5h5M5.5 7a7 7 0 0 1 11.6-2L20 8M4 16l2.9 3A7 7 0 0 0 18.5 17',
 settings:'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
 lock:'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4M12 14v3',
 install:'M7 3H4v18h16V3h-3M12 2v12M8 10l4 4 4-4M9 18h6',
 logout:'M9 3H4v18h5M9 12h12M16 7l5 5-5 5',
 download:'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5'
});
const icon=k=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[k]||paths.checks}"/></svg>`;
const tiles=[['Report','Incidents and|safety concerns','report'],['SOPs','Procedures and|technical instructions','sops'],['Checks','Inspections and|scheduled maintenance','checks'],['Faults','Vehicle defects and|workshop repairs','faults'],['Actions','Your tasks and|shift handover','actions'],['Fleet','Buses, service status|and history','fleet']];
const current=()=>location.hash.slice(1)||'home',rows=k=>scoped(state[k],garage),pill=(label,tone='')=>`<span class="pill ${tone}">${esc(label)}</span>`;
function notify(text){$('#message').textContent=text;$('#message').classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#message').classList.remove('show'),5000);}
function go(page){stopDictation();overlay='';profile=false;mode='list';if(page==='admin'&&manager(me))loadAdmin().catch(e=>notify(e.message));if(current()===page)render();else location.hash=page;}
function setProfile(open,restoreFocus=false){
 profile=open;
 const panel=$('#profile-panel'),trigger=$('#profile-trigger');
 if(panel)panel.hidden=!open;
 trigger?.setAttribute('aria-expanded',String(open));
 if(restoreFocus)trigger?.focus();
}
function heading(title){return `<h1 class="fleet-heading">${title}</h1>`;}
function tabs(items){return `<div class="report-switch fleet-tabs" role="group" aria-label="View">${items.map(([id,label])=>`<button data-mode="${id}" aria-pressed="${mode===id}">${label}</button>`).join('')}</div>`;}
function empty(text){return `<section class="card empty">${text}</section>`;}
function home(){return `<div class="ops-home-entry toolbar">${manager(me)?'<button data-go="garage-today">Garage Today</button>':'<button data-go="my-jobs">My Jobs</button>'}</div>`+'<h1 class="sr-only">FleetTap home</h1><section class="home-tasks" aria-label="Garage tasks">'+tiles.map(([title,description,key])=>`<button class="home-task" data-go="${key}">${icon(key)}<strong>${title}</strong><span>${description.split('|').join('<br>')}</span></button>`).join('')+'</section>';}
function recordList(kind){const list=rows(kind);return list.length?`<div class="fleet-list">${list.map(r=>`<article class="card"><div class="row"><h2>${esc(r.title)}</h2>${pill(r.status,'attention')}</div><p class="muted">${esc(r.id)} · ${esc(r.vehicle||'Garage')} · ${esc(r.type||'Vehicle defect')}</p><p class="record-note">${esc(r.description)}</p>${r.immediate?`<p class="record-note"><strong>Immediate response:</strong> ${esc(r.immediate)}</p>`:''}${photoGallery(r.photos,garage)}<button class="secondary" data-go="actions">View linked actions</button></article>`).join('')}</div>`:empty(`No ${kind} recorded in this garage.`);}
function reports(kind){return mode==='records'?heading(kind==='faults'?'Faults':'Report')+tabs([['new',kind==='faults'?'Report fault':'New report'],['records','View records']])+recordList(kind):reportFlowView(tabletContext());}
function sops(){return sopView(tabletContext());}
function actions(){return actionsView(tabletContext());}
function fleet(){return fleetFlowView({...tabletContext(),openingCheck:isTabletSaving()});}
function checks(){return checksFlowView(tabletContext());}
function tabletContext(){return {state,garage,me,content,contentVersion,organisation,assignees,garages,page:current(),openingCheck:isTabletSaving()};}
function render(){
 stopDictation();
 const page=current(),isTablet=isChecksRoute(page)||(['fleet','checks'].includes(page)&&mode==='list')||/^(vehicle|start|inspection)(\/|$)/.test(page)||(isReportRoute(page)&&mode!=='records')||page==='sops'||page.startsWith('sops/')||isActionsRoute(page)||isFleetRoute(page);
 document.body.classList.toggle('sop-work-mode',page.startsWith('content/')||page.startsWith('org-sop/'));document.body.classList.toggle('tablet-shell',isTablet);document.body.classList.toggle('manager-mode',page==='manage'||page.startsWith('submitted-reports'));document.body.classList.toggle('checks-mode',isChecksRoute(page));document.body.classList.toggle('fleet-mode',isFleetRoute(page));document.body.classList.toggle('schedule-mode',page==='schedules'||page.startsWith('schedules/'));document.body.classList.toggle('actions-mode',isActionsRoute(page));document.body.classList.toggle('sop-mode',page==='sops'||page.startsWith('sops/'));document.body.classList.toggle('report-mode',isReportRoute(page)&&mode!=='records');document.body.classList.toggle('inspection-mode',page.startsWith('inspection/'));
 const count=myActionCount(state,garage,me);
 $('#account').innerHTML=`<button class="topbar-bell" data-go="actions" aria-label="My Actions, ${count} outstanding">${icon('bell')}${count?`<span class="action-count">${count}</span>`:''}</button><button class="avatar" id="profile-trigger" aria-label="Profile and garage" aria-controls="profile-panel" aria-expanded="${profile}">${esc(me.name.split(' ').map(n=>n[0]).slice(0,2).join(''))}</button><div id="profile-panel" class="profile-panel" ${profile?'':'hidden'}><h2>${esc(me.name)}</h2><p class="help">${esc(me.email||me.employee_id||'')} · ${esc(roleLabel(me.role,me.role_names))}</p><label>Garage<select id="garage-select">${garages.map(g=>`<option value="${g.id}" ${garage===g.id?'selected':''}>${esc(g.organisation_name+' · '+g.name)}</option>`).join('')}</select></label>${manager(me)?`<button class="secondary" data-go="manage">${icon('settings')}Manage FleetTap</button>`:''}<button class="secondary" type="button" data-pwa-install>${icon('install')}Install FleetTap</button><button class="secondary" id="logout">${icon('logout')}Sign out</button><span class="profile-version">FleetTap Version ${esc(FLEETTAP_APP_VERSION)}</span></div>`;
 const views={password:()=>`<form id="password-form" class="card login"><h1>Change password</h1><label>Current password<input type="password" name="current_password" autocomplete="current-password" required maxlength="128"></label><label>New password<input type="password" name="password" autocomplete="new-password" required minlength="12" maxlength="128"></label><label>Confirm new password<input type="password" name="confirm" autocomplete="new-password" required minlength="12" maxlength="128"></label><button>Save and sign out</button></form>`,admin:()=>adminView(me,adminData),home,report:()=>reports('reports'),faults:()=>reports('faults'),fleet,sops,checks,actions};
 const parts=page.split('/');
 $('#workspace').innerHTML=controlsBanner(tabletContext())+(busReleaseRoute(page)?busReleaseView(tabletContext()):parts[0]==='required-instructions'?controlsView(tabletContext()):performanceRoute(page)?performanceView(tabletContext()):operationsRoute(page)?operationsView(tabletContext()):roadmapRoute(page)?roadmapView(tabletContext()):['content','org-sop','checklists'].includes(parts[0])?contentView(tabletContext()):parts[0]==='reviews'?reviewView(tabletContext()):adminRoute(page)?adminToolsView(tabletContext()):isFleetRoute(page)?fleet():isChecksRoute(page)?checks():isActionsRoute(page)?actions():parts[0]==='sops'?sops():parts[0]==='start'?tabletView(tabletContext()):parts[0]==='inspection'?tabletView(tabletContext()):parts[0]==='defect'?reports('faults'):(views[page]||home)());

 if(page==='admin')syncUserScope(adminData,me);
 const selected=overlay|| (page==='home'?'home':'menu');
 $('#navigation-root').innerHTML=`<nav class="mobile-navigation" aria-label="Quick navigation"><span class="nav-highlight" style="transform:translateX(${['back','home','menu','ask'].indexOf(selected)*100}%)"></span>${[['back','Back'],['home','Home'],['menu','Menu'],['ask','Ask']].map(([id,label])=>`<button data-nav="${id}" class="${selected===id?'selected':''}" aria-label="${id==='ask'?'Ask FleetTap':label}" ${id==='back'&&page==='home'&&!overlay?'disabled':''}>${icon(id==='ask'?'spark':id)}<span>${label}</span></button>`).join('')}</nav>`;
 $('#overlay-root').innerHTML=overlay?`<div class="navigation-shade" data-dismiss></div>${overlay==='menu'?`<aside class="navigation-drawer"><div class="row"><h2>Menu</h2><button class="icon-button" data-dismiss aria-label="Close menu">${icon('close')}</button></div><nav aria-label="Main menu">${menuView(me,page)}</nav></aside>`:`<section class="ask-panel" aria-label="Ask FleetTap"><div class="row"><h2>${icon('spark')} Ask FleetTap</h2><button class="icon-button" data-dismiss aria-label="Close Ask FleetTap">${icon('close')}</button></div><p>You have <strong>${count} outstanding actions</strong>. There are <strong>${rows('faults').length} recorded defects</strong> in this garage.</p><div class="ask-suggestions"><button data-go="actions">My Actions</button><button data-go="sops">Find instructions</button></div><p class="help">Live record summary. AI questions and approved-document search are planned.</p></section>`}`:'';
}
// The floating Back button follows the current workflow's own back control.
function navigateBack(){
 if(overlay){overlay='';render();return;}
 if(mode!=='list'){mode='list';render();return;}
 const local=$('#workspace [data-work-back],#workspace [data-instruction-done],#workspace [data-report-back],#workspace [data-action-back],#workspace [data-fleet-back]');
 if(local){local.click();return;}
 const parent=[...document.querySelectorAll('#workspace .tap-footer [data-go],#workspace .toolbar [data-go]')].find(b=>/^(←|Back|Change bus|Choose a bus)/.test(b.textContent.trim()));
 if(parent){go(parent.dataset.go);return;}
 if(current().startsWith('roadmap/')){go('roadmap');return;}
 if(current().startsWith('inspection/')){const i=state.inspections.find(i=>i.id===current().split('/')[1]&&i.garage===garage);go(i?'checks/'+encodeURIComponent(i.vehicle):'checks');return;}
 go('home');
}
document.addEventListener('click',e=>{if(profile&&!e.target.closest('.profile-panel,#profile-trigger'))setProfile(false);const el=e.target.closest('button,[data-dismiss]');if(!el||isTabletSaving()||reportBusy()||actionsBusy()||fleetBusy()||adminBusy()||contentBusy()||sopUploadBusy())return;if(busReleaseBusy()||roadmapBusy()||operationsBusy()||performanceBusy())return;if(el.dataset.go){go(el.dataset.go);return;}if(el.dataset.vehicle){go('vehicle/'+el.dataset.vehicle);return;}if(el.dataset.mode){mode=el.dataset.mode;render();return;}if(el.id==='profile-trigger'){if(overlay){overlay='';render();}setProfile(!profile);return;}if(el.hasAttribute('data-dismiss')){overlay='';render();return;}if(el.dataset.nav){const n=el.dataset.nav;if(n==='home')go('home');else if(n==='back'){navigateBack();}else{overlay=overlay===n?'':n;profile=false;render();}return;}});
document.addEventListener('change',async e=>{if(e.target.name==='photos')previewPhotos(e.target);if(e.target.id==='garage-select'){if(busReleaseBusy()||performanceBusy()||operationsBusy()||reportBusy()||actionsBusy()||fleetBusy()||adminBusy()||contentBusy()||sopUploadBusy()){e.target.value=garage;return;}try{await reloadWorkspace(e.target.value);go('home');}catch(err){notify(err.message);}}if(['user-role','user-org'].includes(e.target.id))syncUserScope(adminData,me);});
document.addEventListener('input',e=>{if(e.target.id==='fleet-search'){document.querySelectorAll('[data-search]').forEach(el=>el.hidden=!el.dataset.search.includes(e.target.value.toLowerCase()));const hint=$('#search-empty');if(hint)hint.hidden=!!document.querySelector('[data-search]:not([hidden])');}});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(profile){setProfile(false,true);return;}if(overlay){overlay='';render();}});
document.addEventListener('submit',async e=>{
 const form=e.target;if(form.dataset.releaseForm||form.dataset.timelineFilter||form.hasAttribute('data-control-ack')||form.dataset.performanceForm||form.dataset.operationForm||form.id==='auth-form'||form.dataset.roadmapForm||form.dataset.adminForm||form.dataset.accessForm||form.dataset.contentForm||form.hasAttribute('data-sop-upload')||form.hasAttribute('data-review-form')||form.hasAttribute('data-action-assign'))return;e.preventDefault();const values=Object.fromEntries(new FormData(form)),button=form.querySelector('button');if(button)button.disabled=true;
 try{
  if(form.id==='password-form'){if(values.password!==values.confirm)throw Error('Passwords do not match.');await api('auth',{action:'change_password',...values});location.hash='login';location.reload();return;}
  if(['user-form','organisation-form','garage-form'].includes(form.id)){
   const action={'user-form':'create_user','organisation-form':'organisation','garage-form':'garage'}[form.id];const result=await api('admin',{action,...values});await reloadWorkspace();adminData=await api('admin');render();if(result.link)showLink(result.link);notify('Saved.');return;
  }
  if(form.id==='start-inspection'){const i=await mutation('start',values);go('inspection/'+i.id);return;}
  if(form.dataset.pm3Item){await mutation('answer',{result:values.result,notes:values.notes,readings:(readings[form.dataset.pm3Item]||[]).map((_,n)=>values['reading-'+n])},{id:form.dataset.inspection,item:form.dataset.pm3Item});let stamp=form.querySelector('.saved-stamp');if(!stamp){stamp=document.createElement('p');stamp.className='saved-stamp';form.append(stamp);}stamp.textContent='Saved to FleetTap · '+me.name;notify('Item saved to FleetTap.');return;}
  if(form.id==='submit-pm3')await mutation('submit',values,{id:form.dataset.inspection});

  else return;
  render();notify('Saved to FleetTap.');
 }catch(error){notify(error.message);if(error.status===409){try{await reloadWorkspace();notify('Latest records loaded. Your entry is still here. Review it and save again.');}catch{notify(error.message+' Your entry is still here. Check your connection and try again.');}}}
 finally{if(button)button.disabled=false;}
});
function showLink(link){const box=$('#activation-result');if(box){box.hidden=false;$('#activation-link').value=link;box.scrollIntoView({block:'center',behavior:'smooth'});}}
document.addEventListener('click',async e=>{const el=e.target.closest('button');if(!el||busReleaseBusy()||performanceBusy()||operationsBusy()||reportBusy()||actionsBusy()||fleetBusy()||adminBusy()||contentBusy()||sopUploadBusy())return;try{
 if(el.id==='logout'){if(dayShift(state,garage,me.id)||garageJobs(state,garage).some(j=>j.assigneeId===me.id&&j.status==='In progress')){setProfile(false);endDay();return;}await api('auth',{action:'logout'});location.hash='login';location.reload();}
 if(el.id==='export'){if(!manager(me))return;el.disabled=true;const selectedGarage=garage,latest=await api('workspace',null,'?garage='+encodeURIComponent(selectedGarage));const data=garageExport({state:latest.state,garage:latest.garage,me:latest.user}),blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='fleettap-'+selectedGarage.replace(/[^a-z0-9-]/gi,'-')+'-'+data.exportedAt.slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Depot records exported.');}
 if(el.id==='copy-link'){await navigator.clipboard.writeText($('#activation-link').value);notify('Link copied.');}
 if(el.dataset.resetUser||el.dataset.activeUser){el.disabled=true;const result=await api('admin',el.dataset.resetUser?{action:'reset_user',user_id:el.dataset.resetUser}:{action:'set_active',user_id:el.dataset.activeUser,active:el.dataset.active==='true'});adminData=await api('admin');render();if(result.link)showLink(result.link);notify('Account updated.');}
 }catch(error){notify(error.message);}finally{el.disabled=false;}});
window.addEventListener('hashchange',()=>{mode='list';profile=false;overlay='';render();window.scrollTo(0,0);if(current()==='admin'&&manager(me)&&!adminData)loadAdmin().catch(e=>notify(e.message));});
setupBusRelease({context:tabletContext,render,go,notify,mutation,reload:reloadWorkspace});
setupControls({context:tabletContext,render,go,notify,mutation,reload:reloadWorkspace});
setupPerformance({context:tabletContext,render,go,notify,mutation,reload:reloadWorkspace});
setupOperations({context:tabletContext,render,go,notify,mutation,reload:reloadWorkspace});
setupRoadmap({context:tabletContext,render,go,notify});
setupAccess({refresh:async()=>{await reloadWorkspace();adminData=await api('admin');render();},notify});
setupReviews({context:tabletContext,render,go,mutation,reload:reloadWorkspace,notify});
setupContent({context:tabletContext,render,go,mutation,reload:reloadWorkspace,notify});
setupPhotoPicker();
setupChecks({context:tabletContext,render,go});
setupAdminTools({context:tabletContext,render,go,mutation,reload:reloadWorkspace,notify,version:()=>version});
setupFleet({context:tabletContext,render,go,mutation,reload:reloadWorkspace,notify});
setupActions({context:tabletContext,render,go,mutation,reload:reloadWorkspace,notify});
setupReportFlow({context:tabletContext,render,go,mutation,reload:reloadWorkspace,notify,records:kind=>{mode='records';render();}});
setupTablet({context:tabletContext,render,go,mutation,reload:reloadWorkspace,notify});
if(current()==='admin'&&manager(me))await loadAdmin();render();
