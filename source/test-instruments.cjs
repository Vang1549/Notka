const {installedSounds}=require('./test-sound-host.cjs');
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const script=fs.readFileSync(process.env.NOTKA_EDITOR_HTML||'app/index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
class El{
 constructor(){this.hidden=true;this.children=[];this.style={setProperty(){}};this.dataset={};this.attrs={};this.classList={toggle(){}};this.clientWidth=376;this.clientHeight=540;this.offsetWidth=250;this.offsetHeight=70}
 append(...items){for(const e of items)for(const child of (e.fragment?e.children:[e])){this.children.push(child);child.parent=this}} remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1)} replaceChildren(){this.children=[]}
 setAttribute(k,v){this.attrs[k]=v} addEventListener(k,f){this[k]=f} focus(){} setPointerCapture(){} getBoundingClientRect(){return {left:0,top:0}}get lastElementChild(){return this.children.at(-1)}
}
const settle=()=>new Promise(r=>setImmediate(r));
function boot(native=true,extras={},runtime={}){
 let clock=0,interval=null,draft='',delay=false,fail=false,pending=[],reads=[],started=[];
 const nodes=[];
 const param=()=>({value:0,events:[],setValueAtTime(v,t){this.events.push([v,t])},linearRampToValueAtTime(v,t){this.events.push([v,t])},exponentialRampToValueAtTime(v,t){this.events.push([v,t])}});
 const node=()=>({connect(){},disconnect(){this.disconnected=true},gain:param()});
 class Audio{
  constructor(){this.state='running';this.sampleRate=48000;this.currentTime=clock;this.destination=node()}
  createGain(){const n=node();nodes.push(n);return n}createDynamicsCompressor(){return node()}
  createBufferSource(){const n={...node(),playbackRate:param(),start(t,offset=0){this.at=t;this.offset=offset;started.push(this)},stop(t){this.off=t;if(t===undefined)this.onended?.()}};return n}
  createStereoPanner(){const n={...node(),pan:param(),kind:'pan'};nodes.push(n);return n}
  createBiquadFilter(){const n={...node(),frequency:param(),Q:param(),kind:'filter'};nodes.push(n);return n}
  createBuffer(channels,length,sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return {numberOfChannels:channels,length,sampleRate,duration:length/sampleRate,getChannelData:i=>data[i]}}
  createOscillator(){return {...this.createBufferSource(),frequency:param()}}
  decodeAudioData(bytes,ok,bad){
   const b=Buffer.from(bytes);if(b.toString('ascii',0,4)!=='RIFF'){assert(b.toString('ascii',0,3)==='ID3'||(b[0]===255&&(b[1]&224)===224),'Expected WAV or MP3');const resolve=()=>fail?bad(Error('decode failure')):ok({duration:3,rootSignature:b.subarray(0,90).toString('base64')});if(delay)pending.push(resolve);else queueMicrotask(resolve);return}assert.equal(b.toString('ascii',0,4),'RIFF');assert([1,2].includes(b.readUInt16LE(22)));assert.equal(b.readUInt16LE(34),16);
   const buffer={duration:b.readUInt32LE(40)/(b.readUInt32LE(24)*b.readUInt16LE(32)),rootSignature:b.toString('base64',44,90)};
   const resolve=()=>fail?bad(Error('decode failure')):ok(buffer);
   if(delay)pending.push(resolve);else queueMicrotask(resolve);
  }
 }
 const els={},doc={hidden:false,documentElement:new El(),createElement:()=>{const el=new El();Object.defineProperty(el,"id",{get(){return this._id},set(v){this._id=v;els[v]=this}});return el},createDocumentFragment:()=>Object.assign(new El(),{fragment:true}),getElementById:id=>els[id]??=new El(),addEventListener(k,f){this[k]=f}};
 const host={writeDraft(raw){draft=raw;return true},readDraft(){return ''},restoreRequested:()=>false};
 if(native)host.instrumentData=id=>id==='musicbox-floe'?null:fs.readFileSync('app/instruments/'+id+'.json','utf8');
 Object.assign(host,extras);
 if(host.instrumentData){const read=host.instrumentData;host.instrumentData=id=>{reads.push(id);return read(id)}}
 const ctx=vm.createContext({document:doc,window:new El(),AudioContext:Audio,NotkaPlayer:host,atob:x=>Buffer.from(x,'base64').toString('binary'),btoa:x=>Buffer.from(x,'binary').toString('base64'),Uint8Array,setTimeout:(fn,ms)=>{const id=setTimeout(fn,ms);if(ms>=60000)id.unref();return id},clearTimeout,requestAnimationFrame:()=>1,cancelAnimationFrame(){},setInterval:f=>{interval=f;return 1},clearInterval:()=>interval=null,...runtime});
 vm.runInContext(script,ctx);const run=s=>vm.runInContext(s,ctx);
 // Test-only aliases for edition 64's shortened functions; never shipped in the editor.
 if(process.env.NOTKA_EDITOR_MAP)for(const [name,packed] of Object.entries(JSON.parse(fs.readFileSync(process.env.NOTKA_EDITOR_MAP,'utf8')))){
  if(run('typeof '+name)==='undefined')run('const '+name+'='+packed);
 }
 // Packed 58+ shortens the DOM helper; expose the same lookup only to test snippets.
 if(run('typeof byId')==='undefined')run('const byId=id=>document.getElementById(id)');
 return {els,run,started,nodes,reads,doc,pulse(){interval?.()},get draft(){return draft},set delay(v){delay=v},set fail(v){fail=v},flush(){const list=pending;pending=[];list.forEach(f=>f())},get waiting(){return pending.length}};
}
module.exports={boot,settle};
if(require.main===module)(async()=>{
 const library=()=>boot(true,installedSounds());
 const t=library();assert.equal(t.run('lanes[0].instrument'),'vsco-piano-1');
 t.run('openLaneInstrument()');await t.run("selectInstrument('lib-vsco-violin-1')");assert.equal(t.run('lanes[0].instrument'),'lib-vsco-violin-1');
 assert.equal(t.started.length,1);assert(t.started[0].loop);assert(t.started[0].loopEnd>t.started[0].loopStart);
 assert.equal(JSON.parse((t.run('flushDraft(true)'),t.draft)).lanes[0].instrument,'lib-vsco-violin-1');
 t.els.closeInstrument.onclick();assert.equal(t.run('voices.size'),0);
 t.run("score.push({pitch:60,start:0,len:960,volume:65})");t.els.addLane.onclick();
 t.run('openLaneInstrument()');await t.run("selectInstrument('lib-vsco-flute-1')");t.els.closeInstrument.onclick();
 t.run("score.push({pitch:60,start:0,len:960,volume:100});lanes[0].ghost=true");
 const before=t.started.length;await t.run('play("start")');const notes=t.started.slice(before);
 assert.equal(notes.length,2);assert.notEqual(notes[0].buffer.rootSignature,notes[1].buffer.rootSignature);assert.equal(notes[0].at,notes[1].at);
 t.run('stop()');assert(notes.every(n=>n.disconnected));assert.equal(t.run('voices.size'),0);
 const readCount=t.reads.length;await t.run('play("start")');assert.equal(t.reads.length,readCount);t.run('stop()');
 t.run('lanes[0].muted=true');const muteStart=t.started.length;await t.run('play("start")');assert.equal(t.started.length-muteStart,1);t.run('stop()');
 const saved=t.run('encodeTrack()');t.run('applyTrack(readTrack('+JSON.stringify(saved)+'))');assert.equal(t.run('lanes[0].instrument'),'lib-vsco-violin-1');assert.equal(t.run('lanes[1].instrument'),'lib-vsco-flute-1');
 // Old files migrate to sampled piano. Reject unknown instrument ids without modifying a track.
 const legacy=JSON.parse(saved);legacy.version=2;delete legacy.instruments;for(const lane of legacy.lanes)delete lane.instrument;
 assert.equal(t.run('readTrack('+JSON.stringify(JSON.stringify(legacy))+').lanes[0].instrument'),'vsco-piano-1');
 legacy.lanes[0].instrument='unknown';assert.throws(()=>t.run('readTrack('+JSON.stringify(JSON.stringify(legacy))+')'));
 t.run('chooseLane(0)');assert(!t.els.editLane.disabled);t.run('openLaneInstrument()');assert(!t.els.instrumentSheet.hidden);t.els.closeInstrument.onclick();
 // Two requests for the same bank share decode work; nearest-root mapping and octave transpose.
 await t.run("prepareInstrument('vsco-piano-1')");const idx=t.started.length;
 t.run("instrumentNote('vsco-piano-1',69,1,2,100);instrumentNote('vsco-piano-1',119,1,2,50)");
 assert.equal(t.started[idx].playbackRate.value,1);assert(Math.abs(t.started[idx+1].playbackRate.value-2**(11/12))<1e-12);
 assert(!t.started[idx].loop);t.run('stop()');
 t.run("for(let i=0;i<100;i++)instrumentNote('lib-vsco-flute-1',72,0,.1,100)");assert.equal(t.run('voices.size'),64);t.run('stop()');assert.equal(t.run('voices.size'),0);
 // Stopping or switching while audio decodes must not start a delayed note.
 const delayed=boot();delayed.delay=true;delayed.run('score.push({pitch:60,start:0,len:960,volume:100})');
 const playback=delayed.run('play("start")');await settle();assert(delayed.waiting);delayed.run('stop()');delayed.delay=false;delayed.flush();await playback;assert.equal(delayed.started.length,0);
 const race=library();race.run('openLaneInstrument()');race.delay=true;
 const first=race.run("selectInstrument('lib-vsco-violin-1')");await settle();race.delay=false;
 await race.run("selectInstrument('lib-vsco-flute-1')");race.flush();await first;assert.equal(race.run('lanes[0].instrument'),'lib-vsco-flute-1');assert.equal(race.started.length,1);
 const closing=library();closing.run('openLaneInstrument()');closing.delay=true;
 const choosing=closing.run("selectInstrument('lib-vsco-violin-1')");await settle();closing.els.closeInstrument.onclick();closing.delay=false;closing.flush();await choosing;assert.equal(closing.started.length,0);assert.equal(closing.run('lanes[0].instrument'),'vsco-piano-1');
 const retry=boot();retry.fail=true;await retry.run('unlock()');await assert.rejects(retry.run("prepareInstrument('vsco-piano-1')"));retry.fail=false;await retry.run("prepareInstrument('vsco-piano-1')");assert.deepEqual(retry.reads,['piano','piano']);
 const old=boot(false);old.run('openLaneInstrument()');await old.run("selectInstrument('vsco-piano-1')");assert.equal(old.run('lanes[0].instrument'),'vsco-piano-1');assert.match(old.els.instrumentStatus.textContent,/0.32/);
 console.log('PASS real WAV decoding inputs, per-lane instruments, simultaneous timbres, ghost/mute, save/reload, legacy files, cache, tuning, loops, voice cleanup/limit, stop/load races, retry and old APK notice.');
})().catch(e=>{console.error(e);process.exitCode=1});
