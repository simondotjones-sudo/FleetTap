import {esc} from './api.js';
export const photoPicker=()=>'<label class="photo-picker">📷 Add photos <input type="file" name="photos" accept="image/*" multiple><small>Up to 3 · camera or gallery</small></label><div class="photo-preview" aria-live="polite"></div>';
export const photoGallery=(ids,garage)=>(ids||[]).length?`<div class="photo-gallery">${ids.map(id=>{const url='/.netlify/functions/photos?garage='+encodeURIComponent(garage)+'&id='+encodeURIComponent(id);return `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="Fault evidence" loading="lazy"></a>`;}).join('')}</div>`:'';
export async function uploadPhotos(files,garage){
 if(files.length>3)throw Error('Choose up to three photos.');
 const ids=[];
 for(const file of files){
  if(file.size>20*1024*1024)throw Error('Choose photos under 20 MB.');
  const bitmap=await createImageBitmap(file).catch(()=>{throw Error('This photo could not be opened. Try JPEG or PNG.');});
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));if(!blob||blob.size>2*1024*1024)throw Error('Photo is too large. Choose a smaller photo.');
  const response=await fetch('/.netlify/functions/photos?garage='+encodeURIComponent(garage),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'image/jpeg'},body:blob});const data=await response.json();if(!response.ok)throw Error(data.error||'Photo upload failed.');ids.push(data.id);
 }
 return ids;
}
export function previewPhotos(input){const container=input.parentElement.nextElementSibling;container.replaceChildren();for(const file of [...input.files].slice(0,3)){const img=document.createElement('img'),url=URL.createObjectURL(file);img.alt=file.name;img.src=url;img.onload=img.onerror=()=>URL.revokeObjectURL(url);container.append(img);}const note=document.createElement('span');note.textContent=input.files.length>3?'Choose up to three photos.':input.files.length+' selected';container.append(note);}
