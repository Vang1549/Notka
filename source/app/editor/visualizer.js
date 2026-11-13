const legacySceneDefaults={loop:false,palette:'aurora',rangeMode:'auto',keyStart:48,keyCount:49,keyboardHeight:16,keyLabels:'c',guides:true,speed:1,stretch:1.25,noteWidth:78,roundness:22,noteStyle:'glass',colorMode:'lane',backdrop:'aurora',background:'#080e19',glow:true,glowAmount:40,sparks:true,sparkAmount:30,rays:28,rings:20,trails:15,keyLights:true,fps:30,quality:1.5};
const sceneDefaults={...legacySceneDefaults,palette:'basic',keyboardHeight:18,keyLabels:'none',guides:false,speed:1,noteWidth:80,roundness:25,noteStyle:'solid',backdrop:'plain',background:'#000000',glowAmount:20,sparkAmount:16,rays:0,rings:0,trails:0,fps:60};
delete sceneDefaults.stretch;
const palettes={basic:['#00ff00','#0000ff'],aurora:['#62dfc4','#a898ff','#ffbc79','#74bfff','#f794bc','#d9e59b'],ember:['#ffbc79','#ff7e76','#efcf8b','#f596b2'],ice:['#76d9ff','#8cabff','#8ff0dc','#bdc9ff'],iris:['#bca1ff','#f597d0','#81b5ff','#dcadff']};
const sceneBounds={keyStart:[0,116],keyCount:[12,88],keyboardHeight:[8,26],speed:[.1,10],noteWidth:[40,96],roundness:[0,50],glowAmount:[0,100],sparkAmount:[0,100],rays:[0,100],rings:[0,100],trails:[0,100]};
const sceneChoices={palette:Object.keys(palettes),rangeMode:['auto','manual'],keyLabels:['c','all','none'],noteStyle:['glass','solid','neon'],colorMode:['lane','instrument','single'],backdrop:['aurora','stars','plain'],fps:[30,60],quality:[1,1.5,2]};
const validSceneColor=v=>v==='transparent'||/^#[\da-f]{6}$/i.test(v);
function cleanSceneOptions(saved){
 const legacy=saved&&typeof saved==='object'&&saved.schema!==2;
 const result={...(legacy?legacySceneDefaults:sceneDefaults),schema:2,octaveRange:!legacy,colorSeed:1,presetName:'',colors:{}};delete result.stretch;
 if(!saved||typeof saved!=='object'){result.colorSeed=Math.floor(Math.random()*2147483646)+1;result.presetName='@basic';return result}
 for(const k of Object.keys(sceneDefaults)){
  const value=saved[k];
  if(sceneBounds[k]&&typeof value==='number'&&Number.isFinite(value)){const [lo,hi]=sceneBounds[k];result[k]=Math.max(lo,Math.min(hi,value));if(k!=='speed')result[k]=Math.round(result[k])}
  else if(sceneChoices[k]?.includes(value))result[k]=value;
  else if(typeof sceneDefaults[k]==='boolean'&&typeof value==='boolean')result[k]=value;
  else if(k==='background'&&/^#[\da-f]{6}$/i.test(value))result[k]=value;
 }
 if(legacy){const speed=Number.isFinite(saved.speed)?Math.max(.5,Math.min(3,saved.speed)):[1.3,2.4,4].includes(saved.fall)?3.6/saved.fall:1;const stretch=Number.isFinite(saved.stretch)?Math.max(.25,Math.min(2.5,saved.stretch)):1.25;result.speed=speed*stretch}
 if(typeof saved.octaveRange==='boolean')result.octaveRange=saved.octaveRange;
 if(Number.isSafeInteger(saved.colorSeed)&&saved.colorSeed>0&&saved.colorSeed<=2147483647)result.colorSeed=saved.colorSeed;
 if(typeof saved.presetName==='string'&&saved.presetName.length<=48)result.presetName=saved.presetName;
 result.keyCount=Math.min(result.keyCount,128-result.keyStart);
 if(saved.colors&&typeof saved.colors==='object')for(const [k,v] of Object.entries(saved.colors).slice(0,250))if(/^(lane-\d{1,4}|instrument-[a-z0-9-]{1,48}|single)$/.test(k)&&validSceneColor(v))result.colors[k]=v;
 return result;
}
let options=cleanSceneOptions(null);
let scene=null,sceneFrame=0,prefReturn,scenePreviewLayout=null,playback=null;
const sceneTravel=()=>3.6/options.speed;
function saveSceneOptions(){trackChanged()}
function sceneColorKey(n){return options.colorMode==='single'?'single':options.colorMode==='instrument'?'instrument-'+(n.instrumentId||n.instrument):'lane-'+(n.lane||0)}
function paletteSceneColor(n){
 const list=palettes[options.palette],index=options.colorMode==='instrument'?Math.max(0,n.instrumentId?projectInstruments.findIndex(d=>d.id===n.instrumentId):instruments.findIndex(d=>d.id===n.instrument)):options.colorMode==='single'?0:n.lane||0;
 if(options.palette!=='basic'||index<2)return list[index%list.length];
 let seed=(Math.imul(index+1,2654435761)^options.colorSeed)>>>0;seed^=seed>>>16;
 const hue=(seed>>>0)%360,c=.85,x=c*(1-Math.abs(hue/60%2-1)),m=.1;
 const rgb=hue<60?[c,x,0]:hue<120?[x,c,0]:hue<180?[0,c,x]:hue<240?[0,x,c]:hue<300?[x,0,c]:[c,0,x];
 return '#'+rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');
}
function sceneColor(n){return options.colors[sceneColorKey(n)]||paletteSceneColor(n)}
let sceneColorTarget=null;
function closeSceneColor(){byId('sceneColorPicker').hidden=true;sceneColorTarget=null}
function setSceneColor(value){
 if(!sceneColorTarget)return;const key=sceneColorKey(sceneColorTarget);
 if(value===null)delete options.colors[key];else if(validSceneColor(value))options.colors[key]=value;else return;
 renderSceneColors();saveSceneOptions();refreshScenePreview();
}
function openSceneColor(n,name){
 sceneColorTarget=n;byId('sceneColorTitle').textContent=name;byId('sceneColorPicker').hidden=false;
 byId('scenePaletteColor').style.background=paletteSceneColor(n);
 byId('sceneCustomColor').value=sceneColor(n)==='transparent'?paletteSceneColor(n):sceneColor(n);
 const list=byId('sceneColorSwatches');list.replaceChildren();
 for(const color of ['#ff4040','#ff9f32','#ffff00','#00ff00','#00d9bd','#00cfff','#0000ff','#883bff','#ff42d0','#ffffff','#888888','#000000']){
  const b=document.createElement('button');b.type='button';b.style.background=color;b.setAttribute('aria-label',color);b.onclick=()=>setSceneColor(color);list.append(b);
 }
}
byId('closeSceneColor').onclick=closeSceneColor;
byId('sceneTransparent').onclick=()=>setSceneColor('transparent');
byId('scenePaletteColor').onclick=()=>setSceneColor(null);
byId('sceneCustomColor').oninput=()=>setSceneColor(byId('sceneCustomColor').value);
function renderSceneColors(){
 const list=byId('sceneColors');list.replaceChildren();const seen=new Set();
 lanes.forEach((lane,i)=>{
  const n={lane:i,instrument:lane.instrument||'vsco-piano-1',instrumentId:laneInstrument(lane).id},key=sceneColorKey(n);if(seen.has(key))return;seen.add(key);
  const label=document.createElement('label'),name=document.createElement('span'),button=document.createElement('button');
  name.textContent=options.colorMode==='single'?'Все ноты':options.colorMode==='lane'?lane.name:laneInstrument(lane).name;
  button.type='button';button.className='scene-color-chip';button.style.background=sceneColor(n)==='transparent'?'':sceneColor(n);button.dataset.transparent=String(sceneColor(n)==='transparent');button.setAttribute('aria-label','Цвет · '+name.textContent);
  button.onclick=()=>openSceneColor(n,name.textContent);label.append(name,button);list.append(label);
 });
}
function syncSceneControls(){
 for(const [k,defaultValue] of Object.entries(sceneDefaults)){
  const el=byId(k);if(!el)continue;if(typeof defaultValue==='boolean')el.checked=options[k];else el.value=String(options[k]);
  if(sceneBounds[k]&&!['keyStart','keyCount'].includes(k)){const field=byId(k+'Value');if(document.activeElement!==field)field.value=String(Number(options[k].toFixed(3)))}
 }
 byId('manualRange').hidden=options.rangeMode!=='manual';byId('keyCount').max=String(Math.min(88,128-options.keyStart));
 syncLoopButton();renderSceneColors();
}
function refreshScenePreview(){if(scene)drawScene();drawScenePreview();if(!byId('preferences').hidden&&!byId('visualOptions').hidden)refreshSceneDemo()}
let scenePresets=[],presetReady=false,presetAction=null,presetNaming=false;
function presetIndex(){const value=byId('presetChoice').value;return /^\d+$/.test(value)?Number(value):-1}
function presetSnapshot(name){return {name,scene:cleanSceneOptions({...options,presetName:''}),rack:projectInstruments.map(i=>({source:i.source,color:options.colors['instrument-'+i.id]||options.colors['instrument-'+i.source]||null}))}}
function presetMessage(text){byId('presetStatus').textContent=text}
function cancelPresetAction(){presetAction=null;byId('presetConfirm').hidden=true}
function closePresetList(){byId('presetList').hidden=true;byId('presetChoice').setAttribute('aria-expanded','false')}
function renderScenePresets(selected=''){
 const choice=byId('presetChoice'),list=byId('presetList');list.replaceChildren();choice.value=String(selected);
 choice.textContent=selected==='basic'?'Базовый':scenePresets[Number(selected)]&&selected!==''?scenePresets[Number(selected)].name:options.presetName?'Из трека · '+options.presetName:'Настройки трека';
 function row(name,value,remove){
  const line=document.createElement('div'),button=document.createElement('button');line.className='scene-preset-row';button.className='button';button.textContent=name;button.type='button';button.setAttribute('aria-pressed',String(String(value)===String(selected)));button.onclick=()=>selectScenePreset(value);line.append(button);
  if(remove){const trash=document.createElement('button');trash.type='button';trash.className='button preset-trash';trash.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg>';trash.setAttribute('aria-label','Удалить пресет '+name);trash.onclick=e=>{e?.stopPropagation?.();remove()};line.append(trash)}list.append(line);
 }
 row('Базовый','basic');scenePresets.forEach((p,i)=>row(p.name,i,()=>confirmPresetAction('Удалить пресет «'+p.name+'»?',()=>{
  const selectedName=options.presetName,next=scenePresets.filter(q=>q!==p),at=next.findIndex(q=>q.name===selectedName);
  if(writeScenePresets(next,at<0?selectedName==='@basic'?'basic':'':at)&&selectedName===p.name){options.presetName='';renderScenePresets('');saveSceneOptions()}
 })));
 presetNaming=false;closePresetList();presetButtons();
}
function presetButtons(){
 const chosen=!!scenePresets[presetIndex()];
 byId('presetSaveSplit').hidden=false;byId('presetNewForm').hidden=!presetNaming;
 byId('replaceScenePreset').disabled=!chosen||!presetReady||presetNaming;byId('newScenePreset').disabled=!presetReady||scenePresets.length>=50||presetNaming;
 byId('saveScenePreset').disabled=!presetReady;byId('cancelNewPreset').hidden=false;
}
function presetOptions(preset){
 const result=cleanSceneOptions(preset.scene);
 for(const key of Object.keys(result.colors))if(key.startsWith('instrument-'))delete result.colors[key];
 const used=new Map();for(const i of projectInstruments){const at=used.get(i.source)||0,color=preset.rack.filter(p=>p.source===i.source)[at]?.color;used.set(i.source,at+1);if(color)result.colors['instrument-'+i.id]=color}return result;
}
function sceneFingerprint(value){const q=cleanSceneOptions(value);delete q.presetName;const sort=o=>Object.fromEntries(Object.keys(o).sort().map(k=>[k,o[k]&&typeof o[k]==='object'?sort(o[k]):o[k]]));return JSON.stringify(sort(q))}
function readScenePresets(){
 cancelPresetAction();presetMessage('');
 try{
  const raw=typeof NotkaPlayer!=='undefined'&&NotkaPlayer.soundRead?NotkaPlayer.soundRead('scene-presets'):localStorage.getItem('notka.scene-presets');
  const saved=JSON.parse(raw||'[]');if(!Array.isArray(saved)||saved.length>50)throw Error();
  scenePresets=saved.filter(p=>p&&typeof p.name==='string'&&p.name.trim()&&p.name.length<=48).map(p=>({name:p.name,scene:cleanSceneOptions(p.scene),rack:Array.isArray(p.rack)?p.rack.slice(0,128).filter(i=>i&&typeof i.source==='string'&&/^[a-z0-9-]{1,48}$/.test(i.source)).map(i=>({source:i.source,color:validSceneColor(i.color)?i.color:null})):[]}));presetReady=true;
 }catch{scenePresets=[];presetReady=false;presetMessage('Не удалось прочитать пресеты.')}
 let index=scenePresets.findIndex(p=>p.name===options.presetName);
 if(index<0&&!options.presetName)index=scenePresets.findIndex(p=>sceneFingerprint(presetOptions(p))===sceneFingerprint(options));
 if(index>=0)options.presetName=scenePresets[index].name;
 renderScenePresets(index<0?options.presetName==='@basic'?'basic':'':index);
}
function writeScenePresets(next,selected=''){
 try{
  const raw=JSON.stringify(next);
  if(typeof NotkaPlayer!=='undefined'&&NotkaPlayer.soundWrite){if(!NotkaPlayer.soundWrite('scene-presets',raw))throw Error()}
  else localStorage.setItem('notka.scene-presets',raw);
  scenePresets=next;renderScenePresets(selected);presetMessage('Готово.');return true;
 }catch{presetMessage('Не удалось сохранить пресеты. Проверь свободное место.');return false}
}
function confirmPresetAction(text,action){presetAction=action;byId('presetConfirmText').textContent=text;byId('presetConfirm').hidden=false}
byId('confirmScenePreset').onclick=()=>{const action=presetAction;cancelPresetAction();action?.()};
byId('cancelScenePreset').onclick=cancelPresetAction;
byId('presetChoice').onclick=()=>{const open=byId('presetList').hidden;byId('presetList').hidden=!open;byId('presetChoice').setAttribute('aria-expanded',String(open))};
byId('presetChoice').onchange=()=>selectScenePreset(byId('presetChoice').value);
byId('newScenePreset').onclick=()=>{if(!presetReady||scenePresets.length>=50)return;cancelPresetAction();closePresetList();presetNaming=true;byId('presetName').value='';presetMessage('');presetButtons();byId('presetName').focus?.()};
byId('cancelNewPreset').onclick=()=>{presetNaming=false;cancelPresetAction();presetMessage('');presetButtons()};
byId('presetName').oninput=cancelPresetAction;
byId('saveScenePreset').onclick=()=>{
 if(!presetReady||byId('presetNewForm').hidden)return;cancelPresetAction();
 const name=byId('presetName').value.trim();
 if(!name||name.length>48||/[\u0000-\u001f\u007f]/.test(name)){presetMessage('Введи название до 48 символов.');return}
 if(scenePresets.some(p=>p.name.toLowerCase()===name.toLowerCase())||name==='@basic'){presetMessage('Имя уже занято. Введи другое название.');return}
 if(scenePresets.length>=50){presetMessage('Сохранено 50 пресетов. Удали ненужный.');return}
 if(writeScenePresets([...scenePresets,presetSnapshot(name)],scenePresets.length)){options.presetName=name;saveSceneOptions()}
};
byId('replaceScenePreset').onclick=()=>{
 const index=presetIndex(),preset=scenePresets[index];if(!presetReady||!preset||presetNaming)return;cancelPresetAction();
 const next=scenePresets.slice();next[index]=presetSnapshot(preset.name);
 if(writeScenePresets(next,index)){options.presetName=preset.name;saveSceneOptions()}
};
function selectScenePreset(value){
 cancelPresetAction();closeSceneColor();const preset=scenePresets[Number(value)];
 if(value!=='basic'&&(!/^\d+$/.test(String(value))||!preset))return;
 options=value==='basic'?cleanSceneOptions(null):presetOptions(preset);options.presetName=value==='basic'?'@basic':preset.name;
 renderScenePresets(value);scenePreviewLayout=null;if(scene)Object.assign(scene,keyLayout(scene.events));applySceneLoop();syncSceneControls();saveSceneOptions();refreshScenePreview();
 presetMessage('');
}

function showPrefs(visual,opener){
 cancelSongDelete();
 if(fileBusy)return;
 pendingTrack=null;byId('exportOptions').hidden=true;byId('songSave').hidden=byId('trackChoices').hidden=byId('replaceTrack').hidden=true;
 trackActions();trackMessage(visual||trackHost?'':panelHint);
 if(opener)prefReturn=opener;
 byId('preferences').hidden=false;byId('visualOptions').hidden=!visual;byId('prefHome').hidden=visual;
 byId('preferences').classList.toggle('scene-settings',visual);
 byId('prefTitle').textContent=visual?'Оформление сцены':'';byId('preferences').setAttribute('aria-label',visual?'Оформление сцены':'Меню трека');
 if(visual){readScenePresets();scenePreviewLayout=null;syncSceneControls();byId('sceneDemos').hidden=false;startSceneOverview();queueSceneDemo()}else{byId('sceneDemos').hidden=true;stopSceneDemo();stopSceneOverview()}
 byId('closePrefs').focus?.();
}
function closePrefs(){stopSceneDemo();stopSceneOverview();closeSceneColor();closePresetList();byId('sceneDemos').hidden=true;if(!byId('visualOptions').hidden)saveSceneOptions();flushDraft();cancelPresetAction();pendingTrack=null;byId('replaceTrack').hidden=true;byId('preferences').hidden=true;prefReturn?.focus?.()}
byId('prefs').onclick=()=>showPrefs(false,byId('prefs'));
byId('stagePrefs').onclick=()=>showPrefs(true,byId('stagePrefs'));
byId('closePrefs').onclick=closePrefs;
for(let p=0;p<=116;p++){const item=document.createElement('option');item.value=String(p);item.textContent=pitchName(p);byId('keyStart').append(item)}
for(const [k,defaultValue] of Object.entries(sceneDefaults)){
 const el=byId(k),check=typeof defaultValue==='boolean';if(!el||k==='loop')continue;
 const update=commit=>{
  const value=check?el.checked:typeof defaultValue==='number'?Number(el.value):el.value;
  if(!check&&typeof defaultValue==='number'&&el.value==='')return;
  options=cleanSceneOptions({...options,[k]:value});syncSceneControls();
  if(['rangeMode','keyStart','keyCount'].includes(k)){scenePreviewLayout=null;if(scene)Object.assign(scene,keyLayout(scene.events))}
  refreshScenePreview();if(commit)saveSceneOptions();
 };
 el.oninput=()=>{if(k!=='keyCount')update(false)};el.onchange=()=>update(true);
}
// Commit on blur/Enter, so intermediate input (such as 0,05) is not clamped while typing.
function commitSceneNumber(key,field){
 const raw=field.value.trim().replace(',', '.'),value=raw===''?NaN:Number(raw),[lo,hi]=sceneBounds[key];
 if(Number.isNaN(value)){field.value=String(options[key]);return}
 const clamped=Math.max(lo,Math.min(hi,value)),next=key==='speed'?Math.round(clamped*1000)/1000:Math.round(clamped);
 field.value=String(next);
 if(next===options[key])return;
 options=cleanSceneOptions({...options,[key]:next});syncSceneControls();saveSceneOptions();refreshScenePreview();
}
for(const key of Object.keys(sceneBounds).filter(k=>!['keyStart','keyCount'].includes(k))){
 const field=byId(key+'Value');
 field.onfocus=()=>field.select?.();field.onchange=field.onblur=()=>commitSceneNumber(key,field);
 field.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commitSceneNumber(key,field);field.blur?.()}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation?.();field.value=String(options[key]);field.blur?.()}};
}
syncSceneControls();
const sharp=p=>[1,3,6,8,10].includes(p%12);
function keyLayout(events){
 let lo=options.keyStart,hi=Math.min(127,lo+options.keyCount-1);
 if(options.rangeMode==='auto'){
  let first=127,last=0;for(const n of events){first=Math.min(first,n.pitch);last=Math.max(last,n.pitch)}
  if(!events.length){first=48;last=83}
  if(options.octaveRange){lo=Math.floor(first/12)*12;hi=Math.min(127,Math.floor(last/12)*12+11)}else{
  lo=Math.max(0,Math.floor((first-2)/12)*12);hi=Math.min(127,Math.ceil((last+3)/12)*12-1);
  if(hi-lo+1<48){const extra=48-(hi-lo+1);lo=Math.max(0,lo-Math.floor(extra/24)*12);hi=Math.min(127,lo+47);lo=Math.max(0,hi-47)}
  }
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
function syncLoopButton(){byId('stageLoop').setAttribute('aria-pressed',String(options.loop))}
function applySceneLoop(){
 syncLoopButton();
 if(!playback?.visual)return;
 const p=playback,cycle=Math.max(0,Math.floor((scene?.still?scene.frozenTime:audio.currentTime-p.start)/(p.last*p.sec)));
 p.loopUntil=options.loop?Infinity:cycle;
 if(p.paused){if(scene){scene.loopUntil=p.ended?0:options.loop?Infinity:0;resetSceneAt(p.position)}syncStageTimeline();return;}
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
  if(scene){if(!scene.still)scene.frozenTime=audio.currentTime-scene.start;scene.still=true;drawScene()}
  syncStageTransport();
 }
}
function animateScene(ms){
 if(!scene||scene.still)return;
 const interval=1000/options.fps,elapsed=ms-scene.stamp;
 if(elapsed>=interval-.5){const remainder=elapsed%interval;scene.stamp=Number.isFinite(remainder)&&remainder<interval-.5?ms-remainder:ms;drawScene()}
 sceneFrame=requestAnimationFrame(animateScene);
}
function resetSceneAt(seconds){
 if(!scene)return;
 scene.next=0;scene.cycle=0;scene.visible=[];
 const limit=seconds+sceneTravel();
 while(scene.next<scene.events.length){
  const n=scene.events[scene.next];if(n.start*scene.sec>limit)break;
  scene.next++;if((n.start+n.len)*scene.sec>seconds||n.start*scene.sec>seconds-.9)scene.visible.push(n);
 }
}
function beginScene(events,start,sec,last,loopUntil=0){
 if(sceneFrame)cancelAnimationFrame(sceneFrame);
 scene={events,start,sec,last,loopUntil,...keyLayout(events),next:0,visible:[],still:false,stamp:-Infinity};
 resetSceneAt(audio.currentTime-start);drawScene();sceneFrame=requestAnimationFrame(animateScene);
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
 if(!scene)return;const begin=diagnostics.enabled?diagnostics.now():0,now=scene.still?scene.frozenTime:audio.currentTime-scene.start;renderScene(byId('scene'),scene,now);if(diagnostics.enabled&&!scene.still)diagnostics.draw(diagnostics.now()-begin);
}
function sceneMode(open){
 document.documentElement.classList.toggle('scene-open',open);
 try{if(typeof NotkaPlayer!=='undefined')NotkaPlayer.setSceneMode?.(open)}catch(e){}
}
function leaveStage(){
 stageScrub=null;stop();scene=null;byId('stage').hidden=true;sceneMode(false);setSceneHud(true);byId('visualPlay').focus?.();
}
byId('visualPlay').onclick=()=>play('visual');
byId('leaveStage').onclick=leaveStage;
window.addEventListener('resize',()=>{if(scene)drawScene();if(!byId('preferences').hidden&&!byId('visualOptions').hidden){layoutScenePreviews();drawScenePreview();refreshSceneDemo()}});
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
  if(!byId('sceneColorPicker').hidden){closeSceneColor();return}
  if(!byId('presetConfirm').hidden)cancelPresetAction();
  else if(!byId('presetList').hidden)closePresetList();
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
 finishGesture();draftPending=true;flushDraft(true);diagnostics.persist();
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

