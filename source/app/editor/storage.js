const trackHost=typeof NotkaPlayer!=='undefined'&&typeof NotkaPlayer.writeDraft==='function'?NotkaPlayer:null;
const songHost=trackHost&&typeof trackHost.songList==='function'?trackHost:null;
const panelHint='Для файлов и автосохранения обнови APK через настройки стартовой панели.';
let draftTimer=0,draftPending=false,trackStarted=false,fileBusy=false,pendingTrack=null;
function encodeTrack(draft=false){
 reconcileRack();return JSON.stringify({format:'notka.track',version:3,ppq:PPQ,bpm,division,noteDivision,viewDivision,activeLane,lanes,instruments:projectInstruments,scene:cleanSceneOptions(options),instrumentSources:instrumentReferences(lanes),...(draft&&songFile?{draftFile:songFile}:{})});
}
function readTrack(raw){
 const started=diagnostics.enabled?diagnostics.now():0;
 try{
 if(!raw)throw Error('Файл пуст, слишком велик или недоступен.');
 const t=JSON.parse(raw),integer=Number.isSafeInteger;
 if(t?.format!=='notka.track'||![1,2,3].includes(t.version)||t.ppq!==PPQ||!integer(t.bpm)||t.bpm<40||t.bpm>220||
  !divisions.includes(t.division)||
  ![t.noteDivision,t.viewDivision].every(value=>value===undefined||divisions.includes(value)))throw Error('Неизвестный формат трека.');
 const list=t.version===1?[{name:'Дорожка 1',muted:false,notes:t.notes}]:t.lanes;
 const active=t.version===1?0:t.activeLane;
 if(!Array.isArray(list)||!list.length||!integer(active)||active<0||active>=list.length)throw Error('Неверный список дорожек.');
 const cleanLanes=list.map(lane=>{
  if(!lane||typeof lane.name!=='string'||!lane.name.trim()||lane.name.length>48||
   typeof lane.muted!=='boolean'||(lane.ghost!==undefined&&typeof lane.ghost!=='boolean')||!Array.isArray(lane.notes))throw Error('Некорректная дорожка.');
  const instrument=normalizeInstrument(lane.instrument);
  if(typeof instrument!=='string'||(!instrumentById(instrument)&&!/^lib-[a-z0-9-]{1,43}$/.test(instrument)))throw Error('Неизвестный инструмент дорожки. Обнови редактор.');
  return {name:lane.name,muted:lane.muted,ghost:lane.ghost===true,instrument,instrumentId:lane.instrumentId,notes:readNotes(lane.notes)};
 });
 let rack=[];
 if(t.version===3){
  if(!Array.isArray(t.instruments)||!t.instruments.length||t.instruments.length>128)throw Error('Неверный набор инструментов проекта.');
  const ids=new Set();rack=t.instruments.map(i=>{
   if(!i||typeof i.id!=='string'||!/^inst-[a-z0-9-]{1,40}$/.test(i.id)||ids.has(i.id)||typeof i.name!=='string'||!i.name.trim()||i.name.length>48||typeof i.source!=='string'||(!instrumentById(i.source)&&!/^lib-[a-z0-9-]{1,43}$/.test(i.source)))throw Error('Некорректный инструмент проекта.');
   ids.add(i.id);return {id:i.id,source:i.source,name:i.name.trim(),settings:soundSettings(i.settings,true)};
  });
  for(const lane of cleanLanes)if(!rack.some(i=>i.id===lane.instrumentId&&i.source===lane.instrument))throw Error('Дорожка ссылается на отсутствующий инструмент.');
 }else for(const lane of cleanLanes){
  let item=rack.find(i=>i.source===lane.instrument);
  if(!item){item={id:'inst-'+(rack.length+1),source:lane.instrument,name:instrumentById(lane.instrument)?.name||'Инструмент '+(rack.length+1),settings:soundSettings()};rack.push(item)}
  lane.instrumentId=item.id;
 }
 return {bpm:t.bpm,division:t.division,noteDivision:t.noteDivision??0,viewDivision:t.viewDivision??0,activeLane:active,lanes:cleanLanes,instruments:rack,scene:cleanSceneOptions(t.scene)};
 }catch(e){diagnostics.error('trackParse',e);throw e}finally{if(diagnostics.enabled)diagnostics.operation('trackParse',diagnostics.now()-started)}
}
function readNotes(notes){
 const integer=Number.isSafeInteger;
 const clean=notes.map(n=>{
  if(!n||!integer(n.start)||n.start<0||!integer(n.len)||n.len<1||!integer(n.start+n.len)||
   !integer(n.pitch)||n.pitch<lowestPitch||n.pitch>highestPitch||!integer(n.volume)||n.volume<0||n.volume>100)
   throw Error('Некорректная нота.');
  return {start:n.start,len:n.len,pitch:n.pitch,volume:n.volume};
 });
 return clean;
}
const draftInterval=60000;
function scheduleDraft(delay=draftInterval){
 if(!draftTimer&&draftPending&&trackHost)draftTimer=setTimeout(()=>{draftTimer=0;flushDraft()},delay);
}
function flushDraft(force=false){
 if(!draftPending||!trackHost)return;
 // Closing popovers and releasing sliders must not bypass the minute interval.
 if(draftTimer&&!force)return;
 clearTimeout(draftTimer);draftTimer=0;
 if(gesture?.n){scheduleDraft(1000);return}
 const started=diagnostics.enabled?diagnostics.now():0;
 try{
  if(trackHost.writeDraft(encodeTrack(true))){draftPending=false;if(diagnostics.enabled)diagnostics.operation('autosave',diagnostics.now()-started);return}
  diagnostics.error('autosave','Не удалось записать автокопию.');
 }catch(e){diagnostics.error('autosave',e)}
 byId('status').textContent='Не удалось записать автокопию. Проверь свободное место.';
 scheduleDraft();
}
function trackChanged(){trackStarted=true;draftPending=true;scheduleDraft()}
function applyTrack(t){
 stop();finishGesture(true);contacts.clear();pinch=null;clearSelection();templateNote=null;
 songFile=t.songFile||null;projectInstruments=t.instruments;lanes=t.lanes;activeLane=t.activeLane;score=lanes[activeLane].notes;renderLanes();
 options=cleanSceneOptions(t.scene);scenePreviewLayout=null;syncSceneControls();
 bpm=t.bpm;division=t.division;noteDivision=t.noteDivision;viewDivision=t.viewDivision;
 byId('noteSize').value=String(noteDivision);byId('gridDivision').value=String(viewDivision);byId('snap').value=String(division);
 x=0;
 if(score.length){let first=score[0];for(const n of score)if(n.start<first.start)first=n;y=clampY((highestPitch-first.pitch+.5)*row-h/2)}
 trackStarted=true;byId('status').textContent='Трек загружен.';
 if(t.presetName){
  const preset=presetSongs.find(p=>p.name===t.presetName),missing=[...new Set(lanes.map(l=>l.instrument))].filter(id=>instrumentById(id)?.remote&&!downloadedInstruments.has(id));
  if(missing.length)byId('status').textContent='Трек загружен. Скачай в инструментах: '+missing.map(id=>instrumentById(id)?.name||preset?.instruments?.[id]||id).join(', ')+'.';
 }
 trackChanged();controls();paintSoon();closePrefs();
}
function trackMessage(message){byId('trackStatus').textContent=message}
function presentTrack(raw,file=null,presetName=null){
 const t=readTrack(raw);t.songFile=file;t.presetName=presetName;
 if(!trackStarted){applyTrack(t);return}
 pendingTrack=t;byId('replaceTrack').hidden=false;
 trackMessage('Заменить открытый трек?');
}
function recoverDraft(){
 try{
  const raw=trackHost?.readDraft();if(!raw)throw Error('Автокопии пока нет.');
  const t=JSON.parse(raw);
  // Only an old local draft inherits the pre-0.55 device-wide appearance.
  if(t.scene===undefined)try{t.scene=cleanSceneOptions(JSON.parse(trackHost.readSceneOptions?.()||localStorage.getItem('notka.scene')||'{}'))}catch{}
  presentTrack(JSON.stringify(t),t.draftFile||null);
 }
 catch(e){trackMessage(e.message)}
}
function trackActions(){
 byId('saveAs').hidden=!songFile;byId('saveAs').disabled=byId('saveTrack').disabled=byId('loadFile').disabled=byId('lastTrack').disabled=fileBusy||!trackHost;
 byId('exportTrack').disabled=fileBusy;byId('closePrefs').disabled=byId('loadTrack').disabled=fileBusy;
}
async function importTrack(){
 if(!trackHost||fileBusy)return;
 fileBusy=true;trackActions();pendingTrack=null;byId('replaceTrack').hidden=true;
 try{
  if(!trackHost.pickTrack(false))throw Error('Не удалось открыть выбор файла.');
  let result;
  while(!(result=trackHost.trackResult()))await new Promise(resolve=>setTimeout(resolve,200));
  if(result==='cancelled'){trackMessage('Импорт отменён.');return}
  presentTrack(trackHost.readDocument());
 }catch(e){trackMessage(e instanceof SyntaxError?'Это не файл трека «Нотки».':e.message)}
 finally{fileBusy=false;trackActions()}
}
// Compact built-in notes keep signed editions within older launchers' size limit.
const presetSongs=[{"id":"memory","name":"Memory","instruments":{"lib-mda-grand-1":"Grand Piano · MDA"},"track":{"format":"notka.track","version":2,"ppq":960,"bpm":150,"division":4,"noteDivision":0,"viewDivision":0,"activeLane":1,"lanes":[{"name":"Дорожка 1","muted":false,"ghost":true,"instrument":"lib-mda-grand-1","notes":[[0,1200,60,100],[960,1200,67,100],[1920,1200,65,100],[2880,1200,60,100],[3840,1200,64,100],[5280,1200,64,100],[6720,1200,65,100],[8640,1200,60,100],[9600,1200,65,100],[10560,1200,60,100],[11520,1200,64,100],[12960,1200,64,100],[14400,1200,65,100],[15360,1200,60,100],[16320,1200,67,100],[17280,1200,65,100],[18240,1200,60,100],[19200,1200,64,100],[20640,1200,64,100],[22080,1200,65,100],[24000,1200,60,100],[24960,1200,65,100],[25920,1200,69,100],[26880,1200,67,100],[28320,1200,65,100],[29760,960,67,100],[30720,1200,60,100],[31680,1200,67,100],[32640,1200,65,100],[33600,1200,60,100],[34560,1200,64,100],[36000,1200,64,100],[37440,1200,65,100],[39360,1200,60,100],[40320,1200,65,100],[41280,1200,60,100],[42240,1200,64,100],[43680,1200,64,100],[45120,1200,65,100],[46080,1200,60,100],[47040,1200,67,100],[48000,1200,65,100],[48960,1200,60,100],[49920,1200,64,100],[51360,1200,64,100],[52800,1200,65,100],[54720,1200,60,100],[55680,1200,65,100],[56640,1200,69,100],[57600,1200,67,100],[59040,1200,65,100],[60480,960,67,100]]},{"name":"Дорожка 2","muted":false,"ghost":false,"instrument":"vsco-piano-1","notes":[[960,1440,53,100],[2880,1440,53,100],[4800,1440,53,100],[6720,1440,53,100],[8640,1440,53,100],[10560,1440,53,100],[12480,1440,53,100],[14400,1440,53,100],[16320,1440,53,100],[18240,1440,53,100],[20160,1440,53,100],[22080,1440,53,100],[24000,1440,53,100],[25920,1440,53,100],[27840,1440,53,100],[29760,1440,53,100],[31680,1440,52,100],[33600,1440,52,100],[35520,1440,52,100],[37440,1440,52,100],[39360,1440,52,100],[41280,1440,52,100],[43200,1440,52,100],[45120,1440,52,100],[47040,1440,52,100],[48960,1440,52,100],[50880,1440,52,100],[52800,1440,52,100],[54720,1440,57,100],[56640,1440,57,100],[58560,1440,57,100],[60480,960,57,100]]}]}}];
for(const preset of presetSongs)for(const lane of preset.track.lanes)lane.notes=lane.notes.map(([start,len,pitch,volume])=>({start,len,pitch,volume}));
let songNames=[],songFile=null,pendingSongDelete=null;
function cancelSongDelete(){pendingSongDelete=null;byId('songDeleteConfirm').hidden=true}
function askSongDelete(file){if(fileBusy||!songNames.includes(file))return;pendingTrack=null;byId('replaceTrack').hidden=true;pendingSongDelete=file;byId('songDeleteName').textContent='Удалить «'+file.slice(0,-6)+'»?';byId('songDeleteConfirm').hidden=false;byId('songDeleteConfirm').scrollIntoView?.({block:'nearest'})}
byId('cancelSongDelete').onclick=cancelSongDelete;
byId('confirmSongDelete').onclick=()=>{
 const file=pendingSongDelete;if(!file||fileBusy)return;
 if(typeof songHost?.deleteSong!=='function'){trackMessage('Для удаления треков установи APK 0.48.');return}
 try{if(!songHost.deleteSong(file))throw Error('Не удалось удалить трек.');songNames=songNames.filter(f=>f!==file);if(songFile===file){songFile=null;trackChanged()}cancelSongDelete();renderSongs();trackMessage('Трек удалён.')}catch(e){trackMessage(e.message)}
};
const folderHint=()=>songHost.publicSongs()?'Папка: Загрузки/Notka':'Папка приложения: files/Download/Notka';
const songUpdateHint='Для списка треков и сохранения по имени обнови APK «Нотки» до 0.25 или новее.';
function renderSongs(){
 const list=byId('songList'),query=byId('songQuery').value.trim().toLowerCase();
 list.replaceChildren();
 for(const file of songNames){
  const name=file.slice(0,-6);
  if(!name.toLowerCase().includes(query))continue;
  const row=document.createElement('div');row.className='song-row';const button=document.createElement('button');button.className='button';button.textContent=name;
  button.onclick=()=>{
   pendingTrack=null;byId('replaceTrack').hidden=true;
   cancelSongDelete();try{presentTrack(songHost.openSong(file),file)}
   catch(error){trackMessage(error instanceof SyntaxError?'Файл повреждён.':error.message)}
  };const remove=document.createElement('button');remove.className='button song-remove';remove.innerHTML='<svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg>';remove.setAttribute('aria-label','Удалить '+name);remove.onclick=()=>askSongDelete(file);row.append(button,remove);list.append(row);
 }
 for(const preset of presetSongs){
  if(!preset.name.toLowerCase().includes(query))continue;
  const button=document.createElement('button');button.className='button';button.textContent=preset.name+' · Предустановленный';
  button.onclick=()=>{
   if(fileBusy)return;
   cancelSongDelete();pendingTrack=null;byId('replaceTrack').hidden=true;
   try{presentTrack(JSON.stringify(preset.track),null,preset.name)}catch(error){trackMessage(error.message)}
  };list.append(button);
 }
 if(!list.children.length)list.textContent=query?'Совпадений нет.':'Сохранённых треков пока нет.';
}
byId('saveAs').onclick=()=>{
 if(!songHost){trackMessage(songUpdateHint);return}
 byId('prefHome').hidden=true;byId('songSave').hidden=false;byId('prefTitle').textContent=songFile?'Сохранить как…':'Сохранить';
 byId('songName').value='';trackMessage(folderHint());byId('songName').focus?.();
};
byId('saveTrack').onclick=()=>{
 if(!songFile){byId('saveAs').onclick();return}
 if(!songHost?.overwriteSong){trackMessage('Для записи в открытый файл обнови APK до 0.27.');return}
 writeSong(songFile,true);
};
function songNameFile(value){
 const name=value.trim().replace(/\.notka$/i,'').trim();
 if(!name||name.startsWith('.')||/[\/\\:*?"<>|\u0000-\u001f\u007f]/.test(name)||name.length>80||new Blob([name]).size>240)throw Error('Введи название до 80 символов без знаков пути.');
 return name+'.notka';
}
byId('confirmSave').onclick=()=>{try{writeSong(songNameFile(byId('songName').value),false)}catch(e){trackMessage(e.message)}};
function writeSong(file,overwrite,exiting=false){
 const message=text=>exiting?byId('exitStatus').textContent=text:trackMessage(text);
 try{
  const data=encodeTrack();if(new Blob([data]).size>=8388608)throw Error('Трек превышает лимит в 8 МБ.');
  const result=overwrite?songHost.overwriteSong(file,data):songHost.saveSong(file,data);
  if(result===2){message('Такое название уже есть. Введи другое имя, чтобы сохранить отдельную копию.');return}
  if(result!==1)throw Error('Не удалось записать трек. Проверь свободное место.');
  songFile=file;trackChanged();
  if(exiting)finishExit(true);else{showPrefs(false);message('Сохранено: '+file)}
 }catch(e){message(e.message)}
}
byId('songName').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();byId('confirmSave').onclick()}};
byId('loadTrack').onclick=()=>{
 cancelSongDelete();
 byId('prefHome').hidden=true;byId('trackChoices').hidden=false;byId('prefTitle').textContent='Загрузить';
 byId('songQuery').value='';byId('songQuery').hidden=true;byId('songSearchButton').setAttribute('aria-expanded','false');
 songNames=[];byId('songSearchButton').hidden=false;renderSongs();
 if(!songHost){trackMessage(songUpdateHint);return}
 try{
  const names=JSON.parse(songHost.songList());
  if(!Array.isArray(names))throw Error();
  songNames=names.filter(f=>typeof f==='string'&&f.endsWith('.notka')).sort((a,b)=>a.localeCompare(b,'ru'));
  renderSongs();trackMessage(folderHint());
 }catch{trackMessage('Не удалось прочитать папку с треками.')}
};
byId('songSearchButton').onclick=()=>{
 const input=byId('songQuery');input.hidden=!input.hidden;byId('songSearchButton').setAttribute('aria-expanded',String(!input.hidden));
 if(input.hidden){input.value='';renderSongs()}else input.focus?.();
};
byId('songQuery').oninput=()=>{cancelSongDelete();renderSongs()};
byId('loadFile').onclick=importTrack;
byId('lastTrack').onclick=recoverDraft;
byId('replaceTrack').onclick=()=>{if(pendingTrack)applyTrack(pendingTrack);pendingTrack=null};

