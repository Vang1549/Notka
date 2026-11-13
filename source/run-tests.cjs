// One entry point for all automated suites. Browser/device QA remains explicit.
const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=__dirname,repo=path.dirname(root),python=process.env.NOTKA_PYTHON||'python';
const results=[];
function run(command,args,cwd=root){
 const label=path.basename(args[0]);
 return new Promise(resolve=>{
  let output='',error=null;
  const child=spawn(command,args,{cwd,env:process.env,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  child.on('error',e=>error=e.message);
  const timeout=setTimeout(()=>{error='Timed out after 120 seconds';child.kill('SIGKILL')},120000);
  child.on('close',code=>{
   clearTimeout(timeout);
   // A silent helper is not a successful suite. Explicit subtest skips stay visible.
   const ok=code===0&&!error&&(/^(?:PASS|OK|Verified|APK)/m.test(output)||args.includes('--verify-only'));
   results.push({label,ok});console.log(`${ok?'PASS':'FAIL'} ${label}`);
   for(const line of output.split('\n').filter(l=>l.startsWith('SKIP ')))console.log('  '+line);
   if(!ok)console.error(error||output||'No test result was produced.');
   resolve(ok);
  });
 });
}
(async()=>{
 // Refuse stale assembled HTML; tests must exercise the current source modules.
 const {development}=require('./build-editor.cjs');
 if(fs.readFileSync(path.join(root,'app/index.html'),'utf8')!==development())throw Error('Stale app/index.html: run node build-editor.cjs before testing.');
 const scripts=fs.readdirSync(root).filter(f=>/^test-.*\.cjs$/.test(f)&&f!=='test-sound-host.cjs').sort();
 // Four isolated Node processes, each with its own VM. Export-file validation
 // runs afterwards so it never consumes output from an unfinished JS suite.
 const queue=[...scripts];
 await Promise.all(Array.from({length:4},async()=>{while(queue.length)await run(process.execPath,[queue.shift()])}));
 for(const file of ['verify.py',...fs.readdirSync(root).filter(f=>/^test-.*\.py$/.test(f)).sort()]){
  if(file==='test-export-files.py'&&!results.find(r=>r.label==='test-export.cjs')?.ok){results.push({label:file,ok:false});console.error('FAIL '+file+': export producer failed');continue}
  await run(python,[file]);
 }
 await run(python,['scripts/publish.py','--verify-only'],repo);
 await run(python,['scripts/test_apk_delta.py'],repo);
 const failed=results.filter(r=>!r.ok);
 console.log(`\n${results.length-failed.length}/${results.length} automated suites passed. Browser/WebView/device QA not run.`);
 if(failed.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
