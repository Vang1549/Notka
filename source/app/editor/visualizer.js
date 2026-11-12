const sceneDefaults={loop:false,palette:'aurora',rangeMode:'auto',keyStart:48,keyCount:49,keyboardHeight:16,keyLabels:'c',guides:true,speed:1,stretch:1.25,noteWidth:78,roundness:22,noteStyle:'glass',colorMode:'lane',backdrop:'aurora',background:'#080e19',glow:true,glowAmount:40,sparks:true,sparkAmount:30,rays:28,rings:20,trails:15,keyLights:true,fps:30,quality:1.5};
const palettes={aurora:['#62dfc4','#a898ff','#ffbc79','#74bfff','#f794bc','#d9e59b'],ember:['#ffbc79','#ff7e76','#efcf8b','#f596b2'],ice:['#76d9ff','#8cabff','#8ff0dc','#bdc9ff'],iris:['#bca1ff','#f597d0','#81b5ff','#dcadff']};
const sceneBounds={keyStart:[0,116],keyCount:[12,88],keyboardHeight:[8,26],speed:[.5,3],stretch:[.25,2.5],noteWidth:[40,96],roundness:[0,50],glowAmount:[0,100],sparkAmount:[0,100],rays:[0,100],rings:[0,100],trails:[0,100]};
const sceneChoices={palette:Object.keys(palettes),rangeMode:['auto','manual'],keyLabels:['c','all','none'],noteStyle:['glass','solid','neon'],colorMode:['lane','instrument','single'],backdrop:['aurora','stars','plain'],fps:[30,60],quality:[1,1.5,2]};
function cleanSceneOptions(saved){
 const result={...sceneDefaults,colors:{}};
 if(!saved||typeof saved!=='object')return result;
 for(const k of Object.keys(sceneDefaults)){
  const value=saved[k];
  if(sceneBounds[k]&&typeof value==='number'&&Number.isFinite(value)){const [lo,hi]=sceneBounds[k];result[k]=Math.max(lo,Math.min(hi,value));if(!['speed','stretch'].includes(k))result[k]=Math.round(result[k])}
  else if(sceneChoices[k]?.includes(value))result[k]=value;
  else if(typeof sceneDefaults[k]==='boolean'&&typeof value==='boolean')result[k]=value;
  else if(k==='background'&&/^#[\da-f]{6}$/i.test(value))result[k]=value;
 }
 if(saved.speed===undefined&&[1.3,2.4,4].includes(saved.fall))result.speed=Math.max(.5,Math.min(3,3.6/saved.fall));
 result.keyCount=Math.min(result.keyCount,128-result.keyStart);
 if(saved.colors&&typeof saved.colors==='object')for(const [k,v] of Object.entries(saved.colors).slice(0,250))if(/^(lane-\d{1,4}|instrument-[a-z0-9-]{1,48}|single)$/.test(k)&&/^#[\da-f]{6}$/i.test(v))result.colors[k]=v;
 return result;
}
let options=cleanSceneOptions(null);
let scene=null,sceneFrame=0,prefReturn,scenePreviewLayout=null,playback=null;
const sceneTravel=()=>3.6/(options.speed*options.stretch);
function saveSceneOptions(){
 trackChanged();
}
function sceneColorKey(n){return options.colorMode==='single'?'single':options.colorMode==='instrument'?'instrument-'+(n.instrumentId||n.instrument):'lane-'+(n.lane||0)}
function sceneColor(n){
 const key=sceneColorKey(n);if(options.colors[key])return options.colors[key];
 const list=palettes[options.palette];
 const index=options.colorMode==='instrument'?Math.max(0,n.instrumentId?projectInstruments.findIndex(d=>d.id===n.instrumentId):instruments.findIndex(d=>d.id===n.instrument)):options.colorMode==='single'?0:n.lane||0;
 return list[index%list.length];
}
function renderSceneColors(){
 const list=byId('sceneColors');list.replaceChildren();const seen=new Set();
 lanes.forEach((lane,i)=>{
  const n={lane:i,instrument:lane.instrument||'vsco-piano-1',instrumentId:laneInstrument(lane).id},key=sceneColorKey(n);if(seen.has(key))return;seen.add(key);
  const label=document.createElement('label'),name=document.createElement('span'),input=document.createElement('input');
  name.textContent=options.colorMode==='single'?'Все ноты':options.colorMode==='lane'?lane.name:laneInstrument(lane).name;
  input.type='color';input.value=sceneColor(n);input.setAttribute('aria-label','Цвет · '+name.textContent);
  input.oninput=()=>{if(/^#[\da-f]{6}$/i.test(input.value)){options.colors[key]=input.value;refreshScenePreview()}};
  input.onchange=saveSceneOptions;label.append(name,input);list.append(label);
 });
}
function syncSceneControls(){
 for(const [k,defaultValue] of Object.entries(sceneDefaults)){
  const el=byId(k);if(typeof defaultValue==='boolean')el.checked=options[k];else el.value=String(options[k]);
  if(sceneBounds[k]&&!['keyStart','keyCount'].includes(k))byId(k+'Value').textContent=['speed','stretch'].includes(k)?Number(options[k].toFixed(2))+'×':options[k]+'%';
 }
 byId('manualRange').hidden=options.rangeMode!=='manual';byId('keyCount').max=String(Math.min(88,128-options.keyStart));
 syncLoopButton();renderSceneColors();
}
function refreshScenePreview(){if(scene)drawScene();drawScenePreview()}
let scenePresets=[],presetReady=false,presetAction=null,presetNaming=false;
function presetIndex(){const value=byId('presetChoice').value;return value===''?-1:Number(value)}
function presetSnapshot(name){return {name,scene:cleanSceneOptions(options),rack:projectInstruments.map(i=>({source:i.source,color:options.colors['instrument-'+i.id]||options.colors['instrument-'+i.source]||null}))}}
function presetMessage(text){byId('presetStatus').textContent=text}
function cancelPresetAction(){presetAction=null;byId('presetConfirm').hidden=true}
function renderScenePresets(selected=''){
 const list=byId('presetChoice');list.replaceChildren();
 const empty=document.createElement('option');empty.value='';empty.textContent=scenePresets.length?'Выбери пресет':'Нет сохранённых пресетов';list.append(empty);
 scenePresets.forEach((p,i)=>{const el=document.createElement('option');el.value=String(i);el.textContent=p.name;list.append(el)});
 presetNaming=false;list.value=String(selected);presetButtons();
}
function presetButtons(){
 const chosen=!!scenePresets[presetIndex()];
 byId('presetSaveSplit').hidden=!chosen||presetNaming;byId('presetNewForm').hidden=chosen&&!presetNaming;byId('cancelNewPreset').hidden=!chosen;
 byId('replaceScenePreset').disabled=!chosen||!presetReady;byId('newScenePreset').disabled=!presetReady;
 byId('loadScenePreset').disabled=byId('deleteScenePreset').disabled=!chosen;
 byId('saveScenePreset').disabled=!presetReady;
}
function readScenePresets(){
 const selected=scenePresets[presetIndex()]?.name;
 cancelPresetAction();presetMessage('');
 try{
  const raw=typeof NotkaPlayer!=='undefined'&&NotkaPlayer.soundRead?NotkaPlayer.soundRead('scene-presets'):localStorage.getItem('notka.scene-presets');
  const saved=JSON.parse(raw||'[]');if(!Array.isArray(saved)||saved.length>50)throw Error();
  scenePresets=saved.filter(p=>p&&typeof p.name==='string'&&p.name.trim()&&p.name.length<=48).map(p=>({name:p.name,scene:cleanSceneOptions(p.scene),rack:Array.isArray(p.rack)?p.rack.slice(0,128).filter(i=>i&&typeof i.source==='string'&&/^[a-z0-9-]{1,48}$/.test(i.source)).map(i=>({source:i.source,color:/^#[\da-f]{6}$/i.test(i.color)?i.color:null})):[]}));presetReady=true;
 }catch{scenePresets=[];presetReady=false;presetMessage('Не удалось прочитать пресеты.')}
 const index=scenePresets.findIndex(p=>p.name===selected);renderScenePresets(index<0?'':index);
}
function writeScenePresets(next,selected=''){
 try{
  const raw=JSON.stringify(next);
  if(typeof NotkaPlayer!=='undefined'&&NotkaPlayer.soundWrite){if(!NotkaPlayer.soundWrite('scene-presets',raw))throw Error()}
  else localStorage.setItem('notka.scene-presets',raw);
  scenePresets=next;renderScenePresets(selected);presetMessage('Готово.');
 }catch{presetMessage('Не удалось сохранить пресеты. Проверь свободное место.')}
}
function confirmPresetAction(text,action){presetAction=action;byId('presetConfirmText').textContent=text;byId('presetConfirm').hidden=false}
byId('confirmScenePreset').onclick=()=>{const action=presetAction;cancelPresetAction();action?.()};
byId('cancelScenePreset').onclick=cancelPresetAction;
byId('presetChoice').onchange=()=>{cancelPresetAction();presetNaming=false;presetMessage('');presetButtons()};
byId('newScenePreset').onclick=()=>{cancelPresetAction();presetNaming=true;byId('presetName').value='';presetMessage('');presetButtons();byId('presetName').focus?.()};
byId('cancelNewPreset').onclick=()=>{presetNaming=false;cancelPresetAction();presetMessage('');presetButtons()};
byId('presetName').oninput=cancelPresetAction;
byId('saveScenePreset').onclick=()=>{
 if(!presetReady||byId('presetNewForm').hidden)return;cancelPresetAction();
 const name=byId('presetName').value.trim();
 if(!name||name.length>48||/[\u0000-\u001f\u007f]/.test(name)){presetMessage('Введи название до 48 символов.');return}
 const index=scenePresets.findIndex(p=>p.name.toLowerCase()===name.toLowerCase());
 if(index>=0){presetMessage('Имя уже занято. Введи другое название.');return}
 if(scenePresets.length>=50){presetMessage('Сохранено 50 пресетов. Удали ненужный.');return}
 writeScenePresets([...scenePresets,presetSnapshot(name)],scenePresets.length);
};
byId('replaceScenePreset').onclick=()=>{
 const index=presetIndex(),preset=scenePresets[index];if(!presetReady||!preset)return;
 const replacement=presetSnapshot(preset.name);
 confirmPresetAction('Заменить пресет «'+preset.name+'»?',()=>{const next=scenePresets.slice();next[index]=replacement;writeScenePresets(next,index)});
};
byId('deleteScenePreset').onclick=()=>{
 const index=presetIndex(),preset=scenePresets[index];if(!preset)return;
 confirmPresetAction('Удалить пресет «'+preset.name+'»?',()=>writeScenePresets(scenePresets.filter((_,i)=>i!==index)));
};
byId('loadScenePreset').onclick=()=>{
 cancelPresetAction();const preset=scenePresets[presetIndex()];if(!preset)return;
 presetNaming=false;presetButtons();
 options=cleanSceneOptions(preset.scene);
 for(const key of Object.keys(options.colors))if(key.startsWith('instrument-'))delete options.colors[key];
 const used=new Map();for(const i of projectInstruments){const at=used.get(i.source)||0,color=preset.rack.filter(p=>p.source===i.source)[at]?.color;used.set(i.source,at+1);if(color)options.colors['instrument-'+i.id]=color}
 scenePreviewLayout=null;if(scene)Object.assign(scene,keyLayout(scene.events));applySceneLoop();syncSceneControls();saveSceneOptions();refreshScenePreview();
 byId('presetName').value=preset.name;presetMessage('Применён: '+preset.name);
};

function showPrefs(visual,opener){
 cancelSongDelete();
 if(fileBusy)return;
 pendingTrack=null;byId('exportOptions').hidden=true;byId('songSave').hidden=byId('trackChoices').hidden=byId('replaceTrack').hidden=true;
 trackActions();trackMessage(visual||trackHost?'':panelHint);
 if(opener)prefReturn=opener;
 byId('preferences').hidden=false;byId('visualOptions').hidden=!visual;byId('prefHome').hidden=visual;
 byId('preferences').classList.toggle('scene-settings',visual);
 byId('prefTitle').textContent=visual?'Оформление сцены':'';byId('preferences').setAttribute('aria-label',visual?'Оформление сцены':'Меню трека');
 if(visual){readScenePresets();scenePreviewLayout=null;syncSceneControls();drawScenePreview()}
 byId('closePrefs').focus?.();
}
function closePrefs(){if(!byId('visualOptions').hidden)saveSceneOptions();flushDraft();cancelPresetAction();pendingTrack=null;byId('replaceTrack').hidden=true;byId('preferences').hidden=true;prefReturn?.focus?.()}
byId('prefs').onclick=()=>showPrefs(false,byId('prefs'));
byId('stagePrefs').onclick=()=>showPrefs(true,byId('stagePrefs'));
byId('closePrefs').onclick=closePrefs;
for(let p=0;p<=116;p++){const item=document.createElement('option');item.value=String(p);item.textContent=pitchName(p);byId('keyStart').append(item)}
for(const [k,defaultValue] of Object.entries(sceneDefaults)){
 const el=byId(k),check=typeof defaultValue==='boolean';
 const update=commit=>{
  const value=check?el.checked:typeof defaultValue==='number'?Number(el.value):el.value;
  if(!check&&typeof defaultValue==='number'&&el.value==='')return;
  options=cleanSceneOptions({...options,[k]:value});syncSceneControls();
  if(['rangeMode','keyStart','keyCount'].includes(k)){scenePreviewLayout=null;if(scene)Object.assign(scene,keyLayout(scene.events))}
  if(k==='loop')applySceneLoop();refreshScenePreview();if(commit)saveSceneOptions();
 };
 el.oninput=()=>{if(k!=='keyCount')update(false)};el.onchange=()=>update(true);
}
const sceneLooks={
 sceneCalm:{palette:'aurora',noteStyle:'solid',roundness:18,glow:true,glowAmount:15,sparks:false,sparkAmount:20,rays:0,rings:0,trails:0,backdrop:'plain'},
 sceneCinema:{palette:'aurora',noteStyle:'glass',roundness:22,glow:true,glowAmount:40,sparks:true,sparkAmount:30,rays:28,rings:20,trails:15,backdrop:'aurora'},
 sceneNeon:{palette:'iris',noteStyle:'neon',roundness:32,glow:true,glowAmount:65,sparks:true,sparkAmount:55,rays:45,rings:45,trails:30,backdrop:'stars'}
};
for(const [id,look] of Object.entries(sceneLooks))byId(id).onclick=()=>{options=cleanSceneOptions({...options,...look});syncSceneControls();saveSceneOptions();refreshScenePreview()};
byId('resetSceneColors').onclick=()=>{options.colors={};renderSceneColors();saveSceneOptions();refreshScenePreview()};
syncSceneControls();
const sharp=p=>[1,3,6,8,10].includes(p%12);
function keyLayout(events){
 let lo=options.keyStart,hi=Math.min(127,lo+options.keyCount-1);
 if(options.rangeMode==='auto'){
  let first=127,last=0;for(const n of events){first=Math.min(first,n.pitch);last=Math.max(last,n.pitch)}
  if(!events.length){first=48;last=83}
  lo=Math.max(0,Math.floor((first-2)/12)*12);hi=Math.min(127,Math.ceil((last+3)/12)*12-1);
  if(hi-lo+1<48){const extra=48-(hi-lo+1);lo=Math.max(0,lo-Math.floor(extra/24)*12);hi=Math.min(127,lo+47);lo=Math.max(0,hi-47)}
 }
 const keys=new Map();let whites=0;
 for(let p=lo;p<=hi;p++){const black=sharp(p);keys.set(p,{black,center:whites+(black?0:.5),width:black?.6:1});if(!black)whites++}
 const left=sharp(lo)?-.3:0,right=whites+(sharp(hi)?.3:0);
 for(const k of keys.values())k.center-=left;
 return {keys,whites:right-left,lo,hi};
}
function sceneNoteGeometry(n,now,sec,line,travel){
 const age=now-n.start*sec,duration=n.len*sec,speed=line/travel;
 const head=line+age*speed;
 const tail=head-duration*speed;
 return {age,held:age>=0&&age<duration,top:tail,bottom:Math.min(line,head)};
}
function sceneVisible(s,now){
 const tick=now/s.sec,period=s.last*s.sec,until=s.loopUntil??0;
 s.cycle??=0;
 // Skip missed rounds after a suspended frame; never replay an accumulated backlog.
 if(period>0&&s.cycle<Math.floor(now/period)-1){s.cycle=Math.min(until,Math.max(0,Math.floor(now/period)-1));s.next=0;s.visible=[]}
 let added=0;
 while(s.events.length&&added<4096){
  if(s.next>=s.events.length){if(s.cycle>=until)break;s.cycle++;s.next=0}
  if(s.cycle>until)break;
  const n=s.events[s.next],offset=s.cycle*(s.last||0);
  if((n.start+offset)*s.sec>now+sceneTravel())break;
  s.next++;added++;
  if(n.start+offset+n.len>tick||(n.start+offset)*s.sec>now-.9)s.visible.push(s.cycle?{...n,start:n.start+offset,cycle:s.cycle}:n);
 }
 let kept=0;for(const n of s.visible)if((n.cycle||0)<=until&&(n.start+n.len>tick||n.start*s.sec>now-.9))s.visible[kept++]=n;s.visible.length=kept;
 return s.visible;
}
function sceneLocalTime(s,now){
 const period=s.last*s.sec;
 return now<0||!period?now:now-Math.min(s.loopUntil??0,Math.floor(now/period))*period;
}
function syncLoopButton(){byId('stageLoop').setAttribute('aria-pressed',String(options.loop));byId('loop').checked=options.loop}
function applySceneLoop(){
 syncLoopButton();
 if(!playback?.visual)return;
 const p=playback,cycle=Math.max(0,Math.floor((audio.currentTime-p.start)/(p.last*p.sec)));
 p.loopUntil=options.loop?Infinity:cycle;
 if(!options.loop){
  for(const voice of voices)if(voice.playback===p&&voice.cycle>cycle)silenceVoice(voice);
  if(p.cycle>cycle){p.cycle=cycle+1;p.next=0}
 }
 if(scene){scene.loopUntil=p.loopUntil;scene.cycle=Math.max(0,cycle-1);scene.next=0;scene.visible=[]}
}
byId('stageLoop').onclick=()=>{options.loop=!options.loop;applySceneLoop();saveSceneOptions();refreshScenePreview()};
syncLoopButton();
function endScene(){
 if(sceneFrame)cancelAnimationFrame(sceneFrame);sceneFrame=0;
 if(!scene&&!running)return;
 if(!byId('stage').hidden){
  if(scene){scene.frozenTime=audio.currentTime-scene.start;scene.still=true;drawScene()}
  byId('stageTransport').textContent='▶';byId('stageTransport').setAttribute('aria-label','Играть с начала');
 }
}
function beginScene(events,start,sec,last,loopUntil=0){
 scene={events,start,sec,last,loopUntil,...keyLayout(events),next:0,visible:[],still:false,stamp:-Infinity};
 function animate(ms){
  if(!scene||scene.still)return;
  const interval=1000/options.fps,elapsed=ms-scene.stamp;
  if(elapsed>=interval-.5){const remainder=elapsed%interval;scene.stamp=Number.isFinite(remainder)&&remainder<interval-.5?ms-remainder:ms;drawScene()}
  sceneFrame=requestAnimationFrame(animate);
 }
 drawScene();sceneFrame=requestAnimationFrame(animate);
}
// Rendering is loaded from this exact signed edition only when first needed.
function renderScene(canvas,state,time,mini=false){
 if(!window.NotkaSceneRenderer){
  const source=NotkaPlayer.editorScript('scene-renderer.js');
  if(!source)throw Error('Не удалось загрузить визуализатор.');
  const script=document.createElement('script');script.textContent=source;document.body.append(script);script.remove();
  if(!window.NotkaSceneRenderer)throw Error('Не удалось открыть визуализатор.');
 }
 return window.NotkaSceneRenderer(canvas,state,time,mini);
}
function drawScene(){
 if(!scene)return;const now=scene.still?scene.frozenTime:audio.currentTime-scene.start;renderScene(byId('scene'),scene,now);
}
function drawScenePreview(){
 if(byId('visualOptions').hidden)return;
 const layout=scenePreviewLayout||(scenePreviewLayout=keyLayout(lanes.flatMap(l=>l.notes))),pitches=[...layout.keys.keys()].filter(p=>!sharp(p)),base=Math.max(0,Math.floor(pitches.length/2)-5),events=[];
 for(let i=0;i<12;i++){const lane=i%Math.min(3,lanes.length),pitch=pitches[Math.min(pitches.length-1,base+[0,4,2,7,4,9][i%6])];events.push({start:Math.floor(i/3)*.8+.1*(i%3),len:.6+(i%3)*.3,pitch,volume:80,lane,instrument:lanes[lane].instrument||'vsco-piano-1',instrumentId:laneInstrument(lanes[lane]).id})}
 events.sort((a,b)=>a.start-b.start);renderScene(byId('scenePreview'),{...layout,events,sec:1,last:5,next:0,visible:[]},1.2,true);
}
function sceneMode(open){
 document.documentElement.classList.toggle('scene-open',open);
 try{if(typeof NotkaPlayer!=='undefined')NotkaPlayer.setSceneMode?.(open)}catch(e){}
}
function setSceneHud(show){
 byId('stageHud').hidden=!show;byId('scene').tabIndex=show?-1:0;
 (show?byId('stageHide'):byId('scene')).focus?.();drawScene();
}
byId('stageHide').onclick=()=>setSceneHud(false);
byId('scene').onclick=()=>{if(byId('stageHud').hidden)setSceneHud(true)};
byId('scene').onkeydown=e=>{if(byId('stageHud').hidden&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setSceneHud(true)}};
function leaveStage(){
 stop();scene=null;byId('stage').hidden=true;sceneMode(false);byId('visualPlay').focus?.();
}
byId('visualPlay').onclick=()=>play('visual');
byId('stageTransport').onclick=()=>play('visual');
byId('leaveStage').onclick=leaveStage;
window.addEventListener('resize',()=>{if(scene)drawScene()});
// The native host calls this global entry point; each invocation closes one layer.
function notkaBack(){
 document.activeElement?.blur?.();
 if(mediaExport?.back())return;
 if(importJob){byId('cancelInstrumentImport').onclick();return}
 if(exportJob){byId('cancelExport').onclick();return}
 if(fileBusy)return;
 if(!byId('exitSheet').hidden){cancelExit();return}
 if(!byId('instrumentSheet').hidden){
  if(!byId('instrumentDeleteConfirm').hidden)cancelInstrumentDelete();
  else if(instrumentView==='edit'){flushDraft();if(!byId('soundAdvanced').hidden)soundPage(false);else showInstrumentView('library')}
  else closeInstrument();return;
 }
 if(!byId('laneSheet').hidden){if(!byId('laneDeleteConfirm').hidden)cancelLaneDelete();else if(!byId('laneRename').hidden)closeLaneRename();else closeLane();return}
 if(!byId('stepSheet').hidden){closeStep();return}
 if(!byId('preferences').hidden){
  if(!byId('presetConfirm').hidden)cancelPresetAction();
  else if(!byId('songDeleteConfirm').hidden)cancelSongDelete();
  else if(!byId('replaceTrack').hidden){pendingTrack=null;byId('replaceTrack').hidden=true;trackMessage('')}
  else if(!byId('visualOptions').hidden&&presetNaming)byId('cancelNewPreset').onclick();
  else if(byId('visualOptions').hidden&&byId('prefHome').hidden)showPrefs(false);
  else closePrefs();return;
 }
 if(!byId('stage').hidden){leaveStage();return}
 if(selected||selection.size){if(!byId('volumeRow').hidden)showVolume(false);else byId('closeNote').onclick();return}
 askExit();
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();notkaBack()}});
// Only a tap begun and ended on the backdrop counts. A slider drag never closes a sheet.
for(const id of ['preferences','laneSheet','stepSheet','instrumentSheet','importProgress','exitSheet']){
 const sheet=byId(id);let outside=false;
 sheet.onpointerdown=e=>{outside=e.target===sheet};
 sheet.onpointercancel=()=>outside=false;
 sheet.onclick=e=>{const close=outside&&e.target===sheet;outside=false;if(close&&!sheet.hidden){e.stopPropagation();notkaBack()}};
}
function cancelExit(){byId('exitSheet').hidden=true;byId('prefs').focus?.()}
function askExit(){
 stop();finishGesture();flushDraft();
 byId('exitSheet').hidden=false;byId('exitActions').hidden=false;
 byId('exitChoices').hidden=byId('exitNameForm').hidden=true;byId('exitStatus').textContent='';byId('cancelExit').focus?.();
}
function finishExit(saved=false){
 finishGesture();draftPending=true;flushDraft();
 if(draftPending&&!saved){byId('exitStatus').textContent='Не удалось записать автокопию. Сохрани трек или попробуй снова.';return}
 try{NotkaPlayer.leave()}catch(e){byId('exitStatus').textContent='Не удалось выйти. Попробуй снова.'}
}
byId('cancelExit').onclick=cancelExit;
byId('exitDiscard').onclick=()=>finishExit();
byId('exitSave').onclick=()=>{
 byId('exitActions').hidden=true;
 if(songFile){byId('exitChoices').hidden=false;byId('exitOverwrite').textContent='Заменить «'+songFile.slice(0,-6)+'»'}
 else byId('exitNew').onclick();
};
byId('exitNew').onclick=()=>{byId('exitChoices').hidden=true;byId('exitNameForm').hidden=false;byId('exitStatus').textContent='';byId('exitName').value='';byId('exitName').focus?.()};
byId('exitOverwrite').onclick=()=>writeSong(songFile,true,true);
byId('exitConfirm').onclick=()=>{try{writeSong(songNameFile(byId('exitName').value),false,true)}catch(e){byId('exitStatus').textContent=e.message}};
byId('exitName').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();byId('exitConfirm').onclick()}};

