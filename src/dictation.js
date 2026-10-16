const mic='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>';
const recognitionType=()=>globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;
let active=null;
export const dictationButton=()=>`<button type="button" class="tap-small voice-button" data-report-mic ${recognitionType()?'':'disabled'} aria-pressed="false">${mic}<span>Tap to talk</span></button><p id="voice-status" class="tap-caption" role="status">${recognitionType()?'Or type below. Voice uses your browser’s speech service.':'Voice unavailable in this browser. Type below or use your keyboard microphone.'}</p>`;
export const dictationActive=()=>!!active;
export function stopDictation(){if(active){const session=active;active=null;clearTimeout(session.timer);session.recognition.abort();session.cleanup();}}
export function toggleDictation(input,onText,trigger=null,feedback=null){
 if(active){active.recognition.stop();return;}
 const Constructor=recognitionType();if(!Constructor)return;
 const button=trigger||document.querySelector('[data-report-mic]'),status=feedback||document.querySelector('#voice-status');
 const recognition=new Constructor();recognition.lang='en-IE';recognition.continuous=true;recognition.interimResults=false;
 const cleanup=()=>{input.readOnly=false;button?.setAttribute('aria-pressed','false');if(button)button.querySelector('span').textContent='Tap to talk';};
 const session={recognition,cleanup,timer:null};active=session;
 recognition.onresult=e=>{if(active!==session)return;let words='';for(let n=e.resultIndex;n<e.results.length;n++)if(e.results[n].isFinal)words+=' '+e.results[n][0].transcript;input.value=(input.value.trim()+words).trim().slice(0,input.maxLength||4000);onText(input.value);};
 recognition.onerror=e=>{if(active!==session)return;status.textContent=e.error==='not-allowed'?'Microphone permission denied. You can still type.':e.error==='no-speech'?'No speech heard. Tap to try again or type.':'Voice unavailable. Try again or type your details.';active=null;clearTimeout(session.timer);recognition.abort();cleanup();};
 recognition.onend=()=>{if(active!==session)return;active=null;clearTimeout(session.timer);cleanup();status.textContent='Review your words, then continue.';};
 try{recognition.start();input.readOnly=true;button.setAttribute('aria-pressed','true');button.querySelector('span').textContent='Stop talking';status.textContent='Listening… tap to stop. Your browser handles speech recognition.';session.timer=setTimeout(()=>{if(active===session){stopDictation();status.textContent='Review your words, then continue.';}},60000);}catch{active=null;cleanup();status.textContent='Microphone unavailable. You can still type.';}
}
