let user='';const maps=new Set();
export function setDraftUser(id){if(user!==(id||''))for(const map of maps)map.clear();user=id||'';}
export class WorkDraftMap extends Map{
 constructor(name){super();this.name=name;maps.add(this);}
 key(key){return 'fleettap-workdraft:'+user+':'+this.name+':'+key;}
 get(key){let value=super.get(key);if(value===undefined&&user){try{value=JSON.parse(sessionStorage.getItem(this.key(key))||'null');if(value)super.set(key,value);}catch{}}return value||undefined;}
 has(key){return this.get(key)!==undefined;}
 delete(key){try{sessionStorage.removeItem(this.key(key));}catch{}return super.delete(key);}
 flush(){if(!user)return;for(const [key,value] of this){try{if(!value.dirty){sessionStorage.removeItem(this.key(key));continue;}const clean={...value,files:[],photosNeedReattach:!!value.files?.length&&(this.name==='reports'||!!value.docket||!value.photoIds)};if(clean.photosNeedReattach){clean.step=value.docket?'docket-photos':'photos';clean.error='Your words are restored. Please attach the photos again.';}sessionStorage.setItem(this.key(key),JSON.stringify(clean));}catch{}}}
}
export function preserveWorkDrafts(){for(const map of maps)map.flush();}
export function clearWorkDrafts(){for(const map of maps){for(const key of map.keys())map.delete(key);}try{for(let n=sessionStorage.length-1;n>=0;n--){const key=sessionStorage.key(n);if(key?.startsWith('fleettap-workdraft:'+user+':'))sessionStorage.removeItem(key);}}catch{}}
if(typeof window!=='undefined'){window.addEventListener('beforeunload',preserveWorkDrafts);window.addEventListener('preserve-work',preserveWorkDrafts);}
