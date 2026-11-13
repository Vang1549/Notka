const {boot,settle}=require('./test-instruments.cjs'),assert=require('assert/strict'),fs=require('fs');
const html=fs.readFileSync(process.env.NOTKA_EDITOR_HTML||'app/index.html','utf8');
const markup=html.match(/<section id=(?:"stage"|stage)(?=[\s>])[\s\S]*?<\/section>/)[0];
assert.deepEqual([...markup.matchAll(/<button id="?([a-zA-Z0-9_-]+)"?/g)].map(m=>m[1]),['stagePrefs','stageExport','stageLoop','stageTransport','stageBack10','stageBack1','stageForward1','stageForward10','leaveStage']);
assert(!markup.includes('stageHide'));assert(markup.includes('id="stageSeek"'));assert(html.includes('rotate(90deg)'));
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function tap(t,x,y,target=t.els.scene,dx=0){t.els.stage.onpointerdown({clientX:x,clientY:y,target});t.els.stage.onclick({clientX:x+dx,clientY:y,target})}
(async()=>{
 const modes=[],t=boot(true,{setSceneMode:open=>modes.push(open)});
 t.run('bpm=120;score.push({pitch:60,start:0,len:57600,volume:80});options.loop=true');
 await t.run("play('visual')");assert.deepEqual(modes,[true]);assert.equal(t.els.stageHud.dataset.hidden,'false');
 t.run('audio.currentTime=scene.start+2.25');t.pulse();near(Number(t.els.stageSeek.value),2.25);assert.equal(t.els.stageDuration.textContent,'0:30');
 // HUD animation changes no transport state, and skips controls, swipes and keys.
 t.els.scene.clientWidth=800;t.els.scene.clientHeight=400;t.els.scene.getBoundingClientRect=()=>({left:0,top:0,right:800,width:800,height:400});
 const state=t.run('JSON.stringify([running,scene.start,playback.start,options.loop])'),count=t.started.length;
 tap(t,400,100);assert.equal(t.els.stageHud.dataset.hidden,'true');assert(t.els.stageHud.inert);tap(t,400,100);assert.equal(t.els.stageHud.dataset.hidden,'false');
 tap(t,400,390);tap(t,400,100,{closest:()=>true});tap(t,400,100,t.els.scene,40);assert.equal(t.els.stageHud.dataset.hidden,'false');
 assert.equal(t.run('JSON.stringify([running,scene.start,playback.start,options.loop])'),state);assert.equal(t.started.length,count);
 // Rotated portrait fallback excludes exactly the same keyboard band.
 t.run("window.matchMedia=()=>({matches:true})");t.els.scene.getBoundingClientRect=()=>({left:0,top:0,right:400,width:400,height:800});
 tap(t,10,200);assert.equal(t.els.stageHud.dataset.hidden,'false');tap(t,250,200);assert.equal(t.els.stageHud.dataset.hidden,'true');
 let prevented=false;t.els.scene.onkeydown({key:' ',preventDefault(){prevented=true}});assert(prevented);assert.equal(t.els.stageHud.dataset.hidden,'false');
 // Pause silences scheduled voices and freezes the exact fraction, even as audio time advances.
 t.els.stageTransport.onclick();assert(!t.run('running'));near(t.run('stageTime()'),2.25);assert(t.started.every(v=>v.disconnected));
 t.run('audio.currentTime+=100');t.pulse();near(t.run('stageTime()'),2.25);
 await t.els.stageForward1.onclick();near(t.run('stageTime()'),3.25);assert(!t.run('running'));
 await t.els.stageBack1.onclick();near(t.run('stageTime()'),2.25);
 await t.els.stageBack10.onclick();near(t.run('stageTime()'),0);
 await t.els.stageForward10.onclick();near(t.run('stageTime()'),10);
 await t.els.stageTransport.onclick();assert(t.run('running'));near(t.run('stageTime()'),10);near(t.run('audio.currentTime-playback.start'),10);
 // Loop position, not total elapsed rounds, is retained on pause and seek.
 t.run('audio.currentTime=playback.start+32.5');t.pulse();t.els.stageTransport.onclick();near(t.run('stageTime()'),2.5);
 t.run('audio.currentTime+=80');t.els.stageLoop.onclick();near(t.run('stageTime()'),2.5);assert(!t.run('options.loop'));
 // Dragging updates frozen visuals without audio; release resumes only if it was playing.
 await t.els.stageTransport.onclick();const old=t.started.length;t.els.stageSeek.onpointerdown();
 t.els.stageSeek.value='12.75';t.els.stageSeek.oninput({target:t.els.stageSeek});near(t.run('stageTime()'),12.75);assert(!t.run('running'));assert.equal(t.started.length,old);
 await t.els.stageSeek.onpointerup();assert(t.run('running'));near(t.run('stageTime()'),12.75);await t.els.stageSeek.onchange();near(t.run('stageTime()'),12.75);
 t.els.stageTransport.onclick();t.els.stageSeek.value='4.5';t.els.stageSeek.oninput({target:t.els.stageSeek});await t.els.stageSeek.onchange();assert(!t.run('running'));near(t.run('stageTime()'),4.5);
 await t.els.stageTransport.onclick();await t.run('seekStage(999)');assert(!t.run('running'));near(t.run('stageTime()'),30);assert.equal(t.els.stageTransport.attrs['aria-label'],'Играть с начала');
 await t.els.stageTransport.onclick();near(t.run('stageTime()'),0);assert(t.run('running'));
 t.run('audio.currentTime=playback.start+31');t.pulse();assert(!t.run('running'));near(t.run('stageTime()'),30);
 // Paused seek to the end in loop mode must show the end, not wrap its slider to zero.
 t.els.stageLoop.onclick();await t.run('seekStage(30)');near(Number(t.els.stageSeek.value),30);
 await t.els.stageBack1.onclick();near(t.run('stageTime()'),29);assert(!t.run('running'));
 // Backgrounding pauses, and stale resume promises cannot restart after leaving.
 await t.els.stageTransport.onclick();t.run('suspendEditor()');assert(!t.run('running'));near(t.run('stageTime()'),29);
 const resuming=t.els.stageTransport.onclick();t.els.leaveStage.onclick();await resuming;
 assert(t.els.stage.hidden);assert.equal(t.run('scene'),null);assert.equal(modes.at(-1),false);assert(!t.run('running'));assert(t.started.every(v=>v.disconnected));
 // Resume a real sample inside its ADSR envelope, without replaying the attack.
 const a=boot(false);await a.run('unlock()');a.run("instrumentCache.set('vsco-piano-1',{samples:[{root:60,tune:0,buffer:audio.createBuffer(1,60000,1000)}],rate:1000,gain:1,attack:.02,release:.4});bpm=120;laneInstrument(lanes[0]).settings=soundSettings({attack:2});score.push({start:0,len:7680,pitch:60,volume:100})");
 await a.run("play('visual')");await a.run('seekStage(.7)');near(a.started.at(-1).offset,.7);near(a.nodes.at(-1).gain.events[0][0],.35);
 a.els.stageTransport.onclick();const beforeResume=a.started.length;a.run('audio.currentTime+=20');await a.els.stageTransport.onclick();assert.equal(a.started.length,beforeResume+1);near(a.started.at(-1).offset,.7);a.run('leaveStage()');
 // Large scores jump directly to the chosen audio/visual window in one scheduler pulse.
 const large=boot(false);await large.run('unlock()');large.run("instrumentCache.set('vsco-piano-1',{samples:[{root:60,tune:0,buffer:audio.createBuffer(1,1000,1000)}],rate:1000,gain:1,attack:.02,release:.4});bpm=120;for(let i=0;i<12000;i++)score.push({start:i*48,len:24,pitch:60,volume:100})");
 await large.run("play('visual')");await large.run('seekStage(280.001)');near(large.started[0].offset,.001);assert(large.run('scene.visible.some(n=>n.start===11200*48)'));assert(large.run('scene.visible.length')<200);large.run('leaveStage()');
 const pendingModes=[],p=boot(true,{setSceneMode:o=>pendingModes.push(o)});p.delay=true;p.run('score.push({pitch:60,start:0,len:960,volume:80})');
 const playing=p.run("play('visual')");await settle();p.els.leaveStage.onclick();p.delay=false;p.flush();await playing;
 assert.deepEqual(pendingModes,[true,false]);assert(p.els.stage.hidden);assert(!p.run('running'));assert.equal(p.started.length,0);
 const f=boot();f.fail=true;f.run('score.push({pitch:60,start:0,len:960,volume:80})');await f.run("play('visual')");assert(f.els.stage.hidden);assert(f.els.status.textContent);assert(!f.run('running'));
 console.log('PASS player layout, HUD taps and keyboard exclusion in both orientations, exact pause/resume, ±1/10 seek, paused/live scrubbing, loop position, endpoints, background pause and async cancellation.');
})().catch(e=>{console.error(e);process.exitCode=1});
