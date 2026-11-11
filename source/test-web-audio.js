// Browser QA fixture; loaded only by the development preview, never by the APK.
async function runInstrumentAudioQA(){
 const check=(v,m)=>{if(!v)throw Error(m)},rate=32000;
 const seed=new OfflineAudioContext(1,rate*2,rate),buffer=seed.createBuffer(1,rate*2,rate),samples=buffer.getChannelData(0);
 for(let i=0;i<samples.length;i++)samples[i]=Math.sin(2*Math.PI*440*i/rate)*.5;
 const bank={samples:[{root:69,tune:0,buffer,loop:[rate*.25,rate*1.75]}],rate,gain:1,attack:0,release:.1};
 const render=async settings=>{const c=new OfflineAudioContext(2,rate,rate);createInstrumentVoice(c,c.destination,bank,settings,69,0,.4,100);return c.startRendering()};
 const rms=(b,ch,a=0,z=.2)=>{const x=b.getChannelData(ch);let sum=0;for(let i=a*rate;i<z*rate;i++)sum+=x[Math.floor(i)]**2;return Math.sqrt(sum/((z-a)*rate))};
 const left=await render({pan:-100}),right=await render({pan:100}),soft=await render({attack:.5}),filtered=await render({filter:'lowpass',cutoff:80});
 check(rms(left,0)>.2&&rms(left,1)<1e-7,'left pan');check(rms(right,1)>.2&&rms(right,0)<1e-7,'right pan');
 check(rms(soft,0,0,.1)<rms(left,0,0,.1)*.3,'attack');check(rms(filtered,0)<rms(left,0)*.1,'filter');
 const released=await render({release:.3});check(rms(released,0,.45,.5)>.01&&rms(released,0,.8,.9)===0,'release');
 const item={id:'inst-qa',source:'qa',name:'QA',settings:soundSettings({pan:100,attack:.2,decay:.2,sustain:30,release:.5,filter:'lowpass',cutoff:2000})};
 instrumentCache.set('qa',bank);const track={bpm:120,instruments:[item],lanes:[{instrument:'qa',instrumentId:'inst-qa',notes:[{pitch:69,start:0,len:19200,volume:100}]}]},parts=[],frames=rate*11;
 await renderWave({cancelled:false},track,frames,async p=>parts.push(p),'QA WAV');const wav=joinBytes(parts),view=new DataView(wav.buffer);check(view.getUint16(22,true)===2&&wav.length===44+frames*4,'stereo WAV size');
 const full=new OfflineAudioContext(2,frames,rate),gain=full.createGain(),limiter=full.createDynamicsCompressor();gain.gain.value=.65;gain.connect(limiter);limiter.connect(full.destination);createInstrumentVoice(full,gain,bank,item.settings,69,0,10,100);const expected=await full.startRendering();
 let max=0;for(let i=rate*7.9;i<rate*8.1;i++){check(view.getInt16(44+i*4,true)===0,'export pan');max=Math.max(max,Math.abs(view.getInt16(46+i*4,true)/32768-expected.getChannelData(1)[i]))}
 check(max<.001,'WAV chunk seam '+max);instrumentCache.delete('qa');return 'PASS: real audio pan, attack, release, filter, stereo WAV and 8-second seam (max error '+max.toFixed(6)+')';
}
const qaButton=document.createElement('button');qaButton.id='audioQA';qaButton.textContent='Проверить аудиодвижок';qaButton.style.cssText='position:fixed;bottom:0;left:0;z-index:99';document.body.append(qaButton);
qaButton.onclick=async()=>{qaButton.disabled=true;qaButton.textContent='Проверка…';try{qaButton.textContent=await runInstrumentAudioQA()}catch(e){qaButton.textContent='FAIL: '+e.message}finally{qaButton.disabled=false}};
