const {boot}=require('./test-instruments.cjs'),assert=require('node:assert/strict');
let now=0,id=0;const timers=new Map();
const t=boot(true,{}, {performance:{now:()=>now},setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id},clearTimeout:key=>timers.delete(key)}),run=t.run;
const fireHold=()=>{const entry=[...timers].find(([,v])=>v.ms===350);assert(entry);timers.delete(entry[0]);entry[1].fn()};
const json=code=>JSON.parse(run('JSON.stringify('+code+')'));
const point=(x,y=40,pointerId=1)=>({clientX:x,clientY:y,pointerId,button:0,preventDefault(){}});
(async()=>{
 run("lanes=Array.from({length:9},(_,i)=>({...lanes[0],name:'Дорожка '+(i+1),notes:[{pitch:60+i*3,start:i*960,len:1440,volume:80}],muted:false}));options=cleanSceneOptions(null)");
 const events=json('sceneDemoEvents()');assert.equal(events.length,11);assert.deepEqual(events.slice(0,4).map(n=>n.pitch-events[0].pitch),[0,4,7,12]);assert.deepEqual(events.slice(8).map(n=>n.lane),[8,8,8]);assert.equal(events[0].start,events[3].start);assert(events[4].start>events[3].start);
 assert.equal(run('sceneColor({lane:0})'),'#00ff00');assert.equal(run('sceneColor({lane:1})'),'#0000ff');const color=run('sceneColor({lane:8})');run('options=cleanSceneOptions(JSON.parse(JSON.stringify(options)))');assert.equal(run('sceneColor({lane:8})'),color);
 assert.equal(run('cleanSceneOptions({speed:2,stretch:.5}).speed'),1);
 t.els.stagePrefs.onclick();await run('startSceneDemo()');assert.equal(t.started.length,0);
 for(const [time,count] of [[1.03,4],[2.68,8],[4.33,11]]){run('audio.currentTime='+time);now=time*1000;run('animateSceneDemo('+now+')');assert.equal(t.started.length,count)}
 assert.equal(t.started[0].at,t.started[3].at);assert.equal(t.started[4].at,t.started[7].at);
 // Preview pause freezes its own clock and releases only its own voices.
 run("var songSource=instrumentNote('vsco-piano-1',60,audio.currentTime,100,80)[0];audio.currentTime=4.5");now=4500;
 t.els.replaySceneDemo.onclick();const paused=run('sceneDemoTime()');assert.equal(paused,4.5);assert.equal(run('sceneDemoFrame'),0);assert.equal(run('sceneDemoVoices.size'),0);assert(!run('songSource.disconnected'));assert.equal(t.els.replaySceneDemo.textContent,'▶');
 run('audio.currentTime=54.5');now=54500;run('refreshSceneDemo();animateSceneDemo(54500)');assert.equal(run('sceneDemoTime()'),paused);
 const beforeResume=t.started.length;await t.els.replaySceneDemo.onclick();assert.equal(run('sceneDemoTime()'),paused);assert.equal(t.started.length-beforeResume,3);assert(t.started.slice(beforeResume).every(v=>v.offset>0));assert.equal(t.els.replaySceneDemo.textContent,'Ⅱ');
 t.els.replaySceneDemo.onclick();const pauseAgain=run('sceneDemoTime()'),soundBefore=t.started.length;t.els.sceneDemoSound.onclick();t.els.sceneDemoSound.onclick();assert.equal(run('sceneDemoTime()'),pauseAgain);assert(run('sceneDemo.paused'));assert.equal(t.started.length,soundBefore);
 // Zoom and visual edits keep the same paused position and immutable track.
 const g=new Proxy({}, {get:(o,k)=>o[k]??(()=>k.startsWith('create')?{addColorStop(){}}:undefined),set:(o,k,v)=>(o[k]=v,true)}),transforms=[];g.setTransform=(...args)=>transforms.push(args);t.els.sceneDemo.getContext=()=>g;t.els.scenePreview.getContext=()=>g;
 const songBefore=run('encodeTrack()'),normal=run('sceneDemo.whites');t.els.sceneDemo.onclick();assert(run('sceneDemo.lensRange'));assert.equal(run('sceneDemo.whites'),normal);assert.equal(run('encodeTrack()'),songBefore);assert.equal(run('sceneDemoTime()'),pauseAgain);const camera=transforms.at(-1);assert.equal(camera[0],camera[3]);
 t.els.noteWidth.value='65';t.els.noteWidth.oninput();assert.equal(run('sceneDemoTime()'),pauseAgain);assert(run('sceneDemo.paused'));
 // Snapshot contains actual track events and stays at one moment until explicitly changed.
 assert.equal(run('sceneOverview.events.length'),9);assert.equal(run('sceneOverview.events[1].pitch'),63);assert.equal(run('sceneOverview.events[1].len'),1440);
 const snapshot=run('sceneOverview.position'),oldStarted=t.started.length;now+=50000;run('drawScenePreview()');assert.equal(run('sceneOverview.position'),snapshot);assert.equal(t.started.length,oldStarted);
 run('randomSceneOverview()');assert.notEqual(run('sceneOverview.position'),snapshot);
 const fullTrack=run('encodeTrack()'),position=run('sceneDemoTime()');
 // Tap randomizes; hold scrubs the complete timeline with clamped endpoints.
 t.els.scenePreview.getBoundingClientRect=()=>({left:10,top:20,width:300,height:150,right:310,bottom:170});
 const duration=run('sceneOverviewTrack.duration');t.els.scenePreview.onpointerdown(point(85));fireHold();assert.equal(run('sceneOverviewPosition'),duration*.25);assert(!t.els.sceneOverviewSeek.hidden);
 t.els.scenePreview.onpointermove(point(500));assert.equal(run('sceneOverviewPosition'),duration);t.els.scenePreview.onpointerup(point(500));assert.equal(run('sceneOverviewPosition'),duration);assert(t.els.sceneOverviewSeek.hidden);
 t.els.scenePreview.onpointerdown(point(80));t.els.scenePreview.onpointerup(point(80));assert.notEqual(run('sceneOverviewPosition'),duration);
 const saved=run('sceneOverviewPosition');t.els.scenePreview.onpointerdown(point(80));t.els.scenePreview.onpointermove(point(100));t.els.scenePreview.onpointerup(point(100));assert.equal(run('sceneOverviewPosition'),saved);assert(![...timers.values()].some(v=>v.ms===350));
 t.els.scenePreview.onpointerdown(point(80));t.els.scenePreview.onpointercancel();assert(![...timers.values()].some(v=>v.ms===350));
 // The rotated portrait host maps the canvas's logical X to the screen's Y.
 run('window.matchMedia=()=>({matches:true})');t.els.scenePreview.getBoundingClientRect=()=>({left:10,top:20,width:150,height:300,right:160,bottom:320});t.els.scenePreview.onpointerdown(point(80,95));fireHold();assert.equal(run('sceneOverviewPosition'),duration*.25);t.els.scenePreview.onpointermove(point(80,320));assert.equal(run('sceneOverviewPosition'),duration);t.els.scenePreview.onpointerup(point(80,320));run('window.matchMedia=()=>({matches:false})');
 assert.equal(run('encodeTrack()'),fullTrack);assert.equal(run('sceneDemoTime()'),position);assert(!run('songSource.disconnected'));
 // Both windows preserve the full player's aspect ratio and fit without overlap.
 for(const [width,height,ratio] of [[760,620,1540/690],[500,300,16/9],[250,300,21/9]]){const box=run('previewBoxSize('+[width,height,ratio].join(',')+')');assert(box.width<=width);assert(box.height*2+12<=height+.0001);assert(Math.abs((box.width-2)/(box.height-2)-ratio)<1e-9)}
 // Silent seek to a late event in a large track primes visibility beyond the 4096-note limit.
 run("sceneOverviewTrack={events:Array.from({length:12000},(_,i)=>({pitch:60,start:i,len:1,volume:80,lane:0})),sec:1,last:12000,duration:12000};seekSceneOverview(11000.5)");assert(run('sceneOverview.visible.some(n=>n.start===11000)'));assert(run('sceneOverview.next>11000'));
 // Manual keyboard and MIDI limits apply equally to both previews.
 run("options.rangeMode='manual';options.keyStart=25;options.keyCount=84;scenePreviewLayout=null;drawScenePreview()");await run('startSceneDemo()');assert(run('sceneDemo.paused'));assert.equal(run('sceneDemo.keys.size'),84);assert.equal(run('sceneOverview.keys.size'),84);
 const classes=new Set();for(let step=0;step<12;step++)json('sceneDemoEvents('+step+')').forEach(n=>{assert(n.pitch>=25&&n.pitch<=108);classes.add(n.pitch%12)});assert.equal(classes.size,12);
 run("options.keyStart=116;options.keyCount=12;scenePreviewLayout=null;drawScenePreview()");await run('startSceneDemo()');for(let step=0;step<12;step++)assert(run('sceneDemoEvents('+step+').every(n=>Number.isFinite(n.pitch)&&n.pitch>=116&&n.pitch<=127)'));
 // Resume advances to the next chord; closing cancels both hold and demo work.
 await t.els.replaySceneDemo.onclick();const oldChord=run('sceneDemo.events[0].pitch');run('audio.currentTime=sceneDemo.audioStart+sceneDemo.last+.1');now+=10000;run('animateSceneDemo('+now+')');await new Promise(r=>setImmediate(r));assert(run('sceneDemo'));assert(!run('sceneDemo.paused'));
 t.els.scenePreview.onpointerdown(point(80));t.els.closePrefs.onclick();assert.equal(run('sceneOverview'),null);assert.equal(run('sceneDemo'),null);assert(![...timers.values()].some(v=>v.ms===350));run('stop()');
 // Empty tracks stay usable and never fabricate sample notes.
 run('lanes.forEach(l=>l.notes=[]);scene=null');t.els.stagePrefs.onclick();assert.equal(run('sceneOverview.events.length'),0);assert.equal(run('sceneOverviewPosition'),0);assert.match(t.els.sceneOverviewTime.textContent,/нет нот/);t.els.closePrefs.onclick();
 // Text input still clamps only on commit, with decimal comma and invalid-input recovery.
 for(const [key,[lo,hi]] of Object.entries(run('sceneBounds'))){if(['keyStart','keyCount'].includes(key))continue;const field=t.els[key+'Value'];field.value=String(hi+1000);field.onblur();assert.equal(run('options.'+key),hi);field.value=String(lo-1000);field.onchange();assert.equal(run('options.'+key),lo);field.value='';field.onblur();assert.equal(field.value,String(lo))}
 t.els.speedValue.value='0,765';t.els.speedValue.onblur();assert.equal(run('options.speed'),.765);
 // Closing during decode prevents an orphaned audition.
 const delayed=boot(true,{}, {performance:{now:()=>0},setTimeout:()=>1,clearTimeout(){}});delayed.delay=true;delayed.els.stagePrefs.onclick();const pending=delayed.run('startSceneDemo()');await new Promise(r=>setImmediate(r));delayed.els.closePrefs.onclick();delayed.delay=false;delayed.flush();await pending;assert.equal(delayed.run('sceneDemo'),null);assert.equal(delayed.started.length,0);
 console.log('PASS preview pause/resume and sample offset, independent voices, mute/zoom while paused, real random snapshots, tap/hold/cancel/rotated scrubbing, long-track seek, preserved aspect/containment, keyboard ranges, empty track, clamping and async cancellation.');
})().catch(e=>{console.error(e);process.exitCode=1});
