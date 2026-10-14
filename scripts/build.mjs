import {mkdir,cp,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import {FLEETTAP_APP_MAJOR,FLEETTAP_APP_RELEASE_DATE,FLEETTAP_APP_BUILD,FLEETTAP_APP_VERSION} from '../src/version.js';
if(!Number.isSafeInteger(FLEETTAP_APP_MAJOR)||FLEETTAP_APP_MAJOR<1||!Number.isSafeInteger(FLEETTAP_APP_BUILD)||FLEETTAP_APP_BUILD<1||!/^\d{2}\.\d{2}\.\d{2}$/.test(FLEETTAP_APP_RELEASE_DATE))throw Error('Invalid FleetTap release metadata.');
await rm('dist',{recursive:true,force:true});
await mkdir('dist');
for(const path of ['index.html','workspace.css','fleet.css','tablet.css','assets','src','_headers']) await cp(path,`dist/${path}`,{recursive:true});
// Stamp both entry assets and imported modules so each release has fresh URLs.
const html=await readFile('dist/index.html','utf8');
await writeFile('dist/index.html',html.replace(/((?:src|href)="\/[^"?]+\.(?:js|css))"/g,`$1?v=${FLEETTAP_APP_BUILD}"`));
for(const file of await readdir('dist/src',{recursive:true})){
 if(!file.endsWith('.js'))continue;
 const path=`dist/src/${file}`,source=await readFile(path,'utf8');
 await writeFile(path,source.replace(/(['"])(\.\.?\/[^'"?]+\.js)\1/g,`$1$2?v=${FLEETTAP_APP_BUILD}$1`));
}
await writeFile('dist/version.json',JSON.stringify({version:FLEETTAP_APP_VERSION,build:FLEETTAP_APP_BUILD,releaseDate:FLEETTAP_APP_RELEASE_DATE})+'\n');
console.log(`FleetTap ${FLEETTAP_APP_VERSION} built. Database migrations are managed separately.`);
