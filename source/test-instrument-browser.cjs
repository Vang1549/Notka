if(!require('fs').existsSync('private-48/musicbox-floe.json')){console.log('SKIP private Music Box fixture is not distributed; public-bank playback is tested separately.');process.exit(0)}
const {boot,settle}=require('./test-instruments.cjs'),{installedSounds}=require('./test-sound-host.cjs'),assert=require('assert/strict'),fs=require('fs'),crypto=require('crypto');
(async()=>{
 const host=installedSounds();host.soundDelete("musicbox-floe");host.soundDelete("bank-mda-grand-1");const t=boot(true,host),run=t.run;await settle();
 assert.equal(run('instruments.length'),8);
 run("instrumentCategory='keys';instrumentQuery='';renderInstruments()");assert.equal(run('matchingInstruments().length'),2);
 run("instrumentQuery='ГРАНД';renderInstruments()");assert.equal(run('matchingInstruments()[0].id'),'lib-mda-grand-1');
 run("instrumentCategory='all';instrumentQuery='  MUSIC   BOX  ';renderInstruments()");assert.equal(run('matchingInstruments()[0].id'),'lib-floe-musicbox-1');assert.equal(run('matchingInstruments().length'),1);
 run("instrumentCategory='keys';renderInstruments()");assert.equal(run('matchingInstruments().length'),0);assert(!t.els.instrumentEmpty.hidden);
 run("instrumentCategory='installed';instrumentQuery='';renderInstruments()");assert(run("matchingInstruments().some(d=>d.id==='lib-floe-musicbox-1')"));
 for(const [id,asset,gm] of [['lib-floe-musicbox-1','musicbox-floe',10],['lib-mda-grand-1','bank-mda-grand-1',0]]){
  const raw=fs.readFileSync('private-48/'+asset+'.json','utf8');
  const def=run(`instrumentById('${id}')`);assert.equal(raw.length,def.bytes);run('checkBank('+raw+',instrumentById('+JSON.stringify(id)+'))');
  host.soundWrite(asset,raw);run(`downloadedInstruments.add('${id}');instrumentCategory='all';instrumentQuery='';byId('instrumentSheet').hidden=false`);
  await run(`selectInstrument('${id}')`);assert.equal(run('lanes[0].instrument'),id);assert(t.started.length>0);
  const data=run(`readInstrumentData(instrumentById('${id}'))`);assert.equal(data.gmProgram,gm);
  for(const s of data.samples){const wav=Buffer.from(s.data,'base64');assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt32LE(24),32000);assert(wav.length>1000)}
  run('score.length=0;rowIndexes.delete(score);addNote(0,60)');const midi=Buffer.from(run('makeMidi(readTrack(encodeTrack()),"check")')); // proper program per exported lane
  assert(midi.includes(Buffer.from([0xc0,gm])));
 }
 run("instrumentCategory='installed';renderInstruments()");assert(run("matchingInstruments().some(d=>d.id==='lib-floe-musicbox-1')"));
 console.log('PASS categories, combined search, Cyrillic/English aliases, empty results, installed filter, signed new banks, playback and MIDI programs.');
})().catch(e=>{console.error(e);process.exitCode=1});
