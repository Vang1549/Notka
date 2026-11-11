const {boot}=require('./test-instruments.cjs'),{installedSounds}=require('./test-sound-host.cjs');
const fs=require('fs'),assert=require('assert/strict');
const original=JSON.parse(fs.readFileSync('app/presets/Memory.notka','utf8'));
const legacyShape=raw=>{const data=JSON.parse(raw);delete data.instruments;delete data.instrumentSources;data.version=2;data.lanes.forEach(l=>delete l.instrumentId);return data};
const find=t=>t.els.songList.children.find(b=>b.textContent==='Memory · Предустановленный');
function menu(t){t.els.prefs.onclick();t.els.loadTrack.onclick()}
(async()=>{
 const t=boot();assert.equal(t.run('score.length'),0);assert.equal(t.draft,'');assert.equal(t.started.length,0);
 menu(t);assert(find(t));assert.equal(t.draft,'');assert.equal(t.run('score.length'),0);
 t.els.songQuery.value='mEmOrY';t.els.songQuery.oninput();assert(find(t));
 t.els.songQuery.value='missing';t.els.songQuery.oninput();assert.equal(t.els.songList.children.length,0);
 t.els.songQuery.value='';t.els.songQuery.oninput();find(t).onclick();
 assert.deepEqual(legacyShape(t.run('encodeTrack()')),original);assert.equal(t.run('songFile'),null);assert.equal(t.started.length,0);
 assert.equal(t.els.status.textContent,'Трек загружен.');
 t.run('score[0].pitch=80;trackChanged()');const changed=t.run('encodeTrack()');menu(t);find(t).onclick();
 assert.equal(t.run('encodeTrack()'),changed);assert.equal(t.els.replaceTrack.hidden,false);
 t.els.closePrefs.onclick();assert.equal(t.run('encodeTrack()'),changed);
 menu(t);find(t).onclick();t.els.replaceTrack.onclick();assert.deepEqual(legacyShape(t.run('encodeTrack()')),original);
 assert.deepEqual(JSON.parse(t.run('JSON.stringify(presetSongs[0].track)')),original);
 const p=boot(true,{songList:()=>JSON.stringify(['Memory.notka']),openSong:()=>JSON.stringify({...original,bpm:100}),publicSongs:()=>true});
 menu(p);assert.equal(p.els.songList.children.length,2);p.els.songList.children[0].children[0].onclick();assert.equal(p.run('bpm'),100);assert.equal(p.run('songFile'),'Memory.notka');
 menu(p);find(p).onclick();p.els.replaceTrack.onclick();assert.equal(p.run('songFile'),null);assert.equal(p.run('bpm'),150);
 const e=boot(true,{songList:()=>{throw Error('storage unavailable')}});menu(e);assert(find(e));find(e).onclick();assert.equal(e.run('bpm'),150);
 const ready=boot(true,installedSounds());menu(ready);find(ready).onclick();assert.equal(ready.els.status.textContent,'Трек загружен.');await ready.run("play('start')");assert.equal(ready.run('running'),true);ready.run('stop()');
 console.log('PASS no startup/autoplay/write, exact Memory data, search, readonly preset, replace/cancel, personal filename collision, folder failure/old host, missing instrument hint and installed-bank playback.');
})().catch(e=>{console.error(e);process.exitCode=1});
