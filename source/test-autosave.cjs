const {boot}=require('./test-instruments.cjs'),assert=require('node:assert/strict');
let clock=0,id=0,writes=0,fail=false;const timers=new Map();
const t=boot(false,{writeDraft(){writes++;return !fail}},{setTimeout(fn,ms){const key=++id;timers.set(key,{fn,at:clock+ms});return key},clearTimeout:key=>timers.delete(key)});
function advance(ms){const end=clock+ms;while(true){const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;clock=next[1].at;timers.delete(next[0]);next[1].fn()}clock=end}
advance(120000);assert.equal(writes,0);
t.run('addNote(0,60)');advance(30000);t.run('addNote(960,64);flushDraft()');advance(29999);assert.equal(writes,0);
advance(1);assert.equal(writes,1);assert(!t.run('draftPending'));
advance(180000);assert.equal(writes,1); // Clean intervals never write.
t.run('trackChanged();gesture={n:score[0]}');advance(60000);assert.equal(writes,1);
t.run('gesture=null');advance(1000);assert.equal(writes,2); // Never checkpoint a partial drag.
fail=true;t.run('trackChanged()');advance(60000);assert.equal(writes,3);assert(t.run('draftPending'));
fail=false;advance(60000);assert.equal(writes,4);assert(!t.run('draftPending'));
t.run('trackChanged();suspendEditor()');assert.equal(writes,5);advance(60000);assert.equal(writes,5);
let exits=0;const exit=boot(false,{leave(){exits++}});exit.run('addNote(0,60);finishExit()');assert.equal(exits,1);assert.equal(JSON.parse(exit.draft).lanes[0].notes.length,1);
console.log('PASS minute autosave, no reset by later edits, no clean writes, drag deferral, write retry, background and final exit checkpoint.');
