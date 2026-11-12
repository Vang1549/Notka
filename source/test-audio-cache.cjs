const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
const t=boot(false);
t.run(`instrumentCache.clear();const fakeBank=()=>({samples:[{buffer:{length:12*1024*1024,numberOfChannels:1}}]});instrumentCache.set('old-unused',fakeBank());instrumentCache.set(lanes[0].instrument,fakeBank());instrumentCache.set('new-preview',fakeBank());trimInstrumentCache('new-preview')`);
assert(!t.run("instrumentCache.has('old-unused')"));assert(t.run('instrumentCache.has(lanes[0].instrument)'));assert(t.run("instrumentCache.has('new-preview')"));
console.log('PASS decoded-bank cache drops unused buffers while retaining current tracks and preview.');
