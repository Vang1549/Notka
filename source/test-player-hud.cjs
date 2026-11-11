const {boot,settle}=require('./test-instruments.cjs'),assert=require('assert/strict'),fs=require('fs');
const html=fs.readFileSync(process.env.NOTKA_EDITOR_HTML||'app/index.html','utf8');
assert(!/stageInfo|stageRange|stage-foot/.test(html));
const markup=html.match(/<section id=(?:"stage"|stage)(?=[\s>])[\s\S]*?<\/section>/)[0];
assert.deepEqual([...markup.matchAll(/<button id="?([a-zA-Z0-9_-]+)"?/g)].map(m=>m[1]),['leaveStage','stageExport','stageHide','stagePrefs','stageLoop','stageTransport']);
assert(html.includes('rotate(90deg)')); // Landscape fallback in older hosts/browsers.
(async()=>{
 const modes=[],t=boot(true,{setSceneMode:open=>modes.push(open)});
 t.run('score.push({pitch:60,start:0,len:1920,volume:80});options.loop=true');
 await t.run("play('visual')");
 assert.deepEqual(modes,[true]);assert(!t.els.stageHud.hidden);
 const start=t.run('scene.start');t.run('audio.currentTime=scene.start+.2');t.pulse();
 t.els.stageHide.onclick();assert(t.els.stageHud.hidden);assert.equal(t.els.scene.tabIndex,0);
 const state=t.run('JSON.stringify([running,scene.start,playback.start,options.loop])'),voices=t.started.length;
 t.els.scene.onclick();assert(!t.els.stageHud.hidden);assert.equal(t.els.scene.tabIndex,-1);
 assert.equal(t.run('JSON.stringify([running,scene.start,playback.start,options.loop])'),state);assert.equal(t.started.length,voices);
 t.els.stageHide.onclick();t.run('stop()');assert(t.els.stageHud.hidden);assert.deepEqual(modes,[true]);
 t.els.scene.onclick();assert(!t.els.stageHud.hidden);assert.equal(t.els.stageTransport.attrs['aria-label'],'Играть с начала');
 await t.els.stageTransport.onclick();assert(t.run('running'));assert(t.run('scene.start')>start);
 t.els.stageHide.onclick();let prevented=false;t.els.scene.onkeydown({key:' ',preventDefault(){prevented=true}});assert(prevented);assert(!t.els.stageHud.hidden);
 t.els.leaveStage.onclick();assert(t.els.stage.hidden);assert.equal(t.run('scene'),null);assert.equal(modes.at(-1),false);assert(!t.run('running'));assert(t.started.every(v=>v.disconnected));
 // Leaving during decoding must restore orientation without a late playback start.
 const pendingModes=[],p=boot(true,{setSceneMode:o=>pendingModes.push(o)});p.delay=true;p.run('score.push({pitch:60,start:0,len:960,volume:80})');
 const playing=p.run("play('visual')");await settle();p.els.leaveStage.onclick();p.delay=false;p.flush();await playing;
 assert.deepEqual(pendingModes,[true,false]);assert(p.els.stage.hidden);assert(!p.run('running'));assert.equal(p.started.length,0);
 // Audio failures leave the scene and expose the existing editor error message.
 const f=boot();f.fail=true;f.run('score.push({pitch:60,start:0,len:960,volume:80})');await f.run("play('visual')");assert(f.els.stage.hidden);assert(f.els.status.textContent);assert(!f.run('running'));
 console.log('PASS player control order, HUD hide/restore without transport changes, stopped/restarted scene, keyboard restore, orientation enter/leave, decoding cancellation and visible error recovery.');
})().catch(e=>{console.error(e);process.exitCode=1});
