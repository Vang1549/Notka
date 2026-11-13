byId('playStart').onclick=()=>play('start');
byId('play').onclick=()=>play();
const tempoInput=byId('bpm');
function setTempo(value){
 if(!running&&Number.isInteger(value)){
  const next=Math.max(40,Math.min(220,value));
  if(bpm!==next){bpm=next;trackChanged()}
 }
 tempoInput.value=String(bpm);controls();
}
tempoInput.onfocus=()=>tempoInput.select?.();
tempoInput.onblur=()=>setTempo(/^\d+$/.test(tempoInput.value)?Number(tempoInput.value):bpm);
tempoInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();tempoInput.blur()}};
for(const [id,d] of [['minus',-5],['plus',5]])byId(id).onclick=()=>setTempo(bpm+d);
// Translucent ink blends with the actual note fill, including its depth gradient.
function instrumentInk(accent){
 if(!/^#[0-9a-f]{6}$/i.test(accent))return '#000';
 const linear=[1,3,5].map(i=>{const c=parseInt(accent.slice(i,i+2),16)/255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4)});
 return .2126*linear[0]+.7152*linear[1]+.0722*linear[2]<.075?'#fff':'#000';
}
try{
 const colors=JSON.parse(NotkaPlayer.themeColors());
 for(const [key,value] of Object.entries(colors))if(/^#[0-9a-f]{6}$/i.test(value))document.documentElement.style.setProperty('--'+key,value);
 document.documentElement.style.setProperty('--instrument-ink',instrumentInk(colors.accent));
 document.documentElement.setAttribute('data-note-depth',String(colors.depth===true));
 document.documentElement.style.colorScheme=colors.scheme==='light'?'light':'dark';
}catch{}
function suspendEditor(){stopLibraryAudition();cancelInstrumentHold();stopSceneDemo();stopSceneOverview();cancelLaneHold();instrumentRequest++;previewSerial++;contacts.clear();pinch=null;finishGesture(true);flushDraft(true);diagnostics.suspend();stageScrub=null;if(playback?.visual)pauseStage();else stop()}
document.addEventListener('visibilitychange',()=>{sourceVisibility();if(document.hidden)suspendEditor();else if(!byId('preferences').hidden&&!byId('visualOptions').hidden){startSceneOverview();queueSceneDemo()}});
window.addEventListener('resize',resize);
if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe(roll);
