const exportHost=trackHost&&['beginExport','appendExport','finishExport','cancelExport'].every(k=>typeof trackHost[k]==='function')?trackHost:null;
let exportJob=null;
const editorVersion='0.83';
const exportBase=name=>name.trim().replace(/\.notka$/i,'').replace(/(?:\(v\d+(?:\.\d+)+\))+$/i,'').trim();
const exportRate=32000,exportLimit=256*1024*1024;
const exportText=s=>new Uint8Array(Array.from(unescape(encodeURIComponent(s)),c=>c.charCodeAt(0)));
const joinBytes=parts=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length}return out};
const numberBytes=(n,size,little=false)=>{const b=new Uint8Array(size);for(let i=0;i<size;i++){b[little?i:size-1-i]=n%256;n=Math.floor(n/256)}return b};
function midiVar(n){
 if(!Number.isSafeInteger(n)||n<0||n>0x0fffffff)throw Error('Слишком большой промежуток времени для MIDI.');
 const bytes=[n&127];while(n=Math.floor(n/128))bytes.unshift((n&127)|128);return bytes;
}
function makeMidi(track,title){
 if(track.lanes.length>15)throw Error('Для экспорта MIDI оставь не больше 15 непустых дорожек.');
 const meta=(kind,text)=>[255,kind,...midiVar(exportText(text).length),...exportText(text)];
 const chunk=body=>joinBytes([exportText('MTrk'),numberBytes(body.length,4),body]);
 const tempo=Math.round(60000000/track.bpm);
 const conductor=chunk(new Uint8Array([0,...meta(3,title),0,255,81,3,...numberBytes(tempo,3),0,255,88,4,4,2,24,8,0,255,47,0]));
 const tracks=track.lanes.map((lane,i)=>{
  const channel=i<9?i:i+1,def=instrumentById(lane.instrument),instance=laneInstrument(lane,track.instruments||projectInstruments),settings=instance.settings;
  if(!def)throw Error('Нет данных об инструменте дорожки «'+lane.name+'». Обнови каталог инструментов.');
  const parts=[new Uint8Array([0,...meta(3,lane.name),0,...meta(4,instance.name),0,0xb0|channel,0,0,0,0xb0|channel,32,0,0,0xc0|channel,def.gm,0,0xb0|channel,7,Math.round(Math.min(100,settings.volume)*127/100),0,0xb0|channel,10,Math.round((settings.pan+100)*127/200)])];
  const source=instrumentSources.get(lane.instrument);if(source)parts.push(new Uint8Array([0,...meta(1,source.name+' — '+source.url)]));
  const events=[];let end=0;
  for(const note of lane.notes){
   if(!note.volume||!settings.volume)continue;
   if(note.pitch+settings.transpose<0||note.pitch+settings.transpose>127)throw Error('Высота ноты после транспонирования выходит за диапазон MIDI.');
   end=Math.max(end,note.start+note.len);
   events.push({time:note.start,on:true,pitch:Math.max(0,Math.min(127,note.pitch+settings.transpose)),velocity:Math.max(1,Math.round(Math.pow(note.volume/100,settings.velocity)*127))},{time:note.start+note.len,on:false,pitch:Math.max(0,Math.min(127,note.pitch+settings.transpose)),velocity:0});
  }
  events.sort((a,b)=>a.time-b.time||Number(a.on)-Number(b.on)||a.pitch-b.pitch);
  let tick=0;
  for(const e of events){parts.push(new Uint8Array([...midiVar(e.time-tick),(e.on?0x90:0x80)|channel,e.pitch,e.velocity]));tick=e.time}
  parts.push(new Uint8Array([...midiVar(end-tick),255,47,0]));return chunk(joinBytes(parts));
 });
 return joinBytes([exportText('MThd'),numberBytes(6,4),numberBytes(1,2),numberBytes(tracks.length+1,2),numberBytes(PPQ,2),conductor,...tracks]);
}
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function crcUpdate(crc,bytes){for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return crc>>>0}
function exportCheck(job){if(job.cancelled)throw Error('Экспорт отменён.')}
async function exportWrite(job,bytes){
 for(let at=0;at<bytes.length;at+=32768){
  exportCheck(job);const part=bytes.subarray(at,at+32768);job.bytes+=part.length;
  if(job.bytes>exportLimit)throw Error('Экспорт превышает 256 МБ. Экспортируй MIDI или сократи число дорожек.');
  let binary='';for(const b of part)binary+=String.fromCharCode(b);
  if(!exportHost.appendExport(btoa(binary)))throw Error('Не удалось записать файл. Проверь свободное место.');
  if(++job.chunks%16===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
}
async function zipFile(job,name,generate){
 const filename=exportText(name),offset=job.bytes;
 await exportWrite(job,joinBytes([numberBytes(0x04034b50,4,true),numberBytes(20,2,true),numberBytes(0x808,2,true),new Uint8Array(4),numberBytes(33,2,true),new Uint8Array(12),numberBytes(filename.length,2,true),new Uint8Array(2),filename]));
 let crc=0xffffffff,size=0;
 const write=async bytes=>{crc=crcUpdate(crc,bytes);size+=bytes.length;await exportWrite(job,bytes)};
 await generate(write);crc=(crc^0xffffffff)>>>0;
 await exportWrite(job,joinBytes([numberBytes(0x08074b50,4,true),numberBytes(crc,4,true),numberBytes(size,4,true),numberBytes(size,4,true)]));
 job.entries.push(joinBytes([numberBytes(0x02014b50,4,true),numberBytes(20,2,true),numberBytes(20,2,true),numberBytes(0x808,2,true),new Uint8Array(4),numberBytes(33,2,true),numberBytes(crc,4,true),numberBytes(size,4,true),numberBytes(size,4,true),numberBytes(filename.length,2,true),new Uint8Array(12),numberBytes(offset,4,true),filename]));
}
async function zipFinish(job){
 const offset=job.bytes,central=joinBytes(job.entries);await exportWrite(job,central);
 await exportWrite(job,joinBytes([numberBytes(0x06054b50,4,true),new Uint8Array(4),numberBytes(job.entries.length,2,true),numberBytes(job.entries.length,2,true),numberBytes(central.length,4,true),numberBytes(offset,4,true),new Uint8Array(2)]));
}
function waveHeader(frames){return joinBytes([exportText('RIFF'),numberBytes(36+frames*4,4,true),exportText('WAVEfmt '),numberBytes(16,4,true),numberBytes(1,2,true),numberBytes(2,2,true),numberBytes(exportRate,4,true),numberBytes(exportRate*4,4,true),numberBytes(4,2,true),numberBytes(16,2,true),exportText('data'),numberBytes(frames*4,4,true)])}
// Render short windows with one second of compressor warm-up. Long songs never
// allocate a full-length AudioBuffer; stems use the same samples and timing.
async function renderWave(job,track,frames,write,label){
 await write(waveHeader(frames));
 const secondsPerTick=60/track.bpm/PPQ;
 const events=track.lanes.flatMap(lane=>lane.notes.map((note,variant)=>({note,variant,bank:instrumentCache.get(lane.instrument),settings:laneInstrument(lane,track.instruments||projectInstruments).settings}))).sort((a,b)=>a.note.start-b.note.start);
 let cursor=0,active=[];
 for(let frame=0;frame<frames;frame+=exportRate*8){
  exportCheck(job);const count=Math.min(exportRate*8,frames-frame),warm=Math.min(frame,exportRate),begin=(frame-warm)/exportRate,end=(frame+count)/exportRate;
  while(cursor<events.length&&events[cursor].note.start*secondsPerTick<end)active.push(events[cursor++]);
  active=active.filter(e=>(e.note.start+e.note.len)*secondsPerTick+(e.settings.release??e.bank.release)>begin);
  const Context=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  if(!Context)throw Error('Для WAV обнови Android System WebView. MIDI можно экспортировать отдельно.');
  const context=new Context(2,count+warm,exportRate),gain=context.createGain(),limiter=context.createDynamicsCompressor();gain.gain.value=.65;gain.connect(limiter);limiter.connect(context.destination);
  for(const {note,bank,settings,variant} of active){
   const start=note.start*secondsPerTick,length=note.len*secondsPerTick,elapsed=Math.max(0,begin-start),when=Math.max(0,start-begin);
   createInstrumentVoice(context,gain,bank,settings,note.pitch,when,length,note.volume,elapsed,variant);
  }
  const buffer=await new Promise((resolve,reject)=>{context.oncomplete=e=>resolve(e.renderedBuffer);try{const promise=context.startRendering();if(promise?.then)promise.then(resolve,reject)}catch(e){reject(e)}});
  exportCheck(job);const left=buffer.getChannelData(0),right=buffer.getChannelData(1),pcm=new Uint8Array(count*4),view=new DataView(pcm.buffer);
  for(let i=0;i<count;i++)for(let channel=0;channel<2;channel++){const value=Math.max(-1,Math.min(1,(channel?right:left)[i+warm]));view.setInt16(i*4+channel*2,Math.round(value*(value<0?32768:32767)),true)}
  await write(pcm);byId('exportStatus').textContent=label+' · '+Math.round((frame+count)*100/frames)+'%';
  await new Promise(resolve=>setTimeout(resolve,0));
 }
}
function exportBusy(busy){
 fileBusy=busy;trackActions();for(const id of ['exportMidi','exportAudio','exportName','exportMuted'])byId(id).disabled=busy;
 byId('exportNotka').disabled=busy||!songHost?.saveSong;byId('cancelExport').hidden=!busy;
}
byId('exportTrack').onclick=()=>{
 stop();flushDraft();byId('prefHome').hidden=true;byId('exportOptions').hidden=false;byId('prefTitle').textContent='Экспорт';
 byId('exportName').value=exportBase(songFile||'Мой трек').slice(0,48);byId('exportMuted').checked=false;
 byId('exportStatus').textContent=exportHost?'': 'Для экспорта установи APK 0.35 или новее.';
 byId('exportNotka').disabled=!songHost?.saveSong;byId('exportMidi').disabled=byId('exportAudio').disabled=!exportHost;
};
byId('cancelExport').onclick=()=>{if(exportJob){exportJob.cancelled=true;byId('exportStatus').textContent='Отмена…'}};
async function exportMusic(withAudio){
 const notka=withAudio==='notka';
 if(exportJob||(notka?!songHost?.saveSong:!exportHost))return;
 const name=notka?exportBase(byId('exportName').value):byId('exportName').value.trim();
 if(!name||name.startsWith('.')||/[\/\\:*?"<>|\u0000-\u001f\u007f]/.test(name)||name.length>48){byId('exportStatus').textContent='Введи название до 48 символов без знаков пути.';return}
 const job={cancelled:false,bytes:0,chunks:0,entries:[]};exportJob=job;exportBusy(true);
 try{
  stop();flushDraft();const original=encodeTrack();
  if(notka){
   const file=name+'(v'+editorVersion+').notka',result=songHost.saveSong(file,original);
   if(result!==1)throw Error(result===2?'Такая копия уже есть. Введи другое название.':'Не удалось сохранить копию.');
   byId('exportStatus').textContent='Готово: '+file+'\n'+folderHint();return;
  }
  const track=readTrack(original);
  track.lanes=track.lanes.filter(lane=>lane.notes.some(n=>n.volume>0)&&(!lane.muted||byId('exportMuted').checked));
  if(!track.lanes.length)throw Error('Нет звучащих нот для экспорта.');
  const midi=makeMidi(track,name);
  let frames=0;
  if(withAudio){
   byId('exportStatus').textContent='Подготовка звуков…';await unlock();
   for(const id of new Set(track.lanes.map(l=>l.instrument))){exportCheck(job);await prepareInstrument(id)}
   let seconds=0;for(const lane of track.lanes)for(const n of lane.notes)if(n.volume)seconds=Math.max(seconds,(n.start+n.len)*60/track.bpm/PPQ+(laneInstrument(lane,track.instruments).settings.release??instrumentCache.get(lane.instrument).release)+.25);
   frames=Math.ceil(seconds*exportRate);
   if(!Number.isSafeInteger(frames)||frames*4*(track.lanes.length+1)+midi.length+exportText(original).length+65536>exportLimit)throw Error('WAV займут больше 256 МБ. Экспортируй MIDI или сократи число дорожек.');
  }
  exportCheck(job);if(!exportHost.beginExport())throw Error('Не удалось создать файл экспорта.');
  if(withAudio){
   await zipFile(job,'Track.mid',write=>write(midi));
   await zipFile(job,'Original.notka',write=>write(exportText(original)));
   const map=track.lanes.map((lane,i)=>({file:'Tracks/'+String(i+1).padStart(2,'0')+' - '+lane.name.replace(/[\/\\:*?"<>|\u0000-\u001f\u007f]/g,'-')+'.wav',name:lane.name,instrument:laneInstrument(lane,track.instruments).name,instrumentId:lane.instrumentId,source:lane.instrument,settings:laneInstrument(lane,track.instruments).settings,originallyMuted:lane.muted}));
   await zipFile(job,'Tracks.json',write=>write(exportText(JSON.stringify({bpm:track.bpm,sampleRate:exportRate,tracks:map},null,2))));
   let readme='НОТКА — '+name+'\n\nTrack.mid — ноты всех экспортированных дорожек, темп и типы инструментов.\nMix.wav — общий звук. Tracks/ — отдельные дорожки с одинаковым началом и длительностью.\nTracks.json — соответствие файлов названиям дорожек. Original.notka — исходный проект со всеми дорожками.\n\nFL Studio: File > Import > MIDI file; включи Create one channel per track, отключи Realign events, чтобы сохранить начальную паузу. MIDI передаёт ноты, темп, панораму, громкость и транспонирование; огибающая, фильтр, реверс, обрезка и точная высота сэмплера сохраняются в Original.notka / Tracks.json и звуке WAV, но не в MIDI. Для нашего звучания перенеси WAV из Tracks в Playlist, все с нулевой позиции. Не включай одновременно MIDI-инструменты и WAV, иначе звук удвоится. WAV — готовое аудио, отдельные ноты в нём не редактируются.\n\nEmbers: открой Track.mid. Разделение на MIDI-дорожки сохранено; цвета настраиваются в Embers. Сам MIDI не содержит нашего звука. Mix.wav можно использовать как звуковую дорожку при монтаже видео; автоматический импорт WAV или банка инструментов в Embers не предусмотрен этим экспортом.\n\nWAV: PCM 16 bit, stereo, 32000 Hz, инструменты Нотки. Звук отрендерен отдельно; мастер-обработка и пересчёт могут немного отличаться от живого воспроизведения.\nИсточники звуков: VSCO 2 CE (CC0), MDA Piano / Paul Kellett (MIT), Music box / Joseph SARDIN (CC0). Сведения и лицензии: https://github.com/Vang1549/Notka/blob/main/dist/instrument-credits.txt\n';
   const sources=instrumentReferences(track.lanes);if(sources.length)readme+='\nВнешние инструменты:\n'+sources.map(s=>s.name+' — '+s.url).join('\n');
   await zipFile(job,'Readme.txt',write=>write(exportText(readme)));
   await zipFile(job,'Mix.wav',write=>renderWave(job,track,frames,write,'Общий звук'));
   for(let i=0;i<track.lanes.length;i++)await zipFile(job,map[i].file,write=>renderWave(job,{...track,lanes:[track.lanes[i]]},frames,write,'Дорожка '+(i+1)+'/'+track.lanes.length));
   await zipFinish(job);
  }else await exportWrite(job,midi);
  exportCheck(job);const stamp=new Date().toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15),file=name+'-'+stamp+(withAudio?'.zip':'.mid');
  if(!exportHost.finishExport(file))throw Error('Не удалось сохранить экспорт. Проверь свободное место.');
  byId('exportStatus').textContent='Готово: '+file+'\n'+folderHint();
 }catch(e){diagnostics.error('export',e);if(!notka)exportHost.cancelExport();byId('exportStatus').textContent=e.message||'Не удалось экспортировать трек.'}
 finally{exportJob=null;exportBusy(false)}
}
byId('exportNotka').onclick=()=>exportMusic('notka');byId('exportMidi').onclick=()=>exportMusic(false);byId('exportAudio').onclick=()=>exportMusic(true);
window.addEventListener('pagehide',()=>{if(exportJob){exportJob.cancelled=true;exportHost.cancelExport()}});

let mediaExport;
byId('stageExport').onclick=()=>{
 if(typeof NotkaPlayer.backgroundBegin!=='function'){alert('Для сохранения аудио и видео установи APK 0.57 или новее.');return}
 try{
  if(!mediaExport){const script=document.createElement('script');script.textContent=NotkaPlayer.mediaExportScript();document.body.append(script);script.remove();mediaExport=window.NotkaMediaExport({
   host:exportHost,snapshot:()=>({track:readTrack(encodeTrack()),name:exportBase(songFile||'Мой трек'),folder:folderHint()}),
   stop:()=>{stageScrub=null;if(playback?.visual)pauseStage();else stop();flushDraft()},busy:v=>{fileBusy=v;trackActions()},
   prepare:async id=>{if(!audio)await unlock();return prepareInstrument(id)},bank:id=>instrumentCache.get(id),
   settings:(lane,track)=>laneInstrument(lane,track.instruments).settings,voice:createInstrumentVoice,
   layout:keyLayout,render:renderScene,travel:sceneTravel,write:exportWrite,wave:renderWave
  })}
  mediaExport.open();
 }catch(e){console.error(e);alert('Не удалось открыть сохранение: '+e.message)}
};
