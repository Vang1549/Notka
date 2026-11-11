const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function setup({elapsed=.7,length=2,settings={},loop=null,duration=10,rate=1}={}){
 const t=boot(false);
 await t.run('unlock()');
 t.run(`var testBuffer=audio.createBuffer(1,${duration*1000},1000);
 instrumentCache.set('vsco-piano-1',{samples:[{root:60,tune:0,buffer:testBuffer,loop:${JSON.stringify(loop)}}],rate:1000,gain:1,attack:.02,release:.4});
 bpm=120;laneInstrument(lanes[0]).settings=soundSettings(${JSON.stringify(settings)});
 score.push({start:0,len:${length*1920},pitch:${60+12*Math.log2(rate)},volume:100});x=pixels(${elapsed*1920});`);
 return t;
}
(async()=>{
 // Real editor scheduler: a sustained note resumes at .7s, while the next note attacks normally.
 const t=await setup({settings:{attack:.1,decay:1,sustain:20}});
 t.run('score.push({start:3840,len:1920,pitch:60,volume:100})');
 await t.run("play('visible')");assert.equal(t.started.length,1);
 near(t.started[0].offset,.7);near(t.started[0].off-t.started[0].at,1.7);
 const env=t.nodes.at(-1).gain.events;near(env[0][0],.52);near(env[1][1]-env[0][1],.4);
 t.run('audio.currentTime=playback.start+1.25');t.pulse();assert.equal(t.started.length,2);
 near(t.started[1].offset,0);near(t.nodes.at(-1).gain.events[0][0],0);
 t.run('stop()');assert(t.started.every(v=>v.disconnected));
 // Full original length controls the default attack, even when only a tiny fragment remains.
 const attack=await setup({elapsed:.015,length:.02});await attack.run("play('visible')");
 near(attack.nodes.at(-1).gain.events[0][0],1);near(attack.started[0].offset,.015);attack.run('stop()');
 // A long custom attack resumes part-way up; delay does not restart either.
 for(const [settings,elapsed,level] of [[{attack:2},.7,.35],[{delay:1,attack:1},.7,0],[{delay:1,attack:1},1.5,.5]]){
  const a=await setup({settings,elapsed,length:4});await a.run("play('visible')");near(a.nodes.at(-1).gain.events[0][0],level);near(a.started[0].offset,elapsed);a.run('stop()');
 }
 // A sample that has already finished stays silent, even when its note rectangle continues.
 const ended=await setup({elapsed:.7,duration:.5});await ended.run("play('visible')");assert.equal(ended.started.length,0);ended.run('stop()');
 // Trim, transposition, reverse and loop phase are applied to the skipped portion as well.
 const trimmed=await setup({settings:{start:10,end:90,reverse:true},rate:2});await trimmed.run("play('visible')");
 near(trimmed.started[0].offset,2.4);near(trimmed.started[0].playbackRate.value,2);assert.notEqual(trimmed.started[0].buffer,trimmed.run('testBuffer'));trimmed.run('stop()');
 const looped=await setup({elapsed:3.7,length:5,loop:[1000,2000]});await looped.run("play('visible')");
 assert.equal(looped.started[0].loop,true);near(looped.started[0].offset,1.7);looped.run('stop()');
 // Starting from the beginning ignores the editor scroll offset and retains a fresh attack.
 const full=await setup();await full.run("play('start')");near(full.started[0].offset,0);near(full.nodes.at(-1).gain.events[0][0],0);full.run('stop()');
 // A delayed timer resumes an upcoming note at the actual elapsed time instead of retriggering it.
 const late=await setup({elapsed:0});late.run('score[0].start=1920');await late.run("play('start')");
 assert.equal(late.started.length,0);late.run('audio.currentTime=playback.start+1.3');late.pulse();near(late.started[0].offset,.3);late.run('stop()');
 // The scheduler keeps the original round-robin identity, including notes skipped before the origin.
 const rr=await setup();rr.run(`var bank=instrumentCache.get('vsco-piano-1');bank.roundRobins=2;
 var other=audio.createBuffer(1,10000,1000);bank.samples.push({...bank.samples[0],buffer:other,rr:1});
 score.unshift({start:0,len:48,pitch:60,volume:100})`);await rr.run("play('visible')");
 assert.equal(rr.started.length,1);assert.equal(rr.started[0].buffer,rr.run('other'));near(rr.started[0].offset,.7);rr.run('stop()');
 console.log('PASS editor seek: sample offset, original ADSR, next attack, expired sample, trim/rate/reverse/loop phase, from-start, late scheduling, round robin and cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1});
