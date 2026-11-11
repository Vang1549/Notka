const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
(async()=>{
 const t=boot(),run=t.run;
 run("x=y=0;division=4;col=40;row=34;lanes[0].notes=[{start:0,len:7680,pitch:114,volume:70},{start:240,len:240,pitch:115,volume:100}];score=lanes[0].notes;selected=null;paint()");
 const finger=(type,px,py)=>run(`roll.onpointer${type}({pointerId:1,isPrimary:true,button:0,clientX:${px}+keyWidth-56,clientY:${py}})`);
 const py=run('rulerHeight+(highestPitch-115+.5)*row');
 finger('down',105,py);assert.equal(run('gesture.mode'),'move');finger('move',105,py+34);finger('up',105,py+34);
 assert.equal(run('score[1].pitch'),114);assert.equal(run('score[1].start'),240);assert.equal(run('score[0].len'),7680);
 // Drag did not re-anchor to the note centre or merge its identity with the sustained note.
 assert.equal(run('score.length'),2);run('selected=null;paint()');assert.equal(run('hit(300,114)'),run('score[1]'));assert.equal(run('hit(4000,114)'),run('score[0]'));
 assert(run('Number(blockViews.get(score[1]).style.zIndex)>Number(blockViews.get(score[0]).style.zIndex)'));
 const y=py+34;
 finger('down',132,y);assert.equal(run('gesture.mode'),'resize');finger('move',252,y);finger('up',252,y);
 assert.equal(run('score[1].len'),960);assert.equal(run('score[0].len'),7680);
 // Grow a note through a later neighbour, previously clamped to its start.
 run('selected=null;rowIndexes.delete(score);score[0].start=960;score[1].start=0;score[1].len=240;paint()');
 finger('down',92,y);finger('move',292,y);finger('up',292,y);assert.equal(run('score[1].len'),1440);
 // Cancel overlapping movement and preserve exact start/length/pitch and autosave data.
 const before=run('JSON.stringify(score)');finger('down',90,y);finger('move',130,y-34);finger('cancel',130,y-34);assert.equal(run('JSON.stringify(score)'),before);
 const saved=run('encodeTrack()');run('applyTrack(readTrack('+JSON.stringify(saved)+'))');assert.equal(run('encodeTrack()'),saved);
 // Both identical-pitch voices start independently and have their own release time.
 run('rowIndexes.delete(score);score[0].start=score[1].start=0');const offset=t.started.length;await run('play("start")');
 assert.equal(t.started.length-offset,2);assert.equal(t.started[offset].at,t.started[offset+1].at);assert.notEqual(t.started[offset].off,t.started[offset+1].off);run('stop()');
 // Compare interval lookup against exhaustive results for deeply nested and irregular intervals.
 run('selected=null;rowIndexes.delete(score);score.length=0;for(let i=0;i<8000;i++)score.push({start:(i*137)%40000,len:i%7?1+(i*521)%3000:70000,pitch:48+i%12,volume:100});score.push({start:0,len:90000,pitch:60,volume:50})');
 for(let i=0;i<150;i++){
  const start=(i*829)%80000,pitch=48+i%13,len=1+i*7;
  assert(run(`(()=>{const got=[];queryNotes(noteIndex(lanes[0]).get(${pitch}),${start},${start+len},e=>{got.push(e.note)});const expected=score.filter(n=>n.pitch===${pitch}&&n.start<${start+len}&&n.start+n.len>${start});return got.length===expected.length&&expected.every(n=>got.includes(n))})()`));
  assert.equal(run(`overlap(${start},${len},${pitch})`),run(`score.some(n=>n.pitch===${pitch}&&n.start<${start+len}&&n.start+n.len>${start})`));
  assert.equal(run(`hit(${start},${pitch})`),run(`score.filter(n=>n.pitch===${pitch}&&n.start<=${start}&&n.start+n.len>${start}).sort((a,b)=>noteIndex(lanes[0]).layers.get(b)-noteIndex(lanes[0]).layers.get(a))[0]||null`));
 }
 run('x=pixels(60000);const seen=[];visibleNotes(lanes[0],highestPitch-60,1,n=>seen.push(n))');assert(run('seen.includes(score[score.length-1])'));
 run('lanes[0].ghost=true;lanes.push(newLane("Empty"));chooseLane(1)');assert.equal(run('hit(65000,60)'),null);
 console.log('PASS overlapping move/resize, anchored drag, cancellation, layer selection, save/reload, independent same-pitch audio voices, nested interval index and offscreen sustained notes.');
})().catch(e=>{console.error(e);process.exitCode=1});
