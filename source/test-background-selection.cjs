const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
const t=boot(),run=t.run;
run(`lanes=[{name:'Фон',ghost:true,muted:true,instrument:'vsco-piano-1',notes:[{start:0,len:960,pitch:60,volume:47}]},{name:'Основная',ghost:false,muted:false,instrument:'vsco-piano-1',notes:[]},{name:'Ещё фон',ghost:true,muted:false,instrument:'vsco-piano-1',notes:[]}];activeLane=1;score=lanes[1].notes;y=(highestPitch-62)*row;paint();chooseLane(0);paint()`);
assert.equal(run('isBackground(lanes[0])'),false);assert.equal(run('lanes[0].ghost'),true);assert.equal(run('lanes[0].muted'),true);
assert.equal(run('hit(0,60)'),run('score[0]'));assert(!run('[...blockViews.values()][0].className').includes('ghost'));
t.els.editLane.onclick();const flag=t.els.ghostChoices.children[0].children[2].children[0];assert(!flag.disabled);assert.equal(flag.checked,true);assert.equal(flag.className,'deferred');
run('selectNote(score[0]);addNote(1920,62)');assert.equal(run('score.length'),2);assert.equal(run('score[1].volume'),47);
const saved=run('encodeTrack()');assert.equal(JSON.parse(saved).lanes[0].ghost,true);
run('chooseLane(2);paint()');assert.equal(run('isBackground(lanes[0])'),true);assert.equal(run('isBackground(lanes[2])'),false);assert(run('[...blockViews.values()].every(el=>el.className.includes("ghost"))'));
run('chooseLane(1)');assert.equal(run('isBackground(lanes[2])'),true);assert.equal(run('lanes[1].ghost'),false);
run('chooseLane(0);chooseLane(1)');assert.equal(run('lanes[1].ghost'),false);assert.equal(run('lanes[0].muted'),true);
// Restoring a saved project keeps the active lane editable and its original setting recoverable.
run('applyTrack(readTrack('+JSON.stringify(saved)+'));paint()');assert.equal(run('activeLane'),0);assert.equal(run('isBackground(lanes[0])'),false);assert.equal(run('score.length'),2);
run('chooseLane(1);paint()');assert.equal(run('isBackground(lanes[0])'),true);assert.equal(run('hit(0,60)'),null);
// Explicit changes to an inactive lane remain effective after a visit.
t.els.editLane.onclick();const background=t.els.ghostChoices.children[0].children[2].children[0];background.checked=false;background.onchange();run('chooseLane(0);chooseLane(1)');assert.equal(run('lanes[0].ghost'),false);
// Removing the selected lane reveals the next one without losing that lane's background preference.
run('chooseLane(1)');t.els.editLane.onclick();t.els.deleteLane.onclick();t.els.confirmLane.onclick();assert.equal(run('lanes.length'),2);assert.equal(run('isBackground(lanes[activeLane])'),false);
console.log('PASS temporary background override, selection/editing, original flags, mute, visible notes, file restore, inactive preference changes and deletion.');
