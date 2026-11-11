const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
let saved='',fail=false;
const api={soundRead:key=>key==='scene-presets'?saved:null,soundWrite:(key,raw)=>{if(key!=='scene-presets')return true;if(fail)return false;saved=raw;return true},readSceneOptions:()=>'{"speed":1.6}'};
const open=t=>t.els.stagePrefs.onclick(),choose=(t,i)=>{t.els.presetChoice.value=String(i);t.els.presetChoice.onchange()},state=t=>JSON.parse(t.run('encodeTrack()'));
(async()=>{
 const t=boot(true,api);open(t);assert(t.els.loadScenePreset.disabled);assert(!t.els.saveScenePreset.disabled);
 t.run("score.push({start:0,len:960,pitch:60,volume:80});options=cleanSceneOptions({loop:true,rangeMode:'manual',keyStart:48,keyCount:12,speed:2,stretch:.5,backdrop:'stars',noteStyle:'neon',colorMode:'instrument',colors:{'instrument-inst-1':'#123456','lane-0':'#abcdef',single:'#111111'}})");
 const original=t.run('encodeTrack()');t.els.presetName.value='  Моя сцена  ';t.els.saveScenePreset.onclick();
 assert.equal(JSON.parse(saved)[0].name,'Моя сцена');assert.equal(JSON.parse(saved)[0].rack[0].color,'#123456');assert.equal(t.run('encodeTrack()'),original,'saving preset does not edit music');
 assert(t.els.presetNewForm.hidden);assert(!t.els.presetSaveSplit.hidden);
 t.els.closePrefs.onclick();open(t);assert.equal(t.els.presetChoice.value,'0');assert(!t.els.presetSaveSplit.hidden);
 t.els.newScenePreset.onclick();assert(!t.els.presetNewForm.hidden);assert(t.els.presetSaveSplit.hidden);assert.equal(t.els.presetName.value,'');
 const unchanged=saved;t.els.presetName.value='моя сцена';t.els.saveScenePreset.onclick();assert.equal(saved,unchanged);assert.match(t.els.presetStatus.textContent,/занято/);assert(t.els.presetConfirm.hidden);
 t.els.cancelNewPreset.onclick();assert(t.els.presetNewForm.hidden);assert(!t.els.presetSaveSplit.hidden);assert.equal(saved,unchanged);
 // Fresh editor instance sees presets but does not apply one automatically.
 const u=boot(true,api);assert.equal(state(u).scene.speed,1);open(u);assert.equal(u.els.presetChoice.children[1].textContent,'Моя сцена');
 // Same instrument has a different instance ID, with another instrument first in the rack.
 u.run("projectInstruments.unshift({id:'inst-grand',source:'lib-mda-grand-1',name:'Grand',settings:soundSettings()});projectInstruments[1].id='inst-piano';lanes[0].instrumentId='inst-piano';score.push({start:960,len:960,pitch:64,volume:70})");
 const music=state(u);choose(u,0);u.els.loadScenePreset.onclick();
 const loaded=state(u);assert.deepEqual(loaded.lanes,music.lanes);assert.equal(loaded.scene.speed,2);assert.equal(loaded.scene.colors['instrument-inst-piano'],'#123456');assert(!loaded.scene.colors['instrument-inst-grand']);assert(!loaded.scene.colors['instrument-inst-1']);assert.equal(loaded.scene.colors['lane-0'],'#abcdef');
 assert.deepEqual(JSON.parse(u.draft).scene,loaded.scene);assert.equal(u.els.keyCount.value,'12');assert.equal(u.els.loop.checked,true);
 // Applying/editing a preset never mutates the reusable saved copy.
 const stored=saved;u.run('options.speed=3;saveSceneOptions()');assert.equal(saved,stored);
 u.els.presetName.value='Ignored name';u.els.replaceScenePreset.onclick();assert(!u.els.presetConfirm.hidden);assert.equal(saved,stored);u.els.cancelScenePreset.onclick();assert.equal(saved,stored);
 u.els.replaceScenePreset.onclick();u.els.confirmScenePreset.onclick();assert.equal(JSON.parse(saved).length,1);assert.equal(JSON.parse(saved)[0].scene.speed,3);
 // Failed persistence leaves the old preset/list intact, for both save and delete.
 fail=true;u.els.newScenePreset.onclick();u.els.presetName.value='Новый';u.els.saveScenePreset.onclick();assert.equal(JSON.parse(saved).length,1);assert.match(u.els.presetStatus.textContent,/Не удалось/);
 choose(u,0);u.els.deleteScenePreset.onclick();assert(!u.els.presetConfirm.hidden);u.els.confirmScenePreset.onclick();assert.equal(JSON.parse(saved).length,1);fail=false;
 choose(u,0);u.els.deleteScenePreset.onclick();u.els.cancelScenePreset.onclick();assert.equal(JSON.parse(saved).length,1);
 const current=u.run('encodeTrack()');u.els.deleteScenePreset.onclick();u.els.confirmScenePreset.onclick();assert.deepEqual(JSON.parse(saved),[]);assert.equal(u.run('encodeTrack()'),current);assert(u.els.loadScenePreset.disabled);
 // Closing or changing the choice cancels pending overwrite/delete.
 open(t);t.els.presetName.value='First';t.els.saveScenePreset.onclick();const first=saved;t.els.replaceScenePreset.onclick();t.els.closePrefs.onclick();t.els.confirmScenePreset.onclick();assert.equal(saved,first);
 open(t);choose(t,0);t.els.deleteScenePreset.onclick();choose(t,'');t.els.confirmScenePreset.onclick();assert.equal(saved,first);
 for(const name of ['', 'x'.repeat(49),'bad\nname']){t.els.presetName.value=name;t.els.saveScenePreset.onclick();assert.equal(saved,first)}
 // Repeated instances of one source retain their independent colors by occurrence.
 t.run("projectInstruments=[{id:'inst-a',source:'vsco-piano-1',name:'A',settings:soundSettings()},{id:'inst-b',source:'vsco-piano-1',name:'B',settings:soundSettings()}];lanes[0].instrumentId='inst-a';options.colors={'instrument-inst-a':'#111111','instrument-inst-b':'#222222'}");
 t.els.presetName.value='Pair';t.els.saveScenePreset.onclick();t.run("projectInstruments[0].id='inst-c';projectInstruments[1].id='inst-d';lanes[0].instrumentId='inst-c'");choose(t,1);t.els.loadScenePreset.onclick();assert.equal(state(t).scene.colors['instrument-inst-c'],'#111111');assert.equal(state(t).scene.colors['instrument-inst-d'],'#222222');
 // Live loading updates keyboard/loop without restarting the audio clock.
 await t.run("play('visual')");const start=t.run('playback.start');t.run('options.loop=false;options.keyStart=60;options.keyCount=24');t.els.newScenePreset.onclick();t.els.presetName.value='Live';t.els.saveScenePreset.onclick();choose(t,0);t.els.loadScenePreset.onclick();choose(t,2);t.els.loadScenePreset.onclick();assert.equal(t.run('playback.start'),start);assert.equal(t.run('scene.keys.size'),24);assert.equal(t.run('playback.loopUntil'),0);t.run('stop()');
 // New copies keep the selected preset intact, then select the successfully saved copy.
 const beforeCopy=JSON.parse(saved);t.els.newScenePreset.onclick();t.els.presetName.value='Copy';t.run('options.speed=2.8');t.els.saveScenePreset.onclick();
 assert.equal(JSON.parse(saved).length,beforeCopy.length+1);assert.deepEqual(JSON.parse(saved).slice(0,-1),beforeCopy);assert.equal(t.els.presetChoice.value,String(beforeCopy.length));assert(t.els.presetNewForm.hidden);assert(!t.els.presetSaveSplit.hidden);
 const replacementIndex=beforeCopy.length;t.run('options.speed=1.4');t.els.presetName.value='First';t.els.replaceScenePreset.onclick();t.els.confirmScenePreset.onclick();assert.equal(JSON.parse(saved)[replacementIndex].name,'Copy');assert.equal(JSON.parse(saved)[replacementIndex].scene.speed,1.4);assert.deepEqual(JSON.parse(saved).slice(0,-1),beforeCopy);
 // Changing selection during a pending replacement cancels it.
 const beforeSwitch=saved;t.run('options.speed=.7');t.els.replaceScenePreset.onclick();choose(t,0);t.els.confirmScenePreset.onclick();assert.equal(saved,beforeSwitch);assert(!t.els.presetSaveSplit.hidden);
 // Presets live outside .notka and old global settings remain usable for draft migration.
 assert(!('presets' in state(t)));const old=state(t);delete old.scene;
 const migrated=boot(true,{...api,readDraft:()=>JSON.stringify(old),restoreRequested:()=>true});assert.equal(state(migrated).scene.speed,1.6);
 const good=saved;saved='{bad';const corrupt=boot(true,api);open(corrupt);assert(corrupt.els.saveScenePreset.disabled);assert(corrupt.els.deleteScenePreset.disabled);assert.equal(saved,'{bad');saved=good;
 const local=new Map(),browser=boot(true,{}, {localStorage:{getItem:k=>local.get(k),setItem:(k,v)=>local.set(k,v)}});open(browser);browser.els.presetName.value='Browser';browser.els.saveScenePreset.onclick();assert(local.get('notka.scene-presets'));const restored=boot(true,{}, {localStorage:{getItem:k=>local.get(k)}});open(restored);assert.equal(restored.els.presetChoice.children[1].textContent,'Browser');
 saved=JSON.stringify(Array.from({length:50},(_,i)=>({name:String(i),scene:{}})));const full=boot(true,api);open(full);full.els.presetName.value='51';full.els.saveScenePreset.onclick();assert.equal(JSON.parse(saved).length,50);assert.match(full.els.presetStatus.textContent,/50/);
 console.log('PASS persistent presets: save/restart/load, independent tracks and copies, instrument remapping, overwrite/delete confirmation and cancellation, disk failures, corrupt storage, browser fallback, live keyboard/loop and capacity.');
})().catch(e=>{console.error(e);process.exitCode=1});
