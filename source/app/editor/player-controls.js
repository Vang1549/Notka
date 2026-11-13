// Audio, drawing and the scrubber share one clock; pausing retains the score.
let stageScrub=null;
const stageDuration=()=>scene?scene.last*scene.sec:0;
function stageTime(){
 if(!scene)return 0;
 return sceneLocalTime(scene,scene.still?scene.frozenTime:audio.currentTime-scene.start);
}
function stageClock(seconds){
 const whole=Math.floor(Math.max(0,seconds));
 return Math.floor(whole/60)+':'+String(whole%60).padStart(2,'0');
}
function syncStageTimeline(){
 const duration=stageDuration(),position=Math.max(0,Math.min(duration,stageTime())),range=byId('stageSeek');
 range.max=String(duration||1);
 if(!stageScrub)range.value=String(position);
 range.setAttribute('aria-valuetext',stageClock(position)+' из '+stageClock(duration));
 byId('stagePosition').textContent=stageClock(position);byId('stageDuration').textContent=stageClock(duration);
}
function syncStageTransport(){
 const p=playback,ready=!!p?.visual&&!p.loading,active=ready&&running&&!p.paused;
 const button=byId('stageTransport');button.textContent=active?'Ⅱ':'▶';
 button.setAttribute('aria-label',active?'Пауза':p?.ended?'Играть с начала':'Продолжить');
 for(const id of ['stageTransport','stageSeek','stageBack10','stageBack1','stageForward1','stageForward10'])byId(id).disabled=!ready;
}
function pauseStage(ended=false){
 const p=playback;if(!p?.visual)return;
 generation++;clearInterval(timer);p.loading=false;
 if(!p.paused){p.position=ended?p.last*p.sec:stageTime();p.paused=true;p.ended=ended}
 running=false;current=Math.max(0,p.position/p.sec);
 if(!ended)for(const voice of voices)silenceVoice(voice);
 if(scene){scene.frozenTime=p.position;scene.still=true;scene.cycle=0;scene.next=0;scene.visible=[];scene.loopUntil=p.ended?0:options.loop?Infinity:0}
 if(sceneFrame)cancelAnimationFrame(sceneFrame);sceneFrame=0;
 resetSceneAt(p.position);controls();syncStageTransport();syncStageTimeline();drawScene();
}
async function resumeStage(){
 const p=playback;if(!p?.visual||p.loading||!p.paused)return;
 const token=++generation;p.loading=true;syncStageTransport();
 try{
  await unlock();if(token!==generation||playback!==p)return;
  if(p.position>=p.last*p.sec)p.position=0;
  p.seekEvents=p.events.filter(n=>(n.start+n.len)*p.sec>p.position);
  p.start=audio.currentTime-p.position;p.cycle=0;p.next=0;p.loopUntil=options.loop?Infinity:0;p.paused=false;p.ended=false;p.loading=false;running=true;
  beginScene(p.events,p.start,p.sec,p.last,p.loopUntil);controls();syncStageTransport();syncStageTimeline();startPlaybackTimer(p);
 }catch(e){if(token===generation){p.loading=false;diagnostics.error('playback',e);audioFail();byId('status').textContent=e.message||'Звук недоступен.'}}
}
function setStagePosition(seconds){
 const p=playback;if(!p?.visual||!Number.isFinite(seconds))return;
 p.position=Math.max(0,Math.min(p.last*p.sec,seconds));p.ended=p.position>=p.last*p.sec;
 current=p.position/p.sec;
 if(scene){scene.frozenTime=p.position;scene.still=true;scene.next=0;scene.cycle=0;scene.visible=[];scene.loopUntil=p.ended?0:options.loop?Infinity:0}
 resetSceneAt(p.position);syncStageTimeline();syncStageTransport();drawScene();
}
async function seekStage(seconds){
 if(!playback?.visual)return;
 const resume=running||playback.loading;pauseStage();setStagePosition(seconds);
 // The right endpoint is the stopped final frame, including in loop mode.
 if(resume&&!playback.ended)await resumeStage();
}
byId('stageTransport').onclick=()=>{if(running)pauseStage();else return resumeStage()};
for(const [id,seconds] of [['stageBack10',-10],['stageBack1',-1],['stageForward1',1],['stageForward10',10]])byId(id).onclick=()=>seekStage(Math.max(0,stageTime())+seconds);
function beginStageScrub(){
 if(stageScrub||!playback?.visual)return;
 stageScrub={resume:running||playback.loading};pauseStage();
}
function finishStageScrub(){
 if(!stageScrub)return;
 const resume=stageScrub.resume;stageScrub=null;syncStageTimeline();
 if(resume&&playback?.visual&&!playback.ended)return resumeStage();
}
byId('stageSeek').onpointerdown=beginStageScrub;
byId('stageSeek').oninput=e=>{beginStageScrub();setStagePosition(Number(e.target.value))};
byId('stageSeek').onchange=byId('stageSeek').onpointerup=byId('stageSeek').onpointercancel=byId('stageSeek').onblur=finishStageScrub;
function setSceneHud(show){
 const hud=byId('stageHud');hud.dataset.hidden=String(!show);hud.inert=!show;hud.setAttribute('aria-hidden',String(!show));
 document.documentElement.classList.toggle('scene-hud-hidden',!show);
 byId('scene').tabIndex=show?-1:0;
 if(!show)byId('scene').focus?.();
 drawScene();
}
function stageKeyboardHit(e){
 const canvas=byId('scene'),rect=canvas.getBoundingClientRect(),height=canvas.clientHeight;
 if(!height||!rect.height)return false;
 const rotated=window.matchMedia?.('(orientation:portrait)').matches;
 const y=rotated?(rect.right-e.clientX)*height/rect.width:(e.clientY-rect.top)*height/rect.height;
 const keyH=Math.min(height*.3,Math.max(36,height*options.keyboardHeight/100));
 return y>=Math.max(20,height-keyH)&&y<=height;
}
let stageTap=null;
byId('stage').onpointerdown=e=>{stageTap={x:e.clientX,y:e.clientY}};
byId('stage').onpointercancel=()=>{stageTap=null};
byId('stage').onclick=e=>{
 const tap=stageTap;stageTap=null;
 if(!tap||Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>10)return;
 if(e.target.closest?.('button,input,label,select,a,[role="slider"]')||stageKeyboardHit(e))return;
 setSceneHud(byId('stageHud').dataset.hidden==='true');
};
byId('scene').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSceneHud(byId('stageHud').dataset.hidden==='true')}};
