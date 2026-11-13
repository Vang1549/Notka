const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
const t=boot(),run=t.run;
const gradient={addColorStop(p,c){assert(p>=0&&p<=1);assert.equal(typeof c,'string')}};
let calls=0;
const g=new Proxy({}, {get:(o,k)=>o[k]??((...args)=>{calls++;for(const a of args)if(typeof a==='number')assert(Number.isFinite(a),k+' received a nonfinite coordinate');return k.startsWith('create')?gradient:undefined}),set:(o,k,v)=>(o[k]=v,true)});
run('byId("scene");byId("scenePreview")');t.els.scene.getContext=()=>g;t.els.scenePreview.getContext=()=>g;
// All renderer branches work at narrow and landscape sizes, including sharp boundary keys.
for(const size of [[390,820],[1280,560]])for(const style of ['solid','glass','neon'])for(const backdrop of ['plain','aurora','stars']){
 t.els.scene.clientWidth=size[0];t.els.scene.clientHeight=size[1];
 run(`options=cleanSceneOptions({...options,rangeMode:'manual',keyStart:61,keyCount:12,noteStyle:'${style}',backdrop:'${backdrop}',keyLabels:'all',rays:100,rings:100,trails:100,sparkAmount:100});constEvents=[{pitch:61,start:0,len:960,volume:100,lane:0,instrument:'vsco-piano-1'},{pitch:72,start:200,len:1920,volume:90,lane:1,instrument:'lib-musicbox-1'}]` .replace('constEvents=','var constEvents='));
 run('renderScene(byId("scene"),{events:constEvents,next:0,visible:[],sec:.001,last:3000,...keyLayout(constEvents)},.3)');
 assert.equal(run('keyLayout(constEvents).keys.size'),12);
}
assert(calls>100);
// Appearance must not change the attack/release times, even at extreme speed and stretch.
for(const speed of [.1,.125,1,7.5,10]){
 run(`options.speed=${speed}`);
 const at=run('sceneNoteGeometry({start:960,len:1920},1,.001,400,sceneTravel())');assert.equal(at.bottom,400);assert.equal(at.held,true);
 const before=run('sceneNoteGeometry({start:960,len:1920},.95,.001,400,sceneTravel())');assert(before.bottom<400);assert.equal(before.held,false);
 const slopeBefore=run('sceneNoteGeometry({start:960,len:1920},.959,.001,400,sceneTravel()).top-sceneNoteGeometry({start:960,len:1920},.949,.001,400,sceneTravel()).top');
 const slopeAfter=run('sceneNoteGeometry({start:960,len:1920},.979,.001,400,sceneTravel()).top-sceneNoteGeometry({start:960,len:1920},.969,.001,400,sceneTravel()).top');assert(Math.abs(slopeBefore-slopeAfter)<1e-8,'tail must not accelerate on key contact');
 const end=run('sceneNoteGeometry({start:960,len:1920},2.88,.001,400,sceneTravel())');assert(Math.abs(end.top-400)<1e-8);assert.equal(end.held,false);
}
run("options=cleanSceneOptions({rangeMode:'auto'})");for(const pitches of [[0],[127],[60,64],[24,119]]){
 const range=run('keyLayout('+JSON.stringify(pitches.map(p=>({pitch:p})))+')');assert(range.keys.size>=48);for(const p of pitches)assert(range.keys.has(p));
}
// Live slowdown expands the look-ahead without missing notes; old notes are retired.
run("options.speed=3;options.stretch=1;var visual={events:[0,2,6,15].map(start=>({start,len:.5,pitch:60})),next:0,visible:[],sec:1};sceneVisible(visual,0)");assert.equal(run('visual.next'),1);
run('options.speed=.5;sceneVisible(visual,0)');assert.equal(run('visual.next'),3);run('sceneVisible(visual,10)');assert.equal(run('visual.visible.length'),1);
// Track colours differ; the same instrument keeps one colour across tracks; overrides survive reload.
run("options=cleanSceneOptions({colorMode:'lane'});var testLaneA={lane:0,instrument:'vsco-piano-1'},testLaneB={lane:1,instrument:'vsco-piano-1'}");assert.notEqual(run('sceneColor(testLaneA)'),run('sceneColor(testLaneB)'));
run("options.colorMode='instrument'");assert.equal(run('sceneColor(testLaneA)'),run('sceneColor(testLaneB)'));
run("options.colors['instrument-vsco-piano-1']='#123456';options.speed=2;saveSceneOptions()");t.run('flushDraft(true)');const restored=boot(true,{readDraft:()=>t.draft,restoreRequested:()=>true});assert.equal(restored.run('sceneColor({lane:2,instrument:"vsco-piano-1"})'),'#123456');assert.equal(restored.run('options.speed'),2);
assert.equal(run('cleanSceneOptions({keyStart:999,keyCount:88,speed:-100,stretch:Infinity,background:"no"}).keyCount'),12);assert.equal(run('cleanSceneOptions({fall:2.4,glow:false}).glow'),false);
// Presets change appearance, not playback/track content, and input changes can preview without a disk write.
const music=raw=>{const t=JSON.parse(raw);delete t.scene;return JSON.stringify(t)};const score=music(run('encodeTrack()'));t.els.speed.value='1.7';t.els.speed.oninput();const old=t.draft;assert.equal(run('options.speed'),1.7);assert.equal(t.draft,old);t.els.speed.onchange();assert.equal(t.draft,old);t.run('flushDraft(true)');assert.notEqual(t.draft,old);
run("options.noteStyle='neon';syncSceneControls()");assert.equal(music(run('encodeTrack()')),score);assert.equal(run('options.noteStyle'),'neon');
console.log('PASS renderer styles/effects, portrait/landscape, sharp key limits, synchronized attack/release, live speed lookahead, colour identities, validation, migration and saved settings.');

(async()=>{
 const p=boot();p.run("bpm=120;score.push({pitch:24,start:0,len:960,volume:80},{pitch:72,start:960,len:1920,volume:80});options=cleanSceneOptions({...options,rangeMode:'manual',keyStart:60,keyCount:12,speed:1})");
 await p.run("play('visual')");assert.equal(p.run('running'),true);const origin=p.run('scene.start');
 assert.equal(p.started.length,0);p.run('audio.currentTime=scene.start-.05');p.pulse();
 assert.equal(p.started.length,1);assert.equal(p.started[0].at,origin); // Hidden bass note still sounds.
 p.run("options.speed=3;options.stretch=.25;audio.currentTime=scene.start+.45");p.pulse();
 assert.equal(p.started.length,2);assert.equal(p.started[1].at,origin+.5);assert.equal(p.run('scene.start'),origin);
 assert.equal(p.run('sceneNoteGeometry(scene.events[1],.5,scene.sec,400,sceneTravel()).bottom'),400);
 p.run('stop()');assert(p.started.every(n=>n.disconnected));assert.equal(p.run('running'),false);
 console.log('PASS audio scheduling stays synchronized through live visual changes; off-screen notes remain audible; stop releases voices.');
})().catch(e=>{console.error(e);process.exitCode=1});
