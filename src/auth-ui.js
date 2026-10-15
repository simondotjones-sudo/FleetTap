import {api,esc} from './api.js';
let token=location.hash.startsWith('#activate/')?location.hash.slice(10):null,register=false;
if(token)history.replaceState(null,'',location.pathname);
function screen(message=''){
 document.querySelector('#account').innerHTML='';document.querySelector('#navigation-root').innerHTML='';document.querySelector('#overlay-root').innerHTML='';
 document.querySelector('#workspace').innerHTML=`<section class="card login"><h1>${token?'Set your password':register?'Join your garage':'Welcome to FleetTap'}</h1><p>${token?'Activate your account or reset your password.':register?'Use the registration code from your garage manager.':'Sign in with your email or employee ID.'}</p><form id="auth-form">${token?'':register?'<label>Garage registration code<input name="code" required maxlength="24" autocomplete="off"></label><label>Your name<input name="name" required maxlength="120" autocomplete="name"></label><label>Employee ID<input name="employee_id" maxlength="40" autocomplete="username"></label><label>Email (optional if using employee ID)<input type="email" name="email" maxlength="254" autocomplete="email"></label>':'<label>Email or employee ID<input name="identifier" autocomplete="username" required maxlength="254"></label><label>Organisation code (for employee ID login)<input name="organisation_code" maxlength="12" autocomplete="organization" placeholder="Given when you register"></label>'}<label>${token?'New password':'Password'}<input type="password" name="password" autocomplete="${token||register?'new-password':'current-password'}" ${token||register?'minlength="12"':''} maxlength="128" required></label>${token||register?'<label>Confirm password<input type="password" name="confirm" autocomplete="new-password" minlength="12" maxlength="128" required></label><p class="help">Use at least 12 characters.</p>':''}<button>${token?'Save password':register?'Create staff account':'Sign in'}</button><p id="auth-error" role="status">${esc(message)}</p></form>${token?'':`<button class="secondary" type="button" id="auth-toggle">${register?'Back to sign in':'Register with a garage code'}</button>${register?'':'<details><summary>Forgot your password?</summary><p class="help">Ask your FleetTap administrator for a single-use reset link.</p></details><button class="secondary" type="button" data-pwa-install>Install FleetTap</button>'}`}</section>`;
 document.querySelector('#auth-toggle')?.addEventListener('click',()=>{register=!register;screen();});
 document.querySelector('#auth-form').addEventListener('submit',async e=>{
  e.preventDefault();e.stopImmediatePropagation();const form=e.target,v=Object.fromEntries(new FormData(form)),btn=form.querySelector('button');btn.disabled=true;
  try{
   if(token||register){if(v.password!==v.confirm)throw Error('Passwords do not match.');}
   if(token){await api('auth',{action:'activate',token,password:v.password});token=null;screen('Password saved. Sign in below.');}
   else if(register){const r=await api('auth',{action:'register',...v});register=false;screen('Account created. Your organisation code is '+r.organisation_code+'. Keep it for employee ID login.');document.querySelector('[name=organisation_code]').value=r.organisation_code;document.querySelector('[name=identifier]').value=v.email||v.employee_id;}
   else{await api('auth',{action:'login',...v});location.hash='home';location.reload();}
  }catch(err){document.querySelector('#auth-error').textContent=err.message;btn.disabled=false;}
 });
}
window.addEventListener('session-expired',()=>{location.hash='login';location.reload();});
if(token)screen();else{try{await api('auth');await import('./app.js');}catch(e){screen(e.status===401?'':e.message);}}
