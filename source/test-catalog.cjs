const {boot,settle}=require('./test-instruments.cjs');
const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
const dir=(process.env.NOTKA_DIST||'../dist')+'/soundbank/';
const pub=new crypto.X509Certificate(fs.readFileSync('signing.der')).publicKey;
const signed=data=>{const record=JSON.stringify(data);return JSON.stringify({record,signature:crypto.sign('SHA256',Buffer.from(record),require('./signature-trust.cjs').privateKey()).toString('base64')})};
const manifest=fs.readFileSync(dir+'catalog.json','utf8'),raw=fs.readFileSync(dir+'bank-trumpet-1.json','utf8'),entry=JSON.parse(JSON.parse(manifest).record).instruments[0];
const id=entry.id;const expectedCount=new Set(['vsco-piano-1','lib-mda-grand-1','lib-floe-musicbox-1',...JSON.parse(JSON.parse(manifest).record).instruments.map(d=>d.id)]).size;
function native(store=new Map()){
 const state={store,files:{catalog:manifest,'bank-trumpet-1':raw},status:8,requests:[],jobs:new Map(),removed:[],failWrite:false,badHash:false};let number=0;
 state.api={soundRead:k=>store.get(k)||null,soundWrite(k,v){if(state.failWrite&&k.startsWith('bank-'))return false;store.set(k,v);return true},soundDelete(k){store.delete(k);return true},soundExists:k=>store.has(k),
 soundDownload(k){const n=String(++number);state.requests.push(k);state.jobs.set(n,k);return n},soundStatus:()=>state.status,
 soundText:n=>state.files[state.jobs.get(n)]||null,soundHash:n=>state.badHash?'bad':crypto.createHash('sha256').update(state.files[state.jobs.get(n)]).digest('base64'),
 soundValid:(r,s)=>{try{return require('./signature-trust.cjs').verify(r,s)}catch{return false}},soundDiscard:n=>state.removed.push(n)};
 return state;
}
(async()=>{
 const n=native(),t=boot(true,n.api);await settle();await t.run('checkSoundCatalog()');assert.equal(t.run('instruments.length'),expectedCount);assert.equal(n.requests.length,1);
 t.run('openLaneInstrument()');t.els.closeInstrument.onclick();t.run('openLaneInstrument()');assert.equal(n.requests.length,1);
 await t.run(`downloadInstrument('${id}')`);assert(n.store.has(entry.asset));assert.equal(n.store.get(entry.asset),raw);assert(!n.store.has('pending-bank'));
 const requests=n.requests.length;await t.run(`selectInstrument('${id}')`);assert.equal(t.run('lanes[0].instrument'),id);assert.equal(n.requests.length,requests);
 const track=t.run('encodeTrack()');assert.equal(JSON.parse(track).lanes[0].instrument,id);
 // Assigned instruments cannot be deleted, including in muted/background lanes.
 t.run(`askInstrumentDelete('${id}');deleteInstrument()`);assert(n.store.has(entry.asset));
 t.run("lanes[0].muted=true;lanes[0].ghost=true");t.run(`askInstrumentDelete('${id}');deleteInstrument()`);assert(n.store.has(entry.asset));
 t.run("lanes[0].ghost=false;lanes[0].muted=false;addNote(0,60);paint()");
 assert.equal(t.run('[...blockViews.values()][0].dataset.instrumentIcon'),'trumpet');
 t.run('lanes[0].ghost=true;paint()');assert.equal(t.run('[...blockViews.values()][0].dataset.instrumentIcon'),'trumpet');assert(!t.run('[...blockViews.values()][0].className').includes('ghost'));
 // Existing downloaded instruments survive an offline restart and still decode/play.
 n.status=16;const offline=boot(true,n.api);await settle();assert(offline.run(`downloadedInstruments.has('${id}')`));
 offline.run('applyTrack(readTrack('+JSON.stringify(track)+'))');await offline.run(`unlock();prepareInstrument('${id}')`);assert(offline.run(`instrumentCache.has('${id}')`));
 // A bank remains protected while an unused instance is still in the project rack.
 offline.run('openLaneInstrument()');await offline.run("selectInstrument('vsco-piano-1')");offline.run(`askInstrumentDelete('${id}');cancelInstrumentDelete();deleteInstrument()`);assert(n.store.has(entry.asset));
 offline.run(`askInstrumentDelete('${id}');deleteInstrument()`);assert(n.store.has(entry.asset));
 offline.run(`projectInstruments=projectInstruments.filter(i=>i.source!=='${id}')`);
 offline.run(`askInstrumentDelete('${id}');deleteInstrument()`);assert(!n.store.has(entry.asset));assert(!offline.run(`instrumentCache.has('${id}')`));
 n.status=8;await offline.run(`downloadInstrument('${id}')`);assert(n.store.has(entry.asset));
 // Bad hashes, bad signatures, wrong identity and disk failures cannot install a bank.
 const bad=native(),b=boot(true,bad.api);await settle();bad.badHash=true;await b.run(`downloadInstrument('${id}')`);assert(!bad.store.has(entry.asset));assert.match(b.els.instrumentStatus.textContent,/повреждён/);
 bad.badHash=false;bad.failWrite=true;await b.run(`downloadInstrument('${id}')`);assert(!bad.store.has(entry.asset));bad.failWrite=false;
 await b.run(`downloadInstrument('${id}')`);assert(bad.store.has(entry.asset));
 const sig=JSON.parse(manifest);sig.signature='bad';assert.throws(()=>b.run('parseSoundCatalog('+JSON.stringify(JSON.stringify(sig))+')'));
 const wrong=JSON.parse(JSON.parse(raw).record);wrong.id='bank-other-1';assert.throws(()=>b.run('checkBank('+JSON.stringify(wrong)+',instrumentById('+JSON.stringify(id)+'))'));
 // A damaged local bank is never played; the UI permits a fresh download even when assigned.
 bad.store.set(entry.asset,'invalid');b.run('openLaneInstrument()');await b.run(`selectInstrument('${id}')`);assert(!b.run(`downloadedInstruments.has('${id}')`));
 // Cancelling an active Android download frees the temporary file and changes no track.
 const c=native(),cancel=boot(true,c.api);await settle();c.status=1;const before=cancel.run('encodeTrack()');const pending=cancel.run(`downloadInstrument('${id}')`);cancel.run('cancelInstrumentDownload()');await pending;
 assert.equal(cancel.run('encodeTrack()'),before);assert(!c.store.has(entry.asset));assert(!c.store.has('pending-bank'));assert.match(cancel.els.instrumentStatus.textContent,/отменена/);
 // On restart, remove leftover interrupted download tasks, retain installed files.
 c.store.set('pending-bank','12345');c.status=16;boot(true,c.api);await settle();assert(c.removed.includes('12345'));
 // New catalogue entries need no source/editor changes. Metadata and pitch labels come from signed data.
 const newer=JSON.parse(JSON.parse(manifest).record);newer.version++;newer.instruments.push({...entry,id:'lib-future-1',asset:'bank-future-1',name:'Будущий',short:'Бд'});
 const dyn=native();dyn.files.catalog=signed(newer);const dynamic=boot(true,dyn.api);await settle();dynamic.run('openLaneInstrument()');await settle();assert(dyn.requests.includes('catalog'));assert.equal(dynamic.run("instrumentById('lib-future-1').short"),'Бд');
 // A failed check can be retried through the same visible library action.
 const retry=native();retry.status=16;retry.files.catalog=signed(newer);const retrying=boot(true,retry.api);await settle();
 retrying.run('openLaneInstrument()');await settle();assert.equal(retrying.run('catalogStarted'),false);
 retry.status=8;retrying.run('openLaneInstrument()');await settle();assert.equal(retry.requests.filter(x=>x==='catalog').length,2);
 assert.equal(retrying.run("instrumentById('lib-future-1').short"),'Бд');
 // Unsafe path/duplicate/tampered metadata cannot be used; missing remote references remain in imported music.
 const invalid={...newer,instruments:[{...entry,asset:'../signing'}]};assert.throws(()=>dynamic.run('parseSoundCatalog('+JSON.stringify(signed(invalid))+')'));
 const missing=JSON.parse(track);missing.version=2;delete missing.instruments;missing.lanes[0].instrument='lib-unavailable-1';const imported=dynamic.run('readTrack('+JSON.stringify(JSON.stringify(missing))+')');assert.equal(imported.lanes[0].instrument,'lib-unavailable-1');
 const oldCatalog=JSON.parse(JSON.parse(manifest).record);oldCatalog.instruments=[entry];oldCatalog.version=1;
 const migratedHost=native(new Map([['catalog',signed(oldCatalog)]]));migratedHost.status=16;
 const migrated=boot(true,migratedHost.api);await settle();assert.equal(migrated.run('instruments.length'),expectedCount);
 for(const previous of ['classic',undefined,'vsco-violin-1','vsco-flute-1','vsco-bass-1']){
  const file=JSON.parse(track);file.version=2;delete file.instruments;file.lanes[0].instrument=previous;file.lanes[0].notes=[{pitch:64,start:137,len:840,volume:73}];
  const result=migrated.run('readTrack('+JSON.stringify(JSON.stringify(file))+')');
  assert.equal(result.lanes[0].instrument,previous===undefined||previous==='classic'?'vsco-piano-1':'lib-'+previous);
  assert.deepEqual(JSON.parse(JSON.stringify(result.lanes[0].notes)),file.lanes[0].notes);
 }
 assert.equal(migrated.run('instruments.filter(d=>!d.remote).length'),3);
 assert.equal(migrated.run('typeof piano'),'undefined');
 console.log('PASS signed dynamic catalogue, download/install/retry, offline restart, corrupted data, cancel/recovery, protected in-use instruments, delete/redownload, future metadata, and note/ghost instrument labels.');
})().catch(e=>{console.error(e);process.exitCode=1});
