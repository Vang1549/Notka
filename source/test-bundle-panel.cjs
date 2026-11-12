const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const script=fs.readFileSync('app/launcher.html','utf8').replace('/* PACKED_EDITIONS */',()=>fs.readFileSync('bundled-editions.js','utf8')).match(/<script>([\s\S]*)<\/script>/)[1];
class El{constructor(){this.style={setProperty(){}};this.dataset={};this.hidden=true;this.children=[];this.value=''}append(...x){this.children.push(...x)}replaceChildren(){this.children=[]}setAttribute(){}focus(){}}
const els={},store=new Map(),opened=[],discarded=[],downloads=[];
const bundled={code:72,version:'0.72',name:'Модульный редактор',sha256:'a'.repeat(64),token:'a'.repeat(64),format:2,minApk:64,builtin:true};
let state=16,installOK=false;
const native={setThemeColors(){},bundleList:()=>JSON.stringify([bundled]),valid:()=>true,begin:()=> '1',status:()=>state,discard:id=>discarded.push(id),editionDownload:()=> '2',bundleDownload:code=>{downloads.push(code);return '3'},bundleInstall:(id,code,sha)=>{assert.equal(code,73);assert.equal(sha,'b'.repeat(64));return installOK?sha:null},openEditor:token=>{assert.equal(token.length,64);opened.push(token);return true}};
const context=vm.createContext({NotkaUpdates:native,document:{getElementById:id=>els[id]??=new El(),createElement:()=>new El(),documentElement:{style:{setProperty(){}}}},localStorage:{get length(){return store.size},key:i=>[...store.keys()][i],getItem:k=>store.get(k)||null,setItem:(k,v)=>{assert(!k.startsWith('notka.edition.'));store.set(k,v)}},setTimeout,clearTimeout});
const run=s=>vm.runInContext(s,context);
(async()=>{
 run(script);await new Promise(r=>setImmediate(r));
 assert.equal(run('newestLocal().code'),72);await els.last.onclick();assert.equal(opened.at(-1),bundled.token);
 run("available.set(73,{code:73,version:'0.73',format:2,minApk:64,sha256:'b'.repeat(64)});confirmed=available.get(73);renderPanel()");
 const count=opened.length;
 await els.latest.onclick();assert.equal(opened.length,count);assert.equal(run('newestLocal().code'),72);
 state=8;await els.latest.onclick();assert.equal(opened.length,count);assert.equal(run('newestLocal().code'),72);
 installOK=true;await els.latest.onclick();assert.equal(opened.at(-1),'b'.repeat(64));assert.equal(run('newestLocal().code'),73);
 assert.equal(store.get('notka.last'),'73');assert.equal(store.size,1);assert(downloads.includes(73));assert(discarded.includes('3'));
 console.log('PASS bundle panel: offline launch, download/integrity failures retain previous edition, successful token launch, no package in localStorage.');
})().catch(e=>{console.error(e);process.exitCode=1});
