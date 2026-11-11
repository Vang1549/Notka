const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
function setup(){
 const files=new Map();let exits=0,fail=false,draftFail=false;
 const t=boot(true,{songList:()=>JSON.stringify([...files.keys()]),publicSongs:()=>true,
  saveSong:(file,data)=>{if(fail)return 0;if(files.has(file))return 2;files.set(file,data);return 1},
  overwriteSong:(file,data)=>{if(fail)return 0;files.set(file,data);return 1},leave:()=>exits++},{Blob});
 t.run('score.push({pitch:60,start:0,len:960,volume:80});trackChanged()');
 return Object.assign(t,{files,getExits:()=>exits,failSave:()=>fail=true,failDraft:()=>t.run('NotkaPlayer.writeDraft=()=>false')});
}
const back=t=>t.run('notkaBack()');
const tap=(el,target=el)=>{el.onpointerdown({target});el.onclick({target,stopPropagation(){}})};
(async()=>{
 const t=setup();await t.run("play('visual')");t.els.stagePrefs.onclick();
 t.els.speed.value='1.7';t.els.speed.oninput();back(t);
 assert(t.els.preferences.hidden);assert(!t.els.stage.hidden);assert.equal(JSON.parse(t.draft).scene.speed,1.7);
 back(t);assert(t.els.stage.hidden);assert(!t.els.exitSheet||t.els.exitSheet.hidden);assert.equal(t.getExits(),0);
 back(t);assert(!t.els.exitSheet.hidden);back(t);assert(t.els.exitSheet.hidden);assert.equal(t.getExits(),0);
 // Nested deletion confirmation consumes one Back/outside tap, then its parent closes.
 t.els.editLane.onclick();t.els.addLane.onclick();t.els.deleteLane.onclick();assert(!t.els.laneDeleteConfirm.hidden);
 tap(t.els.laneSheet);assert(t.els.laneDeleteConfirm.hidden);assert(!t.els.laneSheet.hidden);assert.equal(t.run('lanes.length'),2);
 // Starting on a child and ending on the backdrop does not dismiss anything.
 t.els.laneSheet.onpointerdown({target:{}});t.els.laneSheet.onclick({target:t.els.laneSheet,stopPropagation(){}});assert(!t.els.laneSheet.hidden);
 tap(t.els.laneSheet);assert(t.els.laneSheet.hidden);
 // New song: no file until a valid, unique name succeeds, and Back cancels the whole exit flow.
 back(t);t.els.exitSave.onclick();assert(!t.els.exitNameForm.hidden);t.els.exitName.value='../bad';t.els.exitConfirm.onclick();assert.equal(t.files.size,0);assert.equal(t.getExits(),0);
 back(t);assert(t.els.exitSheet.hidden);back(t);t.els.exitSave.onclick();t.els.exitName.value='Новый';t.els.exitConfirm.onclick();
 assert(t.files.has('Новый.notka'));assert.equal(t.getExits(),1);assert.equal(JSON.parse(t.files.get('Новый.notka')).scene.speed,1.7);
 // Existing song: overwrite and Save As are explicit; cancellation does not overwrite.
 const u=setup();u.run("writeSong('Original.notka',false);closePrefs();score[0].pitch=65;trackChanged()");
 back(u);u.els.exitSave.onclick();assert(!u.els.exitChoices.hidden);assert.match(u.els.exitOverwrite.textContent,/Original/);u.els.cancelExit.onclick();assert.equal(u.getExits(),0);assert.equal(JSON.parse(u.files.get('Original.notka')).lanes[0].notes[0].pitch,60);
 back(u);u.els.exitSave.onclick();u.els.exitNew.onclick();u.els.exitName.value='Original';u.els.exitConfirm.onclick();assert.equal(u.getExits(),0);assert.match(u.els.exitStatus.textContent,/название уже есть/);
 u.els.exitName.value='Copy';u.els.exitConfirm.onclick();assert.equal(u.getExits(),1);assert.equal(u.files.size,2);assert.equal(JSON.parse(u.files.get('Copy.notka')).lanes[0].notes[0].pitch,65);
 const v=setup();v.run("writeSong('Original.notka',false);closePrefs();score[0].pitch=70;trackChanged()");back(v);v.els.exitSave.onclick();v.els.exitOverwrite.onclick();assert.equal(v.getExits(),1);assert.equal(JSON.parse(v.files.get('Original.notka')).lanes[0].notes[0].pitch,70);
 // Write failures stay inside exit dialog, no silent exit; discard preserves recoverable draft.
 const f=setup();f.failSave();back(f);f.els.exitSave.onclick();f.els.exitName.value='Error';f.els.exitConfirm.onclick();assert.equal(f.getExits(),0);assert(!f.els.exitSheet.hidden);assert.match(f.els.exitStatus.textContent,/Не удалось/);
 f.els.cancelExit.onclick();back(f);f.els.exitDiscard.onclick();assert.equal(f.getExits(),1);assert.equal(JSON.parse(f.draft).lanes[0].notes[0].pitch,60);
 const d=setup();d.failDraft();back(d);d.els.exitDiscard.onclick();assert.equal(d.getExits(),0);assert.match(d.els.exitStatus.textContent,/автокопию/);
 // Settings confirmations dismiss before the parent; opening input alone is not an action.
 const p=setup();p.els.stagePrefs.onclick();p.run("confirmPresetAction('Удалить?',()=>{throw Error('must not run')})");back(p);assert(p.els.presetConfirm.hidden);assert(!p.els.preferences.hidden);tap(p.els.preferences);assert(p.els.preferences.hidden);
 p.els.prefs.onclick();p.els.saveAs.onclick();back(p);assert(!p.els.preferences.hidden);assert(!p.els.prefHome.hidden);back(p);assert(p.els.preferences.hidden);
 // Escape uses the same path and never invokes the native leave directly.
 let prevented=false;p.doc.keydown({key:'Escape',preventDefault(){prevented=true}});assert(prevented);assert(!p.els.exitSheet.hidden);tap(p.els.exitSheet);assert(p.els.exitSheet.hidden);assert.equal(p.getExits(),0);
 console.log('PASS one-layer Back, scene parameters, backdrop/drag discrimination, nested confirmation cancellation, new/overwrite/copy exit, name collisions, save/draft failure, recovery and Escape.');
})().catch(e=>{console.error(e);process.exitCode=1});
