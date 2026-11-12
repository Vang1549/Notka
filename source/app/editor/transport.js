function stop(mute=true){
 generation++;clearInterval(timer);endScene();playback=null;running=false;current=-1;
 if(mute)for(const sources of voices)silenceVoice(sources);
 controls();paintSoon();
}
async function play(mode='visible'){
 if(importJob)return;
 if(running){stop();return}
 finishGesture();clearSelection();
 const visual=mode==='visual',origin=mode==='visible'?ticks(x):0;
 const events=[];
 for(const [laneIndex,lane] of lanes.entries())if(!lane.muted){
  for(const [variant,note] of lane.notes.entries())if(note.start+note.len>origin)events.push({...note,variant,lane:laneIndex,instrument:lane.instrument||'vsco-piano-1',instrumentId:laneInstrument(lane).id,settings:{...laneInstrument(lane).settings}});
 }
 events.sort((a,b)=>a.start-b.start);
 if(!events.length){byId('status').textContent='От левого края сетки дальше нет звучащих нот. Нажми |▶, чтобы сыграть с начала.';return}
 byId('status').textContent='';
 const token=++generation;running=true;controls();paintSoon();
 if(visual){byId('stage').hidden=false;byId('stageHud').hidden=false;byId('scene').tabIndex=-1;sceneMode(true);byId('stageTransport').textContent='■';byId('stageTransport').setAttribute('aria-label','Остановить');byId('leaveStage').focus?.()}
 try{
  await unlock();
  await Promise.all([...new Set(events.map(n=>n.instrument))].map(prepareInstrument));
  if(token!==generation)return;
  const sec=60/bpm/PPQ,start=audio.currentTime+(visual?sceneTravel():.045),last=events.reduce((end,n)=>Math.max(end,n.start+n.len),0);
  const p=playback={start,sec,last,visual,cycle:0,next:0,loopUntil:visual&&options.loop?Infinity:0};
  if(visual)beginScene(events,start,sec,last,p.loopUntil);
  function pulse(){
   const now=audio.currentTime,period=last*sec;
   if(visual&&p.cycle<Math.floor((now-start)/period)){p.cycle=Math.min(p.loopUntil,Math.max(0,Math.floor((now-start)/period)));p.next=0}
   let scheduled=0;
   while(scheduled<512){
    if(p.next>=events.length){if(p.cycle>=p.loopUntil)break;p.cycle++;p.next=0}
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
   if(elapsed>=(p.loopUntil+1)*last-origin){stop(false);return}
   if(visual)return;
   if(pixels(current)<x||pixels(current)>=x+w){x=pixels(current);paintSoon()}else paintCursor();
  }
  timer=setInterval(pulse,32);pulse();
 }catch(e){if(token===generation){audioFail();byId('status').textContent=e.message||'Звук недоступен.'}}
}
