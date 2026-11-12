const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
function setup(){
 const t=boot(),run=t.run;
 run('let testTime=1000;Date.now=()=>testTime;x=y=0;col=40;row=34;score.length=0;rowIndexes.delete(score);score.push({start:0,len:960,pitch:115,volume:37});paint()');
 const y=run('rulerHeight+(highestPitch-115+.5)*row');
 const pointer=(type,x=52,py=y,id=1)=>run(`roll.onpointer${type}({pointerId:${id},button:0,clientX:${x},clientY:${py}})`);
 const tick=n=>run(`testTime+=${n}`);
 const tap=(x=52)=>{pointer('down',x);tick(40);pointer('up',x)};
 return {...t,pointer,tick,tap,y};
}
let t=setup();t.tap();assert.equal(t.run('score.length'),1);t.tick(80);t.tap();
assert.equal(t.run('score.length'),0);assert.equal(t.run('selected'),null);
t.run('addNote(1920,114)');assert.equal(t.run('score[0].len'),960);assert.equal(t.run('score[0].volume'),37);
assert.equal(JSON.parse(t.run('encodeTrack()')).lanes[0].notes.length,1);
// A later selection, long hold, cancellation, drag or pinch must not delete.
t=setup();t.tap();t.tick(321);t.tap();assert.equal(t.run('score.length'),1);
t=setup();t.tap();t.pointer('down');t.tick(301);t.pointer('up');assert.equal(t.run('score.length'),1);
t=setup();t.tap();t.pointer('down');t.pointer('cancel');t.tap();assert.equal(t.run('score.length'),1);
t=setup();t.tap();t.pointer('down');t.pointer('move',120);t.pointer('up',120);t.tap(120);assert.equal(t.run('score.length'),1);
t=setup();t.tap();t.pointer('down');t.pointer('down',140,t.y,2);t.pointer('up',140,t.y,2);t.pointer('up');t.tap();assert.equal(t.run('score.length'),1);
// A new note's creation is not the first half of a double tap.
t=setup();t.run('score.length=0;rowIndexes.delete(score)');t.tap();t.tap();assert.equal(t.run('score.length'),1);t.tap();assert.equal(t.run('score.length'),0);
// A different note at the same pitch is not a double tap, nor is a distant point on a long note.
t=setup();t.run('score.push({start:960,len:960,pitch:115,volume:90});rowIndexes.delete(score)');t.tap();t.tap(240);assert.equal(t.run('score.length'),2);
t=setup();t.tap();t.tap(180);assert.equal(t.run('score.length'),1);
// Deleting one overlapping note leaves its neighbour intact and keeps the deleted note's settings.
t=setup();t.run('score.push({start:0,len:240,pitch:115,volume:61});rowIndexes.delete(score)');t.tap();t.tap();assert.equal(t.run('score.length'),1);assert.equal(t.run('score[0].len'),960);t.run('addNote(1920,114)');assert.equal(t.run('score[1].len'),240);assert.equal(t.run('score[1].volume'),61);
// Selecting another note after deletion replaces the retained template.
t=setup();t.run('score.push({start:960,len:480,pitch:115,volume:83});rowIndexes.delete(score)');t.tap();t.tap();t.tap(240);t.run('addNote(2400,114)');assert.equal(t.run('score[1].len'),480);assert.equal(t.run('score[1].volume'),83);
// Selecting a background lane now makes it editable.
t=setup();t.run('lanes[0].ghost=true');t.tap();t.tap();assert.equal(t.run('score.length'),0);
console.log('PASS double tap delete, retained length/volume, creation, timing, holds, drag, cancel, pinch, overlap and locked lanes.');
