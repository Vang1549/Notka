const musicbox=require('./test-support/musicbox.cjs');
const {boot,settle}=require('./test-instruments.cjs'),{installedSounds}=require('./test-sound-host.cjs'),assert=require('assert/strict'),fs=require('fs');
(async()=>{
 let downloads=0;const t=boot(true,{...installedSounds(),instrumentData:musicbox.instrumentData,soundDownload:()=>{downloads++;return '1'}});await settle();assert.equal(downloads,0);
 assert.equal(t.run('matchingInstruments().length'),37);assert.equal(t.run('matchingInstruments().filter(i=>i.remote).length'),34);
 t.run("instrumentCategory='keys';instrumentQuery='гранд';renderInstruments()");assert.equal(t.run('matchingInstruments()[0].id'),'lib-mda-grand-1');
 t.run("instrumentCategory='all';instrumentQuery='music box';renderInstruments()");assert.equal(t.run('matchingInstruments()[0].id'),'lib-floe-musicbox-1');
 t.run("instrumentQuery='';renderInstruments()");
 const rows=t.els.instrumentChoices.children.filter(x=>x.className==='instrument-row');assert.equal(rows.length,37);
 for(const row of rows){assert.match(row.children[1].textContent,/^\([\d,]+ МБ\)$/);assert(!/Встроен|В треке/.test(row.children.map(x=>x.textContent).join(' ')));assert(!row.children[2].disabled)}
 await t.run("unlock();prepareInstrument('lib-floe-musicbox-1')");assert.equal(t.run("instrumentCache.get('lib-floe-musicbox-1').samples.length"),musicbox.data.samples.length);
 for(let rr=0;rr<4;rr++){t.run(`instrumentNote('lib-floe-musicbox-1',60,1,1,90,{},${rr})`);assert(t.run(`instrumentCache.get('lib-floe-musicbox-1').samples.filter(s=>s.rr===${rr})`).some(s=>s.buffer===t.started.at(-1).buffer))}
 assert.equal(t.reads.filter(x=>x==='musicbox-floe').length,1);await t.run("prepareInstrument('lib-mda-grand-1')");assert(t.run("instrumentCache.has('lib-mda-grand-1')"));
 // Old arrangements retain their old bank IDs; their existing downloaded data still plays.
 await t.run("prepareInstrument('lib-musicbox-1')");assert(t.run("instrumentCache.has('lib-musicbox-1')"));assert(!t.run("matchingInstruments().some(i=>i.id==='lib-musicbox-1')"));
 const source=fs.readFileSync('app/presets/Memory.notka','utf8'),songs=new Map([['Альфа.notka',source],['Бета.notka',source]]);let fail=false,removed=[];
 const s=boot(true,{songList:()=>JSON.stringify([...songs.keys()]),publicSongs:()=>true,openSong:f=>songs.get(f),deleteSong:f=>{removed.push(f);return !fail&&songs.delete(f)}});
 s.els.prefs.onclick();s.els.loadTrack.onclick();const original=s.run('encodeTrack()');s.run("askSongDelete('Альфа.notka')");s.els.cancelSongDelete.onclick();assert.equal(removed.length,0);
 s.run("askSongDelete('../bad.notka')");s.els.confirmSongDelete.onclick();assert.equal(removed.length,0);
 s.run("askSongDelete('Альфа.notka')");fail=true;s.els.confirmSongDelete.onclick();assert(songs.has('Альфа.notka'));assert.match(s.els.trackStatus.textContent,/Не удалось/);
 fail=false;s.els.confirmSongDelete.onclick();assert(!songs.has('Альфа.notka'));assert.equal(s.run('encodeTrack()'),original);assert(songs.has('Бета.notka'));
 s.run('applyTrack(readTrack('+JSON.stringify(source)+'))');s.run("songFile='Бета.notka'");const notes=s.run('score.length');s.run("askSongDelete('Бета.notka')");s.els.confirmSongDelete.onclick();assert.equal(s.run('songFile'),null);assert.equal(s.run('score.length'),notes);assert(!JSON.parse((s.run('flushDraft(true)'),s.draft)).draftFile);
 assert.equal(s.run('songNames.length'),0);assert(s.els.songList.children.some(b=>b.textContent==='Memory · Предустановленный'));
 const old=boot(true,{songList:()=>JSON.stringify(['Альфа.notka']),publicSongs:()=>true});old.els.loadTrack.onclick();old.run("askSongDelete('Альфа.notka')");old.els.confirmSongDelete.onclick();assert.match(old.els.trackStatus.textContent,/0.48/);
 console.log('PASS three offline banks, compact sizes, retained legacy banks, four round-robin groups, shared decode cache, safe song delete/cancel/failure, open-song preservation and APK fallback.');
})().catch(e=>{console.error(e);process.exitCode=1});
