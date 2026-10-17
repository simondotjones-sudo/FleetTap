// Question and category pages opt in. Vertical scrolling, zoom and form controls keep native behaviour.
export function setupQuestionSwipe(navigate,selector='.question-browse'){
 let gesture=null,suppressClickUntil=0;
 const interactive='input,textarea,select,a,summary,[contenteditable="true"],[data-browse-question],[data-browse-sections]';
 document.addEventListener('pointerdown',e=>{
  suppressClickUntil=0; // A new deliberate tap is not the previous swipe's compatibility click.
  if(gesture){gesture=null;return;}
  const screen=e.target.closest?.(selector);
  if(!screen||!e.isPrimary||!['touch','pen'].includes(e.pointerType)||e.target.closest(interactive)||e.clientX<24||e.clientX>window.innerWidth-24)return;
  gesture={id:e.pointerId,screen,x:e.clientX,y:e.clientY};
 },{passive:true});
 document.addEventListener('pointermove',e=>{
  if(!gesture||e.pointerId!==gesture.id)return;
  const dx=Math.abs(e.clientX-gesture.x),dy=Math.abs(e.clientY-gesture.y);
  if(dy>12&&dy>dx)gesture=null;
 },{passive:true});
 document.addEventListener('pointercancel',()=>{gesture=null;},{passive:true});
 document.addEventListener('pointerup',e=>{
  const g=gesture;gesture=null;
  if(!g||e.pointerId!==g.id||!g.screen.isConnected)return;
  const dx=e.clientX-g.x,dy=e.clientY-g.y;
  if(Math.abs(dx)<60||Math.abs(dx)<Math.abs(dy)*2)return;
  // A swipe over an answer tile must never also produce an answer click.
  suppressClickUntil=Date.now()+500;
  navigate(dx<0?1:-1);
 },{passive:true});
 document.addEventListener('click',e=>{
  if(Date.now()<suppressClickUntil&&e.detail!==0){suppressClickUntil=0;e.preventDefault();e.stopImmediatePropagation();}
 },true);
}
