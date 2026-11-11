const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
const t=boot(false),r=t.run;
r('score.push({start:960,len:480,pitch:64,volume:73});x=80');const original=r('JSON.stringify(score)');
t.els.stepMenu.onclick();assert(!t.els.stepSheet.hidden);
const preview=()=>t.els.gridPreview.innerHTML;
const lines=()=>[...preview().matchAll(/v90" stroke=/g)].length;
const width=()=>Number(preview().match(/y="60" width="([^"]+)"/)[1]);
assert.equal(lines(),17);assert.equal(width(),15.5);
for(const d of [1,2,3,4,6,8,12,16]){
 const left=r('ticks(x)');t.els.gridDivision.onchange({target:{value:String(d)}});
 assert.equal(lines(),4*d+1);assert.equal(width(),Math.max(2,70/d-2));assert.equal(r('ticks(x)'),left);assert.equal(r('JSON.stringify(score)'),original);
}
t.els.snap.onchange({target:{value:'3'}});t.els.gridDivision.onchange({target:{value:'0'}});assert.equal(lines(),13);
t.els.snap.onchange({target:{value:'0'}});assert.equal(lines(),17);assert.match(preview(),/Без привязки/);
t.els.noteSize.onchange({target:{value:'2'}});assert.equal(width(),33);assert.equal(lines(),17);
r('selectNote(score[0])');t.els.stepMenu.onclick();assert.equal(width(),33);
t.els.noteSize.onchange({target:{value:'0'}});assert.equal(width(),15.5);assert.equal(r('JSON.stringify(score)'),original);
r('notkaBack()');assert(t.els.stepSheet.hidden);assert.equal(JSON.parse(t.draft).viewDivision,0);assert.equal(JSON.parse(t.draft).division,0);
t.els.stepMenu.onclick();assert.equal(lines(),17);
console.log('PASS preview subdivisions 1–16 and triplets, auto/free grid, note length/template, unchanged notes and viewport time, Back persistence/reopen.');
