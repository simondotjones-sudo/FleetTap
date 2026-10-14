import {getStore} from '@netlify/blobs';
import {fail} from './runtime.mjs';
export const photoStore=()=>getStore({name:'fleettap-fault-photos',consistency:'strong',region:'eu-central-1'});
export const photoId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
export function validatePhoto(bytes,type){
 if(bytes.length<12||bytes.length>2*1024*1024)fail('Choose a photo under 2 MB.',413);
 const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(type!=='image/jpeg'||!jpeg)fail('Choose a supported photo.',415);
}
export async function validateAttachments(ids,garage,u,store=photoStore()){
 if(!Array.isArray(ids)||ids.length>3||ids.some(id=>!photoId(id)))fail('Choose up to three photos.');
 for(const id of ids){const entry=await store.getMetadata(garage+'/'+id);if(!entry||entry.metadata.garage!==garage||entry.metadata.uploader!==u.id)fail('Photo unavailable. Upload it again.',403);}
 return [...new Set(ids)];
}
