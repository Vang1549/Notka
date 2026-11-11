const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
const t=boot(false),r=t.run;
const flag=i=>t.els.ghostChoices.children[i].children[2].children[0];
t.els.editLane.onclick();assert(t.els.deleteLane.disabled);assert(!flag(0).disabled);assert.equal(flag(0).checked,false);
flag(0).checked=true;flag(0).onchange();assert.equal(r('lanes[0].ghost'),true);assert.equal(r('isBackground(lanes[0])'),false);assert.equal(flag(0).className,'deferred');assert.equal(JSON.parse(t.draft).lanes[0].ghost,true);
t.els.addLane.onclick();assert.equal(r('isBackground(lanes[0])'),true);assert.equal(flag(0).className,'');assert.equal(flag(0).checked,true);
r('chooseLane(0)');assert.equal(r('isBackground(lanes[0])'),false);assert(flag(0).checked);assert.equal(flag(0).className,'deferred');
flag(0).checked=false;flag(0).onchange();r('chooseLane(1)');assert.equal(r('isBackground(lanes[0])'),false);
// Rename directly, preserve unfinished input, restore blank on blur.
t.els.laneName.oninput({target:{value:'  Мелодия  '}});assert.equal(r('lanes[1].name'),'Мелодия');assert.match(t.els.ghostChoices.children[1].children[1].textContent,/Мелодия/);
t.els.laneName.value=' ';t.els.laneName.oninput({target:t.els.laneName});t.els.laneName.onblur();assert.equal(t.els.laneName.value,'Мелодия');
r('score.push({start:0,len:960,pitch:60,volume:50})');
// Merely requesting or cancelling deletion must keep the lane and its notes.
t.els.deleteLane.onclick();assert.equal(r('lanes.length'),2);assert(!t.els.laneDeleteConfirm.hidden);assert.match(t.els.laneDeleteName.textContent,/Мелодия/);t.els.cancelLaneDelete.onclick();t.els.confirmLane.onclick();assert.equal(r('lanes.length'),2);assert.equal(r('score.length'),1);
// Changing the selected lane, its name, closing, or adding a lane cancels stale confirmation.
for(const action of [()=>r('chooseLane(0)'),()=>t.els.laneName.oninput({target:{value:'Новая'}}),()=>{t.els.closeLane.onclick();t.els.editLane.onclick()},()=>t.els.addLane.onclick()]){t.els.deleteLane.onclick();action();const count=r('lanes.length');t.els.confirmLane.onclick();assert.equal(r('lanes.length'),count);assert(t.els.laneDeleteConfirm.hidden)}
// Active deferred background is still deletable; only the confirmed lane disappears.
r('chooseLane(1)');flag(1).checked=true;flag(1).onchange();t.els.deleteLane.onclick();const count=r('lanes.length');t.els.confirmLane.onclick();assert.equal(r('lanes.length'),count-1);assert(!r('lanes.some(l=>l.notes.length)'));assert(t.els.laneSheet.hidden);
r('chooseLane(0)');t.els.editLane.onclick();t.els.deleteLane.onclick();t.els.confirmLane.onclick();t.els.editLane.onclick();assert(t.els.deleteLane.disabled);t.els.deleteLane.onclick();t.els.confirmLane.onclick();assert.equal(r('lanes.length'),1);
console.log('PASS editable/deferred active background, switching, persistence, inline rename, empty names, deletion cancel/stale confirmation, confirmed target and last-lane guard.');
