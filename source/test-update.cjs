const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const html=fs.readFileSync('app/launcher.html','utf8'),code=html.slice(html.indexOf('const updateBox='),html.indexOf('const phase='));
const sign=data=>{const record=JSON.stringify(data);return {record,signature:crypto.sign('SHA256',Buffer.from(record),require('./signature-trust.cjs').privateKey()).toString('base64')}};
const signed=sign({app:'studio.notka.piano',code:68,version:'0.68',panel:{code:60,version:'0.60'},sha256:crypto.createHash('sha256').update(fs.readFileSync('Notka-0.68.apk')).digest('base64')});
const key=new crypto.X509Certificate(fs.readFileSync('signing.der')).publicKey;
const apk=fs.readFileSync('Notka-0.68.apk');
const valid=(r,s)=>require('./signature-trust.cjs').verify(r,s);
assert(valid(signed.record,signed.signature));
const hash=crypto.createHash('sha256').update(apk).digest('base64');
assert.equal(JSON.parse(signed.record).sha256,hash);
const record=JSON.stringify({...JSON.parse(signed.record),code:69,version:'0.69',panel:{code:61,version:'0.61'}});
const future={record,signature:crypto.sign('SHA256',Buffer.from(record),require('./signature-trust.cjs').privateKey()).toString('base64')};
function boot(manifest,initialStatus=8){
 const els={},requests=[],discarded=[],waits=[];
 const state={status:initialStatus,digest:hash,installed:0,manifest};
 const byId=n=>els[n]??={dataset:{},hidden:true,focus(){},setAttribute(){}};
 const bridge={valid,discard:id=>discarded.push(id),
  status:()=>state.status,begin:code=>String(requests.push(code)),channel:()=>JSON.stringify(state.manifest),hash:()=>state.digest,install(){state.installed++;return true}};
 const context=vm.createContext({byId,panelBack(){byId('updateBox').hidden=true},NotkaUpdates:bridge,remember(){},setTimeout:f=>waits.push(f)});
 const run=s=>vm.runInContext(s,context);
 const done=run(code+'\ncheckApkAtStartup();');
 return {els,state,requests,discarded,waits,done,run};
}
(async()=>{
 let t=boot(signed);await t.done;assert.equal(t.els.updateState.textContent,'');assert(t.els.downloadUpdate.hidden);assert(t.els.downloadPanel.hidden);assert(t.els.apkBundleHint.hidden);assert.equal(t.els.apkVersions.textContent,'APK 0.68 (0.68)');assert.equal(t.els.panelVersions.textContent,'Панель 0.60 (0.60)');
 t=boot(signed,16);await t.done;assert.match(t.els.updateState.textContent,/Не удалось проверить/);assert(t.els.downloadUpdate.hidden);
 t.state.status=8;t.state.manifest=future;await t.run('checkApkAtStartup()');assert(!t.els.downloadUpdate.hidden);assert.deepEqual(t.requests,[0,0]);
 t=boot({...future,signature:signed.signature});await t.done;assert.match(t.els.updateState.textContent,/Не удалось проверить/);assert(t.els.downloadUpdate.hidden);
 t=boot(future,1);const {els,state,requests}=t;
 els.updates.onclick();els.closeUpdate.onclick();els.updates.onclick();assert.deepEqual(requests,[0]);assert(els.downloadUpdate.hidden);
 await t.run('checkApkAtStartup()');assert.deepEqual(requests,[0]);
 state.status=8;t.waits.shift()();await t.done;assert.deepEqual(t.discarded,['1']);assert(!els.downloadUpdate.hidden);assert(!els.downloadPanel.hidden);assert(!els.apkBundleHint.hidden);assert.equal(els.panelVersions.textContent,'Панель 0.60 (0.61)');
 els.closeUpdate.onclick();els.updates.onclick();assert.equal(els.apkVersions.textContent,'APK 0.68 (0.69)');assert.deepEqual(requests,[0]);
 state.digest='bad';await els.downloadUpdate.onclick();assert.match(els.updateState.textContent,/целостности/);assert.deepEqual(t.discarded,['1','2']);
 state.digest=hash;await els.downloadUpdate.onclick();assert.equal(state.installed,0);
 assert.equal(els.downloadUpdate.textContent,'Установить');assert.equal(els.downloadPanel.textContent,'Установить');
 await t.run('checkApkAtStartup()');assert.deepEqual(requests,[0,69,69]);assert.equal(els.downloadUpdate.textContent,'Установить');
 await els.downloadPanel.onclick();assert.equal(state.installed,1);
 await els.downloadUpdate.onclick();assert.equal(state.installed,2);assert.deepEqual(requests,[0,69,69]);
 const samePanelRecord=JSON.stringify({...JSON.parse(future.record),panel:{code:60,version:'0.60'}}),samePanel={record:samePanelRecord,signature:crypto.sign('SHA256',Buffer.from(samePanelRecord),require('./signature-trust.cjs').privateKey()).toString('base64')};
 t=boot(samePanel);await t.done;assert(!t.els.downloadUpdate.hidden);assert(t.els.downloadPanel.hidden);assert(t.els.apkBundleHint.hidden);
 t.els.latest.hidden=false;await t.els.downloadUpdate.onclick();
 // The editor check may complete after APK discovery; refresh with the same signed channel.
 t=boot(samePanel);t.els.latest={hidden:false};await t.done;assert(!t.els.apkBundleHint.hidden);
 // A channel request already in flight must not replace the APK being downloaded.
 t=boot(future);await t.done;t.state.status=1;
 const checking=t.run('checkApkAtStartup()'),downloading=t.els.downloadUpdate.onclick();
 t.state.manifest=signed;t.state.status=8;
 for(const wake of t.waits.splice(0))wake();await checking;await downloading;
 assert.equal(t.els.downloadUpdate.textContent,'Установить');assert.equal(t.els.apkVersions.textContent,'APK 0.68 (0.69)');
 // Native resume, visibility and online share throttled checks for BOTH channels.
 let now=100000,catalogChecks=0,apkChecks=0,renders=0;
 const doc={hidden:false},events={};
 const resume=html.slice(html.indexOf('function panelResume('),html.indexOf("byId('latest').onclick="));
 const ctx=vm.createContext({document:Object.assign(doc,{addEventListener:(n,f)=>events[n]=f}),window:{addEventListener:(n,f)=>events[n]=f},Date:{now:()=>now},renderPanel:()=>renders++,diagnosticsResume(){},checkCatalog:()=>{catalogChecks++;ctx.lastCheck=now},checkApkAtStartup:()=>{apkChecks++;ctx.lastApkCheck=now},lastCheck:now,lastApkCheck:now,task:null});
 vm.runInContext(resume,ctx);events.focus();assert.equal(apkChecks,0);
 now+=60000;vm.runInContext('panelResume()',ctx);assert.equal(apkChecks,1);assert.equal(catalogChecks,1);
 events.visibilitychange();events.focus();assert.equal(apkChecks,1);
 events.online();assert.equal(apkChecks,2);assert.equal(catalogChecks,2);
 doc.hidden=true;now+=60000;events.online();assert.equal(apkChecks,2);
 doc.hidden=false;ctx.task={};events.focus();assert.equal(apkChecks,2);ctx.task=null;events.focus();assert.equal(apkChecks,3);
 const host=fs.readFileSync('host.ops','utf8').split('method Main:onResume:V')[1].split('method Main:onWindowFocusChanged')[0];
 assert(host.includes("if(typeof panelResume==='function')panelResume()"));
 assert(!/backupApk|skipBackup|saveInstalledApk/.test(html));
 console.log('PASS automatic APK check, signature and hash verification, explicit install and retry without backup.');
})().catch(e=>{console.error(e);process.exitCode=1});
