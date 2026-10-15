import {randomBytes,createHash,scrypt as deriveKey,timingSafeEqual} from 'node:crypto';
export const randomToken=()=>randomBytes(32).toString('hex');
export const hash=v=>createHash('sha256').update(v).digest('hex');
export const validPassword=v=>typeof v==='string'&&v.length>=12&&v.length<=128;
const keyFor=(password,salt)=>new Promise((resolve,reject)=>deriveKey(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(e,k)=>e?reject(e):resolve(k)));
export async function hashPassword(password){if(!validPassword(password))throw Error('Use a password of 12–128 characters.');const salt=randomBytes(16).toString('hex');return `scrypt-v1:${salt}:${(await keyFor(password,salt)).toString('hex')}`;}
export async function verifyPassword(password,encoded){const p=encoded?.split(':');const valid=p?.length===3&&p[0]==='scrypt-v1'&&/^[a-f0-9]{32}$/.test(p[1])&&/^[a-f0-9]{128}$/.test(p[2]);const key=await keyFor(password,valid?p[1]:'0'.repeat(32));return !!valid&&timingSafeEqual(key,Buffer.from(p[2],'hex'));}
export {manager as canManage,author as canAuthor,reviewer as canReview} from '../src/roles.js';
import {assignableRoles} from '../src/roles.js';
export function canAccessGarage(u,g){return u.role==='platform_admin'||(u.organisation_id===g.organisation_id&&(u.role==='organisation_admin'||u.garage_id===g.id));}
export function canManageUser(actor,target){return actor.id!==target.id&&!target.bootstrap&&permittedAssignment(actor,target.role,target.organisation_id,target.garage_id);}
export function permittedAssignment(actor,role,org,garage){if(!assignableRoles(actor).includes(role))return false;if(actor.role==='platform_admin')return true;if(org!==actor.organisation_id)return false;return actor.role==='organisation_admin'||garage===actor.garage_id;}
