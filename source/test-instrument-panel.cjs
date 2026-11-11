const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict'),fs=require('fs');
(async()=>{
 const t=boot(true,{songList:()=>'[]',publicSongs:()=>true}),r=t.run;
 t.els.editLane.onclick();t.els.ghostChoices.children[0].children[0].onclick();
 assert.equal(t.els.instrumentLibrary.hidden,false);assert.equal(t.els.currentInstrument.hidden,false);assert.equal(t.els.currentInstrument.children.length,1);
 assert.equal(t.els.currentInstrument.children[0].children[0].textContent,'Пианино');
 const original=r('encodeTrack()');t.els.currentInstrument.children[0].children[0].onclick();assert(!t.els.instrumentEditor.hidden);assert(t.els.instrumentLibrary.hidden);assert.equal(r('encodeTrack()'),original);
 t.els.soundName.value='Моё пианино';t.els.soundName.onchange();t.els.soundAdvancedTab.onclick();r('notkaBack()');assert(!t.els.instrumentEditor.hidden);r('notkaBack()');assert(!t.els.instrumentLibrary.hidden);assert.equal(t.els.currentInstrument.children[0].children[0].textContent,'Моё пианино');
 t.els.instrumentSearch.oninput({target:{value:'nothing-matches'}});assert(!t.els.instrumentEmpty.hidden);assert(!t.els.currentInstrument.hidden);assert.equal(t.els.currentInstrument.children[0].children[0].textContent,'Моё пианино');
 t.els.currentInstrument.children[0].children[2].onclick();assert.equal(r('projectInstruments.length'),2);assert(!t.els.instrumentEditor.hidden);r('notkaBack()');assert(!t.els.instrumentLibrary.hidden);
 await r("selectInstrument('vsco-piano-1')");assert.equal(t.els.currentInstrument.children[0].children[0].textContent,r('laneInstrument(lanes[activeLane]).name'));assert(!t.els.instrumentLibrary.hidden);
 r('notkaBack()');assert(t.els.instrumentSheet.hidden);assert(!t.els.laneSheet.hidden);r('notkaBack()');t.els.prefs.onclick();assert.equal(t.els.prefTitle.textContent,'');assert.equal(t.els.preferences.attrs['aria-label'],'Меню трека');
 t.els.saveAs.onclick();assert.match(t.els.prefTitle.textContent,/Сохранить/);r('notkaBack()');assert.equal(t.els.prefTitle.textContent,'');r('closePrefs()');t.els.stagePrefs.onclick();assert.equal(t.els.prefTitle.textContent,'Оформление сцены');
 const html=fs.readFileSync(process.env.NOTKA_EDITOR_HTML||'app/index.html','utf8');assert(!/id=["']?(?:rackTab|libraryTab|rackAdd|instrumentRack)\b/.test(html));
 console.log('PASS direct library, single current instrument, search independence, settings/copy, current row refresh, layered Back, track heading removal and preserved save/player headings.');
})().catch(e=>{console.error(e);process.exitCode=1});
