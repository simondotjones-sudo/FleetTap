import {esc} from './api.js';
export const photoPicker=(count=0,name='photos')=>`<div class="photo-picker"><div class="photo-options"><button type="button" class="tap-tile" data-photo-source="camera"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h4l2-3h4l2 3h4v15H4z"/><circle cx="12" cy="13" r="4"/></svg><strong>Take photo</strong></button><button type="button" class="tap-tile" data-photo-source="files"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h7l2 3h9v13H3zM7 16l3-3 3 3 3-4 3 4"/></svg><strong>Choose files</strong></button></div><input type="file" name="${esc(name)}" accept="image/*" multiple hidden aria-label="Choose photos"></div><div class="photo-preview" aria-live="polite">${count?`<span>${count} selected</span>`:''}</div>`;
export function setupPhotoPicker(){document.addEventListener('click',e=>{const button=e.target.closest('[data-photo-source]');if(!button)return;const input=button.closest('.photo-picker').querySelector('input');if(button.dataset.photoSource==='camera'){input.setAttribute('capture','environment');input.removeAttribute('multiple');}else{input.removeAttribute('capture');input.setAttribute('multiple','');}input.click();});}
export const photoGallery=(ids,garage)=>(ids||[]).length?`<div class="photo-gallery">${ids.map(id=>{const url='/.netlify/functions/photos?garage='+encodeURIComponent(garage)+'&id='+encodeURIComponent(id);return `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="Fault evidence" loading="lazy"></a>`;}).join('')}</div>`:'';
export async function uploadPhotos(files,garage,{docket=false}={}){
 if(files.length>3)throw Error('Choose up to three photos.');
 const ids=[];
 for(const file of files){
  if(file.size>20*1024*1024)throw Error('Choose photos under 20 MB.');
  const bitmap=await createImageBitmap(file).catch(()=>{throw Error('This photo could not be opened. Try JPEG or PNG.');});
  const scale=Math.min(1,(docket?2400:1600)/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  let blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',docket ? .9 : .82));if(docket&&blob?.size>2*1024*1024)blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.75));if(!blob||blob.size>2*1024*1024)throw Error('Photo is too large. Choose a smaller photo.');
  const response=await fetch('/.netlify/functions/photos?garage='+encodeURIComponent(garage),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'image/jpeg'},body:blob});const data=await response.json();if(!response.ok)throw Error(data.error||'Photo upload failed.');ids.push(data.id);
 }
 return ids;
}
export async function photoThumbnail(file){
 if(file.size>20*1024*1024)throw Error('Choose photos under 20 MB.');
 const bitmap=await createImageBitmap(file).catch(()=>{throw Error('This photo could not be opened. Try JPEG or PNG.');});
 const scale=Math.min(1,360/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return canvas.toDataURL('image/jpeg',.7);
}
export function previewPhotos(input){const container=input.parentElement.nextElementSibling;container.replaceChildren();for(const file of [...input.files].slice(0,3)){const img=document.createElement('img'),url=URL.createObjectURL(file);img.alt=file.name;img.src=url;img.onload=img.onerror=()=>URL.revokeObjectURL(url);container.append(img);}const note=document.createElement('span');note.textContent=input.files.length>3?'Choose up to three photos.':input.files.length+' selected';container.append(note);}
