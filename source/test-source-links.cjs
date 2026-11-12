const {boot,settle}=require('./test-instruments.cjs'),{installedSounds}=require('./test-sound-host.cjs'),fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const id='lib-floe-musicbox-1',url='https://www.frozenplain.com/product/music-box-suite-free';
 const p=boot(true,installedSounds());p.run(`lanes[0].instrument='${id}';score.push({pitch:60,start:0,len:960,volume:80});reconcileRack()`);
 const original=p.run('encodeTrack()');assert.equal(JSON.parse(original).instrumentSources[0].url,url);
 const reads=[],publicHost={...installedSounds(),instrumentData:asset=>{reads.push(asset);return asset==='piano'?fs.readFileSync('app/instruments/piano.json','utf8'):null}};
 const t=boot(true,publicHost);assert(t.els.missingSounds.hidden);
 t.run('applyTrack(readTrack('+JSON.stringify(original)+'))');assert(!t.els.missingSounds.hidden);assert.equal(t.els.missingSounds.children[1].children[0].href,url);
 assert.equal(t.run('score.length'),1);assert.equal(t.run('lanes[0].instrument'),id);
 const firstReads=reads.length;t.run('renderLanes();renderLanes();renderInstruments()');t.run('renderInstruments()');assert.equal(reads.filter(x=>x==='musicbox-floe').length,1);
 assert(!t.els.instrumentSource.hidden);assert.match(t.els.instrumentSource.children[0].textContent,/APK 0.51/);
 assert.equal(t.run('pendingBuiltinData.size'),0);
 await t.run('unlock()');await assert.rejects(t.run(`prepareInstrument('${id}')`),/FrozenPlain/);
 const saved=t.run('encodeTrack()');assert.deepEqual(JSON.parse(saved).lanes,JSON.parse(original).lanes);assert.deepEqual(JSON.parse(saved).instruments,JSON.parse(original).instruments);
 const midi=t.run('makeMidi(readTrack('+JSON.stringify(saved)+'),"test")');assert(Buffer.from(midi).includes(Buffer.from(url)));
 // Missing bundled grand remains playable from its verified download on public APKs.
 await t.run("prepareInstrument('lib-mda-grand-1')");assert(t.run("instrumentCache.has('lib-mda-grand-1')"));
 t.run('applyTrack(readTrack('+JSON.stringify(fs.readFileSync('app/presets/Memory.notka','utf8'))+'))');assert(t.els.missingSounds.hidden);
 // Private APK uses its own bank, no false missing warning or download link.
 if(fs.existsSync('private-48/musicbox-floe.json')){p.run('renderLanes();renderInstruments()');assert(p.els.missingSounds.hidden);assert(p.els.instrumentSource.hidden);
 await p.run(`unlock();prepareInstrument('${id}')`);assert.equal(p.reads.filter(x=>x==='musicbox-floe').length,1);assert(!p.run(`pendingBuiltinData.has('${id}')`));}else console.log('SKIP private installed-bank fixture; missing-bank and public fallback checks still run.');
 // Track metadata is informational, never a navigation source.
 const evil=JSON.parse(original);evil.instrumentSources=[{id,url:'javascript:bad()'}];const u=boot(true,publicHost);u.run('applyTrack(readTrack('+JSON.stringify(JSON.stringify(evil))+'))');assert.equal(u.els.missingSounds.children[1].children[0].href,url);
 console.log('PASS source links for missing banks, installed-bank suppression, bounded probes, unchanged notes/settings, verified grand fallback, MIDI source text and untrusted URL rejection.');
})().catch(e=>{console.error(e);process.exitCode=1});
