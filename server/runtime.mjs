import {neon} from '@neondatabase/serverless';
import {getDatabase} from '@netlify/database';
import {hash,canAccessGarage} from './security.mjs';
export const env=k=>globalThis.Netlify?.env?.get(k)??process.env[k];
export const databaseProvider=()=>env('FLEETTAP_DATABASE_PROVIDER')==='netlify'||(env('CONTEXT')&&env('CONTEXT')!=='production')?'netlify':'neon';
let managed;
export const db=()=>databaseProvider()==='netlify'?(managed??=getDatabase(env('NETLIFY_DB_URL')?{connectionString:env('NETLIFY_DB_URL')}:undefined)).sql:neon(env('FLEETTAP_DATABASE_URL'));
export async function closeDatabase(){if(managed){await managed.pool.end();managed=undefined;}}
export const appOrigin=()=>env('CONTEXT')&&env('CONTEXT')!=='production'?env('DEPLOY_PRIME_URL'):env('FLEETTAP_APP_ORIGIN');
export const COOKIE='__Host-fleettap_session';
export function cookie(req){const value=req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);return /^[a-f0-9]{64}$/.test(value||'')?value:'';}
export function fail(message,status=400){throw Object.assign(new Error(message),{status});}
export function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...headers}});}
export function setCookie(token,seconds=28800){return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;}
export async function body(req){if(req.method!=='POST')fail('Method not allowed',405);if(!appOrigin()||req.headers.get('origin')!==appOrigin())fail('Request origin not allowed',403);if(!req.headers.get('content-type')?.startsWith('application/json'))fail('JSON required',415);const raw=await req.text();if(raw.length>64000)fail('Request too large',413);try{return JSON.parse(raw);}catch{fail('Invalid JSON');}}
export async function actor(req){const token=cookie(req);if(!token)fail('Please sign in.',401);const [u]=await db()`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=${hash(token)} AND s.expires_at>now() AND u.active AND u.credential_version=s.credential_version`;if(!u)fail('Please sign in.',401);return u;}
export const safeUser=u=>({id:u.id,email:u.email,name:u.name,role:u.role,organisation_id:u.organisation_id,garage_id:u.garage_id});
export async function garageFor(u,id){if(!/^[a-f0-9-]{36}$/.test(id||''))fail('Choose a garage.');const [g]=await db()`SELECT * FROM garages WHERE id=${id}`;if(!g||!canAccessGarage(u,g))fail('Garage unavailable',403);return g;}
export async function rateLimit(key,max){const [r]=await db()`INSERT INTO auth_limits(key,attempts,expires_at) VALUES(${hash(key)},1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_limits.expires_at<now() THEN 1 ELSE auth_limits.attempts+1 END, expires_at=CASE WHEN auth_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE auth_limits.expires_at END RETURNING attempts`;if(r.attempts>max)fail('Too many attempts. Try again in 15 minutes.',429);}
export function endpoint(handler){return async(req,context)=>{try{if(env('FLEETTAP_READ_ONLY')==='true'&&req.method!=='GET')return json({error:'FleetTap is briefly read-only while the database is being moved. Please retry shortly.'},503);if(env('CONTEXT')&&env('CONTEXT')!=='production'&&!env('NETLIFY_DB_URL'))return json({error:'This deployment needs an isolated database.'},503);return await handler(req,context);}catch(e){const status=e.status||500;if(status===500)console.error('FleetTap request failed',e.code||e.name);return json({error:status===500?'Unable to complete this request. Please try again.':e.message},status);}};}
