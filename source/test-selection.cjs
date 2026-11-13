const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
function setup(){
 let clock=1000,id=0;const timers=new Map(),frames=new Map();
 const t=boot(false,{}, {setTimeout(fn,ms){const key=++id;timers.set(key,{fn,at:clock+ms});return key},clearTimeout:key=>timers.delete(key),requestAnimationFrame:fn=>{const key=++id;frames.set(key,fn);return key},cancelAnimationFrame:key=>frames.delete(key)});
 const run=t.run;
 // Keep the existing 320px note viewport and express legacy touch fixtures relative to the key strip.
 run('roll.clientWidth=keyWidth+320;resize();var testTime=1000;Date.now=()=>testTime;x=y=0;col=40;row=34;score.push({start:240,len:480,pitch:115,volume:40},{start:960,len:720,pitch:113,volume:80},{start:1920,len:240,pitch:114,volume:60});rowIndexes.delete(score);paint()');
 const finger=(type,x,y,pointerId=1)=>run(`roll.onpointer${type}({pointerId:${pointerId},button:0,clientX:${x}+keyWidth-56,clientY:${y},target:roll})`);
 const advance=ms=>{clock+=ms;run(`testTime=${clock}`);for(const [key,item] of [...timers])if(item.at<=clock){timers.delete(key);item.fn()}};
 const paint=()=>run('paint()');
 const select=()=>{finger('down',85,135);advance(350);finger('move',350,270);finger('up',350,270);paint()};
 const snapshot=()=>run('JSON.stringify(score)');
 return Object.assign(t,{finger,advance,paint,select,snapshot,frames,frame(){const pending=[...frames];frames.clear();for(const [,fn]of pending)fn()}});
}
let t=setup();t.finger('down',85,135);t.advance(349);assert.equal(t.run('gesture.mode'),'tap');t.advance(1);assert.equal(t.run('gesture.mode'),'select');assert.equal(t.els.selectionBox.hidden,false);
t.finger('move',350,270);t.finger('up',350,270);t.paint();assert.equal(t.run('selection.size'),2);assert.equal(t.run('score.length'),3);assert.equal(t.els.selectionBox.hidden,true);assert.equal(t.draft,'');assert.equal(t.els.noteName.textContent,'Нот: 2');assert.equal(t.els.duration.textContent,'Разная длина');assert.equal(t.els.volLabel.textContent,'Разная');
assert(t.run('selection.has(score[0])&&selection.has(score[1])&&!selection.has(score[2])'));
// A group preserves relative rhythm/pitch and moves from the touched point without a jump.
t.finger('down',110,185);t.finger('move',150,219);t.paint();assert.equal(t.run('score[0].start'),480);assert.equal(t.run('score[1].start'),1200);assert.equal(t.run('score[0].pitch'),114);assert.equal(t.run('score[1].pitch'),112);assert.equal(t.run('score[2].start'),1920);assert.equal(t.draft,'');
t.finger('up',150,219);assert.equal(t.draft,'');t.advance(60000);assert.equal(JSON.parse(t.draft).lanes[0].notes[1].start,1200);
// Offscreen group members are still drawn after moving into the viewport.
t.run('var seen=new Set();visibleNotes(lanes[0],0,20,n=>seen.add(n))');assert.equal(t.run('seen.size'),2);
const before=t.snapshot();t.finger('down',150,219);t.finger('move',210,253);t.finger('cancel',210,253);assert.equal(t.snapshot(),before);assert.equal(JSON.parse(t.draft).lanes[0].notes[0].start,480);
// Resizing a member changes all lengths by the same amount; shortest member never inverts.
t=setup();t.select();t.finger('down',173,185);assert.equal(t.run('gesture.mode'),'resize');t.finger('move',213,185);t.finger('up',213,185);assert.equal(t.run('score[0].len'),720);assert.equal(t.run('score[1].len'),960);
t.finger('down',213,185);t.finger('move',60,185);t.finger('up',60,185);assert.equal(t.run('score[0].len'),240);assert.equal(t.run('score[1].len'),480);
// Group clamps as a whole at zero time and highest/lowest pitches, preserving intervals.
t=setup();t.select();t.finger('down',110,185);t.finger('move',-200,-1000);t.finger('up',-200,-1000);assert.equal(t.run('score[0].start'),0);assert.equal(t.run('score[1].start'),720);assert.equal(t.run('score[0].pitch'),119);assert.equal(t.run('score[1].pitch'),117);
t=setup();t.select();t.finger('down',110,185);t.finger('move',110,10000);t.finger('up',110,10000);assert.equal(t.run('score[1].pitch'),24);assert.equal(t.run('score[0].pitch'),26);
// Bulk volume is persisted; delete removes only the selected group and retains the last template.
t=setup();t.select();t.els.volumeToggle.onclick();t.els.volume.oninput({target:{value:'37'}});t.els.volume.onchange();assert.equal(t.run('score[0].volume'),37);assert.equal(t.run('score[1].volume'),37);assert.equal(t.run('score[2].volume'),60);
t.els.deleteNote.onclick();assert.equal(t.run('score.length'),1);assert.equal(t.run('score[0].start'),1920);assert.equal(t.run('selection.size'),0);t.advance(60000);assert.equal(JSON.parse(t.draft).lanes[0].notes.length,1);assert.equal(t.run('templateNote.volume'),37);
// A short tap still creates one note; scrolling before hold cancels the selection timer.
t=setup();t.finger('down',85,135);t.advance(100);t.finger('up',85,135);t.advance(500);assert.equal(t.run('score.length'),4);assert.equal(t.run('selection.size'),0);
t=setup();t.finger('down',85,135);t.finger('move',60,135);t.advance(500);assert.equal(t.run('gesture.mode'),'pan');t.finger('up',60,135);assert.equal(t.run('score.length'),3);assert.equal(t.run('selection.size'),0);
// Cancel and a second finger undo an unfinished box; never add a phantom note.
t=setup();t.select();t.finger('down',85,135);t.advance(350);t.finger('move',90,140);t.finger('cancel',90,140);assert.equal(t.run('selection.size'),2);assert.equal(t.run('score.length'),3);
t=setup();t.finger('down',85,135);t.advance(350);t.finger('move',350,270);t.finger('down',240,230,2);assert.equal(t.run('selection.size'),0);t.finger('up',240,230,2);t.finger('up',350,270);assert.equal(t.run('score.length'),3);
// Pinching during group movement restores every member and keeps the earlier selection.
t=setup();t.select();const initial=t.snapshot();t.finger('down',110,185);t.finger('move',150,219);t.finger('down',240,230,2);assert.equal(t.snapshot(),initial);assert.equal(t.run('selection.size'),2);t.finger('up',240,230,2);t.finger('up',150,219);
// Empty tap dismisses a group without creating a note; tapping another note selects just that note.
t=setup();t.select();t.finger('down',85,135);t.finger('up',85,135);assert.equal(t.run('selection.size'),0);assert.equal(t.run('score.length'),3);
t.select();t.finger('down',390,219);t.finger('up',390,219);assert.equal(t.run('selection.size'),1);assert.equal(t.run('selected'),t.run('score[2]'));
// Group double-tap never accidentally deletes one member.
t=setup();t.select();for(let i=0;i<2;i++){t.finger('down',110,185);t.advance(30);t.finger('up',110,185);t.advance(30)}assert.equal(t.run('score.length'),3);assert.equal(t.run('selection.size'),2);
// Only the active lane is selected, even where background notes overlap the box.
t=setup();t.run('lanes.push({...newLane("Background"),ghost:true,notes:[{start:300,len:480,pitch:114,volume:90}]})');t.select();assert.equal(t.run('selection.size'),2);t.run('chooseLane(1)');assert.equal(t.run('selection.size'),0);
// Lost capture cleans up pending hold; auto-pan extends the rectangle without moving notes.
t=setup();t.finger('down',85,135);t.run('roll.onlostpointercapture({pointerId:1,target:roll})');t.advance(500);assert.equal(t.run('gesture'),null);assert.equal(t.run('score.length'),3);
t=setup();const unchanged=t.snapshot();t.finger('down',85,135);t.advance(350);t.finger('move',375,270);t.frame();assert(t.run('x')>0);assert.equal(t.snapshot(),unchanged);t.finger('up',375,270);
// A rectangle also selects a sustained note intersecting it, with its start far offscreen.
t=setup();t.run('score[0].start=0;score[0].len=9600;rowIndexes.delete(score);x=400');t.select();assert(t.run('selection.has(score[0])'));
console.log('PASS hold/box, group move/resize/clamps/volume/delete, cancel/pinch/scroll/tap, background isolation, templates/autosave, autoscroll and sustained overlap.');
