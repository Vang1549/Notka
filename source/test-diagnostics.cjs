const {boot}=require('./test-instruments.cjs'),assert=require('node:assert/strict');
let clock=0,next=0,writes=[];const frames=new Map();
const t=boot(false,{diagnosticsConfig:()=>'{"enabled":true,"overlay":true}',diagnosticsStore(raw){writes.push(JSON.parse(raw));return true}},{performance:{now:()=>clock,memory:{usedJSHeapSize:123456}},requestAnimationFrame(fn){const id=++next;frames.set(id,fn);return id},cancelAnimationFrame:id=>frames.delete(id)});
function advance(dt){clock+=dt;const current=[...frames.values()];frames.clear();for(const fn of current)fn(clock)}
t.run('addNote(0,60);lanes[0].name="PRIVATE TRACK NAME"');
for(let i=0;i<75;i++)advance(16);advance(100);for(let i=0;i<70;i++)advance(16);
assert(!t.els.diagnosticsHud.hidden);assert.match(t.els.diagnosticsHud.textContent,/FPS/);
t.run('diagnostics.operation("load",12);diagnostics.operation("load",8);diagnostics.error("test",new Error("failure"));diagnostics.persist()');
let report=writes.at(-1);assert.equal(report.format,'notka.diagnostics.1');assert(report.samples.length>=2);assert.equal(report.operations.load.count,2);assert.equal(report.operations.load.maxMs,12);assert.equal(report.errors[0].message,'failure');assert(report.summary.slowFrames>=1);assert(!JSON.stringify(report).includes('PRIVATE TRACK NAME'));assert.equal(report.samples.at(-1).notes,1);
const before=report.summary.maxFrameMs;t.doc.hidden=true;t.doc.visibilitychange();clock+=10000;/* Browser suspends rAF entirely while hidden. */t.doc.hidden=false;t.doc.visibilitychange();advance(16);advance(16);t.run('diagnostics.persist()');assert.equal(writes.at(-1).summary.maxFrameMs,before);
for(let i=0;i<610;i++)advance(1000);t.run('for(let i=0;i<60;i++)diagnostics.error("bounded","x");diagnostics.persist()');report=writes.at(-1);assert.equal(report.samples.length,600);assert.equal(report.errors.length,50);
const disabled=boot(false,{diagnosticsConfig:()=>'{"enabled":false,"overlay":true}',diagnosticsStore(){throw Error('must not write')}});disabled.run('diagnostics.error("test","silent");diagnostics.persist()');assert(disabled.els.diagnosticsHud===undefined||disabled.els.diagnosticsHud.hidden);
console.log('PASS opt-in diagnostics, overlay, frame stalls, timing aggregates, no track contents, hidden-time exclusion, bounded samples/errors and disabled no-write mode.');
