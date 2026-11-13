const {boot,settle}=require('./test-instruments.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const root='../dist/soundbank/',pub=new crypto.X509Certificate(fs.readFileSync('signing.der')).publicKey;
const catalog=JSON.parse(JSON.parse(fs.readFileSync(root+'catalog.json','utf8')).record);
const entries=catalog.instruments.filter(d=>d.id.startsWith('lib-gu-'));
function host(){
 const state={store:new Map(),requests:[],jobs:new Map(),badHash:false,status:8},api={};let next=0;
 Object.assign(api,{
  soundRead:k=>state.store.get(k)||null,soundWrite:(k,v)=>{state.store.set(k,v);return true},soundExists:k=>state.store.has(k),soundDelete:k=>state.store.delete(k),
  soundDownload:k=>{const n=String(++next);state.jobs.set(n,k);state.requests.push(k);return n},soundStatus:()=>state.status,
  soundText:n=>fs.readFileSync(root+state.jobs.get(n)+'.json','utf8'),
  soundHash:n=>state.badHash?'bad':crypto.createHash('sha256').update(fs.readFileSync(root+state.jobs.get(n)+'.json')).digest('base64'),
  soundDiscard(){},soundValid:(r,s)=>{try{return require('./signature-trust.cjs').verify(r,s)}catch{return false}}
 });return {state,api};
}
(async()=>{
 const {state,api}=host(),t=boot(true,api),r=t.run;await settle();r('openLaneInstrument()');
 const first=entries[0],second=entries[1],track=r('encodeTrack()');
 assert.equal(r('matchingInstruments().length'),37);
 // No full bank is fetched or assigned when listening to an uninstalled sound.
 await r(`auditionInstrument('${first.id}')`);
 assert(state.requests.includes(first.preview.asset));assert(!state.requests.includes(first.asset));assert(!r(`downloadedInstruments.has('${first.id}')`));
 assert.equal(r('encodeTrack()'),track);assert.equal(t.started.length,1);assert.equal(r('libraryAuditionId'),first.id);
 assert.equal(r(`auditionButtons.get('${first.id}').attrs['aria-pressed']`),'true');
 await r(`auditionInstrument('${first.id}')`);assert.equal(r('libraryAuditionId'),null);assert(t.started[0].disconnected);
 const before=state.requests.length;await r(`auditionInstrument('${first.id}')`);assert.equal(state.requests.length,before);
 const old=t.started.at(-1);await r(`auditionInstrument('${second.id}')`);assert(old.disconnected);assert.equal(r('libraryAuditionId'),second.id);
 const active=t.started.at(-1);r('closeInstrument()');assert(active.disconnected);assert.equal(r('libraryAuditionId'),null);
 // Close/suspend/replacement during asynchronous decode must never start a stale voice.
 r('openLaneInstrument()');t.delay=true;let at=t.started.length;
 const pending=r(`auditionInstrument('${first.id}')`);await settle();assert(t.waiting);r('closeInstrument()');t.delay=false;t.flush();await pending;assert.equal(t.started.length,at);
 r('openLaneInstrument()');t.delay=true;const outdated=r(`auditionInstrument('${first.id}')`);await settle();t.delay=false;
 await r(`auditionInstrument('${second.id}')`);at=t.started.length;t.flush();await outdated;assert.equal(t.started.length,at);assert.equal(r('libraryAuditionId'),second.id);
 t.doc.hidden=true;t.doc.visibilitychange();assert.equal(r('libraryAuditionId'),null);assert(t.started.at(-1).disconnected);t.doc.hidden=false;
 // A corrupt persisted preview is discarded and re-fetched, a corrupt network one is rejected.
 r('openLaneInstrument()');state.store.set(first.preview.asset,'broken');state.badHash=true;at=t.started.length;
 await r(`auditionInstrument('${first.id}')`);assert.equal(t.started.length,at);assert.match(t.els.instrumentStatus.textContent,/Повреждено/);assert(!state.store.has(first.preview.asset));state.badHash=false;
 await r(`auditionInstrument('${first.id}')`);assert.equal(t.started.length,at+1);
 // Cache bounded to five previews; a new process reuses the saved file offline.
 for(const e of entries.slice(0,7))await r(`auditionInstrument('${e.id}')`);
 assert.equal(JSON.parse(state.store.get('preview-cache')).length,5);assert.equal([...state.store.keys()].filter(k=>k.startsWith('preview-')&&k!=='preview-cache').length,5);
 state.status=16;const offline=boot(true,api);await settle();offline.run('openLaneInstrument()');const requestCount=state.requests.length;
 await offline.run(`auditionInstrument('${entries[6].id}')`);assert.equal(offline.started.length,1);assert.equal(state.requests.length,requestCount);offline.run('closeInstrument()');state.status=8;
 // Download installs the whole bank; the next audition uses it without any preview request.
 r('stopLibraryAudition()');await r(`downloadInstrument('${first.id}')`);assert(state.store.has(first.asset));assert(r(`downloadedInstruments.has('${first.id}')`));
 const requests=state.requests.length;await r(`auditionInstrument('${first.id}')`);assert.equal(state.requests.length,requests);assert.equal(r('encodeTrack()'),track);
 // Hold opens confirmation without selecting; cancellation and protected deletion retain data.
 r('renderInstruments()');let row=t.els.instrumentChoices.children.find(el=>el.className==='instrument-row'&&el.children[0].textContent===first.name);
 const name=row.children[0];name.onpointerdown({pointerId:1,clientX:10,clientY:10,button:0});await new Promise(done=>setTimeout(done,580));
 assert.equal(r('pendingInstrumentDelete'),first.id);name.onclick();assert.equal(r('encodeTrack()'),track);r('cancelInstrumentDelete()');assert(state.store.has(first.asset));
 name.onpointerdown({pointerId:2,clientX:10,clientY:10,button:0});name.onpointermove({pointerId:2,clientX:40,clientY:10});await new Promise(done=>setTimeout(done,580));assert.equal(r('pendingInstrumentDelete'),null);
 await r(`selectInstrument('${first.id}')`);r(`askInstrumentDelete('${first.id}')`);assert.equal(r('pendingInstrumentDelete'),null);assert(state.store.has(first.asset));
 // Competing pending previews cannot erase the new recovery marker; closing cancels both.
 r('stopLibraryAudition()');state.status=1;const a=r(`auditionInstrument('${entries[8].id}')`);await settle();const b=r(`auditionInstrument('${entries[9].id}')`);await settle();
 const marker=state.store.get('pending-preview');await new Promise(done=>setTimeout(done,500));assert.equal(state.store.get('pending-preview'),marker);
 r('closeInstrument()');await Promise.all([a,b]);assert(!state.store.has('pending-preview'));
 console.log('PASS 30 new sounds, preview-only downloads, unchanged track/rack, stop/toggle/switch, decode races, close/background, tamper rejection, bounded offline cache, full install and hold/delete protection.');
})().catch(e=>{console.error(e);process.exitCode=1});
