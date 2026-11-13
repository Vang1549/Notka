function stop(mute=true){
 stopLibraryAudition();cancelInstrumentHold();
 generation++;clearInterval(timer);endScene();playback=null;running=false;current=-1;
 if(mute)for(const sources of voices)silenceVoice(sources);
 controls();paintSoon();syncStageTransport();
}
async function play(mode='visible'){
 if(importJob)return;
 if(running){stop();return}
 finishGesture();clearSelection();
 const visual=mode==='visual',origin=mode==='visible'?ticks(x):0;
 const preparation=diagnostics.enabled?diagnostics.now():0,events=[];
 for(const [laneIndex,lane] of lanes.entries())if(!lane.muted){
  const instrument=laneInstrument(lane),settings=prepareVoiceSettings(instrument.settings);
  for(const [variant,note] of lane.notes.entries())if(note.start+note.len>origin)events.push({...note,variant,lane:laneIndex,instrument:lane.instrument||'vsco-piano-1',instrumentId:instrument.id,settings});
 }
 events.sort((a,b)=>a.start-b.start);if(diagnostics.enabled)diagnostics.operation('playPreparation',diagnostics.now()-preparation);
 if(!events.length){byId('status').textContent='От левого края сетки дальше нет звучащих нот. Нажми |▶, чтобы сыграть с начала.';return}
 byId('status').textContent='';
 const token=++generation;running=true;controls();paintSoon();
 if(visual){byId('stage').hidden=false;setSceneHud(true);sceneMode(true);syncStageTransport();byId('leaveStage').focus?.()}
 try{
  await unlock();
  await Promise.all([...new Set(events.map(n=>n.instrument))].map(prepareInstrument));
  if(token!==generation)return;
  const sec=60/bpm/PPQ,start=audio.currentTime+(visual?sceneTravel():.045),last=events.reduce((end,n)=>Math.max(end,n.start+n.len),0);
  const p=playback={events,origin,start,sec,last,visual,paused:false,position:0,cycle:0,next:0,loopUntil:visual&&options.loop?Infinity:0};
  if(visual){beginScene(events,start,sec,last,p.loopUntil);syncStageTransport();syncStageTimeline()}
  startPlaybackTimer(p);

 }catch(e){diagnostics.error('playback',e);if(token===generation){audioFail();byId('status').textContent=e.message||'Звук недоступен.'}}
}
function pulsePlayback(p){
 if(playback!==p||!running||p.paused)return;
 const {origin,start,sec,last,visual}=p;
   const pulseStart=diagnostics.enabled?diagnostics.now():0,now=audio.currentTime,period=last*sec;
   if(visual&&p.cycle<Math.floor((now-start)/period)){p.cycle=Math.min(p.loopUntil,Math.max(0,Math.floor((now-start)/period)));p.next=0}
   let events=p.cycle===0&&p.seekEvents?p.seekEvents:p.events,scheduled=0;
   while(scheduled<512){
    if(p.next>=events.length){if(p.cycle>=p.loopUntil)break;p.cycle++;p.next=0;events=p.events}
    if(p.cycle>p.loopUntil)break;
    const n=events[p.next],on=Math.max(n.start,origin),when=start+p.cycle*period+(on-origin)*sec,off=start+p.cycle*period+(n.start+n.len-origin)*sec;
    if(when>now+.12)break;
    const at=Math.max(when,now);
    // Keep the original envelope length and skip audio already elapsed before this start.
    if(off>at){const voice=instrumentNote(n.instrument,n.pitch,at,n.len*sec,n.volume,n.settings,n.variant,Math.max(0,at-(off-n.len*sec)));if(voice){voice.playback=p;voice.cycle=p.cycle}}
    p.next++;scheduled++;
   }
   const elapsed=Math.max(0,(now-start)/sec),cycle=visual?Math.min(p.loopUntil,Math.floor(elapsed/last)):0;
   current=origin+elapsed-cycle*last;
   if(elapsed>=(p.loopUntil+1)*last-origin){if(visual)pauseStage(true);else stop(false);return}
   if(diagnostics.enabled)diagnostics.operation('audioScheduler',diagnostics.now()-pulseStart);
   if(visual){syncStageTimeline();return;}
   if(pixels(current)<x||pixels(current)>=x+w){x=pixels(current);paintSoon()}else paintCursor();
}
function startPlaybackTimer(p){clearInterval(timer);timer=setInterval(()=>pulsePlayback(p),32);pulsePlayback(p)}
