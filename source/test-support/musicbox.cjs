// Synthetic PCM, generated here: no FrozenPlain audio or licensed package data.
// Exercises the bank/bridge contract; it does not test native Floe extraction.
const fs=require('node:fs'),path=require('node:path');
const sampleRate=32000,frames=16000;
function wav(variant){
 const b=Buffer.alloc(44+frames*2);
 b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);
 b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
 b.writeUInt32LE(sampleRate,24);b.writeUInt32LE(sampleRate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(2000*Math.sin(2*Math.PI*(220+variant*55)*i/sampleRate)),44+i*2);
 return b.toString('base64');
}
const data={format:'notka.instrument.1',id:'musicbox-floe',revision:1,
 name:'Synthetic Music Box test fixture',gmProgram:10,sampleRate,gain:.5,attack:.01,release:.1,roundRobins:4,
 samples:Array.from({length:4},(_,rr)=>({root:60,tune:0,rr,data:wav(rr)}))};
const raw=JSON.stringify(data);
function instrumentData(asset){
 if(asset==='musicbox-floe')return raw;
 return fs.readFileSync(path.join(__dirname,'../app/instruments',asset+'.json'),'utf8');
}
module.exports={raw,data,instrumentData};
