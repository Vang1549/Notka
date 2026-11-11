const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const script=fs.readFileSync('app/index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
class El{
 constructor(){this.offsetWidth=250;this.offsetHeight=70;this.children=[];this.dataset={};this.attrs={};this.style={setProperty(){}};this.classList={toggle:()=>this.light=!this.light};this.clientWidth=376;this.clientHeight=540}
 append(...items){for(const e of items)this.appendOne(e)} appendOne(e){for(const child of (e.fragment?e.children:[e])){this.children.push(child);child.parent=this}}
 get lastElementChild(){return this.children.at(-1)}replaceChildren(){this.children=[]}
 setAttribute(k,v){this.attrs[k]=v}addEventListener(k,fn){this[k]=fn}
 remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1)} setPointerCapture(){}getBoundingClientRect(){return {left:0,top:0}}
}
let audio,timer,frame,time=0,ids=0;const delays=new Map();function advance(n){time+=n;for(const [id,t] of delays)if(t.at<=time){delays.delete(id);t.fn()}};const els={},sounds=[];
const gain=()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}});
class Audio{
 constructor(){audio=this;this.currentTime=0;this.state='running';this.sampleRate=48000}
 createGain(){return gain()}createDynamicsCompressor(){return gain()}decodeAudioData(bytes,ok){queueMicrotask(()=>ok({duration:30}))}createBufferSource(){const o={playbackRate:{},connect(){},disconnect(){},start(t){this.at=t},stop(t){this.until=t}};sounds.push(o);return o}
}
const bridge={instrumentData:id=>fs.readFileSync('app/instruments/'+id+'.json','utf8'),stored:null,writes:0,file:null,result:'content://picked',restore:false,
 writeDraft(s){this.raw=s;const t=JSON.parse(s);delete t.draftFile;this.stored=JSON.stringify(t);this.writes++;return true},readDraft(){return this.raw},
 restoreRequested(){const r=this.restore;this.restore=false;return r},
 scene:null,readSceneOptions(){return this.scene},writeSceneOptions(data){this.scene=data;return true},songs:new Map(),picks:0,publicSongs:()=>true,songList(){return JSON.stringify([...this.songs.keys()])},
 saveSong(name,data){if(this.songs.has(name))return 2;this.songs.set(name,data);return 1},overwriteSong(name,data){if(!this.songs.has(name))return 0;this.songs.set(name,data);return 1},openSong(name){return this.songs.get(name)},
 pickTrack(){this.picks++;return true},trackResult(){return this.result},
 writeDocument(s){this.file=s;return true},readDocument(){return this.file}};
function boot(){
 const doc={getElementById:id=>els[id]??=new El(),documentElement:new El(),createElement:()=>new El(),createDocumentFragment:()=>Object.assign(new El(),{fragment:true}),addEventListener(k,f){this[k]=f}};
 const c=vm.createContext({Blob,document:doc,window:new El(),AudioContext:Audio,atob:x=>Buffer.from(x,'base64').toString('binary'),Uint8Array,NotkaPlayer:bridge,requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout,clearTimeout,clearInterval,setInterval});
 vm.runInContext(script,c);return s=>vm.runInContext(s,c);
}
function setFlag(lane,column,value){
 const input=els.ghostChoices.children[lane].children[column+1].children[0];
 input.checked=value;input.onchange();
}
function save(name){(els.saveAs.hidden?els.saveTrack:els.saveAs).onclick();els.songName.value=name;els.confirmSave.onclick();return bridge.songs.get(name+'.notka')}
(async()=>{
 let run=boot();assert.equal(bridge.writes,0);
 run('addNote(0,60);addNote(0,64);selected=score[0]');els.volume.oninput({target:{value:33}});els.plus.onclick();els.snap.onchange({target:{value:8}});
 const draft=JSON.parse(bridge.stored);assert.equal(draft.lanes[0].notes[0].volume,33);assert.equal(draft.bpm,105);assert.equal(draft.division,8);
 els.prefs.onclick();assert.equal(save("Мелодия"),bridge.stored);
 const manual=bridge.songs.get("Мелодия.notka");run('removeNote(score[0])');const changed=bridge.stored;assert.notEqual(manual,changed);
 // Simulate a process kill without any lifecycle event and relaunch through the recovery button.
 bridge.restore=true;run=boot();assert.equal(run('encodeTrack()'),changed);assert.equal(run('songFile'),'Мелодия.notka');
 els.prefs.onclick();els.loadTrack.onclick();els.songSearchButton.onclick();els.songQuery.value='МЕЛ';els.songQuery.oninput();
 assert.equal(els.songList.children[0].children[0].textContent,'Мелодия');els.songQuery.value='нет такого';els.songQuery.oninput();assert.equal(els.songList.children.length,0);
 els.songSearchButton.onclick();els.songList.children[0].children[0].onclick();assert.equal(bridge.picks,0);assert(!els.replaceTrack.hidden);assert.equal(run('encodeTrack()'),changed);
 els.replaceTrack.onclick();assert.equal(run('encodeTrack()'),manual);assert.equal(bridge.stored,manual);
 els.prefs.onclick();els.loadTrack.onclick();bridge.file='invalid';await els.loadFile.onclick();assert.equal(bridge.stored,manual);
 bridge.file=manual.replace('"pitch":60','"pitch":255');await els.loadFile.onclick();assert.equal(bridge.stored,manual);
 bridge.result='cancelled';await els.loadFile.onclick();assert.equal(bridge.stored,manual);
 run('removeNote(score[0]);removeNote(score[0])');assert.equal(JSON.parse(bridge.stored).lanes[0].notes.length,0);
 const empty=bridge.stored;run=boot();assert.equal(bridge.stored,empty);const legacy=JSON.stringify({format:'notka.track',version:1,ppq:960,bpm:90,division:4,notes:[{start:0,len:240,pitch:60,volume:35}]});
 run('applyTrack(readTrack('+JSON.stringify(legacy)+'))');assert.equal(run('score[0].volume'),35);
 els.addLane.onclick();assert.equal(run('score.length'),0);els.editLane.onclick();
 els.laneName.oninput({target:{value:'Бас'}});els.closeLane.onclick();
 run('addNote(0,60);addNote(240,45)');assert.equal(run('lanes[0].notes.length'),1);
 assert.equal(run('score[0].volume'),100);const full=bridge.stored;
 await new Promise(r=>setImmediate(r));const count=sounds.length;await els.play.onclick();assert.equal(sounds.length-count,2);els.play.onclick();
 bridge.restore=true;run=boot();assert.equal(run('encodeTrack()'),full);assert.equal(run('activeLane'),1);
 els.editLane.onclick();setFlag(1,2,false);els.closeLane.onclick();
 const muted=bridge.stored;const from=sounds.length;await els.play.onclick();assert.equal(sounds.length-from,1);els.play.onclick();
 bridge.result='content://picked';assert.equal(save("Бас"),muted);assert.equal(save("Мелодия"),manual);assert.equal(save("../Два"),undefined);
 run('presentTrack('+JSON.stringify(muted)+')');els.replaceTrack.onclick();assert.equal(run('lanes[1].muted'),true);
 const bad=JSON.parse(muted);bad.lanes[0].notes.push({...bad.lanes[0].notes[0],pitch:255});assert.throws(()=>run('readTrack('+JSON.stringify(JSON.stringify(bad))+')'));
 run('chooseLane(0)');els.editLane.onclick();els.deleteLane.onclick();assert.equal(run('lanes.length'),2);els.confirmLane.onclick();
 assert.equal(run('activeLane'),0);assert.equal(run('score.length'),2);assert.equal(run('lanes[0].name'),'Бас');assert(els.play.disabled);
 els.editLane.onclick();assert(els.deleteLane.disabled);assert.equal(JSON.parse(bridge.stored).lanes.length,1);
 // Mark two layers as references and edit an independent tune at the same pitch/time.
 run('applyTrack(readTrack('+JSON.stringify(legacy)+'))');els.addLane.onclick();run('addNote(0,62)');
 els.addLane.onclick();els.editLane.onclick();
 const check=(i,value)=>setFlag(i,1,value);
 check(0,true);check(1,true);setFlag(1,2,false);
 assert.equal(run('activeLane'),2);assert.equal(run('lanes[1].ghost&&lanes[1].muted'),true);
 assert(run('!lanes[0].muted&&!lanes[2].muted'));setFlag(1,2,true);
 assert.equal(run('lanes[1].ghost'),true);els.closeLane.onclick();run('paint()');
 assert.equal(run('[...blockViews.values()].filter(el=>el.className.includes("ghost")).length'),2);
 run('tapCell(0,60);paint()');assert.equal(run('score.length'),1);assert.equal(run('hit(0,60)'),run('score[0]'));
 assert.equal(run('lanes[0].notes[0].volume'),35);
 run('chooseLane(0)');run('tapCell(0,60);tapCell(480,68);paint()');assert.equal(run('score.length'),2);assert.equal(run('selected'),null);run('removeNote(score[1])');assert.equal(run('lanes[0].ghost'),true);
 const before=run('JSON.stringify(score)');
 for(const x of [59,90]){
  run('roll.onpointerdown({button:0,pointerId:1,clientX:'+x+',clientY:rulerHeight+(highestPitch-60+.5)*row-y});');
  assert.equal(run('gesture.n'),run('score[0]'));
  run('roll.onpointerup({pointerId:1,clientX:'+x+',clientY:rulerHeight+(highestPitch-60+.5)*row-y});');
 }
 assert.equal(run('JSON.stringify(score)'),before);
 els.editLane.onclick();assert(!els.deleteLane.disabled);els.closeLane.onclick();
 await new Promise(r=>setImmediate(r));let start=sounds.length;await els.play.onclick();assert.equal(sounds.length-start,3);els.play.onclick();
 els.editLane.onclick();setFlag(0,2,false);els.closeLane.onclick();start=sounds.length;
 await els.play.onclick();assert.equal(sounds.length-start,2);els.play.onclick();
 const copy=save("Аккорды");assert.equal(copy,bridge.stored);bridge.restore=true;run=boot();assert.equal(run('encodeTrack()'),copy);
 run('chooseLane(2)');els.editLane.onclick();check(0,false);els.closeLane.onclick();run('chooseLane(0)');assert.equal(run('hit(0,60)'),run('score[0]'));
 const v13=JSON.parse(copy);for(const lane of v13.lanes)delete lane.ghost;
 assert(run('readTrack('+JSON.stringify(JSON.stringify(v13))+').lanes.every(l=>l.ghost===false)'));
 run('applyTrack(readTrack('+JSON.stringify(legacy)+'));x=pixels(937)');
 els.stepMenu.onclick();assert.equal(els.stepSheet.hidden,false);
 els.snap.onchange({target:{value:'3'}});els.noteSize.onchange({target:{value:'1'}});els.gridDivision.onchange({target:{value:'8'}});els.closeStep.onclick();
 assert.equal(run('ticks(x)'),937);assert.equal(run('gridStep()'),120);assert.equal(run('minimum()'),320);
 run('selectNote(score[0])');els.noteSize.onchange({target:{value:'1'}});run('addNote(407,62)');assert.equal(run('score[1].len'),960);assert.equal(run('score[1].start'),320);assert.equal(run('score[1].volume'),35);
 const original=run('JSON.stringify(score)');els.gridDivision.onchange({target:{value:'16'}});assert.equal(run('JSON.stringify(score)'),original);
 bridge.restore=true;run=boot();assert.equal(run('gridStep()'),60);assert.equal(run('noteDivision'),1);assert.equal(run('division'),3);
 els.snap.onchange({target:{value:'0'}});els.noteSize.onchange({target:{value:'0'}});
 run('selectNote(score[1])');els.noteSize.onchange({target:{value:'0'}});run('addNote(555,66)');assert.equal(run('score[2].start'),555);assert.equal(run('score[2].len'),60);
 els.snap.onchange({target:{value:'2'}});els.gridDivision.onchange({target:{value:'3'}});
 run('selectNote(score[1]);addNote(680,67)');assert.equal(run('score[3].len'),960);assert.equal(run('score[3].start'),480);
 assert.equal(run('score[3].volume'),35);assert.equal(run('score[1].len'),960);
 bridge.restore=true;run=boot();assert.equal(run('noteDivision'),0);assert.equal(run('viewDivision'),3);
 run('addNote(0,70)');assert.equal(run('score[4].len'),320);
 els.prefs.onclick();const newFile=save('Ручной темп');
 els.bpm.value='137';els.bpm.onblur();assert.equal(run('bpm'),137);els.saveTrack.onclick();
 assert.notEqual(bridge.songs.get('Ручной темп.notka'),newFile);assert.equal(JSON.parse(bridge.songs.get('Ручной темп.notka')).bpm,137);
 save('Отдельная копия');els.bpm.value='222';els.bpm.onblur();els.saveTrack.onclick();assert.equal(JSON.parse(bridge.songs.get('Отдельная копия.notka')).bpm,220);
 assert.equal(JSON.parse(bridge.songs.get('Ручной темп.notka')).bpm,137);
 // A continuous volume gesture writes once when committed, then survives a restart.
 run('selectNote(score[0])');const beforeWrites=bridge.writes;
 for(let volume=10;volume<=80;volume++)els.volume.oninput({target:{value:volume}});
 assert.equal(bridge.writes,beforeWrites);els.volume.onchange();assert.equal(bridge.writes,beforeWrites+1);
 assert.equal(JSON.parse(bridge.stored).lanes[0].notes[0].volume,80);
 const good=bridge.writeDraft,previous=bridge.stored;bridge.writeDraft=()=>false;
 run('addNote(5000,80)');assert.equal(bridge.stored,previous);assert.equal(run('draftPending'),true);
 bridge.writeDraft=good;run('flushDraft()');assert.equal(run('draftPending'),false);assert.notEqual(bridge.stored,previous);
 els.stagePrefs.onclick();els.fps.value='60';els.fps.onchange();els.glow.checked=false;els.glow.onchange();
 bridge.restore=true;run=boot();assert.equal(run('options.fps'),60);assert.equal(run('options.glow'),false);
 console.log('PASS coalesced autosave, failed write/retry, and track scene preferences after draft recovery.');
 console.log('PASS named overwrite, save as, numeric BPM and draft source recovery.');
 console.log('PASS fixed length, one visual cell, independent visual and placement divisions, free mode, anchored viewport, draft recovery.');
 console.log('PASS multiple ghost lanes, independent mute, overlap, pointer and keyboard protection, unlock, save and recovery.');
 console.log('PASS lane isolation, simultaneous unison, mute, rename, delete, legacy import, multi-lane draft recovery and file round trip.');
 console.log('PASS durable edits, independent manual file, crash restart, replace confirmation, invalid import, picker cancellation and empty draft.');
})().catch(e=>{console.error(e);process.exitCode=1});
