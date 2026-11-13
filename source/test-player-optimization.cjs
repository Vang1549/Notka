const {boot}=require('./test-instruments.cjs'),assert=require('node:assert/strict');
const t=boot(),r=t.run;
r(`var rootReads=0;var bank={roundRobins:4,samples:Array.from({length:32},(_,i)=>({get root(){rootReads++;return 24+Math.floor(i/4)*12},rr:i%4,tune:0}))};`);
// Exact same nearest-root choice, including ties and variant fallback.
for(let pitch=0;pitch<152;pitch++)for(let rr=0;rr<4;rr++){
 const expected=r(`bank.samples.filter(s=>s.rr===${rr}).reduce((best,s)=>Math.abs(s.root-${pitch})<Math.abs(best.root-${pitch})?s:best)`);
 assert.equal(r(`nearestSample(bank,${pitch},${rr})`),expected);
}
r('rootReads=0;for(let i=0;i<10000;i++)nearestSample(bank,i%128,i%4)');assert.equal(r('rootReads'),0);
// Settings are snapshotted per lane, then shared by its event list.
(async()=>{
 r('score.push({start:0,len:960,pitch:60,volume:100},{start:960,len:960,pitch:64,volume:100})');
 await t.run("play('visual')");assert.equal(r('scene.events[0].settings'),r('scene.events[1].settings'));assert(r('Object.isFrozen(scene.events[0].settings)'));r('stop()');
 console.log('PASS nearest samples match exhaustive selection for 608 cases; 10,000 cached lookups rescan zero roots; playback shares immutable per-lane settings.');
})().catch(e=>{console.error(e);process.exitCode=1});
