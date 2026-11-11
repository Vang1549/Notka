const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const html=fs.readFileSync('app/launcher.html','utf8'),code=html.slice(html.indexOf('const updateBox='),html.indexOf('const phase='));
const signed=JSON.parse(fs.readFileSync((process.env.NOTKA_DIST||'../dist')+'/channel.json'));
const key=new crypto.X509Certificate(fs.readFileSync('signing.der')).publicKey;
const apk=fs.readFileSync('Notka-0.63.apk');
const valid=(r,s)=>crypto.verify('SHA256',Buffer.from(r),key,Buffer.from(s,'base64'));
assert(valid(signed.record,signed.signature));
const hash=crypto.createHash('sha256').update(apk).digest('base64');
assert.equal(JSON.parse(signed.record).sha256,hash);
const record=JSON.stringify({...JSON.parse(signed.record),code:64,version:'0.64',panel:{code:56,version:'0.56'}});
const future={record,signature:crypto.sign('SHA256',Buffer.from(record),fs.readFileSync('signing.pem')).toString('base64')};
function boot(manifest,initialStatus=8){
 const els={},requests=[],discarded=[],waits=[];
 const state={status:initialStatus,digest:hash,installed:0};
 const byId=n=>els[n]??={dataset:{},hidden:true,focus(){},setAttribute(){}};
 const bridge={valid,discard:id=>discarded.push(id),
  status:()=>state.status,begin:code=>String(requests.push(code)),channel:()=>JSON.stringify(manifest),hash:()=>state.digest,install(){state.installed++;return true}};
 const done=vm.runInNewContext(code+'\ncheckApkAtStartup();',{byId,panelBack(){byId('updateBox').hidden=true},NotkaUpdates:bridge,remember(){},setTimeout:f=>waits.push(f)});
 return {els,state,requests,discarded,waits,done};
}
(async()=>{
 let t=boot(signed);await t.done;assert.equal(t.els.updateState.textContent,'');assert(t.els.downloadUpdate.hidden);assert(t.els.downloadPanel.hidden);assert(t.els.apkBundleHint.hidden);assert.equal(t.els.apkVersions.textContent,'APK 0.63 (0.63)');assert.equal(t.els.panelVersions.textContent,'Панель 0.55 (0.55)');
 t=boot(signed,16);await t.done;assert.match(t.els.updateState.textContent,/Не удалось проверить/);assert(t.els.downloadUpdate.hidden);
 t=boot({...future,signature:signed.signature});await t.done;assert.match(t.els.updateState.textContent,/Не удалось проверить/);assert(t.els.downloadUpdate.hidden);
 t=boot(future,1);const {els,state,requests}=t;
 els.updates.onclick();els.closeUpdate.onclick();els.updates.onclick();assert.deepEqual(requests,[0]);assert(els.downloadUpdate.hidden);
 state.status=8;t.waits.shift()();await t.done;assert.deepEqual(t.discarded,['1']);assert(!els.downloadUpdate.hidden);assert(!els.downloadPanel.hidden);assert(!els.apkBundleHint.hidden);assert.equal(els.panelVersions.textContent,'Панель 0.55 (0.56)');
 els.closeUpdate.onclick();els.updates.onclick();assert.equal(els.apkVersions.textContent,'APK 0.63 (0.64)');assert.deepEqual(requests,[0]);
 state.digest='bad';await els.downloadUpdate.onclick();assert.match(els.updateState.textContent,/целостности/);assert.deepEqual(t.discarded,['1','2']);
 state.digest=hash;await els.downloadUpdate.onclick();assert.equal(state.installed,0);
 assert.equal(els.downloadUpdate.textContent,'Установить');assert.equal(els.downloadPanel.textContent,'Установить');
 await els.downloadPanel.onclick();assert.equal(state.installed,1);
 await els.downloadUpdate.onclick();assert.equal(state.installed,2);assert.deepEqual(requests,[0,64,64]);
 const samePanelRecord=JSON.stringify({...JSON.parse(future.record),panel:{code:55,version:'0.55'}}),samePanel={record:samePanelRecord,signature:crypto.sign('SHA256',Buffer.from(samePanelRecord),fs.readFileSync('signing.pem')).toString('base64')};
 t=boot(samePanel);await t.done;assert(!t.els.downloadUpdate.hidden);assert(t.els.downloadPanel.hidden);assert(t.els.apkBundleHint.hidden);
 t.els.latest.hidden=false;await t.els.downloadUpdate.onclick();
 // The editor check may complete after APK discovery; refresh with the same signed channel.
 t=boot(samePanel);t.els.latest={hidden:false};await t.done;assert(!t.els.apkBundleHint.hidden);
 assert(!/backupApk|skipBackup|saveInstalledApk/.test(html));
 console.log('PASS automatic APK check, signature and hash verification, explicit install and retry without backup.');
})().catch(e=>{console.error(e);process.exitCode=1});
