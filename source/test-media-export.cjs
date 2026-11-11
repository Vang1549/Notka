const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('app/media-export.js','utf8').replace(/^import[^\n]+\n/,'');
assert(!/MediaRecorder|captureStream|requestAnimationFrame|currentTime/.test(source));
function setup(config={}){
 const els={},listeners={},ended=[],progress=[],saved=[],written=[],samples=[],frames=[],outputs=[];let canceled=0,busy=false,prepared=[],inflight=0;
 const track={bpm:120,instruments:[],lanes:[{instrument:'piano',instrumentId:'rack1',muted:false,notes:[{pitch:60,start:0,len:960,volume:80}]},{instrument:'muted',muted:true,notes:[{pitch:70,start:0,len:9000,volume:80}]}]};
 class El{constructor(){this.hidden=false;this.style={};this.children=[];this.value=''}setAttribute(){}append(e){this.children.push(e)}replaceChildren(){this.children=[]}remove(){this.removed=true}focus(){}}
 const get=id=>els[id]??=new El(),doc={hidden:false,body:new El(),createElement:()=>new El(),getElementById:get,addEventListener:(k,f)=>listeners[k]=f};
 class Target{constructor(stream){this.writer=stream.getWriter()}}
 class Output{constructor(o){this.options=o;this.state='pending';outputs.push(this)}addAudioTrack(s){this.audio=s}addVideoTrack(s){this.video=s}async start(){this.state='started';if(config.codecError)throw Error('codec failed')}async finalize(){await this.options.target.writer.write({position:0,data:new Uint8Array([1,2,3,4])});await this.options.target.writer.write({position:2,data:new Uint8Array([9])});this.state='finalized'}async cancel(){this.state='canceled'}}
 class Sample{constructor(o){Object.assign(this,o)}close(){this.closed=true}}
 class Audio{constructor(o){this.options=o}async add(s){assert.equal(inflight++,0,'backpressure must be awaited');assert(s.data.length<=8192);await new Promise(r=>setImmediate(r));samples.push(s);inflight--;if(config.onAudio)config.onAudio()}close(){this.closed=true}}
 class Canvas{constructor(c,o){this.canvas=c;this.options=o}async add(timestamp,duration){assert.equal(inflight++,0);await new Promise(r=>setImmediate(r));frames.push({timestamp,duration});inflight--}close(){this.closed=true}}
 class Offline{constructor(channels,count,rate){this.channels=channels;this.count=count;this.rate=rate}createGain(){return {gain:{value:0},connect(){}}}createDynamicsCompressor(){return {connect(){}}}async startRendering(){if(config.renderError)throw Error('render failed');return {getChannelData:c=>new Float32Array(this.count).fill(c?.25:-.5)}}}
 const scope={localStorage:{getItem:()=>JSON.stringify(config.settings||{}),setItem:(k,v)=>config.persisted=JSON.parse(v)},Output,StreamTarget:Target,Mp4OutputFormat:class{},WebMOutputFormat:class{},OggOutputFormat:class{},AudioSampleSource:Audio,AudioSample:Sample,CanvasSource:Canvas,canEncodeAudio:async()=>!config.unsupported,canEncodeVideo:async()=>!config.unsupported,document:doc,window:{OfflineAudioContext:Offline,addEventListener:(k,f)=>listeners[k]=f},navigator:{},WritableStream,Uint8Array,Date,console,setTimeout:(f)=>setImmediate(f),btoa:s=>Buffer.from(s,'binary').toString('base64')};
 vm.runInNewContext(source,scope);
 const api={host:{beginExport(){written.length=0;return !config.beginError},writeExport(pos,b64){if(config.writeError)return false;written.push({pos,data:Buffer.from(b64,'base64')});return true},cancelExport(){canceled++},finishExport(n){if(config.finishError)return false;saved.push(n);return true}},snapshot:()=>({track:JSON.parse(JSON.stringify(track)),name:'Музыка',folder:'Downloads/Notka'}),stop(){},busy:v=>busy=v,prepare:async id=>{prepared.push(id);if(config.prepare)await config.prepare()},bank:()=>({release:.5}),settings:()=>({volume:100}),voice(){},layout:()=>({keys:new Map(),whites:8}),render(c,s,t){assert(s.exporting);assert.equal(s.loopUntil,0);assert.equal(s.events.length,1);assert(Math.abs(t-(frames.length/Number(get('mediaFps').value)-1))<1e-9)},travel:()=>1,write:async(j,b)=>{if(config.writeError)throw Error('disk full');j.bytes+=b.length;written.push({pos:0,data:b})},wave:async(j,t,count,write)=>{assert.equal(t.lanes.length,1);assert.equal(count,40000);await write(new Uint8Array(44));await write(new Uint8Array(count*4))}};
 let bgState='starting';
 if(config.background)Object.assign(api.host,{backgroundBegin(){if(config.backgroundReject)return false;setImmediate(()=>bgState=config.backgroundFail?'error:service failed':'running');return true},backgroundStatus:()=>bgState,backgroundProgress:p=>progress.push(p),backgroundCommit(){if(bgState!=='running')return false;bgState='committing';return true},backgroundEnd:(success,message)=>ended.push({success,message})});
 const factory=scope.window.NotkaMediaExport(api);get('mediaKind').value='audio';get('mediaFps').value=String(config.fps||30);factory.open();
 const settle=()=>new Promise(r=>setImmediate(r));
 return {root:doc.body.children[0],ended,progress,setBg:s=>bgState=s,get,factory,samples,frames,outputs,saved,written,prepared,listeners,doc,config,settle,get canceled(){return canceled},get busy(){return busy},async choose(kind,label){await settle();get('mediaKind').value=kind;await get('mediaKind').onchange();const i=get('mediaFormat').children.findIndex(o=>o.textContent.includes(label));assert(i>=0);get('mediaFormat').value=String(i)},save:()=>get('mediaSave').onclick()};
}
(async()=>{
 const t=setup();await t.settle();await t.save();assert.match(t.saved[0],/\.wav$/);assert.deepEqual(t.prepared,['piano']);assert(!t.busy);
 t.get('mediaName').value='../bad';await t.save();assert.equal(t.saved.length,1);
 for(const [kind,label,ext] of [['audio','M4A','m4a'],['audio','WebM','weba'],['audio','OGG','ogg'],['video','MP4','mp4'],['video','WebM','webm']]){
  for(const fps of kind==='video'?[24,25,30,50,60]:[30]){const v=setup({fps});await v.choose(kind,label);await v.save();assert.match(v.saved[0],new RegExp('\\.'+ext+'$'));assert(v.samples.every(s=>s.closed));assert.equal(v.outputs[0].state,'finalized');assert(!v.busy);assert.equal(v.written[1].pos,2);assert.equal(v.written[1].data[0],9);
   let count=0;for(const s of v.samples){assert.equal(s.timestamp,count/48000);count+=s.data.length/2}assert.equal(count,kind==='video'?108000:60000);
   assert.equal(v.frames.length,kind==='video'?Math.ceil(2.25*fps):0);v.frames.forEach((f,i)=>assert.equal(f.timestamp,i/fps));if(kind==='video')assert(Math.abs(v.frames.at(-1).timestamp+v.frames.at(-1).duration-2.25)<1e-9);
  }
 }
 for(const config of [{writeError:true},{finishError:true},{beginError:true},{codecError:true}]){const v=setup(config);await v.choose('video','WebM');await v.save();assert.equal(v.saved.length,0);assert.equal(v.canceled,1);assert(!v.busy)}
 let resume;const c=setup({prepare:()=>new Promise(r=>resume=r)});await c.settle();const pending=c.save();await c.settle();assert(c.factory.back());resume();await pending;assert.equal(c.saved.length,0);assert.equal(c.canceled,1);assert(!c.busy);assert(c.factory.back());assert(!c.factory.back());
 const h=setup();h.config.onAudio=()=>{h.doc.hidden=true;h.listeners.visibilitychange()};await h.choose('video','WebM');await h.save();assert(!h.saved.length);assert.equal(h.canceled,1);assert.equal(h.outputs[0].state,'canceled');assert.match(h.get('mediaStatus').textContent,/свёрнуто/);
 const bg=setup({background:true});bg.config.onAudio=()=>{bg.doc.hidden=true;bg.listeners.visibilitychange()};await bg.choose('video','WebM');await bg.save();assert(bg.saved.length===1);assert(bg.ended[0].success);assert(bg.progress.length>1);
 for(const config of [{background:true,backgroundReject:true},{background:true,backgroundFail:true},{background:true,writeError:true},{background:true,finishError:true}]){const v=setup(config);await v.choose('video','WebM');await v.save();assert(!v.saved.length);assert(!v.busy);if(config.backgroundReject)assert.equal(v.canceled,0);assert(config.backgroundReject||v.ended.length===1&&!v.ended[0].success)}
 const nc=setup({background:true});nc.config.onAudio=()=>nc.setBg('error:notification cancelled');await nc.choose('video','WebM');await nc.save();assert(!nc.saved.length);assert(!nc.ended[0].success);
 const pg=setup({background:true});pg.config.onAudio=()=>pg.listeners.pagehide();await pg.choose('video','WebM');await pg.save();assert(!pg.saved.length);assert(pg.ended.every(e=>!e.success));
 const u=setup({unsupported:true});await u.settle();assert.equal(u.get('mediaFormat').children.length,1);u.get('mediaKind').value='video';await u.get('mediaKind').onchange();assert(u.get('mediaSave').disabled);
 // DOM0 pointer handlers must not return false for a field: that cancels native focus/select.
 const touch=setup();await touch.settle();for(const id of ['mediaName','mediaKind','mediaFormat'])assert.notEqual(touch.root.onpointerdown({target:touch.get(id)}),false);
 touch.root.onclick({target:touch.get('mediaName')});assert(!touch.root.hidden);
 touch.get('mediaAdvancedTab').onclick();assert(touch.get('mediaBasic').hidden);assert(!touch.get('mediaAdvanced').hidden);
 touch.get('mediaBasicTab').onclick();assert(!touch.get('mediaBasic').hidden);
 touch.root.onpointerdown({target:touch.root});touch.root.onclick({target:touch.root});assert(touch.root.hidden);
 for(const rate of [32000,44100,48000])for(const channels of [1,2])for(const depth of [16,24]){
  const v=setup({settings:{mediaRate:String(rate),mediaChannels:String(channels),mediaDepth:String(depth)}});await v.settle();await v.save();assert(v.saved.length, v.get('mediaStatus').textContent);
  const bytes=Buffer.concat(v.written.map(w=>w.data)),count=rate*1.25,size=count*channels*depth/8;
  assert.equal(bytes.readUInt32LE(24),rate);assert.equal(bytes.readUInt16LE(22),channels);assert.equal(bytes.readUInt16LE(34),depth);assert.equal(bytes.readUInt32LE(40),size);assert.equal(bytes.length,44+size+size%2);assert.equal(bytes.readUInt32LE(4),bytes.length-8);
  assert.equal(depth===16?bytes.readInt16LE(44):bytes.readIntLE(44,3),-(2**(depth-2)));
 }
 const custom=setup({settings:{mediaRate:'44100',mediaChannels:'1',mediaSize:'854',mediaQuality:'high',mediaBitrate:'96000'},fps:24});await custom.choose('video','WebM');await custom.save();
 assert.equal(custom.outputs[0].audio.options.bitrate,96000);assert.equal(custom.outputs[0].video.options.bitrate,Math.round(854*480*24*.24));assert.equal(custom.outputs[0].video.canvas.width,854);
 assert(custom.samples.every(s=>s.sampleRate===44100&&s.numberOfChannels===1&&s.format==='f32'));assert.equal(custom.samples.reduce((n,s)=>n+s.data.length,0),44100*2.25);
 custom.get('mediaReset').onclick();await custom.settle();assert.equal(custom.get('mediaRate').value,'48000');assert.equal(custom.config.persisted.mediaQuality,'standard');
 const bad=setup({settings:{mediaSize:'99999',mediaRate:'-1',mediaDepth:'0'}});await bad.settle();await bad.save();assert(bad.saved.length);assert.equal(bad.get('mediaSize').value,'1280');
 const broken=setup({renderError:true});await broken.settle();await broken.save();assert.equal(broken.canceled,1);assert(!broken.busy);assert(!broken.saved.length);
 console.log('PASS offline WAV/audio/video, 24/25/30/50/60 fps exact timeline, final partial frame, silence prelude, mute, bounded backpressure, random-access header patches, resource cleanup, invalid names, codec/disk/finalize errors, cancellation, format filtering, field pointer defaults, tabs, persisted settings, custom encoder options and WAV 16/24-bit mono/stereo at 32/44.1/48 kHz.');
})().catch(e=>{console.error(e);process.exitCode=1});
