const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const src=fs.readFileSync('app/launcher.html','utf8').replace('/* PACKED_EDITIONS */',()=>fs.readFileSync('bundled-editions.js','utf8')).match(/<script>([\s\S]*)<\/script>/)[1];
const dist=(process.env.NOTKA_DIST||'../dist')+'/editions/',key=new crypto.X509Certificate(fs.readFileSync('signing.der')).publicKey;
const sign=data=>{const record=JSON.stringify(data);return {record,signature:crypto.sign('SHA256',Buffer.from(record),require('./signature-trust.cjs').privateKey()).toString('base64')}};
const home=JSON.parse(fs.readFileSync(dist+'catalog.json')),base=JSON.parse(home.record);
const shippedTop=vm.runInNewContext(fs.readFileSync('bundled-editions.js','utf8')+';JSON.parse(shippedCatalog.record).latest');
const bundled=vm.runInNewContext(fs.readFileSync('bundled-editions.js','utf8')+';({catalog:JSON.parse(shippedCatalog.record),editions:builtin})');
const oldHtml=Buffer.from(JSON.parse(bundled.editions[shippedTop].record).body,'base64').toString();
const edition=JSON.parse(fs.readFileSync(dist+base.latest+'.json'));
const extraHtml=Buffer.from(JSON.parse(edition.record).body,'base64').toString();
let hasDraft=false,resumed=0,responses=Object.fromEntries(base.editions.map(e=>[e.code,JSON.parse(fs.readFileSync(dist+e.code+'.json'))])),online=false,opened=[],hit=[],written=new Map(),current=0,wontStart=false;
const storage={get length(){return written.size},getItem:k=>written.get(k)||null,setItem:(k,v)=>written.set(k,v),removeItem:k=>written.delete(k),key:i=>[...written.keys()][i]};
function launchShell(){
 const els={};class El{constructor(){this.style={setProperty(){}};this.dataset={};this.hidden=true;this.children=[]}append(...x){this.children.push(...x)}replaceChildren(){this.children=[]}setAttribute(){}focus(){}setPointerCapture(){}getBoundingClientRect(){return {left:10,top:20,width:200,height:100}}}
 const bridge={storageList:()=>JSON.stringify({items:[{id:'public:1',kind:'tracks',name:'Песня.notka',bytes:1024,stamp:'1:1024',removable:true},{id:'installed',kind:'apk',name:'APK',bytes:100,stamp:'',removable:false}],errors:[]}),storageDelete:raw=>{const f=JSON.parse(raw);assert.equal(f.id,'public:1');els.deleted=f;return ''},setThemeColors(raw){els.colors=JSON.parse(raw)},begin(code){assert.equal(code,0);return '77'},channel:()=>JSON.stringify(JSON.parse(fs.readFileSync((process.env.NOTKA_DIST||'../dist')+'/channel.json'))),hasDraft:()=>hasDraft,resumeEditor(body){resumed++;return this.openEditor(body)},valid:(s,sig)=>require('./signature-trust.cjs').verify(s,sig),openEditor(body){if(wontStart)return false;opened.push(Buffer.from(body,'base64').toString());return true},editionDownload(code){current=code;hit.push(code);return '55'},status:()=>online?8:16,editionText:()=>JSON.stringify(responses[current]),discard(){}};
 let now=100000,visibility=[];
 class Clock extends Date{static now(){return now}}
 els.returnToPanel=async(delay=61000)=>{now+=delay;for(const fn of visibility)fn();await new Promise(resolve=>setImmediate(resolve))};
 const doc={hidden:false,addEventListener(event,handler){if(event==='visibilitychange')visibility.push(handler)},getElementById:id=>els[id]??=new El(),createElement:()=>new El()};
 els.hide=()=>{doc.hidden=true;for(const fn of visibility)fn();doc.hidden=false};
 vm.runInNewContext(src,{Date:Clock,document:doc,localStorage:storage,NotkaUpdates:bridge,setTimeout,clearTimeout});
 return els;
}
(async()=>{
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 const top=shippedTop,name=bundled.catalog.editions.find(e=>e.code===top).name;
 written.set('notka.theme',JSON.stringify({mode:'dark',base:'#242838',accent:'#73aaff'}));
 let e=launchShell();assert.equal(e.colors.bg,'#101614');assert.equal(e.colors.accent,'#baef8a');assert.equal(e.brightness.value,100);assert.equal(opened.length,0);assert.deepEqual(hit,[0]);
 assert.equal(e.localVersion.textContent,'0.'+top+' - '+name);
 assert(e.latest.hidden);assert(e.latest.disabled);assert(!e.last.disabled);assert.equal(e.editorVersions.textContent,'Редактор 0.'+top+' (0.'+top+')');
 e.appearance.onchange({target:{value:'light'}});assert.equal(e.colors.scheme,'light');
 assert(e.themeColorSettings.hidden);assert(e.deleteTheme.hidden);
 e.brightness.oninput({target:{value:'140'}});e.brightness.onchange();assert.equal(e.brightness.value,100);
 e.hexColor.onchange({target:{value:'#000000'}});assert.equal(e.colors.bg,'#f4f3eb');
 e.deleteTheme.onclick();e.confirmThemeDelete.onclick();assert.equal(e.appearance.value,'light');
 e.noteDepth.onchange({target:{checked:true}});assert.equal(e.colors.depth,true);
 e.noteDepth.onchange({target:{checked:false}});
 e.addTheme.onclick();const paletteTheme=e.appearance.value;assert(!e.themeColorSettings.hidden);assert(!e.deleteTheme.hidden);
 e.hexColor.onchange({target:{value:'eeeefa'}});e.pickAccent.onclick();
 e.hue.oninput({target:{value:'120'}});e.hue.onchange();
 const touch={pointerId:1,button:0,clientX:210,clientY:20};
 e.colorPad.onpointerdown(touch);e.colorPad.onpointerup({...touch,type:'pointerup'});assert.equal(e.colors.accent,'#00ff00');
 e.colorPad.onpointerdown({...touch,clientY:70});e.colorPad.onpointermove({...touch,clientY:120});e.colorPad.onpointercancel(touch);assert.equal(e.colors.accent,'#000000');
 e.brightness.oninput({target:{value:'125'}});e.brightness.onchange();assert.notEqual(e.colors.bg,'#eeeefa');
 const before=e.colors.line;e.contrast.oninput({target:{value:'140'}});e.contrast.onchange();assert.notEqual(e.colors.line,before);
 assert.equal(JSON.parse(written.get('notka.theme')).brightness,125);assert.equal(JSON.parse(written.get('notka.theme')).contrast,140);
 e.appearance.onchange({target:{value:'dark'}});assert.equal(e.colors.bg,'#101614');
 e.appearance.onchange({target:{value:paletteTheme}});assert.equal(e.brightness.value,125);assert.equal(e.contrast.value,140);
 e.resetTheme.onclick();assert.equal(e.colors.bg,'#f4f3eb');assert.equal(e.brightness.value,100);
 e.pickBase.onclick();e.hexColor.onchange({target:{value:'#eeeefa'}});e.pickAccent.onclick();e.hexColor.onchange({target:{value:'#c4a5ff'}});assert.equal(e.colors.bg,'#eeeefa');assert.equal(e.colors.accent,'#c4a5ff');
 e.addTheme.onclick();const custom=e.appearance.value;assert.match(custom,/^custom-/);
 e.themeName.onchange({target:{value:'Ночное пианино'}});e.noteDepth.onchange({target:{checked:true}});assert.equal(e.colors.depth,true);
 e.pickBase.onclick();e.hexColor.onchange({target:{value:'#192244'}});
 e.appearance.value=paletteTheme;e.appearance.onchange({target:e.appearance});assert.equal(e.colors.bg,'#eeeefa');assert.equal(e.colors.depth,false);
 e.appearance.value=custom;e.appearance.onchange({target:e.appearance});assert.equal(e.colors.bg,'#192244');assert.equal(e.colors.depth,true);
 const storedThemes=JSON.parse(written.get('notka.themes'));assert.equal(storedThemes.items.find(i=>i.id===custom).name,'Ночное пианино');
 e.brightness.oninput({target:{value:'115'}});e.hide();
 assert.equal(JSON.parse(written.get('notka.themes')).items.find(i=>i.id===custom).settings.brightness,115);
 e.brightness.oninput({target:{value:'100'}});e.brightness.onchange();
 // Reload only the theme preferences. Keep shell assertions below on the existing instance.
 const restored=launchShell();assert.equal(restored.appearance.value,custom);assert.equal(restored.colors.bg,'#192244');assert.equal(restored.colors.depth,true);
 e.deleteTheme.onclick();e.cancelThemeDelete.onclick();assert.equal(e.appearance.value,custom);
 e.deleteTheme.onclick();e.confirmThemeDelete.onclick();assert.equal(e.appearance.value,'light');
 assert(!JSON.parse(written.get('notka.themes')).items.some(item=>item.id===custom));assert(e.deleteTheme.hidden);
 e.appearance.value=paletteTheme;e.appearance.onchange({target:e.appearance});
 await e.last.onclick();assert.equal(opened.at(-1),oldHtml);await settle();
 assert(e.latest.hidden);assert.match(e.catalogStatus.textContent,/Не удалось/);
 assert(!fs.readFileSync('app/launcher.html','utf8').includes('id="refresh"'));const calls=hit.length;
 await e.returnToPanel(30000);assert.equal(hit.length,calls);
 online=true;responses[0]=sign(bundled.catalog);await e.returnToPanel();assert.equal(hit.length,calls+1);assert(e.latest.hidden);
 for(const entry of bundled.catalog.editions.filter(e=>e.code<=top)){
  const button=e.choices.children[bundled.catalog.editions.filter(e=>e.code<=top).sort((a,b)=>b.code-a.code).findIndex(e=>e.code===entry.code)];
  assert.equal(button.children[0].textContent,entry.version+' - '+entry.name);
  await button.onclick();
  assert.equal(crypto.createHash('sha256').update(opened.at(-1)).digest('hex'),entry.sha256);
 }
 await e.choices.children.at(-1).onclick();assert.equal(written.get('notka.last'),'1');
 assert.equal(e.localVersion.textContent,'0.'+top+' - '+name);assert(e.latest.hidden);
 hasDraft=true;e=launchShell();assert.equal(e.colors.bg,'#eeeefa');assert.equal(e.colors.accent,'#c4a5ff');await settle();assert(!fs.readFileSync('app/launcher.html','utf8').includes('id="restore"'));assert.equal(resumed,0);
 const code=Math.max(base.latest,top+1),next={...base.editions.at(-1),code,version:'0.'+code,name:'Тест'},catalog=base.latest>top?home:sign({...base,latest:code,editions:[...base.editions,next]});
 responses[0]={...catalog,signature:'bad'};await e.returnToPanel();assert(e.latest.hidden);
 responses[0]=catalog;await e.returnToPanel();assert(!e.latest.hidden);assert(!e.latest.disabled);
 const entry=JSON.parse(catalog.record).editions.at(-1);assert.equal(e.editorVersions.textContent,'Редактор 0.'+top+' ('+entry.version+')');
 responses[code]={...edition,signature:'bad'};const count=opened.length;
 await e.latest.onclick();assert.equal(opened.length,count);assert(!e.latest.hidden);
 responses[code]=base.latest>top?edition:sign({...JSON.parse(edition.record),...next});
 await e.latest.onclick();assert(e.latest.hidden);assert.equal(e.localVersion.textContent,entry.version+' - '+entry.name);assert.equal(e.editorVersions.textContent,'Редактор '+entry.version+' ('+entry.version+')');assert.equal(e.launchStatus.textContent,'');assert.equal(e.catalogStatus.textContent,'');
 await e.choices.children.at(-1).onclick();online=false;e=launchShell();await settle();assert(e.latest.hidden);
 await e.last.onclick();assert.equal(written.get('notka.last'),String(code));assert.equal(opened.at(-1),extraHtml);
 // Slow catalog checks must never block or override offline launches.
 online=true;responses[0]=home;
 e=launchShell();assert(!e.last.disabled);await e.last.onclick();await settle();assert(e.latest.hidden);
 // Themes open as a separate settings branch; Back commits pending changes.
 e.updates.onclick();e.openThemes.onclick();assert(!e.themePanel.hidden);assert(e.panelHome.hidden);assert.equal(e.updateTitle.textContent,'Темы');
 e.addTheme.onclick();e.brightness.oninput({target:{value:'118'}});e.deleteTheme.onclick();
 e.closeUpdate.onclick();assert(e.themeDeleteConfirm.hidden);assert(!e.themePanel.hidden);
 e.closeUpdate.onclick();assert(e.themePanel.hidden);assert(!e.panelHome.hidden);assert(!e.updateBox.hidden);assert.equal(JSON.parse(written.get('notka.theme')).brightness,118);
 e.closeUpdate.onclick();assert(e.updateBox.hidden);
 // File manager: cancel, multiple cached versions, native deletion and stale protection.
 e.updates.onclick();e.openFiles.onclick();assert(!e.filePanel.hidden);assert(e.panelHome.hidden);
 const editorGroup=e.fileGroups.children.find(g=>g.dataset.kind==='editors');
 assert(editorGroup.children.find(r=>r.className==='file-row'&&r.children[0].children.at(-1).children[0].textContent==='Редактор 0.'+top+' - '+name).children.length===1);
 const nativeGroup=e.fileGroups.children.find(g=>g.dataset.kind==='tracks');const nativeRow=nativeGroup.children.find(r=>r.className==='file-row');nativeRow.children[1].onclick();assert(!e.fileConfirm.hidden);e.cancelFileDelete.onclick();assert(e.fileConfirm.hidden);assert(!e.deleted);
 nativeRow.children[1].onclick();await e.confirmFileDelete.onclick();assert.equal(e.deleted.id,'public:1');
 const oldCode=1;assert(written.has('notka.edition.'+oldCode));
 let group=e.fileGroups.children.find(g=>g.dataset.kind==='editors'),oldRow=group.children.find(r=>r.className==='file-row'&&r.children[0].children.at(-1).children[0].textContent.startsWith('Редактор 0.1 -'));
 oldRow.children[1].onclick();await e.confirmFileDelete.onclick();assert(!written.has('notka.edition.1'));assert.equal(e.choices.children.at(-1).children[1].textContent,'Скачать');
 // Selecting every removable version cannot delete the offline bundled editor.
 group=e.fileGroups.children.find(g=>g.dataset.kind==='editors');group.children.find(b=>b.className==='button file-select').onclick();e.deleteFiles.onclick();assert(!e.fileConfirm.hidden);await e.confirmFileDelete.onclick();
 assert.equal([...written.keys()].filter(k=>k.startsWith('notka.edition.')).length,0);assert.equal(e.localVersion.textContent,'0.'+top+' - '+name);
 e.closeUpdate.onclick();assert(e.filePanel.hidden);assert(!e.updateBox.hidden);e.closeUpdate.onclick();assert(e.updateBox.hidden);
 online=false;await e.last.onclick();assert.equal(opened.at(-1),oldHtml);
 console.log('PASS local launch during catalog check, offline, current, remote update, invalid signatures, retry, compact versions and older manual selection.');
})().catch(e=>{console.error(e);process.exitCode=1});
