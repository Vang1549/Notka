const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
const t=boot(false);t.run('y=(highestPitch-72)*row;paint()');
for(const k of t.els.keys.children.filter(k=>!k.hidden)){
 const p=Number(k.dataset.pitch);assert.equal(k.textContent,['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][p%12]);assert.equal(String(k.dataset.octave),p%12===0?String(Math.floor(p/12)-1):'');assert(k.attrs['aria-label']);
}
assert.equal(t.run('keyWidth'),32);assert.equal(t.run('w'),t.run('roll.clientWidth-32'));
// Rotation changes available geometry without shifting a note or its time coordinate.
t.run('score.push({start:960,len:480,pitch:60,volume:70});x=80;roll.clientWidth=844;roll.clientHeight=240;resize()');assert.equal(t.run('w'),812);assert.equal(t.run('x'),80);assert.equal(t.run('score[0].start'),960);
t.run('row=16;y=(highestPitch-60)*row;paint()');assert.equal(t.els.keys.children[0].textContent,'C');assert.equal(t.els.keys.children[0].dataset.octave,4);
console.log('PASS compact note letters, C octave markers, accessible full names, narrow key geometry and resize with unchanged notes/time.');
