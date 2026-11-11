const {boot,settle}=require('./test-instruments.cjs');
const fs=require('fs'),assert=require('assert/strict');
function host(){const h={parts:[],saved:[],cancelled:0,fail:false};h.api={songList:()=> '[]',publicSongs:()=>true,beginExport(){h.parts=[];return true},appendExport(raw){if(h.fail)return false;h.parts.push(Buffer.from(raw,'base64'));return true},finishExport(name){h.saved.push({name,data:Buffer.concat(h.parts)});return true},cancelExport(){h.cancelled++;h.parts=[]}};return h}
(async()=>{
 const h=host(),t=boot(true,h.api);
 t.run("score.push({start:480,len:480,pitch:60,volume:100},{start:960,len:960,pitch:60,volume:50});lanes[0].name='Правая';lanes[0].ghost=true;lanes.push({...newLane('Левая'),notes:[{start:480,len:1440,pitch:60,volume:80}]},{...newLane('Выключена'),muted:true,notes:[{start:0,len:960,pitch:64,volume:50}]})");
 const original=t.run('encodeTrack()');t.els.exportTrack.onclick();t.els.exportName.value='Проверка';await t.els.exportMidi.onclick();
 assert.equal(h.saved.length,1,t.els.exportStatus.textContent);assert.match(h.saved[0].name,/\.mid$/);assert.equal(t.run('encodeTrack()'),original);assert.equal(t.reads.length,0);assert(!t.run('fileBusy'));
 fs.writeFileSync('/tmp/notka-export.mid',h.saved[0].data);
 t.els.exportMuted.checked=true;await t.els.exportMidi.onclick();fs.writeFileSync('/tmp/notka-export-muted.mid',h.saved[1].data);
 h.fail=true;await t.els.exportMidi.onclick();assert.equal(h.saved.length,2);assert(h.cancelled);assert.match(t.els.exportStatus.textContent,/записать/);h.fail=false;
 t.els.exportName.value='../bad';await t.els.exportMidi.onclick();assert.equal(h.saved.length,2);
 t.els.exportName.value='Проверка';t.run('lanes=Array.from({length:16},(_,i)=>({...newLane(String(i)),notes:[{start:0,len:960,pitch:60,volume:80}]}))');await t.els.exportMidi.onclick();assert.match(t.els.exportStatus.textContent,/15/);
 t.run('lanes.pop()');await t.els.exportMidi.onclick();fs.writeFileSync('/tmp/notka-export-15.mid',h.saved.at(-1).data);
 t.run('lanes=[newLane("Пустая")]');await t.els.exportMidi.onclick();assert.match(t.els.exportStatus.textContent,/Нет звучащих/);
 t.run('score=lanes[0].notes;score.push({start:0x10000000,len:960,pitch:60,volume:80})');await t.els.exportMidi.onclick();assert.match(t.els.exportStatus.textContent,/промежуток/);
 // Independently unpacked below using Python's ZIP/WAV/MIDI readers.
 h.api.beginExport();await t.run("(async()=>{const j={bytes:0,chunks:0,entries:[]};await zipFile(j,'Русское имя.txt',w=>w(exportText('Тест')));await zipFile(j,'test.wav',async w=>{await w(waveHeader(320));await w(new Uint8Array(1280))});await zipFinish(j)})()");
 fs.writeFileSync('/tmp/notka-export.zip',Buffer.concat(h.parts));
 const old=boot();old.els.exportTrack.onclick();assert.match(old.els.exportStatus.textContent,/0.35/);assert(old.els.exportMidi.disabled);
 // Cancel before a delayed bank finishes loading: never publish partial audio.
 const c=host(),cancel=boot(true,c.api);cancel.run('score.push({start:0,len:960,pitch:60,volume:100})');cancel.els.exportTrack.onclick();cancel.delay=true;
 const pending=cancel.els.exportAudio.onclick();await settle();assert(cancel.waiting);cancel.els.cancelExport.onclick();cancel.delay=false;cancel.flush();await pending;
 assert.equal(c.saved.length,0);assert.equal(c.cancelled,1);assert.match(cancel.els.exportStatus.textContent,/отменён/);assert(!cancel.run('fileBusy'));
 // A .notka copy includes every lane and scene, and keeps the working filename/draft unchanged.
 const copies=new Map();let copyResult=1;
 const n=boot(true,{songList:()=>JSON.stringify([...copies.keys()]),publicSongs:()=>true,saveSong:(name,raw)=>{if(copies.has(name))return 2;if(copyResult!==1)return copyResult;copies.set(name,raw);return 1}});
 n.run("songFile='Memory.notka';score.push({start:0,len:960,pitch:60,volume:80});lanes[0].muted=true;options.speed=2.4;options.colors['lane-0']='#123456';trackChanged()");
 const before=n.run('encodeTrack()'),draft=n.draft,version=n.run('editorVersion');
 n.els.exportTrack.onclick();assert(!n.els.exportNotka.disabled);assert(n.els.exportMidi.disabled);
 await n.els.exportNotka.onclick();const filename='Memory(v'+version+').notka';
 assert.equal(copies.get(filename),before);assert.equal(n.run('songFile'),'Memory.notka');assert.equal(n.draft,draft);assert.equal(n.run('encodeTrack()'),before);
 assert.equal(JSON.parse(copies.get(filename)).scene.speed,2.4);assert.equal(JSON.parse(copies.get(filename)).lanes[0].muted,true);
 n.run('options.speed=1');await n.els.exportNotka.onclick();assert.equal(copies.get(filename),before);assert.match(n.els.exportStatus.textContent,/уже есть/);
 n.els.exportName.value='Copy(v0.51)(v0.55).notka';await n.els.exportNotka.onclick();assert(copies.has('Copy(v'+version+').notka'));
 n.run("songFile='Memory(v0.55).notka'");n.els.exportTrack.onclick();assert.equal(n.els.exportName.value,'Memory');
 for(const value of ['../bad','(v0.55).notka','x'.repeat(49)]){n.els.exportName.value=value;await n.els.exportNotka.onclick();assert.equal(copies.size,2)}
 copyResult=0;n.els.exportName.value='Failure';await n.els.exportNotka.onclick();assert.equal(copies.size,2);assert.match(n.els.exportStatus.textContent,/Не удалось/);assert(!n.run('fileBusy'));assert(!n.els.exportNotka.disabled);
 const recipient=boot();recipient.run('applyTrack(readTrack('+JSON.stringify(copies.get(filename))+'))');assert.equal(recipient.run('options.speed'),2.4);assert.equal(recipient.run('score.length'),1);
 assert(old.els.exportNotka.disabled);
 c.api.beginExport(); // A running audio export also disables project-copy export.
 cancel.delay=true;cancel.els.exportName.value='Busy';const audioPending=cancel.els.exportAudio.onclick();await settle();assert(cancel.els.exportNotka.disabled);cancel.els.cancelExport.onclick();cancel.delay=false;cancel.flush();await audioPending;
 console.log('PASS versioned .notka copies, suffix replacement, complete muted tracks/scene, duplicate protection, unchanged working file, validation/failure recovery, old APK and import.');
 console.log('PASS export UI, immutable source, ghost/mute options, MIDI without samples, limits, invalid names, failed writes, ZIP streaming, cancellation and old APK notice.');
})().catch(e=>{console.error(e);process.exitCode=1});
