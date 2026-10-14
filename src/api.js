export async function api(name,body,query=''){
 const response=await fetch('/.netlify/functions/'+name+query,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 const result=await response.json();if(!response.ok){if(response.status===401&&name!=='auth')window.dispatchEvent(new Event('session-expired'));throw Object.assign(new Error(result.error||'Request failed'),{status:response.status});}return result;
}
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
