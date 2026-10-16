import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {FLEETTAP_APP_BUILD} from '../src/version.js';

execFileSync(process.execPath,['scripts/build.mjs']);
const worker = await readFile('dist/sw.js','utf8');
const pwaSource = await readFile('src/pwa.js','utf8');

function workerHarness() {
  const listeners = {}, stored = new Map(), deleted = [], requests = [];
  let offline = false;
  const cache = {
    addAll: async paths => { for (const path of paths) stored.set(path,new Response(path)); },
    match: async key => stored.get(typeof key === 'string' ? key : new URL(key.url).pathname)?.clone()
  };
  const context = {
    self:{location:{origin:'https://fleet-tap.com'},addEventListener:(name,fn)=>{listeners[name]=fn;}},
    caches:{open:async()=>cache,keys:async()=>['unrelated-cache','fleettap-offline-previous',`fleettap-offline-${FLEETTAP_APP_BUILD}`],delete:async name=>deleted.push(name)},
    fetch:async request=>{requests.push(request);if(offline)throw Error('offline');return new Response('network');},
    URL,Response,Set,Promise
  };
  vm.runInNewContext(worker,context);
  return {listeners,stored,deleted,requests,setOffline:()=>{offline=true;},dispatch(request){let response;listeners.fetch({request,respondWith:p=>{response=p;}});return response;}};
}

test('build produces origin-relative manifest, install icons and complete offline dependencies',async()=>{
  const manifest=JSON.parse(await readFile('dist/manifest.webmanifest','utf8'));
  assert.equal(manifest.id,'/');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.display,'standalone');
  for(const icon of [...manifest.icons,{src:'/assets/icons/apple-touch-icon.png',sizes:'180x180'}]){
    const png=await readFile('dist'+icon.src),size=Number(icon.sizes.split('x')[0]);
    assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
  }
  assert.ok(manifest.icons.some(icon=>icon.purpose==='maskable'));
  const harness=workerHarness();let task;harness.listeners.install({waitUntil:p=>{task=p;}});await task;
  for(const path of harness.stored.keys())await access('dist'+path.split('?')[0]);
  const html=await readFile('dist/offline.html','utf8');
  for(const match of html.matchAll(/(?:src|href)="(\/[^"?]+(?:\?[^"\s]+)?)"/g))assert.ok(harness.stored.has(match[1]),`Offline dependency not cached: ${match[1]}`);
  assert.doesNotMatch(worker,/__BUILD__|__OFFLINE_ASSETS__/);
});

test('service worker never handles authenticated API calls, uploads, mutations or third-party requests',()=>{
  const h=workerHarness();
  for(const request of [
    {url:'https://fleet-tap.com/.netlify/functions/workspace?garage=secret',method:'GET',mode:'cors'},
    {url:'https://fleet-tap.com/.netlify/functions/photos?id=private',method:'GET',mode:'navigate'},
    {url:'https://fleet-tap.com/.netlify/functions/auth',method:'POST',mode:'cors'},
    {url:'https://fleet-tap.com/api/private',method:'GET',mode:'navigate'},
    {url:'https://other.example/',method:'GET',mode:'navigate'},
    {url:'https://fleet-tap.com/version.json',method:'GET',mode:'cors'}
  ])assert.equal(h.dispatch(request),undefined);
  assert.equal(h.requests.length,0);assert.equal(h.stored.size,0);
});

test('online navigation stays fresh; failed navigation shows only the public offline page',async()=>{
  const h=workerHarness();let task;h.listeners.install({waitUntil:p=>{task=p;}});await task;
  const request={url:'https://fleet-tap.com/?private=not-cached',method:'GET',mode:'navigate'};
  assert.equal(await (await h.dispatch(request)).text(),'network');
  h.setOffline();assert.equal(await (await h.dispatch(request)).text(),'/offline.html');
  assert.ok(![...h.stored.keys()].some(key=>key.includes('private')));
  h.listeners.activate({waitUntil:p=>{task=p;}});await task;
  assert.deepEqual(h.deleted,['fleettap-offline-previous']);
  // No forced activation/claim or reload APIs are provided: invoking any would fail this test.
});

function installHarness({ios=false,standalone=false,route='',dismissed=false}={}){
  const events={},docEvents={},classes=new Map(),storage=new Map(),timers=[];
  if(dismissed)storage.set('fleettap-install-dismissed-at',String(Date.now()));
  const panelStatus={textContent:''},root={innerHTML:'',replaceChildren(){this.innerHTML='';},querySelector:()=>({focus(){},...panelStatus})};
  const connection={hidden:true,textContent:''};
  const display={matches:standalone,addEventListener(){}};
  const window={matchMedia:()=>display,isSecureContext:true,addEventListener:(name,fn)=>{events[name]=fn;}};
  const navigator={userAgent:ios?'iPhone':'Chrome',platform:'',maxTouchPoints:0,onLine:true,serviceWorker:{register:async()=>({update:async()=>{}})}};
  const document={querySelector:selector=>selector==='#pwa-root'?root:connection,body:{classList:{toggle:(key,value)=>classes.set(key,value)}},activeElement:null,addEventListener:(name,fn)=>{docEvents[name]=fn;}};
  const location={hash:route};
  vm.runInNewContext(pwaSource,{window,navigator,document,location,localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},setTimeout:fn=>timers.push(fn),Date});
  return {events,docEvents,root,classes,storage,navigator,connection,location,timers,click:async attr=>docEvents.click({target:{closest:()=>({hasAttribute:key=>key===attr,isConnected:true,focus(){}})}})};
}

test('native install event is prompted only by a tap, dismissed once and reusable through Profile',async()=>{
  const h=installHarness();let prompted=0,prevented=0;
  h.events.beforeinstallprompt({preventDefault:()=>{prevented++;},prompt:async()=>{prompted++;},userChoice:Promise.resolve({outcome:'dismissed'})});
  assert.equal(prevented,1);assert.equal(prompted,0);assert.match(h.root.innerHTML,/Install app/);
  await h.click('data-pwa-confirm');assert.equal(prompted,1);assert.equal(h.root.innerHTML,'');assert.ok(h.storage.has('fleettap-install-dismissed-at'));
  await h.click('data-pwa-confirm');assert.equal(prompted,1);
  await h.click('data-pwa-install');assert.match(h.root.innerHTML,/browser menu/);
});

test('iOS guidance and reminders stay away from active checks and installed apps',async()=>{
  const ios=installHarness({ios:true});ios.timers[0]();assert.match(ios.root.innerHTML,/Share, then Add to Home Screen/);
  const checking=installHarness({ios:true,route:'#inspection/123'});checking.timers[0]();assert.equal(checking.root.innerHTML,'');
  const dismissed=installHarness({ios:true,dismissed:true});dismissed.timers[0]();assert.equal(dismissed.root.innerHTML,'');await dismissed.click('data-pwa-install');assert.match(dismissed.root.innerHTML,/Install FleetTap/);
  const installed=installHarness({ios:true,standalone:true});installed.timers[0]();assert.equal(installed.root.innerHTML,'');assert.equal(installed.classes.get('pwa-installed'),true);
  ios.events.appinstalled();assert.equal(ios.root.innerHTML,'');assert.equal(ios.classes.get('pwa-installed'),true);
});

test('loss and recovery of connectivity update the warning without reloading an open screen',()=>{
  const h=installHarness();h.navigator.onLine=false;h.events.offline();assert.equal(h.connection.hidden,false);assert.match(h.connection.textContent,/not saved to the garage/);
  h.navigator.onLine=true;h.events.online();assert.equal(h.connection.hidden,true);
});
