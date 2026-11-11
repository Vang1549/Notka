const {boot,settle}=require('./test-instruments.cjs'),{installedSounds}=require('./test-sound-host.cjs'),assert=require('assert/strict'),fs=require('fs');
const id='lib-floe-musicbox-1',bank=fs.readFileSync('private-48/musicbox-floe.json','utf8'),pause=ms=>new Promise(r=>setTimeout(r,ms));
function setup(){
 const disk=new Map(),state={result:'picked',raw:bank,saved:null,picks:0,commits:0,failSave:false};
 const bridge={...installedSounds(),soundRead:k=>disk.get(k)||null,soundWrite:(k,v)=>{disk.set(k,v);return true},soundExists:()=>false,
  instrumentAvailable:a=>a!=='musicbox-floe'||!!state.saved,instrumentData:a=>a==='musicbox-floe'?state.saved:fs.readFileSync('app/instruments/'+a+'.json','utf8'),
  pickInstrument:()=>{state.picks++;return true},instrumentResult:()=>state.result,readInstrumentPackage:()=>state.raw,
  commitInstrumentImport:()=>{state.commits++;if(state.failSave)return false;state.saved=state.raw;return true},cancelInstrumentImport(){},hasImportedInstrument:()=>!!state.saved,
  deleteImportedInstrument:()=>{state.saved=null;return true},importedBytes:()=>String(state.saved?.length||0)};
 const t=boot(true,bridge);t.run('renderInstruments()');return {t,state,bridge,disk};
}
function split(t){return t.els.instrumentChoices.children.find(x=>x.className==='instrument-row'&&x.children[0].textContent.includes('FrozenPlain')).children[2]}
function visit(t){const group=split(t);group.children[0].onclick();assert(group.children[1].disabled);t.doc.hidden=true;t.doc.visibilitychange();t.doc.hidden=false;t.doc.visibilitychange();t.run('renderInstruments()');assert(!split(t).children[1].disabled)}
(async()=>{
 let {t,state,bridge,disk}=setup();assert(split(t).children[1].disabled);await t.run('importMusicbox()');assert.equal(state.picks,0);
 // A focus/visible event without leaving does not unlock import.
 split(t).children[0].onclick();t.doc.visibilitychange();assert.equal(t.run('sourceStep'),1);visit(t);assert.equal(disk.get('musicbox-source-step'),'2');
 const original=t.run('encodeTrack()');state.result='cancelled';await t.run('importMusicbox()');assert.equal(state.commits,0);assert.equal(t.run('encodeTrack()'),original);assert(t.els.importProgress.hidden);
 state.result='picked';state.raw='!zip:ZipException';await t.run('importMusicbox()');assert.match(t.els.status.textContent,/архив.*zip:ZipException/);assert.equal(state.saved,null);
 state.raw='!access:SecurityException';await t.run('importMusicbox()');assert.match(t.els.status.textContent,/Нет доступа/);
 state.raw='!read';await t.run('importMusicbox()');assert.match(t.els.status.textContent,/APK до 0.51/);
 state.raw='!bank-save';await t.run('importMusicbox()');assert.match(t.els.status.textContent,/свободное место/);
 state.raw='!unsupported';await t.run('importMusicbox()');assert.match(t.els.status.textContent,/не поддерживаемый/);assert.equal(state.saved,null);
 state.raw=bank;t.fail=true;await t.run('importMusicbox()');assert.match(t.els.status.textContent,/WebView/);assert.equal(state.commits,0);t.fail=false;
 state.failSave=true;await t.run('importMusicbox()');assert.match(t.els.status.textContent,/сохранить/);assert.equal(state.saved,null);state.failSave=false;
 // Cancel while decoding: no commit and no partial installation.
 t.delay=true;const cancelled=t.run('importMusicbox()');await pause(50);assert(t.waiting);t.els.cancelInstrumentImport.onclick();t.delay=false;t.flush();await cancelled;assert.equal(state.saved,null);
 await t.run('importMusicbox()');assert(state.saved);assert.equal(t.run('encodeTrack()'),original);assert(t.run(`instrumentCache.has('${id}')`));assert(t.els.missingSounds.hidden);assert.match(t.els.status.textContent,/импортирована/);
 // Offline restart retains the bank and unlock state; imported banks can be deleted when unused.
 const fresh=boot(true,bridge);assert.equal(fresh.run('sourceStep'),2);fresh.run('openLaneInstrument()');fresh.run('renderInstruments()');const row=fresh.els.instrumentChoices.children.find(x=>x.className==='instrument-row'&&x.children[0].textContent.includes('FrozenPlain'));assert(!row.children[0].disabled);assert(!row.children[2].disabled);
 fresh.run(`askInstrumentDelete('${id}');deleteInstrument()`);assert.equal(state.saved,null);assert(!split(fresh).children[1].disabled);
 await fresh.run('importMusicbox()');fresh.run(`lanes[0].instrument='${id}';reconcileRack();score.push({start:0,len:960,pitch:60,volume:90});renderLanes()`);
 fresh.run(`askInstrumentDelete('${id}')`);assert.equal(fresh.run('pendingInstrumentDelete'),null);assert(state.saved);
 // Recovery after process death in browser treats reopening as a return, with no auto picker/import.
 disk.set('musicbox-source-step','1');const recovered=boot(true,bridge);assert.equal(recovered.run('sourceStep'),2);assert(recovered.run("byId('importProgress').hidden"));
 console.log('PASS split button gating, persisted return, picker cancel, corrupt package, decode/save failures, cancel during decoding, atomic commit, offline restart, unchanged track and protected deletion.');
})().catch(e=>{console.error(e);process.exitCode=1});
