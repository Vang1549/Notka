const fs=require('fs'),crypto=require('crypto');
const dir=(process.env.NOTKA_DIST||'../dist')+'/soundbank/';
const key=new crypto.X509Certificate(fs.readFileSync('signing.der')).publicKey;
function installedSounds(){
 const store=new Map(fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>[f.slice(0,-5),fs.readFileSync(dir+f,'utf8')]));
 return {soundRead:k=>store.get(k)||null,soundWrite:(k,v)=>{store.set(k,v);return true},soundDelete:k=>store.delete(k),soundExists:k=>store.has(k),soundDownload:()=> '1',soundStatus:()=>16,soundText:()=>null,soundHash:()=>null,soundDiscard(){},soundValid:(r,s)=>{try{return require('./signature-trust.cjs').verify(r,s)}catch{return false}}};
}
module.exports={installedSounds};
