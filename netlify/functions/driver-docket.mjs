import {actor,body,db,endpoint,env,garageFor,json,rateLimit} from '../../server/runtime.mjs';
import {photoStore} from '../../server/photos.mjs';
import {analyseDocket,docketStore} from '../../server/docket.mjs';
import {matchDocketBus} from '../../src/docket.js';

export const makeDocketHandler=(dependencies={})=>async req=>{
 const user=await actor(req),input=await body(req);await garageFor(user,input.garage);
 await rateLimit('docket:'+user.id,20);
 const analysed=await analyseDocket({photoIds:input.photos,garage:input.garage,user,photos:(dependencies.photoStore||photoStore)(),apiKey:dependencies.apiKey??env('OPENAI_API_KEY'),model:dependencies.model||env('FLEETTAP_DOCKET_MODEL')||'gpt-4.1-mini',fetchImpl:dependencies.fetchImpl||fetch});
 // Check access again after the external request, before returning or retaining the result.
 const currentUser=await actor(req);await garageFor(currentUser,input.garage);
 const [row]=await db()`SELECT data FROM garage_records WHERE garage_id=${input.garage}`;
 const match=matchDocketBus(analysed.extracted,row?.data?.vehicles||[],input.garage),id=crypto.randomUUID(),created=new Date().toISOString();
 await (dependencies.docketStore||docketStore)().setJSON(input.garage+'/'+id,{...analysed,garage:input.garage,uploader:user.id,created});
 return json({id,extracted:analysed.extracted,vehicle:match.vehicle,warnings:[...analysed.extracted.warnings,...(match.warning?[match.warning]:[])]});
};
export default endpoint(makeDocketHandler());
