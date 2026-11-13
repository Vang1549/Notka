// Run the actual APK launcher with its actual built-in bundle metadata.
const fs=require('fs'),vm=require('vm'),{execFileSync}=require('child_process');
const release=JSON.parse(fs.readFileSync('release.json','utf8'));
const assets=JSON.parse(execFileSync(process.env.NOTKA_PYTHON||'python',['-c',
 "import json,zipfile; r=json.load(open('release.json')); z=zipfile.ZipFile('Notka-'+r['apk_version']+'.apk'); print(json.dumps({'launcher':z.read('assets/index.html').decode(),'builtin':json.loads(z.read('assets/editor-builtin.json'))}))"],{encoding:'utf8'}));
const builtin={...assets.builtin,token:assets.builtin.sha256,builtin:true};
let harness=fs.readFileSync('test-bundle-panel.cjs','utf8').split('(async()=>{')[0];
harness=harness.replace(/^const script=.*$/m,()=>`const script=${JSON.stringify(assets.launcher.match(/<script>([\s\S]*)<\/script>/)[1])};`);
harness=harness.replace(/^const bundled=.*$/m,()=>`const bundled=${JSON.stringify(builtin)};`);
harness+=`
(async()=>{
 run(script);await new Promise(r=>setImmediate(r));
 assert.equal(run('currentVersion'),${release.apk_code});
 assert.equal(run('currentApk'),${JSON.stringify(release.apk_version)});
 assert.equal(run('currentPanel.code'),${release.panel_code});
 assert.equal(run('newestLocal().code'),${release.editor_code});
 await els.last.onclick();assert.equal(opened.at(-1),bundled.token);
 const future={...bundled,code:bundled.code+1,minApk:${release.apk_code}+1};
 const envelope=entries=>({record:JSON.stringify({kind:'notka.catalog.1',latest:future.code,editions:entries}),signature:'fixture'});
 context.mixed=envelope([bundled,future]);
 assert.equal(run('unpackCatalog(mixed).latest'),bundled.code);
 assert.equal(run('unpackCatalog(mixed).editions.length'),1);
 context.mixed={record:JSON.stringify({kind:'notka.catalog.1',latest:bundled.code,editions:[bundled,{...future,minApk:bundled.minApk}]}),signature:'fixture'};
 assert.equal(run('unpackCatalog(mixed).latest'),bundled.code);
 context.mixed=envelope([future]);assert.equal(run('unpackCatalog(mixed).editions.length'),0);
 context.mixed=envelope([bundled,{...future,minApk:'bad'}]);assert.throws(()=>run('unpackCatalog(mixed)'));
 console.log('PASS actual release APK: matching versions, offline built-in editor selected and launched; future packages filtered without rejecting compatible catalog.');
})().catch(e=>{console.error(e);process.exitCode=1});
`;
vm.runInNewContext(harness,{require,console,setTimeout,clearTimeout,setImmediate,process},{filename:'release-panel-harness.cjs'});
