const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
const notes=t=>JSON.parse(t.run('JSON.stringify(score)'));
let writes=0;const t=boot(false,{writeDraft:()=>{writes++;return true}});
t.run("x=y=0;col=40;row=34;score.push({start:240,len:480,pitch:115,volume:40},{start:960,len:720,pitch:113,volume:80},{start:1920,len:240,pitch:114,volume:60});selection.add(score[0]);selection.add(score[1]);selected=score[0];paint()");
const original=notes(t);t.els.copyNotes.onclick();assert.equal(writes,1);
assert.deepEqual(notes(t).slice(0,3),original);assert.deepEqual(notes(t).slice(3),[{...original[0],start:1680},{...original[1],start:2400}]);assert.equal(t.run('selection.size'),2);assert(t.run('selection.has(score[3])&&selection.has(score[4])&&!selection.has(score[0])'));assert(t.run('selected===score[3]&&templateNote===score[3]'));
t.run('paint()');assert(!t.els.inspector.hidden);assert(t.run('pixels(selected.start)>=x&&pixels(selected.start)<x+w'));
// A repeated copy duplicates only the current group, not the original or unrelated note.
t.els.copyNotes.onclick();assert.equal(writes,2);assert.equal(t.run('score.length'),7);assert.deepEqual(notes(t).slice(5),[{...original[0],start:3120},{...original[1],start:3840}]);
// Copied notes can be moved together immediately with the existing finger gesture.
t.run("var copyPX=keyWidth+pixels(selected.start)-x+10,copyPY=rulerHeight+(highestPitch-selected.pitch+.5)*row-y;roll.onpointerdown({button:0,pointerId:1,clientX:copyPX,clientY:copyPY,target:roll});roll.onpointermove({pointerId:1,clientX:copyPX+40,clientY:copyPY+34,target:roll});roll.onpointerup({pointerId:1,clientX:copyPX+40,clientY:copyPY+34,target:roll})");
assert.equal(notes(t)[5].start,3360);assert.equal(notes(t)[6].start,4080);assert.equal(notes(t)[5].pitch,114);assert.deepEqual(notes(t).slice(0,3),original);
t.els.volume.oninput({target:{value:'25'}});t.els.volume.onchange();assert.equal(notes(t)[5].volume,25);assert.equal(notes(t)[0].volume,40);
t.els.deleteNote.onclick();assert.equal(t.run('score.length'),5);assert.deepEqual(notes(t).slice(0,3),original);
// One free-length/zero-volume note, no quantization or minimum length inflation.
const single=boot(false);single.run("division=4;score.push({start:13,len:7,pitch:60,volume:0});selected=score[0];selection.add(selected)");single.els.copyNotes.onclick();assert.deepEqual(notes(single)[1],{start:20,len:7,pitch:60,volume:0});assert.equal(JSON.parse(single.draft).lanes[0].notes.length,2);
assert(single.run('selected!==score[0]&&templateNote.len===7&&templateNote.volume===0'));
single.run('paint()');assert(!single.els.inspector.hidden);
// Overlapping notes and multiple pitches retain their full span and relative timing.
const overlap=boot(false);overlap.run("score.push({start:0,len:4000,pitch:60,volume:90},{start:1000,len:40,pitch:64,volume:30});for(const n of score)selection.add(n);selected=score[0];lanes.push({...newLane('Фон'),ghost:true,notes:[{start:0,len:4000,pitch:60,volume:80}]})");overlap.els.copyNotes.onclick();assert.equal(notes(overlap)[2].start,4000);assert.equal(notes(overlap)[3].start,5000);assert.equal(overlap.run('lanes[1].notes.length'),1);
const raw=overlap.run('encodeTrack()');overlap.run('applyTrack(readTrack('+JSON.stringify(raw)+'))');assert.equal(overlap.run('score.length'),4);assert.equal(overlap.run('selection.size'),0);
// No selection and busy/playing/gesture/pinch states never write or create notes.
const blocked=boot(false);blocked.els.copyNotes.onclick();assert.equal(blocked.draft,'');blocked.run('score.push({start:0,len:240,pitch:60,volume:80});selected=score[0];selection.add(selected)');
for(const [on,off] of [['running=true','running=false'],['fileBusy=true','fileBusy=false'],["gesture={mode:'move'}",'gesture=null'],['pinch={}','pinch=null']]){blocked.run(on);blocked.els.copyNotes.onclick();assert.equal(blocked.run('score.length'),1);blocked.run(off)}
assert.equal(blocked.draft,'');blocked.run('score[0].start=Number.MAX_SAFE_INTEGER-240');blocked.els.copyNotes.onclick();assert.equal(blocked.run('score.length'),1);assert.match(blocked.els.status.textContent,/пределы/);
// Large groups avoid spread-argument limits and are saved in a single operation.
let largeWrites=0;const big=boot(false,{writeDraft:()=>{largeWrites++;return true}});big.run('for(let i=0;i<10000;i++){const n={start:i*240,len:240,pitch:60,volume:80};score.push(n);selection.add(n)}selected=score[0]');big.els.copyNotes.onclick();assert.equal(big.run('score.length'),20000);assert.equal(big.run('selection.size'),10000);assert.equal(largeWrites,1);
console.log('PASS copy single/group/overlap, repeated copies, no shared notes, immediate drag/volume/delete, viewport reveal, lane isolation, serialization, guards/overflow and large groups.');
