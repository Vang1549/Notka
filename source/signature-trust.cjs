// Test harnesses model the native verifier's current and pinned legacy keys.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const keys=['signing.der','signing-legacy.der'].map(name=>new crypto.X509Certificate(fs.readFileSync(path.join(__dirname,name))).publicKey);
function verify(record,signature){
 return keys.some(key=>{try{return crypto.verify('sha256',Buffer.from(record),key,Buffer.from(signature,'base64'))}catch{return false}});
}
function privateKey(){
 const location=process.env.NOTKA_SIGNING_KEY||(process.platform==='win32'?'D:/Tools/Notka/keys/signing.pem':'/mnt/d/Tools/Notka/keys/signing.pem');
 const key=crypto.createPrivateKey(fs.readFileSync(location));
 if(!crypto.createPublicKey(key).export({type:'spki',format:'der'}).equals(keys[0].export({type:'spki',format:'der'})))throw Error('Signing identity mismatch');
 return key;
}
module.exports={verify,privateKey};
