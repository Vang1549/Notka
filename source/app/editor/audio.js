let bpm=100,current=-1,running=false,audio,master,timer,generation=0;
async function unlock(){
 if(!audio){
   audio=new AudioContext();
   const limiter=audio.createDynamicsCompressor();limiter.connect(audio.destination);
   master=audio.createGain();master.gain.value=.65;master.connect(limiter);
 }
 if(audio.state!=='running')await audio.resume();
}
function audioFail(){if(byId('stage').hidden)stop();else leaveStage();byId('status').textContent='Звук недоступен. Попробуй нажать ещё раз.'}
const instrumentCache=new Map(),instrumentLoads=new Map();
let previewSerial=0,instrumentRequest=0;
function instrumentError(){return Error('Для этих инструментов обнови APK «Нотки» до 0.32 или новее.')}
async function prepareInstrument(id){
 if(instrumentCache.has(id)){
  const bank=instrumentCache.get(id);instrumentCache.delete(id);instrumentCache.set(id,bank);trimInstrumentCache(id);return bank;
 }
 if(instrumentLoads.has(id))return instrumentLoads.get(id);
 const def=instrumentById(id);
 if(!def)throw Error('Инструмент отсутствует в каталоге. Подключись к интернету и открой редактор заново.');
 if(!def.asset||!sampleHost)throw instrumentError();
 const pending=(async()=>{
  const data=readInstrumentData(def);checkBank(data,def);
  const bank=await decodeInstrumentBank(data,def);
  instrumentCache.set(id,bank);trimInstrumentCache(id);return bank;
 })();
 instrumentLoads.set(id,pending);
 try{return await pending}finally{instrumentLoads.delete(id)}
}
// Evict unused decoded banks under memory pressure; keep current tracks unchanged.
function trimInstrumentCache(keep){
 const used=new Set(lanes.map(l=>l.instrument||'vsco-piano-1'));used.add(keep);
 const bytes=bank=>bank.samples.reduce((n,s)=>n+(s.buffer.length||0)*(s.buffer.numberOfChannels||1)*4,0);
 let total=[...instrumentCache.values()].reduce((n,b)=>n+bytes(b),0);
 for(const [id,bank] of instrumentCache){
  if(total<=64*1024*1024)break;
  if(!used.has(id)){total-=bytes(bank);instrumentCache.delete(id)}
 }
}
async function decodeInstrumentBank(data,def,job=null){
 checkBank(data,def);
  const samples=[];
  for(const sample of data.samples){
   if(job?.cancelled)throw Error('Импорт отменён.');
   if(!Number.isInteger(sample.root)||sample.root<0||sample.root>127||!Number.isFinite(sample.tune))throw Error('Повреждён набор звуков.');
   const binary=atob(sample.data),bytes=new Uint8Array(binary.length);
   for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   // Callbacks also work on WebViews whose decodeAudioData does not return a Promise.
   const buffer=await new Promise((resolve,reject)=>audio.decodeAudioData(bytes.buffer,resolve,reject));
   if(sample.loop&&(!Array.isArray(sample.loop)||sample.loop.length!==2||sample.loop[0]<0||sample.loop[0]>=sample.loop[1]||sample.loop[1]/data.sampleRate>buffer.duration))throw Error('Повреждена петля инструмента.');
   samples.push({root:sample.root,tune:sample.tune,loop:sample.loop,rr:sample.rr||0,buffer});
  }
  samples.sort((a,b)=>a.root-b.root);
  const bank={samples,roundRobins:data.roundRobins||1,rate:data.sampleRate,gain:data.gain,attack:data.attack,release:data.release};
  if(![bank.rate,bank.gain,bank.attack,bank.release].every(Number.isFinite)||bank.rate<8000||bank.gain<=0||bank.gain>1||bank.attack<0||bank.attack>1||bank.release<.01||bank.release>3)throw Error('Повреждены параметры инструмента.');
 return bank;
}
function silenceVoice(sources){
 for(const source of sources){try{source.stop()}catch{}try{source.disconnect()}catch{}}
 sources.dispose?.();voices.delete(sources);
}
const reverseBuffers=new WeakMap();
function reverseBuffer(context,buffer){
 if(reverseBuffers.has(buffer))return reverseBuffers.get(buffer);
 const reversed=context.createBuffer(buffer.numberOfChannels,buffer.length,buffer.sampleRate);
 for(let channel=0;channel<buffer.numberOfChannels;channel++){const from=buffer.getChannelData(channel),to=reversed.getChannelData(channel);for(let i=0;i<from.length;i++)to[i]=from[from.length-1-i]}
 reverseBuffers.set(buffer,reversed);return reversed;
}
function envelopePlan(bank,s,length,volume){
 const attack=s.attack??Math.min(bank.attack,length/2),release=s.release??bank.release,level=bank.gain*(s.volume/100)*Math.pow(volume/100,s.velocity);
 const knots=[[0,0],[s.delay,0],[s.delay+attack,level],[s.delay+attack+s.hold,level],[s.delay+attack+s.hold+s.decay,level*s.sustain/100]];
 const points=[...new Map(knots.map(p=>[p[0],p[1]])).entries()].sort((a,b)=>a[0]-b[0]);
 const before=t=>{let prior=points[0];for(const point of points.slice(1)){if(t<point[0])return prior[1]+(point[1]-prior[1])*(t-prior[0])/(point[0]-prior[0]);prior=point}return prior[1]};
 const offLevel=before(length),stops=points.filter(p=>p[0]<length).concat([[length,offLevel],[length+release,0]]);
 const value=t=>t<=length?before(t):Math.max(0,offLevel*(1-(t-length)/release));
 return {stops,value,release};
}
function createInstrumentVoice(context,destination,bank,rawSettings,pitch,when,length,volume,elapsed=0,variant=0){
 const s=soundSettings(rawSettings);if(!volume||!s.volume)return;
 if(s.filter!=='off'&&!context.createBiquadFilter)throw Error('Для фильтра обнови Android System WebView.');
 if(s.pan!==0&&!context.createStereoPanner)throw Error('Для панорамы обнови Android System WebView.');
 const tuned=pitch+s.transpose,group=variant%(bank.roundRobins||1),pool=bank.samples.filter(sample=>(sample.rr||0)===group);let sample=pool[0]||bank.samples[0];
 for(const candidate of pool)if(Math.abs(candidate.root-tuned)<Math.abs(sample.root-tuned))sample=candidate;
 const buffer=s.reverse?reverseBuffer(context,sample.buffer):sample.buffer,rate=Math.pow(2,(tuned-sample.root+(sample.tune+s.fine)/100)/12),low=buffer.duration*s.start/100,high=buffer.duration*s.end/100;
 let loopLow=0,loopHigh=0;
 if(sample.loop&&s.loop==='original'){
  loopLow=sample.loop[0]/bank.rate;loopHigh=sample.loop[1]/bank.rate;
  if(s.reverse){const old=loopLow;loopLow=buffer.duration-loopHigh;loopHigh=buffer.duration-old}
 }
 const looping=loopHigh>loopLow&&loopLow>=low&&loopHigh<=high;
 let offset=low+elapsed*rate;if(looping&&offset>=loopHigh)offset=loopLow+(offset-loopLow)%(loopHigh-loopLow);
 const envelope=envelopePlan(bank,s,length,volume),remaining=Math.min(length+envelope.release-elapsed,looping?Infinity:(high-offset)/rate);
 if(offset>=high||remaining<=0)return;
 const source=context.createBufferSource(),env=context.createGain(),nodes=[source,env];source.buffer=buffer;source.playbackRate.value=rate;
 if(looping){source.loop=true;source.loopStart=loopLow;source.loopEnd=loopHigh}
 env.gain.setValueAtTime(envelope.value(elapsed),when);
 for(const [time,value] of envelope.stops)if(time>elapsed)env.gain.linearRampToValueAtTime(value,when+time-elapsed);
 source.connect(env);let tail=env;
 if(s.filter!=='off'){
  const filter=context.createBiquadFilter();filter.type=s.filter;filter.frequency.value=Math.min(s.cutoff,context.sampleRate*.49);filter.Q.value=s.resonance;tail.connect(filter);tail=filter;nodes.push(filter);
 }
 if(s.pan!==0){
  const pan=context.createStereoPanner();pan.pan.value=s.pan/100;tail.connect(pan);tail=pan;nodes.push(pan);
 }
 tail.connect(destination);const sources=[source];sources.dispose=()=>{for(const node of nodes){try{node.disconnect()}catch{}}};
 source.start(when,offset);source.stop(when+remaining);return sources;
}
const auditionVariants=new Map();
function instrumentNote(id,pitch,when,length,volume=100,settings={},variant=null,elapsed=0){
 if(volume===0)return;
 while(voices.size>=64)silenceVoice(voices.values().next().value);
 const bank=instrumentCache.get(id);if(!bank)throw Error('Инструмент ещё не загружен.');
 if(variant===null){variant=auditionVariants.get(id)||0;auditionVariants.set(id,variant+1)}
 const sources=createInstrumentVoice(audio,master,bank,settings,pitch,when,length,volume,elapsed,variant);if(!sources)return;
 voices.add(sources);sources[0].onended=()=>{sources.dispose();voices.delete(sources)};return sources;
}
async function preview(pitch,volume=100){
 if(!volume)return;
 const lane=lanes[activeLane],id=lane.instrument||'vsco-piano-1',token=++previewSerial,epoch=generation;
 try{
  await unlock();await prepareInstrument(id);
  if(token===previewSerial&&epoch===generation&&lane===lanes[activeLane]&&id===(lane.instrument||'vsco-piano-1')&&!running&&!document.hidden)instrumentNote(id,pitch,audio.currentTime+.006,.48,volume,laneInstrument(lane).settings);
 }catch(e){if(token===previewSerial&&epoch===generation){byId('status').textContent=e.message||'Звук недоступен.'}}
}
