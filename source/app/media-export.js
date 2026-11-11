import {Output,StreamTarget,Mp4OutputFormat,WebMOutputFormat,OggOutputFormat,AudioSampleSource,AudioSample,CanvasSource,canEncodeAudio,canEncodeVideo} from 'mediabunny';
window.NotkaMediaExport=function(api){
'use strict';
// Installed with the signed APK. The editor provides a small, explicit audio/render API.
const root=document.createElement('section');root.id='mediaExport';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','mediaTitle');
root.innerHTML=`<style>
#mediaExport{position:fixed;inset:0;z-index:20;background:#0009;display:grid;place-items:center;padding:12px}#mediaExport .media-card{width:min(460px,100%);max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);overflow:auto;background:var(--panel,#18211d);color:var(--text,#eee);border:1px solid var(--border,#45544a);border-radius:16px;padding:18px;box-sizing:border-box}#mediaExport header{display:flex;align-items:center;justify-content:space-between;margin:0 0 16px}#mediaExport h2{font-size:21px;margin:0}#mediaExport label{display:grid;gap:5px;margin:12px 0}#mediaExport input,#mediaExport select{font:inherit;box-sizing:border-box;min-width:0;width:100%;padding:9px;border:1px solid var(--border,#45544a);border-radius:8px;background:var(--raised,#26332b);color:inherit}#mediaExport .media-row{display:flex;gap:12px}#mediaExport .media-row>*{flex:1;min-width:0}#mediaExport button{font:inherit;padding:10px 16px;min-height:42px;border:1px solid var(--border,#45544a);border-radius:10px;background:var(--raised,#26332b);color:inherit}#mediaExport #mediaSave{background:var(--accent,#b9ef8a);color:var(--on,#172411);font-weight:600;width:100%}#mediaExport progress{width:100%;height:8px;accent-color:var(--accent,#b9ef8a)}#mediaStatus{white-space:pre-line;margin:12px 0 0;font-size:14px;overflow-wrap:anywhere}#mediaHint{white-space:pre-line;font-size:13px;opacity:.7;margin:10px 0}#mediaExport button:disabled{opacity:.45}#mediaExport .media-tabs{display:flex;gap:6px}#mediaExport .media-tabs button{flex:1}#mediaExport [aria-selected="true"]{border-color:var(--accent);color:var(--accent)}#mediaExport fieldset{min-width:0;border:1px solid var(--border);border-radius:10px;margin:14px 0;padding:8px 12px}#mediaExport legend{font-weight:600}#mediaExport input,#mediaExport select{min-height:42px}#mediaExport .media-card{overscroll-behavior:contain}#mediaExport [hidden]{display:none!important}
</style><div class="media-card"><header><h2 id="mediaTitle">Сохранить файл</h2><button id="mediaClose" aria-label="Закрыть сохранение">‹</button></header><div class="media-tabs" role="tablist" aria-label="Настройки экспорта"><button id="mediaBasicTab" role="tab" aria-controls="mediaBasic" aria-selected="true">Основные</button><button id="mediaAdvancedTab" role="tab" aria-controls="mediaAdvanced" aria-selected="false">Advanced</button></div><div id="mediaBasic" role="tabpanel" aria-labelledby="mediaBasicTab"><label>Название<input id="mediaName" maxlength="48" autocomplete="off"></label><div class="media-row"><label>Тип<select id="mediaKind"><option value="audio">Аудио</option><option value="video">Видео</option></select></label><label>Формат<select id="mediaFormat"></select></label></div></div><div id="mediaAdvanced" role="tabpanel" aria-labelledby="mediaAdvancedTab" hidden><fieldset id="mediaVideo"><legend>Видео</legend><div class="media-row"><label>Разрешение<select id="mediaSize"><option value="854">480p</option><option value="1280">720p</option><option value="1920">1080p</option></select></label><label>Кадры/с<select id="mediaFps"><option>24</option><option>25</option><option>30</option><option>50</option><option>60</option></select></label></div><label>Качество видео<select id="mediaQuality"><option value="compact">Компактное</option><option value="standard">Стандартное</option><option value="high">Высокое</option></select></label></fieldset><fieldset><legend>Звук</legend><div class="media-row"><label>Частота<select id="mediaRate"><option value="32000">32 кГц</option><option value="44100">44,1 кГц</option><option value="48000">48 кГц</option></select></label><label>Каналы<select id="mediaChannels"><option value="2">Стерео</option><option value="1">Моно</option></select></label></div><label id="mediaBitrateRow">Битрейт<select id="mediaBitrate"><option value="64000">64 кбит/с</option><option value="96000">96 кбит/с</option><option value="128000">128 кбит/с</option><option value="192000">192 кбит/с</option><option value="256000">256 кбит/с</option><option value="320000">320 кбит/с</option></select></label><label id="mediaDepthRow">Глубина WAV<select id="mediaDepth"><option value="16">16 бит</option><option value="24">24 бита</option></select></label></fieldset><button id="mediaReset">По умолчанию</button></div><p id="mediaHint"></p><button id="mediaSave">Сохранить</button><button id="mediaCancel" hidden>Отменить</button><progress id="mediaProgress" max="100" value="0" hidden></progress><p id="mediaStatus" role="status"></p></div>`;
document.body.append(root);
const el=id=>document.getElementById(id),status=text=>{el('mediaStatus').textContent=text;if(job?.background)api.host.backgroundProgress(Math.floor(Number(el('mediaProgress').value)||0))};
const choices=[
 {kind:'audio',label:'WAV · без сжатия',ext:'wav',mime:'audio/wav'},
 {kind:'audio',label:'M4A · AAC',ext:'m4a',audio:'aac',mime:'audio/mp4;codecs=mp4a.40.2'},
 {kind:'audio',label:'WebM · Opus',ext:'weba',audio:'opus',mime:'audio/webm;codecs=opus'},
 {kind:'audio',label:'OGG · Opus',ext:'ogg',audio:'opus',mime:'audio/ogg;codecs=opus'},
 {kind:'video',label:'MP4 · H.264',ext:'mp4',audio:'aac',video:'avc',mime:'video/mp4;codecs=avc1,mp4a.40.2'},
 {kind:'video',label:'WebM · VP8',ext:'webm',audio:'opus',video:'vp8',mime:'video/webm;codecs=vp8,opus'}
];
let job=null,formats=[],outside=false,revision=0;
const defaults={mediaSize:'1280',mediaFps:'30',mediaQuality:'standard',mediaRate:'48000',mediaChannels:'2',mediaBitrate:'192000',mediaDepth:'16'};
const allowed={mediaSize:['854','1280','1920'],mediaFps:['24','25','30','50','60'],mediaQuality:['compact','standard','high'],mediaRate:['32000','44100','48000'],mediaChannels:['1','2'],mediaBitrate:['64000','96000','128000','192000','256000','320000'],mediaDepth:['16','24']};
let stored={};try{stored=JSON.parse(localStorage.getItem('notka.mediaExport.v1'))||{}}catch{}
for(const id of Object.keys(defaults))el(id).value=allowed[id].includes(stored[id])?stored[id]:defaults[id];
function remember(){try{localStorage.setItem('notka.mediaExport.v1',JSON.stringify(Object.fromEntries(Object.keys(defaults).map(id=>[id,el(id).value]))))}catch{}}
function page(advanced){el('mediaBasic').hidden=advanced;el('mediaAdvanced').hidden=!advanced;for(const [id,selected] of [['mediaBasicTab',!advanced],['mediaAdvancedTab',advanced]]){el(id).setAttribute('aria-selected',String(selected));el(id).tabIndex=selected?0:-1}}
el('mediaBasicTab').onclick=()=>page(false);el('mediaAdvancedTab').onclick=()=>page(true);
for(const id of ['mediaBasicTab','mediaAdvancedTab'])el(id).onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const advanced=id==='mediaBasicTab';page(advanced);el(advanced?'mediaAdvancedTab':'mediaBasicTab').focus()}};
function settings(){const value=id=>allowed[id].includes(el(id).value)?el(id).value:defaults[id],width=Number(value('mediaSize')),height=width===854?480:width*9/16,frameRate=Number(value('mediaFps'));
 return {width,height,frameRate,sampleRate:Number(value('mediaRate')),channels:Number(value('mediaChannels')),audioBitrate:Number(value('mediaBitrate')),depth:Number(value('mediaDepth')),videoBitrate:Math.round(width*height*frameRate*({compact:.07,standard:.14,high:.24}[value('mediaQuality')]))};}
async function supported(f,o=settings()){try{return f.ext==='wav'||await canEncodeAudio(f.audio,{numberOfChannels:o.channels,sampleRate:o.sampleRate,bitrate:o.audioBitrate})&&(!f.video||await canEncodeVideo(f.video,{width:o.width,height:o.height,frameRate:o.frameRate,bitrate:o.videoBitrate}))}catch{return false}}
async function updateFormats(){
 const stamp=++revision,kind=el('mediaKind').value,old=formats[Number(el('mediaFormat').value)]?.ext;
 el('mediaSave').disabled=true;el('mediaVideo').hidden=kind!=='video';el('mediaHint').textContent='Проверка форматов…';
 const available=await Promise.all(choices.map(async f=>f.kind===kind&&await supported(f)?f:null));if(stamp!==revision||job)return;
 formats=available.filter(Boolean);el('mediaFormat').replaceChildren();
 for(const [i,f] of formats.entries()){const option=document.createElement('option');option.value=String(i);option.textContent=f.label;el('mediaFormat').append(option)}
 el('mediaFormat').value=String(Math.max(0,formats.findIndex(f=>f.ext===old)));el('mediaSave').disabled=!formats.length;updateHint();
}
function updateHint(){const f=formats[Number(el('mediaFormat').value)],o=settings(),wav=f?.ext==='wav';el('mediaBitrateRow').hidden=wav;el('mediaDepthRow').hidden=!wav;
 el('mediaHint').textContent=!f?'Нет доступного кодировщика для этих настроек. Попробуй 480p / 30 кадров или обнови Android System WebView.':(f.video?o.width+' × '+o.height+' · '+o.frameRate+' FPS · '+(o.videoBitrate/1e6).toFixed(1)+' Мбит/с\n':'')+(o.channels===2?'Стерео':'Моно')+' · '+(o.sampleRate/1000).toLocaleString('ru')+' кГц · '+(wav?o.depth+' бит':o.audioBitrate/1000+' кбит/с');
}
function busy(value){
 api.busy(value);for(const id of ['mediaName','mediaKind','mediaFormat',...Object.keys(defaults),'mediaSave','mediaReset'])el(id).disabled=value;
 el('mediaCancel').hidden=el('mediaProgress').hidden=!value;
}
function cancel(reason='Экспорт отменён.'){if(job){job.cancelled=true;job.reason=reason;job.abort?.();status(reason)}}
function back(){if(root.hidden)return false;if(job)cancel();else{root.hidden=true;el('stageExport').focus?.()}return true}
root.onpointerdown=e=>{outside=e.target===root};root.onpointercancel=()=>outside=false;root.onclick=e=>{if(outside&&e.target===root)back();outside=false};
el('mediaClose').onclick=back;el('mediaCancel').onclick=()=>cancel();el('mediaKind').onchange=updateFormats;el('mediaFormat').onchange=updateHint;for(const id of Object.keys(defaults))el(id).onchange=()=>{remember();return updateFormats()};
el('mediaReset').onclick=()=>{for(const id of Object.keys(defaults))el(id).value=defaults[id];remember();return updateFormats()};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!job?.background)cancel('Расчёт прерван: приложение было свёрнуто. Повтори сохранение.')});
window.addEventListener('pagehide',()=>{cancel();if(job?.background)api.host.backgroundEnd(false,'Сохранение прервано: редактор закрыт.')});
const check=j=>{if(j.background&&(!j.polledAt||Date.now()-j.polledAt>=200)){j.polledAt=Date.now();const state=api.host.backgroundStatus();if(state!=='running'&&state!=='committing'&&state!=='starting'){j.cancelled=true;j.reason=state.startsWith('error:')?state.slice(6):'Экспорт отменён.'}}if(j.cancelled)throw Error(j.reason||'Экспорт отменён.')};
function duration(track){let end=0;for(const lane of track.lanes){const settings=api.settings(lane,track);for(const n of lane.notes)if(n.volume&&settings.volume)end=Math.max(end,(n.start+n.len)*60/track.bpm/960+(settings.release??api.bank(lane.instrument).release)+.25)}return end}
// MessageChannel yields without a hidden page's timer clamping.
const yieldUI=()=>new Promise(resolve=>{if(typeof MessageChannel!=='function'){setTimeout(resolve,0);return}const channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve()};channel.port2.postMessage(0)});
async function writeAt(j,position,data){
 check(j);if(!Number.isSafeInteger(position)||position<0||position+data.length>256*1024*1024)throw Error('Файл превышает 256 МБ. Уменьши качество или длительность.');
 for(let i=0;i<data.length;i+=32768){check(j);const part=data.subarray(i,i+32768);let raw='';for(let k=0;k<part.length;k++)raw+=String.fromCharCode(part[k]);if(!api.host.writeExport(position+i,btoa(raw)))throw Error('Не удалось записать файл. Проверь свободное место.');j.bytes=Math.max(j.bytes,position+i+part.length)}
}
// Render bounded windows at the selected rate, keeping the editor's instrument
// voices and compressor warm-up. Do not resample an already quantized 32 kHz WAV.
async function renderPcm(j,track,frames,write){
 const {sampleRate:rate,channels}=j.options,secondsPerTick=60/track.bpm/960;
 const events=track.lanes.flatMap(lane=>lane.notes.map((note,variant)=>({note,variant,bank:api.bank(lane.instrument),settings:api.settings(lane,track)}))).sort((a,b)=>a.note.start-b.note.start);
 let cursor=0,active=[];
 for(let frame=0;frame<frames;frame+=rate*8){
  check(j);const count=Math.min(rate*8,frames-frame),warm=Math.min(frame,rate),begin=(frame-warm)/rate,end=(frame+count)/rate;
  while(cursor<events.length&&events[cursor].note.start*secondsPerTick<end)active.push(events[cursor++]);
  active=active.filter(e=>(e.note.start+e.note.len)*secondsPerTick+(e.settings.release??e.bank.release)>begin);
  const Context=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  if(!Context)throw Error('Для сохранения звука обнови Android System WebView.');
  const context=new Context(channels,count+warm,rate),gain=context.createGain(),limiter=context.createDynamicsCompressor();gain.gain.value=.65;gain.connect(limiter);limiter.connect(context.destination);
  for(const {note,bank,settings,variant} of active){const start=note.start*secondsPerTick;api.voice(context,gain,bank,settings,note.pitch,Math.max(0,start-begin),note.len*secondsPerTick,note.volume,Math.max(0,begin-start),variant)}
  const buffer=await new Promise((resolve,reject)=>{context.oncomplete=e=>resolve(e.renderedBuffer);try{const promise=context.startRendering();if(promise?.then)promise.then(resolve,reject)}catch(e){reject(e)}});
  check(j);const data=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));
  for(let offset=0;offset<count;offset+=2048){check(j);const size=Math.min(2048,count-offset),pcm=new Float32Array(size*channels);
   for(let i=0;i<size;i++)for(let c=0;c<channels;c++)pcm[i*channels+c]=Math.max(-1,Math.min(1,data[c][warm+offset+i]));
   await write(pcm);if(offset%16384===0)await yieldUI();
  }
 }
}
function waveHeader(frames,o){const size=frames*o.channels*o.depth/8,bytes=new Uint8Array(44),v=new DataView(bytes.buffer),text=(at,s)=>{for(let i=0;i<s.length;i++)bytes[at+i]=s.charCodeAt(i)};
 text(0,'RIFF');v.setUint32(4,36+size+(size%2),true);text(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,o.channels,true);v.setUint32(24,o.sampleRate,true);v.setUint32(28,o.sampleRate*o.channels*o.depth/8,true);v.setUint16(32,o.channels*o.depth/8,true);v.setUint16(34,o.depth,true);text(36,'data');v.setUint32(40,size,true);return bytes;
}
function pcmBytes(pcm,depth){const stride=depth/8,bytes=new Uint8Array(pcm.length*stride),view=new DataView(bytes.buffer),limit=2**(depth-1);
 for(let i=0;i<pcm.length;i++){const value=Math.max(-1,Math.min(1,pcm[i])),n=Math.round(value*(value<0?limit:limit-1)),at=i*stride;if(depth===16)view.setInt16(at,n,true);else{bytes[at]=n&255;bytes[at+1]=(n>>8)&255;bytes[at+2]=(n>>16)&255}}return bytes;
}
async function renderFile(j,track,format,frames){
 const o=j.options,video=!!format.video,{width,height,frameRate:fps,sampleRate:rate,channels}=o,prelude=video?Math.round(api.travel()*rate):0,total=frames+prelude,totalFrames=Math.ceil(total/rate*fps);
 let output,canvas,wake,finished=false,audio,visual,frame=0,sample=0,blocks=0;
 const events=track.lanes.flatMap(lane=>lane.notes.map((n,variant)=>({...n,variant,lane:lane._index,instrument:lane.instrument,instrumentId:lane.instrumentId}))).sort((a,b)=>a.start-b.start);
 const scene={...api.layout(events),events,next:0,visible:[],sec:60/track.bpm/960,last:events.reduce((v,n)=>Math.max(v,n.start+n.len),0),loopUntil:0,exporting:true};
 try{
  if(!await supported(format,o))throw Error('Этот формат или качество недоступны. Выбери другие настройки.');check(j);
  if(!j.background&&navigator.wakeLock?.request)navigator.wakeLock.request('screen').then(lock=>{if(finished)lock.release().catch(()=>{});else wake=lock}).catch(()=>{});
  const container=format.ext==='mp4'||format.ext==='m4a'?new Mp4OutputFormat({fastStart:false}):format.ext==='ogg'?new OggOutputFormat():new WebMOutputFormat();
  output=new Output({format:container,target:new StreamTarget(new WritableStream({write:({position,data})=>writeAt(j,position,data)}),{chunked:true,chunkSize:65536})});
  audio=new AudioSampleSource({codec:format.audio,bitrate:o.audioBitrate});output.addAudioTrack(audio);
  if(video){canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.style.cssText='position:fixed;left:-10000px;top:0;width:'+width+'px;height:'+height+'px;pointer-events:none';root.append(canvas);visual=new CanvasSource(canvas,{codec:format.video,bitrate:o.videoBitrate,keyFrameInterval:2});output.addVideoTrack(visual,{frameRate:fps})}
  await output.start();check(j);
  async function pcm(bytes){
   for(let offset=0;offset<bytes.length;offset+=2048*channels){
    check(j);const part=bytes.subarray(offset,offset+2048*channels),count=part.length/channels;
    // Await every encoder submission: neither sound nor frames outrun the writer.
    const chunk=new AudioSample({data:part,format:'f32',numberOfChannels:channels,sampleRate:rate,timestamp:sample/rate});
    try{await audio.add(chunk)}finally{chunk.close()}sample+=count;
    while(video&&frame<totalFrames&&frame/fps<sample/rate){check(j);api.render(canvas,scene,frame/fps-prelude/rate);await visual.add(frame/fps,Math.min(1/fps,total/rate-frame/fps));frame++;if(frame%4===0)await yieldUI()}
    const percent=Math.min(99,sample/total*100);el('mediaProgress').value=percent;status('Расчёт · '+Math.floor(percent)+'%');if(++blocks%8===0)await yieldUI();
   }
  }
  for(let n=0;n<prelude;n+=2048)await pcm(new Float32Array(Math.min(2048,prelude-n)*channels));
  await renderPcm(j,track,frames,pcm);
  check(j);audio.close();visual?.close();status('Сборка файла…');await output.finalize();check(j);if(!j.bytes)throw Error('Кодировщик не создал файл. Выбери другой формат.');
 }finally{
  finished=true;if(output&&output.state!=='finalized')await output.cancel().catch(()=>{});canvas?.remove();if(wake)await wake.release().catch(()=>{});
 }
}
async function save(){
 if(job)return;const format=formats[Number(el('mediaFormat').value)],name=el('mediaName').value.trim();
 if(!format)return;
 if(!name||name.length>48||name.startsWith('.')||/[\/\\:*?"<>|\u0000-\u001f\u007f]/.test(name)){status('Введи название до 48 символов без знаков пути.');return}
 const j=job={cancelled:false,bytes:0,chunks:0,background:false,options:settings()};let success=false,finalMessage='Экспорт отменён.';busy(true);el('mediaProgress').value=0;
 try{
  if(typeof api.host.backgroundBegin==='function'){
   if(!api.host.backgroundBegin(name)){j.foreignJob=true;throw Error('Не удалось запустить фоновое сохранение.')}j.background=true;status('Подготовка фонового сохранения…');
   const started=Date.now();while(api.host.backgroundStatus()==='starting'){check(j);if(Date.now()-started>15000)throw Error('Фоновая служба не запустилась. Повтори сохранение.');await new Promise(resolve=>setTimeout(resolve,50))}check(j);
  }
  api.stop();const {track,folder}=api.snapshot();track.lanes=track.lanes.map((l,i)=>({...l,_index:i})).filter(l=>!l.muted&&l.notes.some(n=>n.volume>0)&&api.settings(l,track).volume>0);
  if(!track.lanes.length)throw Error('Нет звучащих нот для сохранения.');
  status('Подготовка звуков…');for(const id of new Set(track.lanes.map(l=>l.instrument))){check(j);await api.prepare(id)}check(j);
  const seconds=duration(track),frames=Math.ceil(seconds*j.options.sampleRate);
  if(!Number.isSafeInteger(frames)||frames<=0)throw Error('Некорректная длительность трека.');
  const dataSize=frames*j.options.channels*j.options.depth/8;
  if(format.ext==='wav'&&44+dataSize+(dataSize%2)>256*1024*1024)throw Error('WAV превышает 256 МБ. Выбери сжатый формат или сократи трек.');
  if(!api.host.beginExport())throw Error('Не удалось создать файл. Проверь свободное место.');
  if(format.ext==='wav'){
   await writeAt(j,0,waveHeader(frames,j.options));
   await renderPcm(j,track,frames,async pcm=>{check(j);await writeAt(j,j.bytes,pcmBytes(pcm,j.options.depth));const p=Math.min(99,j.bytes/(44+dataSize)*100);el('mediaProgress').value=p;status('Сохранение · '+Math.round(p)+'%')});
   if(dataSize%2)await writeAt(j,j.bytes,new Uint8Array(1));
  }
  else await renderFile(j,track,format,frames);
  check(j);status('Завершение…');const file=name+'-'+Date.now()+'.'+format.ext;
  if(j.background&&!api.host.backgroundCommit()){check(j);throw Error('Фоновое сохранение остановлено.')}
  if(!api.host.finishExport(file))throw Error('Не удалось сохранить файл. Проверь свободное место.');
  success=true;finalMessage='Файл сохранён';el('mediaProgress').value=100;status('Готово: '+file+'\n'+folder);
 }catch(e){if(!j.foreignJob)api.host.cancelExport();finalMessage=j.cancelled?j.reason||'Экспорт отменён.':e.message||'Не удалось сохранить файл.';status(finalMessage)}
 finally{if(j.background)api.host.backgroundEnd(success,finalMessage);job=null;busy(false);el('mediaSave').disabled=!formats.length}
}
el('mediaSave').onclick=save;
return {open(){if(job)return;api.stop();root.hidden=false;page(false);el('mediaName').value=api.snapshot().name.slice(0,48);status('');updateFormats();el('mediaClose').focus()},back};

};
