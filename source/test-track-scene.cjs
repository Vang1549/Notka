const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
const scene=t=>JSON.parse(t.run('encodeTrack()')).scene;
const files=new Map();let globalWrites=0;
const a=boot(true,{songList:()=>JSON.stringify([...files.keys()]),saveSong:(name,raw)=>{files.set(name,raw);return 1},overwriteSong:(name,raw)=>{files.set(name,raw);return 1},publicSongs:()=>true,writeSceneOptions:()=>{globalWrites++;return true}},{Blob});
a.run("score.push({start:0,len:960,pitch:60,volume:80});options=cleanSceneOptions({loop:true,palette:'ember',rangeMode:'manual',keyStart:36,keyCount:61,keyboardHeight:22,keyLabels:'all',guides:false,speed:1.7,stretch:.7,noteWidth:85,roundness:40,noteStyle:'neon',colorMode:'instrument',backdrop:'stars',background:'#123456',glow:false,glowAmount:5,sparks:false,sparkAmount:10,rays:10,rings:5,trails:80,keyLights:false,fps:60,quality:2,colors:{'instrument-inst-1':'#abcdef','lane-0':'#123abc',single:'#987654'}});saveSceneOptions();writeSong('A.notka',false)");
assert(files.has('A.notka'),a.els.trackStatus.textContent);
const expected=scene(a),first=files.get('A.notka');
assert.deepEqual(JSON.parse(a.draft).scene,expected);assert.equal(globalWrites,0);
// A different phone's global options cannot override the received file.
const b=boot(true,{readSceneOptions:()=>JSON.stringify({speed:3,palette:'iris'})});
b.run('presentTrack('+JSON.stringify(first)+')');assert.deepEqual(scene(b),expected);
assert.equal(b.els.speed.value,'1.7');assert.equal(b.els.loop.checked,true);assert.equal(b.els.stageLoop.attrs['aria-pressed'],'true');
assert.equal(b.run("sceneColor({lane:0,instrumentId:'inst-1',instrument:'vsco-piano-1'})"),'#abcdef');
// Track B has independent defaults; simply inspecting or cancelling an import changes nothing.
const legacy=JSON.parse(first);delete legacy.scene;
b.run('presentTrack('+JSON.stringify(JSON.stringify(legacy))+')');assert.deepEqual(scene(b),expected);
b.els.closePrefs.onclick();assert.deepEqual(scene(b),expected);
b.run('presentTrack('+JSON.stringify(JSON.stringify(legacy))+')');b.els.replaceTrack.onclick();
assert.equal(scene(b).speed,1);assert.equal(scene(b).loop,false);assert.deepEqual(scene(b).colors,{});
b.run("options.speed=2.2;options.colors['lane-0']='#aabbcc';saveSceneOptions()");const second=b.run('encodeTrack()');
b.run('applyTrack(readTrack('+JSON.stringify(first)+'))');assert.deepEqual(scene(b),expected);
b.run('applyTrack(readTrack('+JSON.stringify(second)+'))');assert.equal(scene(b).speed,2.2);assert.equal(scene(b).colors['lane-0'],'#aabbcc');
// Modern and pre-feature local drafts restore correctly; migration affects only the old draft.
const modern=boot(true,{readDraft:()=>b.draft,restoreRequested:()=>true,readSceneOptions:()=>'{"speed":3}'});assert.equal(scene(modern).speed,2.2);
const old=boot(true,{readDraft:()=>JSON.stringify(legacy),restoreRequested:()=>true,readSceneOptions:()=>'{"speed":1.9,"loop":true,"colors":{"lane-0":"#ffffff"}}'});
assert.equal(scene(old).speed,1.9);assert.equal(JSON.parse(old.draft).scene.loop,true);
old.run('applyTrack(readTrack('+JSON.stringify(JSON.stringify(legacy))+'))');assert.equal(scene(old).speed,1);
const fresh=boot(true,{readSceneOptions:()=>'{"speed":3}'});assert.equal(scene(fresh).speed,1);
for(const version of [1,2]){
 const raw={...legacy,version};if(version===1)raw.notes=raw.lanes[0].notes;
 fresh.run('applyTrack(readTrack('+JSON.stringify(JSON.stringify(raw))+'))');assert.equal(scene(fresh).speed,1);
}
// Invalid optional visual data is normalized without discarding valid music.
const bad={...legacy,scene:{speed:-4,stretch:'bad',rangeMode:'manual',keyStart:999,keyCount:999,palette:'unknown',background:'url(bad)',fps:999,loop:'yes',colors:{'lane-0':'#ABCDEF','lane-1':'bad','__proto__':'#ffffff',unknown:'#ffffff'},unknown:99}};
fresh.run('applyTrack(readTrack('+JSON.stringify(JSON.stringify(bad))+'))');
assert.equal(scene(fresh).speed,.5);assert.equal(scene(fresh).stretch,1.25);assert.equal(scene(fresh).keyCount,12);assert.equal(scene(fresh).fps,30);assert.equal(scene(fresh).loop,false);assert.deepEqual(scene(fresh).colors,{'lane-0':'#ABCDEF'});assert.equal(fresh.run('score.length'),1);
// Saving after editing updates the actual .notka file, and Save As keeps copies independent.
a.run("options.speed=2.4;saveSceneOptions();writeSong('A.notka',true);writeSong('Copy.notka',false);options.speed=.8;saveSceneOptions();writeSong('Copy.notka',true)");
assert.equal(JSON.parse(files.get('A.notka')).scene.speed,2.4);assert.equal(JSON.parse(files.get('Copy.notka')).scene.speed,.8);
console.log('PASS per-track scene round trip across phones, named save/overwrite/copy, draft persistence and migration, independent switching, deferred import confirmation, old formats, defaults and malformed scene normalization.');
