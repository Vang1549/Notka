const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('app/launcher.html','utf8'),code=html.slice(html.indexOf('function refreshDiagnostics(){'),html.indexOf('let panelOutside=false;'));
function setup(supported=true){
 let config={enabled:false,overlay:false},report={},exports=0,status={};
 const els={},byId=id=>els[id]??={hidden:true,focus(){},setAttribute(){}};
 const host=supported?{diagnosticsConfig:()=>JSON.stringify(config),diagnosticsConfigure:raw=>{config=JSON.parse(raw);return true},diagnosticsReport:()=>JSON.stringify(report),diagnosticsClear:()=>{report={};return true},diagnosticsExport:()=>{exports++;return true},diagnosticsStatus:()=>JSON.stringify(status)}:{};
 const context=vm.createContext({byId,NotkaUpdates:host,document:{hidden:false,addEventListener(){}},setTimeout:()=>1,clearTimeout(){}});vm.runInContext(code,context);
 return {els,config:()=>config,setReport:v=>report=v,exports:()=>exports,setStatus:v=>status=v,resume:()=>vm.runInContext('diagnosticsResume()',context)};
}
const t=setup();t.els.openDiagnostics.onclick();assert.equal(t.els.diagnosticsPanel.hidden,false);assert.equal(t.els.panelHome.hidden,true);assert(t.els.saveDiagnostics.disabled);assert(t.els.diagnosticsOverlay.disabled);
t.els.diagnosticsEnabled.checked=true;t.els.diagnosticsOverlay.checked=true;t.els.diagnosticsEnabled.onchange();assert.deepEqual(t.config(),{enabled:true,overlay:true});assert(!t.els.diagnosticsOverlay.disabled);
t.setReport({format:'notka.diagnostics.1',editor:'0.73',samples:[{mode:'player',drawFps:30,audioBytes:1048576}],errors:[{}]});t.els.openDiagnostics.onclick();assert(!t.els.saveDiagnostics.disabled);assert.match(t.els.diagnosticsSummary.textContent,/30 FPS/);
t.setStatus({state:'saved',message:'Отчёт сохранён.'});t.els.saveDiagnostics.onclick();assert.equal(t.exports(),1);assert.match(t.els.diagnosticsStatus.textContent,/сохранён/);
t.setStatus({state:'cancelled',message:'Сохранение отменено.'});t.els.saveDiagnostics.onclick();assert.match(t.els.diagnosticsStatus.textContent,/отменено/);assert(!t.els.saveDiagnostics.disabled);
t.setStatus({state:'pending',message:'Сохраняю отчёт…'});t.resume();assert(t.els.saveDiagnostics.disabled);
t.setStatus({state:'error',message:'Отчёт остался в приложении'});t.resume();assert(!t.els.saveDiagnostics.disabled);assert.match(t.els.diagnosticsStatus.textContent,/остался/);
t.els.diagnosticsEnabled.checked=false;t.els.diagnosticsEnabled.onchange();assert(!t.els.saveDiagnostics.disabled); // Turning off doesn't delete the previous report.
t.els.clearDiagnostics.onclick();assert(t.els.saveDiagnostics.disabled);t.resume();assert(t.els.saveDiagnostics.disabled);
const legacy=setup(false);legacy.els.openDiagnostics.onclick();assert(legacy.els.diagnosticsEnabled.disabled);assert.match(legacy.els.diagnosticsStatus.textContent,/0.66/);
console.log('PASS diagnostics settings, overlay switch, latest-session summary, system-export action/status/cancel, retained report when disabled, clear and old-APK notice.');
