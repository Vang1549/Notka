
'use strict';
const byId=id=>document.getElementById(id);
const names=['До','До♯','Ре','Ре♯','Ми','Фа','Фа♯','Соль','Соль♯','Ля','Ля♯','Си'];
const pitchName=p=>names[p%12]+(Math.floor(p/12)-1);
const instruments=[{"id":"vsco-piano-1","short":"П","name":"Пианино","gm":0,"asset":"piano","demo":60,"bytes":5523797},{"id":"lib-mda-grand-1","short":"ГП","name":"Grand Piano · MDA","gm":0,"asset":"bank-mda-grand-1","demo":60,"bytes":7683540},{"id":"lib-floe-musicbox-1","short":"Шк","name":"Шкатулка · FrozenPlain","gm":10,"asset":"musicbox-floe","demo":60,"bytes":21145294}];
const visibleInstrumentIds=new Set(instruments.map(d=>d.id));
const legacyInstruments={'classic':'vsco-piano-1','vsco-violin-1':'lib-vsco-violin-1','vsco-flute-1':'lib-vsco-flute-1','vsco-bass-1':'lib-vsco-bass-1'};
const normalizeInstrument=id=>id===undefined?'vsco-piano-1':(Object.prototype.hasOwnProperty.call(legacyInstruments,id)?legacyInstruments[id]:id);
const instrumentById=id=>instruments.find(item=>item.id===id);
// Static SVG paths keep marks sharp and theme-aware without image/font downloads.
const instrumentIcons={
 piano:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 4v9h2V4m5 0v9h2V4M8 13v7m7-7v7"/>',
 violin:'<path d="m15 8 5-5m-3-1 5 5M13 6l5 5-3 3c-2-1-3 0-3 2 0 3-4 6-7 3s0-7 3-7c2 0 3-1 2-3zM5 19l9-9m-1 12 8-13"/>',
 flute:'<path d="m3 19 15-15 3 3L6 22zM16 6l3 3M6 17l1 1m2-4 1 1m2-4 1 1M18 3l1-1 3 3-1 1"/>',
 bass:'<path d="M12 6V2h3M11 6h3v5c0 2 4 2 4 5 0 4-3 5-6 5s-6-1-6-5c0-3 4-3 4-5V8zM12 7v15M9 16h6"/>',
 musicbox:'<path d="M3 12h18v8H3zM3 12l4-8h10l4 8M8 16h8M12 4v5"/><path d="M15 2v5l3-1V1z"/>',
 trumpet:'<path d="M2 10h13l6-5v14l-6-5H5m-2-6v8m4-2v3c0 3 7 3 7 0v-7M8 7v5m3-5v5m3-5v5M7 7h2m1 0h2m1 0h2"/>'
};
const instrumentIconPrograms={0:'piano',1:'piano',2:'piano',3:'piano',4:'piano',5:'piano',10:'musicbox',32:'bass',40:'violin',43:'bass',56:'trumpet',73:'flute'};
function paintInstrumentMark(el,def,width){
 const icon=def?instrumentIconPrograms[def.gm]||'':'';
 if(el.dataset.instrumentIcon!==icon){
  el.dataset.instrumentIcon=icon;
  el.innerHTML=icon?'<svg class="note-instrument" viewBox="0 0 24 24" preserveAspectRatio="xMinYMax meet" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+instrumentIcons[icon]+'</svg>':'';
 }
 const mark=def?.short||'Ин';
 setView(el.dataset,'instrument',icon?'':width<16?Array.from(mark)[0]:mark);
 setView(el,'title',def?.name||'Неизвестный инструмент');
}

const soundDefaults={volume:100,pan:0,transpose:0,fine:0,attack:null,release:null,delay:0,hold:0,decay:0,sustain:100,filter:'off',cutoff:16000,resonance:.7,start:0,end:100,reverse:false,loop:'original',velocity:1};
const soundBounds={volume:[0,150],pan:[-100,100],transpose:[-24,24],fine:[-100,100],attack:[0,5],release:[.005,10],delay:[0,2],hold:[0,5],decay:[0,10],sustain:[0,100],cutoff:[20,20000],resonance:[.1,20],start:[0,99.9],end:[.1,100],velocity:[.25,3]};
function soundSettings(raw={},strict=false){
 const result={...soundDefaults};
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Неверные настройки инструмента.');
 for(const k of Object.keys(result))if(Object.prototype.hasOwnProperty.call(raw,k)){
  const v=raw[k],bounds=soundBounds[k];
  if((k==='attack'||k==='release')&&v===null){result[k]=null;continue}
  const valid=bounds?typeof v==='number'&&Number.isFinite(v)&&v>=bounds[0]&&v<=bounds[1]&&(k!=='transpose'||Number.isInteger(v)):k==='reverse'?typeof v==='boolean':(k==='filter'?['off','lowpass','highpass','bandpass']:['original','off']).includes(v);
  if(!valid){if(strict)throw Error('Некорректный параметр инструмента: '+k);continue}result[k]=v;
 }
 if(result.start>=result.end)throw Error('Начало сэмпла должно быть раньше конца.');
 return result;
}
let projectInstruments=[{id:'inst-1',source:'vsco-piano-1',name:'Пианино',settings:soundSettings()}];
function laneInstrument(lane,rack=projectInstruments){return rack.find(i=>i.id===lane.instrumentId&&i.source===lane.instrument)||rack.find(i=>i.source===lane.instrument)||{source:lane.instrument||'vsco-piano-1',name:instrumentById(lane.instrument)?.name||'Инструмент',settings:soundSettings()}}
function addProjectInstrument(source,copy=null){
 if(projectInstruments.length>=128)throw Error('В проекте может быть до 128 инструментов.');
 let number=1;while(projectInstruments.some(i=>i.id==='inst-'+number))number++;
 const base=copy?.name||instrumentById(source)?.name||'Инструмент';let name=base,n=2;
 while(projectInstruments.some(i=>i.name===name))name=base.slice(0,42)+' '+n++;
 const item={id:'inst-'+number,source,name,settings:soundSettings(copy?.settings)};projectInstruments.push(item);return item;
}
function reconcileRack(){
 for(const lane of lanes){let item=laneInstrument(lane);if(!item.id)item=addProjectInstrument(item.source);lane.instrumentId=item.id}
}
const sourceUsed=id=>projectInstruments.some(i=>i.source===id)||lanes.some(l=>l.instrument===id);

const sampleHost=typeof NotkaPlayer!=='undefined'&&typeof NotkaPlayer.instrumentData==='function'?NotkaPlayer:null;
// Only app-owned source URLs may become links; track files cannot supply URLs.
const instrumentSources=new Map([['lib-floe-musicbox-1',{name:'Music Box Suite Free · FrozenPlain',url:'https://www.frozenplain.com/product/music-box-suite-free'}]]);
const builtinPresence=new Map(),pendingBuiltinData=new Map(),remoteAlternatives=new Map();
const importHost=sampleHost&&['pickInstrument','instrumentResult','readInstrumentPackage','commitInstrumentImport','cancelInstrumentImport','hasImportedInstrument','deleteImportedInstrument'].every(k=>typeof sampleHost[k]==='function')?sampleHost:null;
const floeId='lib-floe-musicbox-1';
let sourceStep=0,sourceAway=false,importJob=null;
function importedMusicbox(){return !!importHost?.hasImportedInstrument()}
function saveSourceStep(){try{sampleHost?.soundWrite('musicbox-source-step',String(sourceStep))}catch{}}
function restoreSourceStep(){try{const saved=sampleHost?.soundRead('musicbox-source-step');sourceStep=saved==='1'||saved==='2'?2:0;if(sourceStep)saveSourceStep()}catch{}}
function sourceVisibility(){
 if(document.hidden){if(sourceStep===1)sourceAway=true;return}
 sourceResume();
}
function sourceResume(){
 let returned=sourceAway;try{returned=returned||sampleHost?.soundRead('musicbox-source-step')==='2'}catch{}
 if(sourceStep===1&&returned){sourceStep=2;sourceAway=false;saveSourceStep();renderMissingSounds();if(!byId('instrumentSheet').hidden)renderInstruments()}
}

function builtinAvailable(def){
 if(!['lib-mda-grand-1','lib-floe-musicbox-1'].includes(def.id))return true;
 if(!builtinPresence.has(def.id)){
  if(typeof sampleHost?.instrumentAvailable==='function'){builtinPresence.set(def.id,!!sampleHost.instrumentAvailable(def.asset));return builtinPresence.get(def.id)}
  let raw='';try{raw=sampleHost?.instrumentData(def.asset)||''}catch{}
  builtinPresence.set(def.id,!!raw);
  // Reuse the compatibility probe when decoding, without retaining it indefinitely.
  if(raw){pendingBuiltinData.set(def.id,raw);setTimeout(()=>pendingBuiltinData.delete(def.id),30000)}
 }
 return builtinPresence.get(def.id);
}
function downloadableInstrument(id){const def=instrumentById(id);return def&&!def.remote&&!builtinAvailable(def)?remoteAlternatives.get(id):def}
function instrumentReferences(trackLanes){return [...new Set(trackLanes.filter(l=>l.notes.length).map(l=>l.instrument))].filter(id=>instrumentSources.has(id)).map(id=>({id,...instrumentSources.get(id)}))}
function availableInstrument(def){return !!def&&(def.remote?downloadedInstruments.has(def.id):builtinAvailable(def))}
function authorLink(id){
 const source=instrumentSources.get(id),group=document.createElement('div'),link=document.createElement('a'),button=document.createElement('button');
 group.className='source-split';link.className='button source-link';link.href=source.url;link.rel='noopener noreferrer';link.textContent='Скачать ↗';
 link.setAttribute('aria-label','Скачать у автора · '+source.name);link.onclick=()=>{flushDraft();if(!sourceStep){sourceStep=1;sourceAway=false;saveSourceStep()}};
 button.className='button'+(sourceStep===2&&importHost?' import-ready':'');button.textContent='Импорт';button.setAttribute('aria-label','Импортировать Music Box Suite Free');
 button.disabled=sourceStep!==2||!importHost||!!importJob;button.onclick=()=>importMusicbox();
 group.append(link,button);return group;
}
function importReadError(raw){
 const messages={'!uri':'Не выбран файл пакета.','!access':'Нет доступа к файлу. Выбери его из «Загрузок».','!package-read':'Файл недоступен или превышает 16 МБ.','!package-save':'Нет места для временного пакета.','!zip':'Не удалось открыть архив пакета.','!template':'Ошибка импортёра. Переустанови APK.','!sample':'Ошибка чтения звуковой записи.','!license':'Ошибка чтения лицензии.','!contents':'Пакет неполный.','!bank-save':'Не удалось сохранить инструмент. Проверь свободное место.'};
 const code=String(raw||'!read').split(':')[0];
 if(code==='!read'&&typeof importHost?.importReaderVersion!=='function')return 'Для исправления чтения пакета обнови APK до 0.51.';
 return (messages[code]||'Не удалось прочитать пакет.')+' ['+String(raw||'!read').replace(/[^a-zA-Z0-9:!-]/g,'').slice(0,80)+']';
}
async function importMusicbox(){
 if(!importHost||importJob||fileBusy||sourceStep!==2)return;
 const job={cancelled:false};importJob=job;fileBusy=true;stop();flushDraft();
 const progress=byId('importStatus');byId('importProgress').hidden=false;progress.textContent='Выбери скачанный файл .floe-pkg';byId('cancelInstrumentImport').disabled=false;
 let message='';
 try{
  if(!importHost.pickInstrument())throw Error('Не удалось открыть выбор файла.');
  let result;
  while(!job.cancelled&&!(result=importHost.instrumentResult()))await new Promise(resolve=>setTimeout(resolve,250));
  if(job.cancelled||result==='cancelled')return;
  progress.textContent='Проверка пакета…';await new Promise(resolve=>setTimeout(resolve,30));
  if(job.cancelled)return;
  const raw=importHost.readInstrumentPackage();
  if(raw==='!unsupported')throw Error('Это не поддерживаемый пакет Music Box Suite Free. Скачай файл .floe-pkg по левой кнопке.');
  if(!raw||raw[0]==='!')throw Error(importReadError(raw));
  const data=JSON.parse(raw),def=instrumentById(floeId);checkBank(data,def);
  progress.textContent='Подготовка звука…';await unlock();
  let bank;
  try{bank=await decodeInstrumentBank(data,def,job)}catch(e){if(job.cancelled)return;throw Error('Не удалось прочитать FLAC. Обнови Android System WebView и повтори импорт.')}
  if(job.cancelled)return;
  if(!importHost.commitInstrumentImport())throw Error('Не удалось сохранить инструмент. Проверь свободное место.');
  instrumentCache.set(floeId,bank);builtinPresence.set(floeId,true);pendingBuiltinData.delete(floeId);
  message='Шкатулка импортирована.';
 }catch(e){message=e.message||'Не удалось импортировать инструмент.'}
 finally{
  importHost.cancelInstrumentImport();importJob=null;fileBusy=false;byId('importProgress').hidden=true;
  renderMissingSounds();renderInstruments();controls();trackActions();
  if(message){soundMessage(message);byId('status').textContent=message}
 }
}
byId('cancelInstrumentImport').onclick=()=>{if(importJob){importJob.cancelled=true;byId('cancelInstrumentImport').disabled=true;byId('importStatus').textContent='Отмена…'}};

function renderMissingSounds(){
 const box=byId('missingSounds');box.replaceChildren();
 const missing=[...new Set(lanes.filter(l=>l.notes.length).map(l=>l.instrument))].filter(id=>instrumentSources.has(id)&&!availableInstrument(instrumentById(id)));
 box.hidden=!missing.length;
 for(const id of missing){const text=document.createElement('p');text.textContent='Нет звука: '+instrumentById(id).name+'.';box.append(text,authorLink(id))}
 if(missing.length&&!importHost){const hint=document.createElement('p');hint.textContent='Для импорта установи APK 0.51.';box.append(hint)}
}
const newLane=name=>({name,muted:false,ghost:false,instrument:'vsco-piano-1',instrumentId:projectInstruments.find(i=>i.source==='vsco-piano-1')?.id,notes:[]});
let lanes=[newLane('Дорожка 1')],activeLane=0,score=lanes[0].notes;
const laneViews=new WeakMap(),voices=new Set();
// Keep the saved background preference; selecting a lane temporarily reveals it for editing.
const isBackground=lane=>lane.ghost&&lane!==lanes[activeLane];
function renderLanes(){
 if(!byId('laneSheet').hidden)renderLaneFlags();
 renderMissingSounds();
}
function chooseLane(index){
 if(running||index<0||index>=lanes.length)return;
 finishGesture(true);contacts.clear();pinch=null;clearSelection();templateNote=null;
 laneViews.set(lanes[activeLane],(y+h/2)/row);
 activeLane=index;score=lanes[index].notes;
 if(laneViews.has(lanes[index]))y=clampY(laneViews.get(lanes[index])*row-h/2);
 renderLanes();if(!byId('laneSheet').hidden)syncLaneSheet();controls();paintSoon();trackChanged();
}
byId('addLane').onclick=()=>{
 if(running)return;
 let number=lanes.length+1;
 const used=new Set(lanes.map(lane=>lane.name));
 while(used.has('Дорожка '+number))number++;
 lanes.push(newLane('Дорожка '+number));chooseLane(lanes.length-1);
};
function laneFlag(row,title,checked){
 const label=document.createElement('label'),input=document.createElement('input');
 input.type='checkbox';input.checked=checked;input.setAttribute('aria-label',title);
 label.append(input);row.append(label);
 return input;
}
let laneHold=null;
function cancelLaneHold(){if(laneHold)clearTimeout(laneHold.timer);laneHold=null}
function openLaneRename(index){
 if(running||byId('laneSheet').hidden)return;
 chooseLane(index);byId('laneList').hidden=true;byId('laneRename').hidden=false;byId('laneName').focus?.();byId('laneName').select?.();
}
function closeLaneRename(){
 cancelLaneDelete();byId('laneName').blur?.();flushDraft();byId('laneRename').hidden=true;byId('laneList').hidden=false;renderLaneFlags();
}
function renderLaneFlags(){
 cancelLaneHold();const list=byId('ghostChoices');list.replaceChildren();
 lanes.forEach((lane,i)=>{
  const row=document.createElement('div'),name=document.createElement('button'),icon=document.createElement('button');
  row.className='lane-flags'+(i===activeLane?' lane-current':'');
  icon.className='button lane-instrument';paintInstrumentMark(icon,instrumentById(laneInstrument(lane).source),24);
  icon.setAttribute('aria-label','Инструмент · '+lane.name+' · '+laneInstrument(lane).name);icon.setAttribute('aria-haspopup','dialog');
  icon.onclick=()=>{if(running)return;chooseLane(i);openLaneInstrument()};
  name.className='button lane-name';name.textContent=lane.name;name.setAttribute('aria-pressed',String(i===activeLane));name.title='Удерживайте, чтобы переименовать';
  let skip=false;
  name.onpointerdown=e=>{
   cancelLaneHold();skip=false;if(e.isPrimary===false||e.button>0)return;
   name.setPointerCapture?.(e.pointerId);const hold={x:e.clientX,y:e.clientY,timer:0};laneHold=hold;
   hold.timer=setTimeout(()=>{if(laneHold!==hold)return;skip=true;cancelLaneHold();openLaneRename(i)},1000);
  };
  name.onpointermove=e=>{if(laneHold&&Math.hypot(e.clientX-laneHold.x,e.clientY-laneHold.y)>10){skip=true;cancelLaneHold()}};
  name.onpointerup=cancelLaneHold;name.onpointercancel=()=>{skip=true;cancelLaneHold()};name.onlostpointercapture=cancelLaneHold;
  name.oncontextmenu=e=>e.preventDefault();name.onkeydown=e=>{if(e.key==='F2'){e.preventDefault();openLaneRename(i)}};
  name.onclick=()=>{cancelLaneHold();if(skip){skip=false;return}if(running)return;chooseLane(i);closeLane()};
  row.append(icon,name);
  const box=laneFlag(row,'Фон · '+lane.name,!!lane.ghost);box.className=i===activeLane?'deferred':'';
  box.onchange=()=>{lane.ghost=box.checked;controls();paintSoon();trackChanged()};
  const sound=laneFlag(row,'Звук · '+lane.name,!lane.muted);
  sound.onchange=()=>{lane.muted=!sound.checked;controls();trackChanged()};
  list.append(row);
 });
}
let pendingLaneDelete=null;
function cancelLaneDelete(){pendingLaneDelete=null;byId('laneDeleteConfirm').hidden=true}
byId('cancelLaneDelete').onclick=cancelLaneDelete;
function closeLane(){cancelLaneHold();closeLaneRename();flushDraft();byId('laneSheet').hidden=true;byId('editLane').focus?.()}
function syncLaneSheet(){
 const lane=lanes[activeLane];
 byId('laneName').value=lane.name;
 renderLaneFlags();byId('deleteLane').disabled=lanes.length===1;cancelLaneDelete();
}
byId('editLane').onclick=()=>{
 if(running)return;byId('laneRename').hidden=true;byId('laneList').hidden=false;syncLaneSheet();byId('laneSheet').hidden=false;byId('closeLane').focus?.();
};
byId('closeLane').onclick=()=>{if(!byId('laneRename').hidden)closeLaneRename();else closeLane()};
byId('finishLaneRename').onclick=closeLaneRename;
byId('laneName').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();closeLaneRename()}};
byId('laneName').oninput=e=>{
 const name=e.target.value.trim();cancelLaneDelete();
 if(name){lanes[activeLane].name=name;renderLanes();renderLaneFlags();trackChanged(true)}
};
byId('laneName').onblur=()=>{byId('laneName').value=lanes[activeLane].name};
byId('deleteLane').onclick=()=>{
 if(running||lanes.length===1)return;pendingLaneDelete=lanes[activeLane];
 byId('laneDeleteName').textContent='Удалить «'+pendingLaneDelete.name+'» вместе с нотами?';byId('laneDeleteConfirm').hidden=false;
};
byId('confirmLane').onclick=()=>{
 if(running||pendingLaneDelete!==lanes[activeLane]||lanes.length===1||byId('laneDeleteConfirm').hidden)return;
 const removing=activeLane;
 chooseLane(removing>0?removing-1:1);
 lanes.splice(removing,1);if(activeLane>removing)activeLane--;
 closeLane();renderLanes();controls();trackChanged();
};
