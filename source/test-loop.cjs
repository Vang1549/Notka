const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
(async()=>{
 const t=boot();
 t.run("bpm=120;score.push({pitch:60,start:0,len:960,volume:80},{pitch:64,start:960,len:960,volume:80})");
 t.els.stageLoop.onclick();assert.equal(t.els.stageLoop.attrs['aria-pressed'],'true');
 const restored=boot(true,{readDraft:()=>t.draft,restoreRequested:()=>true});assert.equal(restored.run('options.loop'),true);
 await t.run("play('visual')");const origin=t.run('playback.start');
 // Notes in upcoming rounds must descend before the boundary, with no scene reset.
 const future=t.run('sceneVisible(scene,.9).map(n=>n.start)');assert(future.includes(1920));
 assert(Math.abs(t.run('sceneLocalTime(scene,1.01)')-.01)<1e-10);
 for(let i=0;i<=200;i++){t.run(`audio.currentTime=${origin+i*.1}`);t.pulse()}
 const times=t.started.map(n=>n.at);assert(times.length>=40);times.forEach((at,i)=>assert(Math.abs(at-(origin+i*.5))<1e-9));assert.equal(t.run('running'),true);
 assert.equal(t.run('scene.start'),origin); // One uninterrupted audio/visual clock.
 t.run('stop()');const count=t.started.length;t.pulse();assert.equal(t.started.length,count);assert(t.started.every(n=>n.disconnected));
 // Disable a loop when the next round has already been scheduled, then re-enable it.
 const u=boot();u.run("bpm=120;score.push({pitch:60,start:0,len:960,volume:100});options.loop=true");await u.run("play('visual')");
 const start=u.run('playback.start');u.run(`audio.currentTime=${start+.41}`);u.pulse();
 assert.equal(u.started.length,2);assert.equal(u.started[1].at,start+.5);
 u.els.stageLoop.onclick();assert(u.started[1].disconnected);assert.equal(u.run('playback.loopUntil'),0);
 u.els.stageLoop.onclick();u.pulse();assert.equal(u.started.length,3);assert.equal(u.started[2].at,start+.5);assert(!u.started[2].disconnected);
 u.els.stageLoop.onclick();u.run(`audio.currentTime=${start+.51}`);u.pulse();assert.equal(u.run('running'),false);assert(u.started[2].disconnected);
 // Very short loops schedule multiple rounds ahead without adding silent time.
 const v=boot();v.run('bpm=120;score.push({pitch:60,start:0,len:48,volume:80});options.loop=true');await v.run("play('visual')");
 v.run('audio.currentTime=playback.start');v.pulse();assert(v.started.length>=4);
 v.started.forEach((n,i)=>assert(Math.abs(n.at-v.run('playback.start')-i*.025)<1e-10));
 v.run('stop()');
 // Normal editor playback remains single-pass even when visual looping is enabled.
 const w=boot();w.run('score.push({pitch:60,start:0,len:960,volume:80});options.loop=true');await w.run("play('start')");assert.equal(w.run('playback.loopUntil'),0);w.run('audio.currentTime=10');w.pulse();assert.equal(w.run('running'),false);
 console.log('PASS seamless multi-round scheduling, visual lookahead/wrap, short loops, live enable/disable and queued-voice cancellation, persistence, stop, single-pass editor.');
})().catch(e=>{console.error(e);process.exitCode=1});
