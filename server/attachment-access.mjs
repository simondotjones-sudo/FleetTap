import {db,fail} from './runtime.mjs';
import {canManage} from './security.mjs';

export async function attachmentGarage(u,garage,id,kind){
 const sql=db(),[row]=await sql`SELECT data FROM garage_records WHERE garage_id=${garage}`;
 const state=row?.data||{},origin=state.attachmentOrigins?.[kind]?.[id];if(!origin||origin===garage)return garage;
 const states=[state,...(canManage(u)?(state.vehicleTransferArchive||[]).map(a=>a.state):[])];
 const linked=states.some(s=>kind==='photos'?['faults','reports'].some(k=>(s[k]||[]).some(r=>(r.photos||[]).includes(id))):(s.inspections||[]).some(i=>i.templateSnapshot?.sourceId===id));
 if(!linked)fail('Attachment unavailable.',404);
 const [scope]=await sql`SELECT a.id FROM garages a JOIN garages b ON b.organisation_id=a.organisation_id WHERE a.id=${origin} AND b.id=${garage}`;
 if(!scope)fail('Attachment unavailable.',404);return origin;
}
