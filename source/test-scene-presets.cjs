const {boot}=require('./test-instruments.cjs'),assert=require('node:assert/strict');
let saved='',fail=false;
const api={soundRead:key=>key==='scene-presets'?saved:null,soundWrite:(key,raw)=>{if(key!=='scene-presets')return true;if(fail)return false;saved=raw;return true}};
const open=t=>t.els.stagePrefs.onclick(),choose=(t,i)=>t.run('selectScenePreset('+JSON.stringify(String(i))+')'),state=t=>JSON.parse(t.run('encodeTrack()'));
const add=(t,name)=>{t.els.newScenePreset.onclick();t.els.presetName.value=name;t.els.saveScenePreset.onclick()},trash=(t,i)=>t.els.presetList.children[i+1].children[1].onclick();
(async()=>{
 const t=boot(true,api);open(t);assert(!t.els.presetSaveSplit.hidden);assert(t.els.replaceScenePreset.disabled);assert(!t.els.newScenePreset.disabled);
 t.run("score.push({start:0,len:960,pitch:60,volume:80});options=cleanSceneOptions({loop:true,rangeMode:'manual',keyStart:48,keyCount:12,speed:2,stretch:.5,backdrop:'stars',noteStyle:'neon',colorMode:'instrument',colors:{'instrument-inst-1':'transparent','lane-0':'#abcdef'}})");
 const music=state(t).lanes;add(t,'Моя сцена');assert.equal(JSON.parse(saved)[0].rack[0].color,'transparent');assert.equal(state(t).scene.presetName,'Моя сцена');assert.deepEqual(state(t).lanes,music);assert(!t.els.presetSaveSplit.hidden);assert(t.els.presetNewForm.hidden);
 // Applied identity survives closing, a fresh editor, and reading a saved song.
 const track=t.run('encodeTrack()');t.els.closePrefs.onclick();open(t);assert.equal(t.els.presetChoice.value,'0');
 const u=boot(true,api);u.run('applyTrack(readTrack('+JSON.stringify(track)+'))');open(u);assert.equal(u.els.presetChoice.value,'0');assert(!u.els.replaceScenePreset.disabled);
 // Legacy tracks with no stored preset identity match by normalized appearance.
 const legacy=JSON.parse(track);delete legacy.scene.presetName;u.run('applyTrack(readTrack('+JSON.stringify(JSON.stringify(legacy))+'))');open(u);assert.equal(u.els.presetChoice.value,'0');
 u.run("projectInstruments[0].id='inst-other';lanes[0].instrumentId='inst-other'");choose(u,0);assert(u.els.presetConfirm.hidden);assert.equal(state(u).scene.colors['instrument-inst-other'],'transparent');assert.equal(state(u).scene.speed,1);
 // Update is immediate; ONLY deleting asks for confirmation.
 u.run('options.speed=3');const stored=saved;u.els.replaceScenePreset.onclick();assert.notEqual(saved,stored);assert(u.els.presetConfirm.hidden);assert.equal(JSON.parse(saved)[0].scene.speed,3);
 u.els.newScenePreset.onclick();assert(!u.els.presetSaveSplit.hidden);assert(u.els.replaceScenePreset.disabled);assert(u.els.newScenePreset.disabled);u.els.cancelNewPreset.onclick();assert(!u.els.replaceScenePreset.disabled);
 add(u,'Копия');assert.equal(JSON.parse(saved).length,2);assert.equal(u.els.presetChoice.value,'1');
 trash(u,0);assert(!u.els.presetConfirm.hidden);assert.equal(u.els.presetChoice.value,'1');u.els.cancelScenePreset.onclick();assert.equal(JSON.parse(saved).length,2);
 trash(u,0);choose(u,1);u.els.confirmScenePreset.onclick();assert.equal(JSON.parse(saved).length,2);
 trash(u,0);fail=true;u.els.confirmScenePreset.onclick();assert.equal(JSON.parse(saved).length,2);assert.match(u.els.presetStatus.textContent,/Не удалось/);fail=false;
 trash(u,0);u.els.confirmScenePreset.onclick();assert.equal(JSON.parse(saved).length,1);assert.equal(u.els.presetChoice.value,'0');assert.equal(state(u).scene.presetName,'Копия');
 const appearance=state(u).scene;trash(u,0);u.els.confirmScenePreset.onclick();assert.equal(JSON.parse(saved).length,0);assert.equal(state(u).scene.speed,appearance.speed);assert.equal(state(u).scene.presetName,'');assert(u.els.replaceScenePreset.disabled);
 choose(u,'basic');assert.equal(state(u).scene.presetName,'@basic');assert.equal(u.els.presetList.children[0].children.length,1);assert(u.els.presetConfirm.hidden);
 assert.equal(state(u).scene.background,'#000000');assert.equal(state(u).scene.fps,60);assert.equal(state(u).scene.roundness,25);
 const before=saved;for(const name of ['', 'x'.repeat(49),'bad\nname']){add(u,name);assert.equal(saved,before)}
 saved='{bad';const corrupt=boot(true,api);open(corrupt);assert(corrupt.els.newScenePreset.disabled);assert(corrupt.els.replaceScenePreset.disabled);assert.equal(saved,'{bad');
 const local=new Map(),browser=boot(true,{}, {localStorage:{getItem:k=>local.get(k),setItem:(k,v)=>local.set(k,v)}});open(browser);add(browser,'Browser');assert(local.get('notka.scene-presets'));
 const full=Array.from({length:50},(_,i)=>({name:String(i),scene:{}}));saved=JSON.stringify(full);const f=boot(true,api);open(f);assert(f.els.newScenePreset.disabled);assert(!f.els.presetSaveSplit.hidden);
 for(const b of [t,u,corrupt,browser,f])b.els.closePrefs.onclick();
 console.log('PASS immediate preset selection/update, persistent identity and legacy match, remapped transparent colors, fixed action buttons, delete-only confirmation, cancellation, save failure, browser storage and capacity.');
})().catch(e=>{console.error(e);process.exitCode=1});
