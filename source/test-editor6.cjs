const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const script=fs.readFileSync('app/index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
class El{
 constructor(){this.offsetWidth=250;this.offsetHeight=70;this.children=[];this.dataset={};this.attrs={};this.style={setProperty(){}};this.classList={toggle:()=>this.light=!this.light};this.clientWidth=376;this.clientHeight=540}
 append(e){for(const child of (e.fragment?e.children:[e])){this.children.push(child);child.parent=this}}
 get lastElementChild(){return this.children.at(-1)}replaceChildren(){this.children=[]}
 setAttribute(k,v){this.attrs[k]=v}addEventListener(k,fn){this[k]=fn}
 remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1)} setPointerCapture(){}getBoundingClientRect(){return {left:0,top:0}}
}
let audio,timer,frame,time=0,ids=0;const delays=new Map();function advance(n){time+=n;for(const [id,t] of delays)if(t.at<=time){delays.delete(id);t.fn()}};const els={},sounds=[];
const gain=()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}});
class Audio{
 constructor(){audio=this;this.currentTime=0;this.state='running';this.sampleRate=48000}
 createGain(){return gain()}createDynamicsCompressor(){return gain()}decodeAudioData(bytes,ok){queueMicrotask(()=>ok({duration:30}))}createBufferSource(){const o={playbackRate:{},connect(){},disconnect(){},start(t){this.at=t},stop(t){this.until=t}};sounds.push(o);return o}
}
const doc={getElementById:id=>els[id]??=new El(),documentElement:new El(),createElement:()=>new El(),createDocumentFragment:()=>Object.assign(new El(),{fragment:true}),addEventListener(k,f){this[k]=f}};
const ctx=vm.createContext({setTimeout:(fn,n)=>{const id=++ids;delays.set(id,{fn,at:time+n});return id},clearTimeout:id=>delays.delete(id),cancelAnimationFrame:()=>{},document:doc,window:new El(),AudioContext:Audio,NotkaPlayer:{instrumentData:id=>fs.readFileSync('app/instruments/'+id+'.json','utf8')},atob:x=>Buffer.from(x,'base64').toString('binary'),Uint8Array,requestAnimationFrame:f=>{frame=f;return 1},setInterval:f=>{timer=f;return 1},clearInterval:()=>timer=null});
vm.runInContext(script,ctx);
const run=s=>vm.runInContext(s,ctx),flush=()=>{if(frame){const f=frame;frame=null;f()}};
const roll=els.roll;
function finger(type,x,y){roll['onpointer'+type]({pointerId:1,isPrimary:true,button:0,clientX:x,clientY:y})}
function tap(x,y){finger('down',x,y);finger('up',x,y);flush()}
function drag(x,y,ex,ey){finger('down',x,y);finger('move',ex,ey);finger('up',ex,ey);flush()}
(async()=>{
 await run("unlock();prepareInstrument('vsco-piano-1')");
 const n=()=>run('score[0]'),snap=v=>{els.snap.onchange({target:{value:String(v)}});flush()};
 assert.equal(run('division'),4);tap(69,200);assert.equal(n().len,240);
 run('removeNote(score[0])');snap(2);
 tap(69,200);assert.equal(n().start,0);assert.equal(n().len,480);const orig=n().pitch;
 finger('down',69,200);flush();assert(els.volumeRow.hidden);assert.equal(run('selected'),n());assert(!els.inspector.hidden);
 finger('move',149,166);finger('up',149,166);flush();assert.equal(n().start,960);assert.equal(n().pitch,orig+1);
 drag(173,166,253,166);assert.equal(n().start,960);assert.equal(n().len,1440);
 els.volumeToggle.onclick();flush();assert(!els.volumeRow.hidden);assert.equal(els.volumeToggle.attrs['aria-expanded'],'true');els.volumeToggle.onclick();assert(els.volumeRow.hidden);els.volumeToggle.onclick();
 els.volume.oninput({target:{value:27}});assert.equal(n().volume,27);els.volume.onchange();
 const startSnap=n().start,lenSnap=n().len;snap(3);assert.equal(n().start,startSnap);assert.equal(n().len,lenSnap);tap(99,245);assert.equal(run('score[1].start'),320);assert.equal(run('score[1].len'),1440);assert.equal(run('score[1].volume'),27);
 snap(8);tap(99,290);assert.equal(run('score[2].start'),120);
 tap(99,290);assert.equal(run('score.length'),3);assert(els.volumeRow.hidden);els.volumeToggle.onclick();els.volume.oninput({target:{value:0}});els.closeNote.onclick();
 tap(149,385);assert.equal(run('score[3].volume'),0);assert.equal(run('score[1].volume'),27);
 tap(149,385);els.deleteNote.onclick();assert.equal(run('templateNote'),null);
 snap(0);tap(75,340);const free=run('score[3]');assert.equal(free.start,114);assert.equal(free.len,240);assert.equal(free.volume,100);
 drag(112,340,125,340);assert.equal(free.len,318);
 finger('down',81,340);finger('move',89,306);assert.equal(free.start,162);finger('move',89,340);assert.equal(free.start,162);finger('cancel',89,340);assert.equal(free.start,114);
 // Swiping on an empty row pans.
 finger('down',81,440);finger('move',51,440);finger('up',51,440);assert.equal(free.start,114);assert(run('x')>0);
 await els.playStart.onclick();assert.equal(run('current'),0);els.play.onclick();flush();finger('down',81,340);finger('up',81,340);els.deleteNote.onclick();assert(!run('score').includes(free));
 // A new note at 100 BPM, lasting 1.5 beats, has .9 seconds of sustain.
 run('rowIndexes.delete(score);score.splice(0);score.push({start:0,len:1440,pitch:60,volume:27},{start:0,len:480,pitch:64,volume:0});controls()');
 await new Promise(r=>setImmediate(r));let offset=sounds.length;await els.play.onclick();
 assert.equal(sounds.length-offset,1);let o=sounds[offset];assert(Math.abs(o.until-o.at-(.9+JSON.parse(fs.readFileSync('app/instruments/piano.json')).release+.01))<1e-6);
 audio.currentTime=.7;timer();assert(run('running'));audio.currentTime=1.1;timer();assert(!run('running'));
 // Start halfway through a sustained note, between grid lines, at several zoom levels.
 for(const division of [0,2,3,16]){
  run('division='+division+';col=31.375;score[0].start=bar-960;x=pixels(bar+137.5);controls()');
  offset=sounds.length;await els.play.onclick();
  assert(Math.abs(run('current')-3977.5)<1e-8);
  assert.equal(sounds.length-offset,1);o=sounds[offset];
  assert(Math.abs(o.until-o.at-(342.5*(60/100/960)+JSON.parse(fs.readFileSync('app/instruments/piano.json')).release+.01))<1e-6);
  els.play.onclick();
 }
 run('x=pixels(score[0].start+score[0].len)');offset=sounds.length;
 await els.play.onclick();assert(!run('running'));assert.equal(sounds.length,offset);assert.match(els.status.textContent,/нет звучащих нот/);
 await els.playStart.onclick();assert.equal(run('current'),0);assert.equal(run('x'),0);els.play.onclick();
 run('col=40;division=0');
 run('stop();x=240;y=1800;paint()');
 const send=(type,id,px,py)=>{roll[type==='lostpointercapture'?'onlostpointercapture':'onpointer'+type]({pointerId:id,isPrimary:id===1,button:0,clientX:px,clientY:py,target:roll});flush()};
 const near=(v,want)=>assert(Math.abs(v-want)<1e-8, v+' vs '+want);
 const original=run('JSON.stringify(score)'),template=run('templateNote');
 const midCol=run('(x+170-keyWidth)/col'),midRow=run('(y+200-rulerHeight)/row');
 send('down',1,120,200);send('down',2,220,200);
 send('move',1,90,202);send('move',2,250,198);
 near(run('col'),64);near(run('row'),34);
 near(run('(x+170-keyWidth)/col'),midCol);near(run('(y+200-rulerHeight)/row'),midRow);
 send('up',2,250,198);send('up',1,90,202);
 // Vertical stretch, horizontal jitter and shrink. Test duplicate cancel/lost events.
 send('down',1,160,140);send('down',2,161,260);
 send('move',1,162,110);send('move',2,159,290);near(run('row'),51);near(run('col'),64);
 send('move',1,162,170);send('move',2,159,230);near(run('row'),17);near(run('col'),64);
 send('cancel',1,162,170);send('lostpointercapture',1,162,170);send('up',2,159,230);
 // Diagonal scales each dimension by a different factor.
 send('down',1,100,150);send('down',2,200,250);
 send('move',1,75,100);send('move',2,225,300);near(run('col'),96);near(run('row'),34);
 send('down',3,250,300);send('up',2,225,300);send('up',3,250,300);send('up',1,75,100);
 near(run('cols'),Math.ceil(320/96)+1);assert.equal(run('contacts.size'),0);
 assert.equal(run('JSON.stringify(score)'),original);assert.equal(run('templateNote'),template);
 // A second finger interrupts an in-progress note drag and restores original data.
 run('x=0;y=0;rowIndexes.delete(score);score.splice(0);addNote(0,highestPitch-4);paint()');
 const beforePinch=run('JSON.stringify(score)');
 send('down',1,80,183);send('move',1,185,150);assert.notEqual(run('JSON.stringify(score)'),beforePinch);
 send('down',2,270,158);assert.equal(run('JSON.stringify(score)'),beforePinch);
 send('move',2,280,159);send('up',2,280,159);send('up',1,185,150);
 assert.equal(run('JSON.stringify(score)'),beforePinch);assert.equal(run('score.length'),1);
 // Both endpoints are playable, and dragging beyond either end clamps the pitch.
 for(const [scroll,py,out,pitch,label] of [[-1e6,40,-100,119,'Си8'],[1e6,535,700,24,'До1']]){
  run('rowIndexes.delete(score);score.splice(0);templateNote=null;x=0');
  roll.wheel({deltaX:0,deltaY:scroll,preventDefault(){}});flush();
  assert(els.keys.children.some(k=>!k.hidden&&k.textContent===label));
  tap(80,py);assert.equal(n().pitch,pitch);
  finger('down',80,py);finger('move',80,out);finger('up',80,out);
  assert.equal(n().pitch,pitch);
 }
 // A tall viewport at minimum zoom can show all 96 keys. Empty space is inert.
 roll.clientHeight=2000;run('row=16;resize()');assert.equal(els.keys.children.length,96);
 assert.equal(els.keys.children[0].textContent,'Си8');assert.equal(els.keys.children.at(-1).textContent,'До1');
 tap(145,1900);assert.equal(run('score.length'),1);
 // Grab the right half of a long off-grid note, just before its resize handle.
 run('roll.clientHeight=540;row=34;col=40;division=2;x=y=0;resize();rowIndexes.delete(score);score.length=0;score.push({start:300,len:1440,pitch:highestPitch-4,volume:50});paint()');
 finger('down',185,183);assert.equal(run('gesture.mode'),'move');assert.equal(n().start,300);
 finger('move',188,183);assert.equal(n().start,300);
 finger('move',225,183);assert.equal(n().start,780);finger('up',225,183);assert.equal(n().len,1440);
 console.log('PASS immediate anchored drag, pitch/time drag, edge resize, volume, delete, 3/8 subdivisions, continuous resize/move, cancellation, scroll, tempo, playback, per-axis pinch, anchored midpoint and interrupted edits.');
 // The time/pitch index must not rescan unrelated notes during repeated pointer moves.
 run('rowIndexes.delete(score);score.length=0;selected=null;let checks=0;for(let i=0;i<24000;i++){const start=Math.floor(i/12)*480;score.push({get start(){checks++;return start},pitch:48+i%12,len:240,volume:100})};overlap(0,10,48);checks=0');
 for(let i=0;i<300;i++){
  const t=i*137,p=48+i%13,len=1+i%800;
  assert.equal(run('hit('+t+','+p+')'),run('score.find(n=>n.pitch==='+p+'&&n.start<='+t+'&&n.start+n.len>'+t+')||null'));
  assert.equal(run('overlap('+t+','+len+','+p+')'),run('score.some(n=>n.pitch==='+p+'&&n.start<'+(t+len)+'&&n.start+n.len>'+t+')'));
 }
 run('checks=0;for(let i=0;i<5000;i++){hit(i*101,48+i%12);overlap(i*101,120,48+i%12)}');
 assert(run('checks')<10000);
 console.log('PASS indexed note selection and collisions match exhaustive checks on 24,000 notes.');
})().catch(e=>{console.error(e);process.exitCode=1});
