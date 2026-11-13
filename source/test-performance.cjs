const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
const t=boot(false);t.run('row=16;col=12;y=350;x=0;score.push({pitch:95,start:240,len:960,volume:80});rowIndexes.delete(score);paint()');
let cellWrites=0;for(const cell of t.els.notes.children){const original=cell.setAttribute.bind(cell);cell.setAttribute=(...args)=>{cellWrites++;original(...args)}}
let blockWrites=0;const block=t.run('blockViews.get(score[0])');block.style=new Proxy(block.style,{set(o,k,v){blockWrites++;o[k]=v;return true}});
t.run('x=3.3;y=351.2;paint()');assert.equal(blockWrites,0);assert.equal(cellWrites,0);
assert.match(t.els.blocks.style.transform,/-3.3px,-351.2px/);assert.equal(block.style.left,'12px');
t.run('x=12;paint()');assert(cellWrites<t.els.notes.children.length/4,'most cell labels must be reused');assert.equal(blockWrites,0);
// Keyboard activation still creates notes at the currently visible cell after pan/zoom.
t.run('x=48;y=320;paint()');const el=t.els.notes.children[4];el.onclick({detail:0});
assert(t.run('score.some(n=>n.start===1920&&n.pitch===99)'));
// Geometry remains equivalent to the old viewport-relative positions, including a long clipped note.
t.run('score.push({pitch:98,start:0,len:9000,volume:70});rowIndexes.delete(score);x=120;paint()');
for(const n of t.run('[...blockViews.keys()]')){const view=t.run('blockViews').get(n);assert.equal(parseFloat(view.style.left)-t.run('x'),t.run('pixels('+n.start+')-x'));assert.equal(parseFloat(view.style.top)-t.run('y'),t.run('(highestPitch-'+n.pitch+')*row-y+2'))}
// The player reuses actual path instances until keyboard geometry changes.
let paths=0;class Path{constructor(){paths++}moveTo(){}lineTo(){}quadraticCurveTo(){}closePath(){}}
const p=boot(false,{}, {Path2D:Path});const gradient={addColorStop(){}};let filled=0,gradients=0;
const g=new Proxy({}, {get:(o,k)=>o[k]??((...args)=>{if(k==='fill'&&args[0] instanceof Path)filled++;if(k.startsWith('create'))gradients++;return k.startsWith('create')?gradient:undefined}),set:(o,k,v)=>(o[k]=v,true)});
p.run('byId("scene")');p.els.scene.getContext=()=>g;p.run('options=cleanSceneOptions({rangeMode:"manual",keyStart:60,keyCount:24,trails:0});var ps={events:[{pitch:60,start:0,len:960,volume:80,lane:0}],next:0,visible:[],sec:.001,last:2000,...keyLayout([])};renderScene(byId("scene"),ps,.1)');
assert.equal(paths,24);assert(filled>=24);const initialGradients=gradients;assert(initialGradients>0);p.run('renderScene(byId("scene"),ps,.2)');assert.equal(paths,24);assert.equal(gradients,initialGradients);
p.els.scene.clientWidth+=50;p.run('renderScene(byId("scene"),ps,.3)');assert.equal(paths,48);
p.run('Object.assign(ps,keyLayout([]));renderScene(byId("scene"),ps,.4)');assert.equal(paths,72);
p.run('options.keyboardHeight=22;renderScene(byId("scene"),ps,.5)');assert.equal(paths,96);
const before=p.run('ps.visible');p.run('sceneVisible(ps,1.5)');assert.equal(p.run('ps.visible'),before);assert.equal(before.length,0);
console.log('PASS sub-cell pan without cell/block writes, reused labels, current keyboard cell activation, unchanged note geometry, keyboard path reuse/invalidation and allocation-free visible-note pruning.');
