// Opt-in diagnostics: bounded metadata only, never note data or track names.
const diagnostics=(()=>{
 let enabled=false,overlay=false,frame=0,last=0,epoch=0,frames=0,slow=0,maxFrame=0,renderFrames=0,renderMs=0,renderMax=0,lastPersist=0;
 const now=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
 const report={format:'notka.diagnostics.1',editor:'0.83',startedAt:null,updatedAt:null,samples:[],errors:[],operations:{},summary:{frames:0,slowFrames:0,maxFrameMs:0}};
 const host=typeof NotkaPlayer!=='undefined'?NotkaPlayer:null;
 const round=n=>Math.round(n*100)/100;
 function operation(name,ms){if(!enabled)return;const o=report.operations[name]||(report.operations[name]={count:0,totalMs:0,maxMs:0});o.count++;o.totalMs=round(o.totalMs+ms);o.maxMs=round(Math.max(o.maxMs,ms))}
 function error(kind,value){
  if(!enabled)return;
  report.errors.push({at:new Date().toISOString(),kind,message:String(value?.message||value||'Неизвестная ошибка').slice(0,400),stack:String(value?.stack||'').slice(0,1800)});
  if(report.errors.length>50)report.errors.shift();
  if(now()-lastPersist>=5000)persist();
 }
 function persist(){
  if(!enabled)return;
  report.updatedAt=new Date().toISOString();lastPersist=now();
  try{return host?.diagnosticsStore?.(JSON.stringify(report))===true}catch{return false}
 }
 function sample(ms){
  let audioBytes=0;for(const bank of instrumentCache.values())for(const s of bank.samples)audioBytes+=(s.buffer.length||0)*(s.buffer.numberOfChannels||1)*4;
  const jsHeap=typeof performance!=='undefined'&&performance.memory?.usedJSHeapSize;
  const row={at:Date.now(),mode:running?(playback?.visual?'player':'playback'):'editor',fps:round(frames*1000/ms),slowFrames:slow,maxFrameMs:round(maxFrame),drawFps:round(renderFrames*1000/ms),drawMeanMs:renderFrames?round(renderMs/renderFrames):0,drawMaxMs:round(renderMax),notes:lanes.reduce((n,l)=>n+l.notes.length,0),lanes:lanes.length,voices:voices.size,audioBytes,...(Number.isFinite(jsHeap)?{jsHeapBytes:jsHeap}:{})};
  report.samples.push(row);if(report.samples.length>600)report.samples.shift();
  if(overlay){const el=byId('diagnosticsHud');el.hidden=false;el.textContent=(row.mode==='player'?'Плеер '+row.drawFps+' FPS · отрисовка '+row.drawMaxMs:'Экран '+row.fps+' FPS · кадр '+row.maxFrameMs)+' мс\nЗвук '+(audioBytes/1048576).toFixed(1)+' МБ · голосов '+row.voices+(Number.isFinite(jsHeap)?' · JS '+(jsHeap/1048576).toFixed(1)+' МБ':'')}
  frames=slow=maxFrame=renderFrames=renderMs=renderMax=0;
 }
 function tick(ms){
  if(!enabled)return;
  if(!document.hidden){
   if(last){const dt=ms-last;frames++;report.summary.frames++;if(dt>50){slow++;report.summary.slowFrames++}maxFrame=Math.max(maxFrame,dt);report.summary.maxFrameMs=round(Math.max(report.summary.maxFrameMs,dt))}
   last=ms;if(!epoch)epoch=ms;
   if(ms-epoch>=1000){sample(ms-epoch);epoch=ms;if(now()-lastPersist>=30000)persist()}
  }else{last=epoch=0;frames=slow=maxFrame=renderFrames=renderMs=renderMax=0}
  frame=requestAnimationFrame(tick);
 }
 function start(){
  try{const config=JSON.parse(host?.diagnosticsConfig?.()||'{}');enabled=config.enabled===true;overlay=enabled&&config.overlay===true}catch{}
  if(!enabled)return;
  if(typeof performance!=='undefined'&&performance.now)operation('webViewReady',performance.now());
  report.startedAt=new Date().toISOString();report.userAgent=typeof navigator!=='undefined'?navigator.userAgent:'';
  report.screen={width:window.innerWidth||0,height:window.innerHeight||0,dpr:window.devicePixelRatio||1};
  window.addEventListener('error',e=>error('javascript',e.error||e.message));
  window.addEventListener('unhandledrejection',e=>error('promise',e.reason));
  persist();frame=requestAnimationFrame(tick);
 }
 return {start,now,persist,error,operation,suspend(){last=epoch=0;frames=slow=maxFrame=renderFrames=renderMs=renderMax=0;persist()},get enabled(){return enabled},draw(ms){if(enabled){renderFrames++;renderMs+=ms;renderMax=Math.max(renderMax,ms)}}};
})();
