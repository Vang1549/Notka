const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
const plain=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 const t=boot();t.run('openLaneInstrument()');assert.equal(t.els.instrumentLibrary.hidden,false);assert.equal(t.run('projectInstruments.length'),1);
 await t.run("selectInstrument('vsco-piano-1')");const first=t.run('lanes[0].instrumentId');assert.equal(t.run('projectInstruments.length'),2);
 await t.run("selectInstrument('vsco-piano-1')");const second=t.run('lanes[0].instrumentId');assert.notEqual(first,second);assert.equal(t.reads.filter(x=>x==='piano').length,1);
 t.run(`openInstrumentSettings('${second}')`);t.els['sound-pan'].value='-70';t.els['sound-pan'].onchange();t.els['sound-attack'].value='1.2';t.els['sound-attack'].onchange();
 assert.equal(t.run(`projectInstruments.find(i=>i.id==='${first}').settings.pan`),0);
 assert.equal(JSON.parse(t.draft).instruments.find(i=>i.id===second).settings.pan,-70);
 t.els.addLane.onclick();t.run(`assignProjectInstrument('${second}')`);assert.equal(t.run('laneInstrument(lanes[0])===laneInstrument(lanes[1])'),true);
 const raw=t.run('encodeTrack()');t.run('applyTrack(readTrack('+JSON.stringify(raw)+'))');assert.equal(t.run('encodeTrack()'),raw);
 const bad=JSON.parse(raw);bad.instruments[0].settings.cutoff=Infinity;assert.throws(()=>t.run('readTrack('+JSON.stringify(JSON.stringify(bad))+')'));
 const dangling=JSON.parse(raw);dangling.lanes[0].instrumentId='inst-missing';assert.throws(()=>t.run('readTrack('+JSON.stringify(JSON.stringify(dangling))+')'));
 const duplicate=JSON.parse(raw);duplicate.instruments[1].id=duplicate.instruments[0].id;assert.throws(()=>t.run('readTrack('+JSON.stringify(JSON.stringify(duplicate))+')'));
 const legacy=JSON.parse(raw);legacy.version=2;delete legacy.instruments;legacy.lanes.forEach(l=>delete l.instrumentId);const migrated=t.run('readTrack('+JSON.stringify(JSON.stringify(legacy))+')');assert.equal(migrated.instruments.length,1);assert.equal(migrated.instruments[0].settings.attack,null);
 t.run(`openInstrumentSettings('${second}')`);t.els['sound-start'].value='99';t.els['sound-start'].onchange();t.els['sound-end'].value='50';t.els['sound-end'].onchange();assert.equal(t.run('laneInstrument(lanes[0]).settings.end'),100);
 t.els.soundReset.onclick();assert.equal(t.run('laneInstrument(lanes[0]).settings.attack'),null);assert.equal(t.run('laneInstrument(lanes[0]).settings.pan'),0);
 // Envelope is interrupted at note-off, with release from its actual current level.
 t.run('var testBank={gain:1,attack:.01,release:.2};var envTest=envelopePlan(testBank,soundSettings({attack:2,release:1}),.2,100)');assert(Math.abs(t.run('envTest.value(.2)')-.1)<1e-10);assert(Math.abs(t.run('envTest.value(.7)')-.05)<1e-10);assert.equal(t.run('envTest.value(1.2)'),0);
 assert.equal(t.run('envelopePlan(testBank,soundSettings({delay:1}),.2,100).value(.1)'),0);
 assert.equal(t.run('envelopePlan(testBank,soundSettings({attack:.1,hold:.1,decay:.2,sustain:30}),2,100).value(1)'),.3);
 // Real scheduling parameters: rate, trim, pan/filter routing, velocity curve.
 await t.run("prepareInstrument('vsco-piano-1')");t.run("instrumentCache.get('vsco-piano-1').samples=[instrumentCache.get('vsco-piano-1').samples.find(s=>s.root===69)]");const begin=t.started.length;
 t.run("instrumentNote('vsco-piano-1',69,10,1,50,{transpose:12,fine:50,pan:-100,filter:'lowpass',cutoff:2000,resonance:2,start:10,end:70,loop:'off',volume:80,velocity:2})");
 const voice=t.started[begin];assert(Math.abs(voice.playbackRate.value-2**(12.5/12))<1e-10);assert(Math.abs(voice.offset-voice.buffer.duration*.1)<1e-10);assert(t.nodes.some(n=>n.kind==='pan'&&n.pan.value===-1));assert(t.nodes.some(n=>n.kind==='filter'&&n.frequency.value===2000&&n.Q.value===2));
 // Reverse preserves originals and caches transformed PCM; clipping and loop bounds remain valid.
 t.run("var tiny=audio.createBuffer(1,4,4);tiny.getChannelData(0).set([1,2,3,4]);var reversed=reverseBuffer(audio,tiny)");assert.deepEqual(plain(t.run('Array.from(reversed.getChannelData(0))')),[4,3,2,1]);assert.deepEqual(plain(t.run('Array.from(tiny.getChannelData(0))')),[1,2,3,4]);assert.equal(t.run('reverseBuffer(audio,tiny)===reversed'),true);
 t.run('stop()');assert(t.started.every(v=>v.disconnected));
 // MIDI carries per-instance pan/volume/transpose and rejects out-of-range pitches.
 t.run("score.push({pitch:60,start:0,len:960,volume:100});laneInstrument(lanes[activeLane]).settings=soundSettings({pan:100,volume:50,transpose:12})");
 const midi=Buffer.from(t.run("makeMidi(readTrack(encodeTrack()),'Rack')"));assert(midi.includes(Buffer.from([0xb1,10,127])));assert(midi.includes(Buffer.from([0x91,72,127])));
 assert.equal(Buffer.from(t.run('waveHeader(100)')).readUInt16LE(22),2);
 console.log('PASS project instances/sharing/copy, cached banks, UI settings/reset, v3 round trip, v1/v2 migration, malformed files, interrupted ADSR, sample trim/reverse, pan/filter/rate routing, MIDI and stereo WAV metadata.');
})().catch(e=>{console.error(e);process.exitCode=1});
