// Library auditions own their download and voice, never the track or its rack.
let libraryAuditionSerial=0,libraryAuditionId=null,libraryAuditionJob=null,libraryAuditionVoice=null;
let instrumentHoldTimer=null,instrumentHoldPointer=null;
const auditionButtons=new Map();
const earIcon='<svg width="23" height="23" viewBox="0 0 28 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10a7 7 0 0 1 14 0c0 4-4 4-5 7s-2 4-4 4a3 3 0 0 1-3-3M7 10a3 3 0 0 1 6 0c0 2-3 2-3 4M20 8a7 7 0 0 1 0 8M23 4a12 12 0 0 1 0 16"/></svg>';
function syncLibraryAudition(){
 for(const [id,button] of auditionButtons){
  const active=id===libraryAuditionId;
  button.setAttribute('aria-pressed',String(active));
  button.setAttribute('aria-busy',String(active&&!!libraryAuditionJob));
  button.setAttribute('aria-label',(active?'Остановить предпрослушивание':'Послушать')+' · '+instrumentById(id).name);
  button.title=active?'Остановить предпрослушивание':'Послушать';
 }
}
function stopLibraryAudition(){
 libraryAuditionSerial++;libraryAuditionId=null;
 if(libraryAuditionJob){libraryAuditionJob.cancelled=true;libraryAuditionJob=null}
 const voice=libraryAuditionVoice;libraryAuditionVoice=null;
 if(voice)silenceVoice(voice);
 syncLibraryAudition();
}
function readAudition(raw,meta){
 if(typeof raw!=='string'||raw.length!==meta.bytes)throw Error('Повреждено предпрослушивание.');
 const data=verifySound(raw);
 if(data.format!=='notka.preview.1'||data.id!==meta.asset||data.mime!=='audio/mpeg'||!Number.isFinite(data.duration)||data.duration<=0||data.duration>10||typeof data.data!=='string'||data.data.length>240000||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.data))throw Error('Повреждено предпрослушивание.');
 return data;
}
function cacheAudition(meta,raw){
 // A small persistent LRU stores at most five short files; full banks are separate.
 let ids=[];try{ids=JSON.parse(catalogHost.soundRead('preview-cache')||'[]')}catch{}
 if(!Array.isArray(ids))ids=[];
 ids=ids.filter(x=>typeof x==='string'&&/^preview-[a-z0-9-]{1,39}$/.test(x)&&x!==meta.asset);
 if(!catalogHost.soundWrite(meta.asset,raw))return;
 ids.push(meta.asset);while(ids.length>5)catalogHost.soundDelete(ids.shift());
 catalogHost.soundWrite('preview-cache',JSON.stringify(ids));
}
async function auditionInstrument(id){
 const def=instrumentById(id);if(!def||running||document.hidden||byId('instrumentSheet').hidden)return;
 if(libraryAuditionId===id){stopLibraryAudition();soundMessage('');return}
 instrumentRequest++;previewSerial++;for(const voice of voices)silenceVoice(voice);
 stopLibraryAudition();const token=libraryAuditionSerial,epoch=generation;
 const valid=()=>token===libraryAuditionSerial&&epoch===generation&&!running&&!document.hidden&&!byId('instrumentSheet').hidden;
 libraryAuditionId=id;syncLibraryAudition();soundMessage('');
 try{
  await unlock();if(!valid())return;
  let sources;
  if(availableInstrument(def)){
   const bank=await prepareInstrument(id);if(!valid())return;
   sources=createInstrumentVoice(audio,master,bank,{},def.demo||60,audio.currentTime+.006,1.8,80);
  }else{
   const meta=(remoteAlternatives.get(id)||def).preview;
   if(!catalogHost||!meta)throw Error('Предпрослушивание доступно после установки этого инструмента.');
   let raw=catalogHost.soundRead(meta.asset),data;
   try{data=readAudition(raw,meta)}catch{if(raw)catalogHost.soundDelete(meta.asset)}
   if(!data){
    const job={cancelled:false};libraryAuditionJob=job;syncLibraryAudition();soundMessage('Загружаем предпрослушивание…');
    const result=await fetchSound(meta.asset,job,30000,'preview');if(!valid())return;
    if(result.hash!==meta.sha256)throw Error('Повреждено предпрослушивание.');
    raw=result.raw;data=readAudition(raw,meta);
   }
   if(!valid())return;cacheAudition(meta,raw);
   const binary=atob(data.data),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   const buffer=await new Promise((resolve,reject)=>audio.decodeAudioData(bytes.buffer,resolve,reject));if(!valid())return;
   if(!Number.isFinite(buffer.duration)||buffer.duration>10)throw Error('Повреждено предпрослушивание.');
   const source=audio.createBufferSource();source.buffer=buffer;source.connect(master);source.start();source.stop(audio.currentTime+buffer.duration);
   sources=[source];sources.dispose=()=>source.disconnect();
  }
  libraryAuditionJob=null;libraryAuditionVoice=sources;syncLibraryAudition();soundMessage('');
  if(sources)sources[0].onended=()=>{if(libraryAuditionVoice!==sources)return;sources.dispose?.();libraryAuditionVoice=null;libraryAuditionId=null;syncLibraryAudition()};
  else{libraryAuditionId=null;syncLibraryAudition()}
 }catch(e){if(valid()){stopLibraryAudition();soundMessage(e.message||'Не удалось послушать инструмент.')}}
}
function cancelInstrumentHold(){clearTimeout(instrumentHoldTimer);instrumentHoldTimer=null;instrumentHoldPointer=null}
function bindInstrumentHold(button,def){
 let skip=false;
 button.title=def.name+' · удерживай для удаления';
 button.onclick=()=>{if(skip){skip=false;return}selectInstrument(def.id)};
 button.onpointerdown=e=>{
  if(e.button!==undefined&&e.button!==0)return;
  cancelInstrumentHold();skip=false;instrumentHoldPointer={id:e.pointerId,x:e.clientX,y:e.clientY};
  instrumentHoldTimer=setTimeout(()=>{cancelInstrumentHold();skip=true;stopLibraryAudition();askInstrumentDelete(def.id)},550);
 };
 button.onpointermove=e=>{const p=instrumentHoldPointer;if(p&&p.id===e.pointerId&&Math.hypot(e.clientX-p.x,e.clientY-p.y)>8)cancelInstrumentHold()};
 button.onpointerup=button.onpointercancel=button.onlostpointercapture=()=>cancelInstrumentHold();
 button.oncontextmenu=e=>{e.preventDefault();cancelInstrumentHold();skip=true;stopLibraryAudition();askInstrumentDelete(def.id)};
 button.onkeydown=e=>{if(e.key==='Delete'){e.preventDefault();stopLibraryAudition();askInstrumentDelete(def.id)}};
}
