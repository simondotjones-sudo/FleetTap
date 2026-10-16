import {mkdir,cp,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import {FLEETTAP_APP_MAJOR,FLEETTAP_APP_RELEASE_DATE,FLEETTAP_APP_BUILD,FLEETTAP_APP_VERSION} from '../src/version.js';
if(!Number.isSafeInteger(FLEETTAP_APP_MAJOR)||FLEETTAP_APP_MAJOR<1||!Number.isSafeInteger(FLEETTAP_APP_BUILD)||FLEETTAP_APP_BUILD<1||!/^\d{2}\.\d{2}\.\d{2}$/.test(FLEETTAP_APP_RELEASE_DATE))throw Error('Invalid FleetTap release metadata.');
await rm('dist',{recursive:true,force:true});
await mkdir('dist');
for(const path of ['index.html','offline.html','manifest.webmanifest','workspace.css','fleet.css','admin-tools.css','tablet.css','pwa.css','operations.css','performance.css','assets','src','_headers']) await cp(path,`dist/${path}`,{recursive:true});
// Stamp both entry assets and imported modules so each release has fresh URLs.
for(const page of ['index.html','offline.html']){
 const html=await readFile(`dist/${page}`,'utf8');
 await writeFile(`dist/${page}`,html.replace(/((?:src|href)="\/[^"?]+\.(?:js|css))"/g,`$1?v=${FLEETTAP_APP_BUILD}"`));
}
for(const file of await readdir('dist/src',{recursive:true})){
 if(!file.endsWith('.js'))continue;
 const path=`dist/src/${file}`,source=await readFile(path,'utf8');
 await writeFile(path,source.replace(/(['"])(\.\.?\/[^'"?]+\.js)\1/g,`$1$2?v=${FLEETTAP_APP_BUILD}$1`));
}
await writeFile('dist/version.json',JSON.stringify({version:FLEETTAP_APP_VERSION,build:FLEETTAP_APP_BUILD,releaseDate:FLEETTAP_APP_RELEASE_DATE})+'\n');
const offlineAssets=['/offline.html',`/pwa.css?v=${FLEETTAP_APP_BUILD}`,`/src/offline.js?v=${FLEETTAP_APP_BUILD}`,'/assets/icons/icon-192.png','/assets/mark.svg','/assets/fonts/Gellix-Regular.woff2','/assets/fonts/Gellix-Bold.woff2'];
const worker=await readFile('sw.js','utf8');
await writeFile('dist/sw.js',worker.replace('__BUILD__',String(FLEETTAP_APP_BUILD)).replace('__OFFLINE_ASSETS__',JSON.stringify(offlineAssets)));
console.log(`FleetTap ${FLEETTAP_APP_VERSION} built. Netlify Database migrations apply during deployment; production provider cutover is explicit.`);
