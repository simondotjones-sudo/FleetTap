import {mkdir,cp,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist');
for(const path of ['index.html','workspace.css','fleet.css','tablet.css','assets','src','_headers']) await cp(path,`dist/${path}`,{recursive:true});
console.log('FleetTap frontend built. Database migrations are managed separately.');
