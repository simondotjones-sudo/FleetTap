import {actor,garageFor,endpoint,fail,json,env,rateLimit} from '../../server/runtime.mjs';
import {photoStore,photoId,validatePhoto} from '../../server/photos.mjs';
export default endpoint(async req=>{
 const u=await actor(req),params=new URL(req.url).searchParams,garage=params.get('garage');
 await garageFor(u,garage);
 const store=photoStore();
 if(req.method==='GET'){
  const id=params.get('id');if(!photoId(id))fail('Photo unavailable.',404);
  const entry=await store.getWithMetadata(garage+'/'+id,{type:'arrayBuffer'});
  if(!entry||entry.metadata.garage!==garage)fail('Photo unavailable.',404);
  return new Response(entry.data,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="fault-photo.jpg"'}});
 }
 if(req.method!=='POST')fail('Method not allowed.',405);
 if(req.headers.get('origin')!==env('FLEETTAP_APP_ORIGIN'))fail('Request origin not allowed.',403);
 await rateLimit('photo:'+u.id,60);
 const bytes=new Uint8Array(await req.arrayBuffer());validatePhoto(bytes,req.headers.get('content-type'));
 const id=crypto.randomUUID();await store.set(garage+'/'+id,bytes.buffer,{metadata:{garage,uploader:u.id,created:new Date().toISOString()}});
 return json({id},201);
});
