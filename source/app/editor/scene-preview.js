// Audition owns its clock and voices; it never changes the song transport.
let sceneDemo=null,sceneDemoFrame=0,sceneDemoTimer=0,sceneDemoSerial=0,sceneDemoMuted=false,sceneDemoZoom=false,sceneDemoChord=0,sceneDemoPaused=false;
const sceneDemoVoices=new Set();
const sceneDemoNow=()=>typeof performance!=='undefined'?performance.now():Date.now();
function silenceSceneDemo(){for(const voice of sceneDemoVoices){for(const source of voice){try{source.stop()}catch{}}voice.dispose?.()}sceneDemoVoices.clear()}
function stopSceneDemo(){sceneDemoSerial++;clearTimeout(sceneDemoTimer);sceneDemoTimer=0;if(sceneDemoFrame)cancelAnimationFrame(sceneDemoFrame);sceneDemoFrame=0;sceneDemo=null;silenceSceneDemo()}
// A fixed progression varies the harmony without consecutive repeats or dissonant seconds.
const demoChords=[[0,4,7,12],[1,5,8,13],[9,12,16,21],[3,7,10,15],[5,9,12,17],[6,9,13,18],[7,11,14,19],[8,12,15,20],[2,5,9,14],[10,14,17,22],[4,7,11,16],[11,14,18,23]];
function fitPreviewPitches(tones,layout){
 const center=(layout.lo+layout.hi)/2,candidates=[];
 for(let octave=-1;octave<=10;octave++){
  const pitches=tones.map(p=>p+octave*12),lo=Math.min(...pitches),hi=Math.max(...pitches);
  if(lo>=layout.lo&&hi<=layout.hi)candidates.push({pitches,score:Math.abs((lo+hi)/2-center)+(lo<layout.lo+2||hi>layout.hi-2?128:0)});
 }
 if(candidates.length)return candidates.sort((a,b)=>a.score-b.score)[0].pitches;
 // One-octave ranges need an inversion. Preserve pitch classes instead of clamping notes.
 const folded=tones.map(tone=>[...layout.keys.keys()].filter(p=>p%12===tone%12).sort((a,b)=>Math.abs(a-center)-Math.abs(b-center))[0]);
 if(folded.every(Number.isFinite))return folded;
 // The final MIDI octave ends at G; unavailable harmonies use an in-range triad.
 return tones.map((_,i)=>layout.lo+[0,tones[0]%2?3:4,7,0][i]);
}
function sceneDemoEvents(step=null){
 if(step===null){step=sceneDemoChord;sceneDemoChord+=Math.ceil(lanes.length/4)}
 const events=[],layout=demoLayout();
 for(let offset=0;offset<lanes.length;offset+=4){
  const group=lanes.slice(offset,offset+4),chord=demoChords[(step+offset/4)%demoChords.length];
  const tones=group.length===1?chord.slice(0,3):group.length===2?[chord[0],chord[(step+offset/4)%2?2:1]]:chord.slice(0,group.length);
  const pitches=fitPreviewPitches(tones,layout);
  pitches.forEach((pitch,j)=>{const index=offset+j%group.length,lane=lanes[index];events.push({pitch,start:1.1+offset/4*1.65,len:.8,volume:80,lane:index,instrument:lane.instrument||'vsco-piano-1',instrumentId:laneInstrument(lane).id,settings:prepareVoiceSettings(laneInstrument(lane).settings)})});
 }
 return events;
}
function demoLayout(){return keyLayout(scene?.events||lanes.flatMap(l=>l.notes))}
function frameSceneDemo(demo,now){
 if(!sceneDemoZoom){demo.lensRange=null;return}
 const at=(demo.events.find(n=>n.start+Math.max(n.len,.85)>now)||demo.events.at(-1)).start,group=demo.events.filter(n=>n.start===at);
 demo.lensRange=[Math.max(demo.lo,Math.min(...group.map(n=>n.pitch))-2),Math.min(demo.hi,Math.max(...group.map(n=>n.pitch))+2)];
}
function renderSceneDemo(demo,now){frameSceneDemo(demo,now);renderScene(byId('sceneDemo'),demo,now,true)}
function queueSceneDemo(){
 if(byId('visualOptions').hidden||byId('preferences').hidden||document.hidden)return;
 const position=sceneDemo?.paused?sceneDemo.position:0;stopSceneDemo();sceneDemoTimer=setTimeout(()=>{sceneDemoTimer=0;startSceneDemo(position)},120);
}
async function startSceneDemo(position=0){
 stopSceneDemo();syncSceneDemoPlayback();if(byId('visualOptions').hidden||byId('preferences').hidden||document.hidden)return;
 const token=sceneDemoSerial,events=sceneDemoEvents();if(!events.length)return;position=Math.min(position,events.at(-1).start+1.7);
 byId('sceneDemoStatus').textContent='';
 if(!sceneDemoMuted&&!sceneDemoPaused){
  try{await unlock();await Promise.all([...new Set(events.map(n=>n.instrument))].map(id=>prepareInstrument(id)))}
  catch(e){if(token===sceneDemoSerial){byId('sceneDemoStatus').textContent='Предпросмотр без звука: инструмент недоступен.';diagnostics.error('scenePreview',e)}}
 }
 if(token!==sceneDemoSerial||byId('preferences').hidden||document.hidden)return;
 sceneDemo={...demoLayout(),audition:true,events,sec:1,last:events.at(-1).start+1.7,next:0,visible:[],started:sceneDemoNow()-position*1000,audioStart:(audio?.currentTime??0)-position,audioClock:!sceneDemoMuted&&audio?.state==='running',nextSound:0,stamp:-Infinity,paused:sceneDemoPaused,position};
 syncSceneDemoPlayback();if(sceneDemo.paused)renderSceneDemo(sceneDemo,position);else animateSceneDemo(sceneDemoNow());
}
function animateSceneDemo(ms){
 const demo=sceneDemo;if(!demo||demo.paused)return;
 if(document.hidden||byId('preferences').hidden||byId('visualOptions').hidden){stopSceneDemo();return}
 const now=demo.audioClock?audio.currentTime-demo.audioStart:(ms-demo.started)/1000;
 while(demo.nextSound<demo.events.length&&demo.events[demo.nextSound].start<=now+.08){
  const n=demo.events[demo.nextSound++];
  if(sceneDemoMuted||n.start+n.len<=now||!audio||!instrumentCache.has(n.instrument))continue;
  try{
   const voice=createInstrumentVoice(audio,master,instrumentCache.get(n.instrument),n.settings,n.pitch,audio.currentTime+Math.max(0,n.start-now),n.len,n.volume,Math.max(0,now-n.start),n.lane);
   if(voice){sceneDemoVoices.add(voice);voice[0].onended=()=>{voice.dispose?.();sceneDemoVoices.delete(voice)}}
  }catch(e){diagnostics.error('scenePreview',e)}
 }
 if(ms-demo.stamp>=1000/options.fps-.5){demo.stamp=ms;renderSceneDemo(demo,now)}
 if(now<demo.last)sceneDemoFrame=requestAnimationFrame(animateSceneDemo);else{sceneDemoFrame=0;startSceneDemo()}
}
function refreshSceneDemo(){
 if(!sceneDemo){queueSceneDemo();return}
 const layout=demoLayout();if(layout.lo!==sceneDemo.lo||layout.hi!==sceneDemo.hi){queueSceneDemo();return}
 const now=sceneDemoTime();
 renderSceneDemo(sceneDemo,now);
}
function sceneDemoTime(){return !sceneDemo?0:sceneDemo.paused?sceneDemo.position:sceneDemo.audioClock?audio.currentTime-sceneDemo.audioStart:(sceneDemoNow()-sceneDemo.started)/1000}
function syncSceneDemoPlayback(){
 const button=byId('replaySceneDemo');button.textContent=sceneDemoPaused?'▶':'Ⅱ';button.setAttribute('aria-label',sceneDemoPaused?'Продолжить предпросмотр':'Пауза предпросмотра');button.setAttribute('aria-pressed',String(!sceneDemoPaused));
}
function pauseSceneDemo(){
 sceneDemoPaused=true;sceneDemoSerial++;
 if(sceneDemo){sceneDemo.position=Math.max(0,Math.min(sceneDemo.last,sceneDemoTime()));sceneDemo.paused=true;sceneDemo.loading=false}
 if(sceneDemoFrame)cancelAnimationFrame(sceneDemoFrame);sceneDemoFrame=0;silenceSceneDemo();syncSceneDemoPlayback();if(sceneDemo)renderSceneDemo(sceneDemo,sceneDemo.position);
}
async function resumeSceneDemo(){
 sceneDemoPaused=false;syncSceneDemoPlayback();const demo=sceneDemo;if(!demo){queueSceneDemo();return}
 if(demo.loading)return;demo.loading=true;const token=++sceneDemoSerial;
 try{
  if(!sceneDemoMuted){await unlock();await Promise.all([...new Set(demo.events.map(n=>n.instrument))].map(prepareInstrument))}
  if(token!==sceneDemoSerial||sceneDemo!==demo||byId('preferences').hidden||document.hidden)return;
  const position=demo.position>=demo.last?0:demo.position;
  demo.started=sceneDemoNow()-position*1000;demo.audioStart=(audio?.currentTime??0)-position;demo.audioClock=!sceneDemoMuted&&audio?.state==='running';demo.paused=false;demo.loading=false;demo.nextSound=0;demo.next=0;demo.visible=[];demo.stamp=-Infinity;animateSceneDemo(sceneDemoNow());
 }catch(e){if(token===sceneDemoSerial){demo.loading=false;sceneDemoPaused=true;syncSceneDemoPlayback();byId('sceneDemoStatus').textContent='Не удалось включить звук предпросмотра.';diagnostics.error('scenePreview',e)}}
}
function syncSceneDemoSound(){
 const button=byId('sceneDemoSound');button.setAttribute('aria-label',sceneDemoMuted?'Включить звук предпросмотра':'Выключить звук предпросмотра');button.setAttribute('aria-pressed',String(!sceneDemoMuted));
 button.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z"/>'+ (sceneDemoMuted?'<path d="m16 9 6 6m0-6-6 6"/>':'<path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>')+'</svg>';
}
byId('sceneDemoSound').onclick=()=>{sceneDemoMuted=!sceneDemoMuted;syncSceneDemoSound();if(sceneDemoMuted)silenceSceneDemo();else if(!sceneDemoPaused){if(sceneDemo)pauseSceneDemo();resumeSceneDemo()}};
byId('replaySceneDemo').onclick=()=>sceneDemoPaused?resumeSceneDemo():pauseSceneDemo();
syncSceneDemoSound();

function toggleSceneDemoZoom(){
 sceneDemoZoom=!sceneDemoZoom;const canvas=byId('sceneDemo');canvas.setAttribute('aria-pressed',String(sceneDemoZoom));canvas.setAttribute('aria-label',sceneDemoZoom?'Отдалить ноты предпросмотра':'Приблизить ноты предпросмотра');
 if(sceneDemo){const now=sceneDemoTime();renderSceneDemo(sceneDemo,Math.min(now,sceneDemo.last));}
}
byId('sceneDemo').onclick=toggleSceneDemoZoom;
byId('sceneDemo').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleSceneDemoZoom()}};

// A silent snapshot of the actual track, independent of its playback cursor.
let sceneOverview=null,sceneOverviewTrack=null,sceneOverviewPosition=0,overviewGesture=null,overviewHold=0;
function overviewTrack(){
 const events=scene?.events||lanes.flatMap((lane,index)=>lane.muted?[]:lane.notes.map(n=>({...n,lane:index,instrument:lane.instrument||'vsco-piano-1',instrumentId:laneInstrument(lane).id}))).sort((a,b)=>a.start-b.start),sec=scene?.sec||60/bpm/PPQ;
 const last=events.reduce((value,n)=>Math.max(value,n.start+n.len),0);return {events,sec,last,duration:last*sec};
}
function randomSceneOverview(){
 if(!sceneOverviewTrack)sceneOverviewTrack=overviewTrack();const track=sceneOverviewTrack;
 if(track.events.length){const n=track.events[Math.floor(Math.random()*track.events.length)],candidate=(n.start+n.len*(.2+Math.random()*.5))*track.sec;
  sceneOverviewPosition=Math.min(track.duration,candidate);if(Math.abs(sceneOverviewPosition-(sceneOverview?.position??-1))<.01&&track.duration>.02)sceneOverviewPosition=(sceneOverviewPosition+track.duration*.381966)%track.duration;
 }else sceneOverviewPosition=0;
 drawScenePreview();
}
function drawScenePreview(){
 if(byId('visualOptions').hidden||byId('preferences').hidden)return;
 if(!sceneOverviewTrack)sceneOverviewTrack=overviewTrack();const track=sceneOverviewTrack,layout=scenePreviewLayout||(scenePreviewLayout=demoLayout());
 sceneOverviewPosition=Math.max(0,Math.min(track.duration,sceneOverviewPosition));
 const position=sceneOverviewPosition,visible=[];let next=0;
 for(;next<track.events.length;next++){const n=track.events[next];if(n.start*track.sec>position+sceneTravel())break;if((n.start+n.len)*track.sec>position||n.start*track.sec>position-.9)visible.push(n)}
 sceneOverview={...layout,events:track.events,sec:track.sec,last:track.last,next,visible,position};
 renderScene(byId('scenePreview'),sceneOverview,position,true);
 byId('sceneOverviewTime').textContent=track.events.length?stageClock(position)+' / '+stageClock(track.duration):'В треке пока нет нот';
 byId('sceneOverviewProgress').style.width=(track.duration?100*position/track.duration:0)+'%';
 byId('sceneOverviewSeek').hidden=!!track.events.length&&!overviewGesture?.scrubbing;
}
function seekSceneOverview(seconds){if(!sceneOverviewTrack||!Number.isFinite(seconds))return;sceneOverviewPosition=Math.max(0,Math.min(sceneOverviewTrack.duration,seconds));drawScenePreview()}
function cancelOverviewGesture(){clearTimeout(overviewHold);overviewHold=0;overviewGesture=null;if(sceneOverviewTrack)byId('sceneOverviewSeek').hidden=!!sceneOverviewTrack.events.length}
function stopSceneOverview(){cancelOverviewGesture();sceneOverview=null;sceneOverviewTrack=null}
function previewBoxSize(width,height,ratio){const h=Math.max(0,Math.min((height-12)/2,(width-2)/ratio+2));return {width:Math.min(width,Math.max(0,(h-2)*ratio+2)),height:h}}
function layoutScenePreviews(){
 const host=byId('sceneDemos'),canvas=byId('scene'),ratio=canvas.clientWidth>0&&canvas.clientHeight>0?canvas.clientWidth/canvas.clientHeight:16/9,box=previewBoxSize(host.clientWidth,host.clientHeight,ratio);
 host.style.setProperty('--preview-width',box.width+'px');host.style.setProperty('--preview-height',box.height+'px');
}
function startSceneOverview(){layoutScenePreviews();if(!sceneOverviewTrack)sceneOverviewTrack=overviewTrack();randomSceneOverview()}
function overviewPointerFraction(e){
 const r=byId('scenePreview').getBoundingClientRect(),rotated=window.matchMedia?.('(orientation:portrait)').matches;
 return Math.max(0,Math.min(1,rotated?(e.clientY-r.top)/r.height:(e.clientX-r.left)/r.width));
}
const overviewCanvas=byId('scenePreview');
overviewCanvas.onpointerdown=e=>{
 if(overviewGesture||e.button>0)return;e.preventDefault();overviewCanvas.setPointerCapture?.(e.pointerId);
 overviewGesture={id:e.pointerId,x:e.clientX,y:e.clientY,fraction:overviewPointerFraction(e),moved:false,scrubbing:false};
 overviewHold=setTimeout(()=>{overviewHold=0;if(!overviewGesture)return;overviewGesture.scrubbing=true;seekSceneOverview(overviewGesture.fraction*(sceneOverviewTrack?.duration||0))},350);
};
overviewCanvas.onpointermove=e=>{
 const gesture=overviewGesture;if(!gesture||gesture.id!==e.pointerId)return;e.preventDefault();gesture.fraction=overviewPointerFraction(e);
 if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>8){gesture.moved=true;if(!gesture.scrubbing){clearTimeout(overviewHold);overviewHold=0}}
 if(gesture.scrubbing)seekSceneOverview(gesture.fraction*(sceneOverviewTrack?.duration||0));
};
overviewCanvas.onpointerup=e=>{const gesture=overviewGesture;if(!gesture||gesture.id!==e.pointerId)return;e.preventDefault();const tap=!gesture.scrubbing&&!gesture.moved;if(gesture.scrubbing)seekSceneOverview(overviewPointerFraction(e)*(sceneOverviewTrack?.duration||0));cancelOverviewGesture();if(tap)randomSceneOverview()};
overviewCanvas.onpointercancel=overviewCanvas.onlostpointercapture=cancelOverviewGesture;
overviewCanvas.oncontextmenu=e=>e.preventDefault();
overviewCanvas.onkeydown=e=>{if(['Enter',' ','ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();if(e.key==='Enter'||e.key===' ')randomSceneOverview();else seekSceneOverview(e.key==='Home'?0:e.key==='End'?sceneOverviewTrack?.duration:sceneOverviewPosition+(e.key==='ArrowLeft'?-1:1))}};
