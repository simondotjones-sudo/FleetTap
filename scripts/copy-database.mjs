import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {templateFor} from '../src/templates.js';
import {taskReadings} from '../src/inspections.js';

// Data import only. Schema must have arrived through a successful Netlify deploy.
// Credentials and source content never go in arguments, files, Git, or logs.
const tables=['organisations','garages','users','sessions','activation_tokens','auth_limits','garage_records','audit_events'];
export async function copyDatabase({sourceUrl,targetUrl,targetKind,confirmProduction=false,document:sourceDocument}){
 if(!['preview','production'].includes(targetKind)||targetKind==='production'&&confirmProduction!==true)throw Error('Choose preview, or explicitly confirm the approved production cutover.');
 if(!sourceUrl||!targetUrl||sourceUrl===targetUrl)throw Error('Use distinct source and target databases.');
 const source=new pg.Client({connectionString:sourceUrl}),target=new pg.Client({connectionString:targetUrl});
 let sourceOpen=false,targetOpen=false;
 try{
  await source.connect();await target.connect();
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');sourceOpen=true;
  await target.query('BEGIN ISOLATION LEVEL SERIALIZABLE');targetOpen=true;
  await target.query("SELECT pg_advisory_xact_lock(71375106)");
  const counts={};
  const identifier=v=>'"'+v.replaceAll('"','""')+'"';
  for(const table of [...tables,'inspection_documents']){
   const result=await target.query('SELECT count(*)::integer AS count FROM '+identifier(table));
   if(result.rows[0].count!==0)throw Error('Target is not empty. Stop and review the previous import.');
  }
  for(const table of tables){
   const {rows}=await source.query('SELECT * FROM '+identifier(table));
   for(const row of rows){
    const keys=Object.keys(row);await target.query('INSERT INTO '+identifier(table)+' ('+keys.map(identifier).join(',')+') '+(table==='audit_events'?'OVERRIDING SYSTEM VALUE ':'')+'VALUES ('+keys.map((_,n)=>'$'+(n+1)).join(',')+')',keys.map(k=>row[k]));
   }
   const check=await target.query('SELECT count(*)::integer AS count FROM '+identifier(table));
   if(check.rows[0].count!==rows.length)throw Error('Imported row count does not match.');counts[table]=rows.length;
  }
  // Optional on reruns from a source that already supports document storage.
  const existing=await source.query("SELECT to_regclass('public.inspection_documents') AS name");
  if(existing.rows[0].name){
   const {rows}=await source.query('SELECT * FROM inspection_documents');
   for(const row of rows){const keys=Object.keys(row);await target.query('INSERT INTO inspection_documents ('+keys.map(identifier).join(',')+') VALUES ('+keys.map((_,n)=>'$'+(n+1)).join(',')+')',keys.map(k=>row[k]));}counts.inspection_documents=rows.length;
  }
  await target.query("SELECT setval(pg_get_serial_sequence('audit_events','id'),COALESCE((SELECT max(id) FROM audit_events),1),(SELECT count(*)>0 FROM audit_events))");
  if(sourceDocument){
   if(sourceDocument.confirmPM3Revision8!==true)throw Error('Verify the PM3 Revision 8 source before attaching it to legacy inspections.');
   const {garageId,uploaderId,path}=sourceDocument,bytes=await readFile(path);
   if(bytes.length>4*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Original source must be a PDF under 4 MB.');
   const {rows:[user]}=await target.query('SELECT role,organisation_id,garage_id FROM users WHERE id=$1 AND active',[uploaderId]);
   const {rows:[garage]}=await target.query('SELECT organisation_id FROM garages WHERE id=$1',[garageId]);
   if(!user||!garage||!['platform_admin','organisation_admin','garage_manager'].includes(user.role)||user.role!=='platform_admin'&&(user.organisation_id!==garage.organisation_id||user.role==='garage_manager'&&user.garage_id!==garageId))throw Error('Choose an authorised administrator and garage.');
   const {rows:[record]}=await target.query('SELECT data FROM garage_records WHERE garage_id=$1 FOR UPDATE',[garageId]);
   if(!record)throw Error('Garage records are missing.');
   const template=structuredClone(templateFor(record.data));
   if(template.sourceId)throw Error('An original document is already attached; do not replace it during data import.');
   const id=crypto.randomUUID();template.sourceId=id;template.sourceName='SG Buses 271+ PM 3 Spec. (Aug 26).pdf';
   template.tasks=template.tasks.map(t=>({...t,fields:structuredClone(taskReadings(t))}));
   await target.query('INSERT INTO inspection_documents(id,garage_id,name,content,uploaded_by) VALUES($1,$2,$3,$4,$5)',[id,garageId,template.sourceName,bytes.toString('base64'),uploaderId]);
   record.data.inspectionTemplate=template;
   for(const inspection of record.data.inspections||[])if(!inspection.templateSnapshot&&inspection.template==='TO-PMS 035 · Revision 8 · demo mapping 1'){inspection.templateId='pm3';inspection.templateSnapshot=structuredClone(template);}
   await target.query('UPDATE garage_records SET data=$1::jsonb,version=version+1,updated_at=now() WHERE garage_id=$2',[JSON.stringify(record.data),garageId]);
   await target.query("INSERT INTO audit_events(actor_id,action,target,garage_id) VALUES($1,'initial_pm3_source_import',$2,$3)",[uploaderId,id,garageId]);counts.sourceDocument=1;
  }
  await target.query('COMMIT');targetOpen=false;
  await source.query('COMMIT');sourceOpen=false;return counts;
 }finally{
  if(targetOpen)await target.query('ROLLBACK').catch(()=>{});if(sourceOpen)await source.query('ROLLBACK').catch(()=>{});
  await Promise.allSettled([target.end(),source.end()]);
 }
}
if(import.meta.url===new URL(process.argv[1],'file:').href){
 console.log('Ready for database copy JSON on hidden stdin');
 const rl=createInterface({input:process.stdin});const [line]=await once(rl,'line');rl.close();
 try{const counts=await copyDatabase(JSON.parse(line));console.log(JSON.stringify({ok:true,counts}));}catch(error){console.error('Copy failed:',error.code||error.name);process.exitCode=1;}
}
