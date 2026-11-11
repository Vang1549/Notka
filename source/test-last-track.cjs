const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
const original={format:'notka.track',version:1,ppq:960,bpm:133,division:4,notes:[{start:960,len:480,pitch:65,volume:37}]};
const raw=JSON.stringify(original);
const t=boot(false,{readDraft:()=>raw});
assert.equal(t.run('score.length'),0);
t.els.prefs.onclick();assert(!t.els.prefHome.hidden);t.els.lastTrack.onclick();assert.equal(t.run('score.length'),1);assert.equal(t.run('score[0].pitch'),65);assert(t.els.preferences.hidden);
// The menu action must retain the existing replacement confirmation on a nonempty project.
t.run('score[0].pitch=70');t.els.prefs.onclick();t.els.lastTrack.onclick();assert(!t.els.replaceTrack.hidden);assert.equal(t.run('score[0].pitch'),70);t.els.replaceTrack.onclick();assert.equal(t.run('score[0].pitch'),65);
const empty=boot(false);empty.els.prefs.onclick();empty.els.lastTrack.onclick();assert.match(empty.els.trackStatus.textContent,/Автокопии пока нет/);assert.equal(empty.run('score.length'),0);
console.log('PASS last track directly from editor menu, no automatic load, confirmation, missing draft.');
