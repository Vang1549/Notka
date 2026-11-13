const catalogHost=sampleHost&&['soundRead','soundWrite','soundDelete','soundExists','soundDownload','soundStatus','soundText','soundHash','soundValid','soundDiscard'].every(key=>typeof sampleHost[key]==='function')?sampleHost:null;
const downloadedInstruments=new Set();
let catalogJob=null,catalogStarted=false,bankJob=null,pendingInstrumentDelete=null;
const catalogError='Для каталога инструментов обнови APK до 0.33 или новее.';
const catalogKey='catalog';
function verifySound(raw){
 if(typeof raw!=='string'||!raw||raw.length>=8388608)throw Error('Файл инструмента недоступен или слишком велик.');
 const envelope=JSON.parse(raw);
 if(typeof envelope.record!=='string'||typeof envelope.signature!=='string'||!catalogHost.soundValid(envelope.record,envelope.signature))throw Error('Не удалось проверить подпись набора звуков.');
 return JSON.parse(envelope.record);
}
function parseSoundCatalog(raw){
 if(typeof raw!=='string'||raw.length>262144)throw Error('Некорректный каталог звуков.');
 const data=verifySound(raw),seen=new Set(),assets=new Set();
 if(data.kind!=='notka.instruments.1'||!Number.isInteger(data.version)||data.version<1||!Array.isArray(data.instruments)||data.instruments.length>200)throw Error('Неизвестный каталог звуков.');
 const entries=data.instruments.map(d=>{
  if(!d||typeof d.id!=='string'||!/^lib-[a-z0-9-]{1,43}$/.test(d.id)||seen.has(d.id)||typeof d.asset!=='string'||!/^bank-[a-z0-9-]{1,42}$/.test(d.asset)||assets.has(d.asset)||
    typeof d.name!=='string'||!d.name.trim()||d.name.length>48||typeof d.short!=='string'||!/^[-\p{L}\p{N}]{1,3}$/u.test(d.short)||
    !Number.isInteger(d.gm)||d.gm<0||d.gm>127||!Number.isInteger(d.demo)||d.demo<24||d.demo>119||
    !Number.isInteger(d.revision)||d.revision<1||d.revision>65535||!Number.isInteger(d.bytes)||d.bytes<100||d.bytes>=8388608||
    typeof d.sha256!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(d.sha256))throw Error('Некорректный инструмент в каталоге.');
  seen.add(d.id);assets.add(d.asset);
  const p=d.preview;
  if(p!==undefined&&(!p||typeof p.asset!=='string'||!/^preview-[a-z0-9-]{1,39}$/.test(p.asset)||!Number.isInteger(p.bytes)||p.bytes<100||p.bytes>262144||typeof p.sha256!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(p.sha256)))throw Error('Некорректное предпрослушивание.');
  return {id:d.id,name:d.name.trim(),short:d.short,asset:d.asset,gm:d.gm,demo:d.demo,revision:d.revision,bytes:d.bytes,sha256:d.sha256,preview:p?{asset:p.asset,bytes:p.bytes,sha256:p.sha256}:null,remote:true};
 });
 for(const old of instruments.filter(d=>d.remote)){
  const next=entries.find(d=>d.id===old.id);
  if(!next||next.asset!==old.asset||next.sha256!==old.sha256||next.revision!==old.revision)throw Error('Каталог изменил существующий инструмент. Сохранена предыдущая версия.');
 }
 return entries;
}
function mergeSoundCatalog(entries){
 for(const entry of entries){
  remoteAlternatives.set(entry.id,entry);
  const index=instruments.findIndex(d=>d.id===entry.id);
  if(index<0)instruments.push(entry);else if(instruments[index].remote)instruments[index]=entry;
  if(entry.id!=='lib-musicbox-1')visibleInstrumentIds.add(entry.id);
  if(catalogHost.soundExists(entry.asset))downloadedInstruments.add(entry.id);
 }
 renderLanes();paintSoon();if(!byId('instrumentSheet').hidden)renderInstruments();
}
const shippedSoundCatalog="{\"record\":\"{\\\"kind\\\":\\\"notka.instruments.1\\\",\\\"version\\\":7,\\\"instruments\\\":[{\\\"id\\\":\\\"lib-vsco-trumpet-1\\\",\\\"asset\\\":\\\"bank-trumpet-1\\\",\\\"name\\\":\\\"\\\\u0422\\\\u0440\\\\u0443\\\\u0431\\\\u0430\\\",\\\"short\\\":\\\"\\\\u0422\\\\u0440\\\",\\\"gm\\\":56,\\\"demo\\\":67,\\\"revision\\\":1,\\\"bytes\\\":1435112,\\\"sha256\\\":\\\"hiZHM1m3Psfki5KTh75oWLijGoOW3FbWZ1IRnPJtwpY=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-trumpet-1\\\",\\\"bytes\\\":49674,\\\"sha256\\\":\\\"CbcrOgjQTJCRpwn+2DhrassgP8pvIND8EmA9Pgh5wPs=\\\"}},{\\\"id\\\":\\\"lib-vsco-violin-1\\\",\\\"asset\\\":\\\"bank-violin-1\\\",\\\"name\\\":\\\"\\\\u0421\\\\u043a\\\\u0440\\\\u0438\\\\u043f\\\\u043a\\\\u0430\\\",\\\"short\\\":\\\"\\\\u0421\\\\u043a\\\",\\\"gm\\\":40,\\\"demo\\\":69,\\\"revision\\\":1,\\\"bytes\\\":1913241,\\\"sha256\\\":\\\"l4HKyRDDBJBeMZ2ORrlKEorxIrqG2tj9AXS9DrzhPWc=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-violin-1\\\",\\\"bytes\\\":49673,\\\"sha256\\\":\\\"chKkVxyvMZMoBF/bTH9ajxWa3vkOe8RgA7Xh621O5Fg=\\\"}},{\\\"id\\\":\\\"lib-vsco-flute-1\\\",\\\"asset\\\":\\\"bank-flute-1\\\",\\\"name\\\":\\\"\\\\u0424\\\\u043b\\\\u0435\\\\u0439\\\\u0442\\\\u0430\\\",\\\"short\\\":\\\"\\\\u0424\\\",\\\"gm\\\":73,\\\"demo\\\":72,\\\"revision\\\":1,\\\"bytes\\\":1674175,\\\"sha256\\\":\\\"JTvrMkDiYffQaLoQRNUDRl5deFq+RSRVi4TyvDGzKzQ=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-flute-1\\\",\\\"bytes\\\":49672,\\\"sha256\\\":\\\"i9rgpwnwVqvUQrDXNPtMuEat0kcnrs+Fp+LybgxVUOs=\\\"}},{\\\"id\\\":\\\"lib-vsco-bass-1\\\",\\\"asset\\\":\\\"bank-bass-1\\\",\\\"name\\\":\\\"\\\\u041a\\\\u043e\\\\u043d\\\\u0442\\\\u0440\\\\u0430\\\\u0431\\\\u0430\\\\u0441\\\",\\\"short\\\":\\\"\\\\u041a\\\\u0431\\\",\\\"gm\\\":32,\\\"demo\\\":40,\\\"revision\\\":1,\\\"bytes\\\":1449224,\\\"sha256\\\":\\\"c04tJ6rlL2VWSpRaEaUbWk1IAmypj0KDdeTdu7HcnTY=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-bass-1\\\",\\\"bytes\\\":49671,\\\"sha256\\\":\\\"fD6Nw9pjb3j7T+aGDcm2JCEfUBOowqSH8ELmIvZkoWE=\\\"}},{\\\"id\\\":\\\"lib-musicbox-1\\\",\\\"asset\\\":\\\"bank-musicbox-1\\\",\\\"name\\\":\\\"\\\\u041c\\\\u0443\\\\u0437\\\\u044b\\\\u043a\\\\u0430\\\\u043b\\\\u044c\\\\u043d\\\\u0430\\\\u044f \\\\u0448\\\\u043a\\\\u0430\\\\u0442\\\\u0443\\\\u043b\\\\u043a\\\\u0430\\\",\\\"short\\\":\\\"\\\\u0428\\\\u043a\\\",\\\"gm\\\":10,\\\"demo\\\":84,\\\"revision\\\":1,\\\"bytes\\\":585417,\\\"sha256\\\":\\\"txioejeQCS+r8LqjYRWgUZ0/qcNjtmrHbwfXM/gTd08=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-musicbox-1\\\",\\\"bytes\\\":49675,\\\"sha256\\\":\\\"8dEm8hhvTPyy5QQJ76rWfL1hwRgtenMv3lFuNosHHIY=\\\"}},{\\\"id\\\":\\\"lib-mda-grand-1\\\",\\\"asset\\\":\\\"bank-mda-grand-1\\\",\\\"name\\\":\\\"Grand Piano \\\\u00b7 MDA\\\",\\\"short\\\":\\\"\\\\u0413\\\\u041f\\\",\\\"gm\\\":0,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":7684380,\\\"sha256\\\":\\\"/RndDOlwu2e7ulj/hDyvbBkm2/qRpZLcTQHRBrfgKNs=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-mda-grand-1\\\",\\\"bytes\\\":49676,\\\"sha256\\\":\\\"MakpsR6aeH5OptfsqEzWmCg+E+wtg2V7wzD67LLn0Zc=\\\"}},{\\\"id\\\":\\\"lib-gu-epiano-1\\\",\\\"asset\\\":\\\"bank-gu-epiano-1\\\",\\\"name\\\":\\\"\\\\u042d\\\\u043b\\\\u0435\\\\u043a\\\\u0442\\\\u0440\\\\u043e\\\\u043f\\\\u0438\\\\u0430\\\\u043d\\\\u0438\\\\u043d\\\\u043e\\\",\\\"short\\\":\\\"\\\\u042d\\\\u041f\\\",\\\"gm\\\":4,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":3290160,\\\"sha256\\\":\\\"qZruWLo/eXx7bAYzZGnePStvM2fSGDRcDlcsuDctW3Q=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-epiano-1\\\",\\\"bytes\\\":49676,\\\"sha256\\\":\\\"qAygsEYGaA1G3IXGE3xJTSqp03cobwGzd3Nz/UVeiNM=\\\"}},{\\\"id\\\":\\\"lib-gu-clavinet-1\\\",\\\"asset\\\":\\\"bank-gu-clavinet-1\\\",\\\"name\\\":\\\"\\\\u041a\\\\u043b\\\\u0430\\\\u0432\\\\u0438\\\\u043d\\\\u0435\\\\u0442\\\",\\\"short\\\":\\\"\\\\u041a\\\\u0432\\\",\\\"gm\\\":7,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":3290120,\\\"sha256\\\":\\\"NEjC2Uhyk8VEPwiG4qt3jfgrE4EcKe1PhYIUcFxE0xQ=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-clavinet-1\\\",\\\"bytes\\\":49678,\\\"sha256\\\":\\\"gM3H5PBa/2vesyuukXW32zHyetlPSMIWl9bk3rTlT1g=\\\"}},{\\\"id\\\":\\\"lib-gu-celesta-1\\\",\\\"asset\\\":\\\"bank-gu-celesta-1\\\",\\\"name\\\":\\\"\\\\u0427\\\\u0435\\\\u043b\\\\u0435\\\\u0441\\\\u0442\\\\u0430\\\",\\\"short\\\":\\\"\\\\u0427\\\\u043b\\\",\\\"gm\\\":8,\\\"demo\\\":72,\\\"revision\\\":1,\\\"bytes\\\":3290112,\\\"sha256\\\":\\\"9bxyIQtCcOD0ucFiLPp0W1870+ibj0MzYw1gAex8B+w=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-celesta-1\\\",\\\"bytes\\\":49677,\\\"sha256\\\":\\\"UrMfg3rAwrP5MOOAhFazjYWSXzjwfP7HzxDMsySTWiU=\\\"}},{\\\"id\\\":\\\"lib-gu-glockenspiel-1\\\",\\\"asset\\\":\\\"bank-gu-glockenspiel-1\\\",\\\"name\\\":\\\"\\\\u0413\\\\u043b\\\\u043e\\\\u043a\\\\u0435\\\\u043d\\\\u0448\\\\u043f\\\\u0438\\\\u043b\\\\u044c\\\",\\\"short\\\":\\\"\\\\u0413\\\\u043b\\\",\\\"gm\\\":9,\\\"demo\\\":72,\\\"revision\\\":1,\\\"bytes\\\":3290145,\\\"sha256\\\":\\\"rHWYfMP+BNNCAGf/Z8L18ohLB1DTHGrheprdWpxevJs=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-glockenspiel-1\\\",\\\"bytes\\\":49682,\\\"sha256\\\":\\\"3rY09f2WHwPZednpofbi16F61NmUH4CxvlY80YGAghk=\\\"}},{\\\"id\\\":\\\"lib-gu-marimba-1\\\",\\\"asset\\\":\\\"bank-gu-marimba-1\\\",\\\"name\\\":\\\"\\\\u041c\\\\u0430\\\\u0440\\\\u0438\\\\u043c\\\\u0431\\\\u0430\\\",\\\"short\\\":\\\"\\\\u041c\\\\u0440\\\",\\\"gm\\\":12,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":3290113,\\\"sha256\\\":\\\"/42GyYAuuccg3uW3M+Rx9lefDoYt+ARqIIYb0GtzVDg=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-marimba-1\\\",\\\"bytes\\\":49677,\\\"sha256\\\":\\\"DII+rRrzD3SgCGrLTIIrFMNp/1K6V80PXwvdw7KqBG8=\\\"}},{\\\"id\\\":\\\"lib-gu-xylophone-1\\\",\\\"asset\\\":\\\"bank-gu-xylophone-1\\\",\\\"name\\\":\\\"\\\\u041a\\\\u0441\\\\u0438\\\\u043b\\\\u043e\\\\u0444\\\\u043e\\\\u043d\\\",\\\"short\\\":\\\"\\\\u041a\\\\u0441\\\",\\\"gm\\\":13,\\\"demo\\\":72,\\\"revision\\\":1,\\\"bytes\\\":3290122,\\\"sha256\\\":\\\"akhfKYh928w4QUMgrlOUwkv5BliLbQ9yjYZgjxb9pk4=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-xylophone-1\\\",\\\"bytes\\\":49679,\\\"sha256\\\":\\\"JqTzCIgPwBxTwWcoetPRbronZKEYdbv5ZIVf83JmJqE=\\\"}},{\\\"id\\\":\\\"lib-gu-organ-1\\\",\\\"asset\\\":\\\"bank-gu-organ-1\\\",\\\"name\\\":\\\"\\\\u042d\\\\u043b\\\\u0435\\\\u043a\\\\u0442\\\\u0440\\\\u043e\\\\u043e\\\\u0440\\\\u0433\\\\u0430\\\\u043d\\\",\\\"short\\\":\\\"\\\\u041e\\\\u0440\\\",\\\"gm\\\":16,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":1199561,\\\"sha256\\\":\\\"CD3tq4C+0v1NlzeyUdVZ7/lxq6hYpc17fnn/o38h4lU=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-organ-1\\\",\\\"bytes\\\":49675,\\\"sha256\\\":\\\"Vximn8OPzzx3ZLy9dYTaSJA9xf9RutEAz13x997ILNs=\\\"}},{\\\"id\\\":\\\"lib-gu-percussive-organ-1\\\",\\\"asset\\\":\\\"bank-gu-percussive-organ-1\\\",\\\"name\\\":\\\"\\\\u0423\\\\u0434\\\\u0430\\\\u0440\\\\u043d\\\\u044b\\\\u0439 \\\\u043e\\\\u0440\\\\u0433\\\\u0430\\\\u043d\\\",\\\"short\\\":\\\"\\\\u0423\\\\u043e\\\",\\\"gm\\\":17,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":1199573,\\\"sha256\\\":\\\"DrhtizAtIpN33iAg22BcWJQ3rkFKVe3LA0cZRC6Tmg8=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-percussive-organ-1\\\",\\\"bytes\\\":49686,\\\"sha256\\\":\\\"gDFoFdu60+uk1miK9ZtPzPYVmnaXSgu2SaQDFnN2Sj0=\\\"}},{\\\"id\\\":\\\"lib-gu-church-organ-1\\\",\\\"asset\\\":\\\"bank-gu-church-organ-1\\\",\\\"name\\\":\\\"\\\\u0426\\\\u0435\\\\u0440\\\\u043a\\\\u043e\\\\u0432\\\\u043d\\\\u044b\\\\u0439 \\\\u043e\\\\u0440\\\\u0433\\\\u0430\\\\u043d\\\",\\\"short\\\":\\\"\\\\u0426\\\\u043e\\\",\\\"gm\\\":19,\\\"demo\\\":48,\\\"revision\\\":1,\\\"bytes\\\":1199583,\\\"sha256\\\":\\\"m2D14aFeCdElS9dTI2Jym/r7h0nFklUZE/cZSfOGHM4=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-church-organ-1\\\",\\\"bytes\\\":49682,\\\"sha256\\\":\\\"rXyW2NJvXYaBQ5q85fR+ZOvoD9s5eJ/RwxR6WxYEFW0=\\\"}},{\\\"id\\\":\\\"lib-gu-accordion-1\\\",\\\"asset\\\":\\\"bank-gu-accordion-1\\\",\\\"name\\\":\\\"\\\\u0410\\\\u043a\\\\u043a\\\\u043e\\\\u0440\\\\u0434\\\\u0435\\\\u043e\\\\u043d\\\",\\\"short\\\":\\\"\\\\u0410\\\\u043a\\\",\\\"gm\\\":21,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":1199544,\\\"sha256\\\":\\\"XqVVVjgXautixZPHYpoqZTDRDJIm9Wsn1P2yL/84K+I=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-accordion-1\\\",\\\"bytes\\\":49679,\\\"sha256\\\":\\\"xCRMx06eJlvxkGMtUd5KX0SNVm3QtSwR2JF5LDVeXHc=\\\"}},{\\\"id\\\":\\\"lib-gu-harmonica-1\\\",\\\"asset\\\":\\\"bank-gu-harmonica-1\\\",\\\"name\\\":\\\"\\\\u0413\\\\u0443\\\\u0431\\\\u043d\\\\u0430\\\\u044f \\\\u0433\\\\u0430\\\\u0440\\\\u043c\\\\u043e\\\\u043d\\\\u0438\\\\u043a\\\\u0430\\\",\\\"short\\\":\\\"\\\\u0413\\\\u0433\\\",\\\"gm\\\":22,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":1199587,\\\"sha256\\\":\\\"IXLoBKzniOGxHruLz581sTXjUTzDEm9N4Lz2y2EPilI=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-harmonica-1\\\",\\\"bytes\\\":49679,\\\"sha256\\\":\\\"hIPqskkezylj6yaOhCloaulRMx/ysbQV1zJILCrUVwU=\\\"}},{\\\"id\\\":\\\"lib-gu-nylon-guitar-1\\\",\\\"asset\\\":\\\"bank-gu-nylon-guitar-1\\\",\\\"name\\\":\\\"\\\\u0413\\\\u0438\\\\u0442\\\\u0430\\\\u0440\\\\u0430 \\\\u00b7 \\\\u043d\\\\u0435\\\\u0439\\\\u043b\\\\u043e\\\\u043d\\\",\\\"short\\\":\\\"\\\\u0413\\\\u043d\\\",\\\"gm\\\":24,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":3290162,\\\"sha256\\\":\\\"JMY8198vCq+Yxp25xGVwpz350VtXXI8dzOClSq5fXrE=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-nylon-guitar-1\\\",\\\"bytes\\\":49682,\\\"sha256\\\":\\\"kGoReHShg+QcQjwRV/ivezNJwEunHKNBHLcopHpmmvg=\\\"}},{\\\"id\\\":\\\"lib-gu-overdrive-1\\\",\\\"asset\\\":\\\"bank-gu-overdrive-1\\\",\\\"name\\\":\\\"\\\\u0413\\\\u0438\\\\u0442\\\\u0430\\\\u0440\\\\u0430 \\\\u00b7 \\\\u043e\\\\u0432\\\\u0435\\\\u0440\\\\u0434\\\\u0440\\\\u0430\\\\u0439\\\\u0432\\\",\\\"short\\\":\\\"\\\\u041e\\\\u0432\\\",\\\"gm\\\":29,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":1199595,\\\"sha256\\\":\\\"2bMFdsbg+aoLM9PEps4a/LLq6d6cYNc14wcHp8b/jtI=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-overdrive-1\\\",\\\"bytes\\\":49679,\\\"sha256\\\":\\\"fdKqDW8H3QSfD4CM87g4K+lhU9WkDpPsr6B1TISAi38=\\\"}},{\\\"id\\\":\\\"lib-gu-distortion-1\\\",\\\"asset\\\":\\\"bank-gu-distortion-1\\\",\\\"name\\\":\\\"\\\\u0413\\\\u0438\\\\u0442\\\\u0430\\\\u0440\\\\u0430 \\\\u00b7 \\\\u0434\\\\u0438\\\\u0441\\\\u0442\\\\u043e\\\\u0440\\\\u0448\\\\u043d\\\",\\\"short\\\":\\\"\\\\u0414\\\\u0441\\\",\\\"gm\\\":30,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":1199589,\\\"sha256\\\":\\\"4CsNf0tsoByqlqoSiNL0z/IMyzC9OQ7Zf9kVR2gxUhU=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-distortion-1\\\",\\\"bytes\\\":49680,\\\"sha256\\\":\\\"GzqLOcvWp6gRGZy2bV1q0khM4Y8Qamr52gBricv+xp0=\\\"}},{\\\"id\\\":\\\"lib-gu-fretless-bass-1\\\",\\\"asset\\\":\\\"bank-gu-fretless-bass-1\\\",\\\"name\\\":\\\"\\\\u0411\\\\u0435\\\\u0437\\\\u043b\\\\u0430\\\\u0434\\\\u043e\\\\u0432\\\\u044b\\\\u0439 \\\\u0431\\\\u0430\\\\u0441\\\",\\\"short\\\":\\\"\\\\u0411\\\\u0431\\\",\\\"gm\\\":35,\\\"demo\\\":48,\\\"revision\\\":1,\\\"bytes\\\":1199577,\\\"sha256\\\":\\\"Dv3SQfyh6uXMD20CHwlr74jgaRjZLl15NMwKpkIaJlo=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-fretless-bass-1\\\",\\\"bytes\\\":49683,\\\"sha256\\\":\\\"a7g7luhD5Lk+2zwr83wmSZLOFS4IO0VRV0ep6Zohd1U=\\\"}},{\\\"id\\\":\\\"lib-gu-synth-bass-1\\\",\\\"asset\\\":\\\"bank-gu-synth-bass-1\\\",\\\"name\\\":\\\"\\\\u0421\\\\u0438\\\\u043d\\\\u0442\\\\u0435\\\\u0437\\\\u0430\\\\u0442\\\\u043e\\\\u0440\\\\u043d\\\\u044b\\\\u0439 \\\\u0431\\\\u0430\\\\u0441\\\",\\\"short\\\":\\\"\\\\u0421\\\\u0431\\\",\\\"gm\\\":38,\\\"demo\\\":48,\\\"revision\\\":1,\\\"bytes\\\":1199595,\\\"sha256\\\":\\\"ZTttFwMfhsv9CGJU7pzj6KHGcH0GDe8oWefqL1/zeyo=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-synth-bass-1\\\",\\\"bytes\\\":49680,\\\"sha256\\\":\\\"o+QtwGlvEDXMi1lkZKAmz7YPMzsZTz/13jlyZR6JmIk=\\\"}},{\\\"id\\\":\\\"lib-gu-cello-1\\\",\\\"asset\\\":\\\"bank-gu-cello-1\\\",\\\"name\\\":\\\"\\\\u0412\\\\u0438\\\\u043e\\\\u043b\\\\u043e\\\\u043d\\\\u0447\\\\u0435\\\\u043b\\\\u044c\\\",\\\"short\\\":\\\"\\\\u0412\\\\u0447\\\",\\\"gm\\\":42,\\\"demo\\\":48,\\\"revision\\\":1,\\\"bytes\\\":1199547,\\\"sha256\\\":\\\"qFC/HDWvpmkfdxWjxq4C81mlhwq911MQb3CC7kG2774=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-cello-1\\\",\\\"bytes\\\":49675,\\\"sha256\\\":\\\"BwHEiavt0alYEW6oF1XVEM0M+imjkm92E5iMfiJcka8=\\\"}},{\\\"id\\\":\\\"lib-gu-pizzicato-1\\\",\\\"asset\\\":\\\"bank-gu-pizzicato-1\\\",\\\"name\\\":\\\"\\\\u0421\\\\u0442\\\\u0440\\\\u0443\\\\u043d\\\\u043d\\\\u044b\\\\u0435 \\\\u00b7 \\\\u043f\\\\u0438\\\\u0446\\\\u0446\\\\u0438\\\\u043a\\\\u0430\\\\u0442\\\\u043e\\\",\\\"short\\\":\\\"\\\\u041f\\\\u0446\\\",\\\"gm\\\":45,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":3290194,\\\"sha256\\\":\\\"qjuIpw2nxYXiYpxtttOIBS9I9elF7D9RG01BFNWj9oM=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-pizzicato-1\\\",\\\"bytes\\\":49679,\\\"sha256\\\":\\\"nEnjS+sV8aKmcf0HH7ffBQKoXKgrGO/bcA24O0VPPDA=\\\"}},{\\\"id\\\":\\\"lib-gu-harp-1\\\",\\\"asset\\\":\\\"bank-gu-harp-1\\\",\\\"name\\\":\\\"\\\\u0410\\\\u0440\\\\u0444\\\\u0430\\\",\\\"short\\\":\\\"\\\\u0410\\\\u0440\\\",\\\"gm\\\":46,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":3290089,\\\"sha256\\\":\\\"9LRPECvQrwIp/skKt8ukRGeGSnDE79MQVD5vsgpq9oI=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-harp-1\\\",\\\"bytes\\\":49674,\\\"sha256\\\":\\\"vIsgTVPP6wo7106tLxa/4EBPn/KPgQyplQIZEf2nyaU=\\\"}},{\\\"id\\\":\\\"lib-gu-strings-1\\\",\\\"asset\\\":\\\"bank-gu-strings-1\\\",\\\"name\\\":\\\"\\\\u0421\\\\u0442\\\\u0440\\\\u0443\\\\u043d\\\\u043d\\\\u044b\\\\u0439 \\\\u0430\\\\u043d\\\\u0441\\\\u0430\\\\u043c\\\\u0431\\\\u043b\\\\u044c\\\",\\\"short\\\":\\\"\\\\u0421\\\\u0430\\\",\\\"gm\\\":48,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":1199592,\\\"sha256\\\":\\\"o72GgSCVNm/6n6GMYDkuF0pu5byWtORdXGrLIcCwJps=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-strings-1\\\",\\\"bytes\\\":49677,\\\"sha256\\\":\\\"GqvgXmfQ2hVMcCGl8dhatYOU0VJbOg1YfwtBkDnqXkI=\\\"}},{\\\"id\\\":\\\"lib-gu-choir-1\\\",\\\"asset\\\":\\\"bank-gu-choir-1\\\",\\\"name\\\":\\\"\\\\u0425\\\\u043e\\\\u0440 \\\\u00b7 \\\\u0410-\\\\u0430\\\",\\\"short\\\":\\\"\\\\u0425\\\\u0440\\\",\\\"gm\\\":52,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":1199522,\\\"sha256\\\":\\\"CjoS7AlRofmUSh8xSP2urmQCPF7if6KMv/2jy8cXKwQ=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-choir-1\\\",\\\"bytes\\\":49675,\\\"sha256\\\":\\\"0v1L4FwodtsV81MghyL4olZY3qo29VzAgmF1ffxwY7M=\\\"}},{\\\"id\\\":\\\"lib-gu-trombone-1\\\",\\\"asset\\\":\\\"bank-gu-trombone-1\\\",\\\"name\\\":\\\"\\\\u0422\\\\u0440\\\\u043e\\\\u043c\\\\u0431\\\\u043e\\\\u043d\\\",\\\"short\\\":\\\"\\\\u0422\\\\u0431\\\",\\\"gm\\\":57,\\\"demo\\\":48,\\\"revision\\\":1,\\\"bytes\\\":1199529,\\\"sha256\\\":\\\"axjUibZz8lOg/n2gpqz6gKvOl4gQ9LoCWJF9fWBeV/8=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-trombone-1\\\",\\\"bytes\\\":49678,\\\"sha256\\\":\\\"2EdpgV8tpY8wrckFRF6ORUtN0Onva4mq+Lnqb+GppcU=\\\"}},{\\\"id\\\":\\\"lib-gu-horn-1\\\",\\\"asset\\\":\\\"bank-gu-horn-1\\\",\\\"name\\\":\\\"\\\\u0412\\\\u0430\\\\u043b\\\\u0442\\\\u043e\\\\u0440\\\\u043d\\\\u0430\\\",\\\"short\\\":\\\"\\\\u0412\\\\u043b\\\",\\\"gm\\\":60,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":1199532,\\\"sha256\\\":\\\"X4bNQDJAs138I1T8qkiQHGfLuTBTmH/TJYZFQhgfLmU=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-horn-1\\\",\\\"bytes\\\":49674,\\\"sha256\\\":\\\"KclxumrM0JEco5xXSblhjnOTaoV5vG8wG2nrUDQdZvY=\\\"}},{\\\"id\\\":\\\"lib-gu-alto-sax-1\\\",\\\"asset\\\":\\\"bank-gu-alto-sax-1\\\",\\\"name\\\":\\\"\\\\u0410\\\\u043b\\\\u044c\\\\u0442-\\\\u0441\\\\u0430\\\\u043a\\\\u0441\\\\u043e\\\\u0444\\\\u043e\\\\u043d\\\",\\\"short\\\":\\\"\\\\u0421\\\\u043a\\\",\\\"gm\\\":65,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":1199565,\\\"sha256\\\":\\\"L6dLfe8A8Yd9JtzT3t3hIxFV1iKt6XLvGp9eqPL8xbg=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-alto-sax-1\\\",\\\"bytes\\\":49678,\\\"sha256\\\":\\\"bggaMixzBjq1a/StkGAo37jY28zQI4cv6sMl+ByyHk4=\\\"}},{\\\"id\\\":\\\"lib-gu-oboe-1\\\",\\\"asset\\\":\\\"bank-gu-oboe-1\\\",\\\"name\\\":\\\"\\\\u0413\\\\u043e\\\\u0431\\\\u043e\\\\u0439\\\",\\\"short\\\":\\\"\\\\u0413\\\\u0431\\\",\\\"gm\\\":68,\\\"demo\\\":72,\\\"revision\\\":1,\\\"bytes\\\":1199511,\\\"sha256\\\":\\\"3g8dG+jfZYiAiaw9Lo/iujW8CMkQMfbOTgiXNcfjksM=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-oboe-1\\\",\\\"bytes\\\":49674,\\\"sha256\\\":\\\"+Ha4FLdDm6OZS5C6jZ2S5LtBkSLisGDzc/FwhhWHpVc=\\\"}},{\\\"id\\\":\\\"lib-gu-clarinet-1\\\",\\\"asset\\\":\\\"bank-gu-clarinet-1\\\",\\\"name\\\":\\\"\\\\u041a\\\\u043b\\\\u0430\\\\u0440\\\\u043d\\\\u0435\\\\u0442\\\",\\\"short\\\":\\\"\\\\u041a\\\\u0440\\\",\\\"gm\\\":71,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":1199529,\\\"sha256\\\":\\\"NhNbQh2xvw4LYkRKplwKB9J2pMDyvCrw0mX68r4IAs8=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-clarinet-1\\\",\\\"bytes\\\":49678,\\\"sha256\\\":\\\"woH6mqUC1tn1jcs5FIcdVmV2yh7VU5FiwccSQzRWDx4=\\\"}},{\\\"id\\\":\\\"lib-gu-pan-flute-1\\\",\\\"asset\\\":\\\"bank-gu-pan-flute-1\\\",\\\"name\\\":\\\"\\\\u041f\\\\u0430\\\\u043d-\\\\u0444\\\\u043b\\\\u0435\\\\u0439\\\\u0442\\\\u0430\\\",\\\"short\\\":\\\"\\\\u041f\\\\u0444\\\",\\\"gm\\\":75,\\\"demo\\\":72,\\\"revision\\\":1,\\\"bytes\\\":1199545,\\\"sha256\\\":\\\"OFKpN2uebMhtJrWm9/UCDBrby76NaOB2t8C+PxpcXfw=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-pan-flute-1\\\",\\\"bytes\\\":49679,\\\"sha256\\\":\\\"a9eAehdqgiFBrj7bqQ9v1WQmCCIFnyX1l+Stve1dtHQ=\\\"}},{\\\"id\\\":\\\"lib-gu-square-lead-1\\\",\\\"asset\\\":\\\"bank-gu-square-lead-1\\\",\\\"name\\\":\\\"\\\\u041b\\\\u0438\\\\u0434 \\\\u00b7 \\\\u043f\\\\u0440\\\\u044f\\\\u043c\\\\u043e\\\\u0443\\\\u0433\\\\u043e\\\\u043b\\\\u044c\\\\u043d\\\\u0438\\\\u043a\\\",\\\"short\\\":\\\"\\\\u041b\\\\u043f\\\",\\\"gm\\\":80,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":1199604,\\\"sha256\\\":\\\"PwaLUJQQssL8a866ge2Gpuk09nlAPNexSi35V+4Jx4o=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-square-lead-1\\\",\\\"bytes\\\":49681,\\\"sha256\\\":\\\"x8vtVo4CnBssL8k9AUfIN51PBG9HZf5jcFjh4GGYbEk=\\\"}},{\\\"id\\\":\\\"lib-gu-saw-lead-1\\\",\\\"asset\\\":\\\"bank-gu-saw-lead-1\\\",\\\"name\\\":\\\"\\\\u041b\\\\u0438\\\\u0434 \\\\u00b7 \\\\u043f\\\\u0438\\\\u043b\\\\u0430\\\",\\\"short\\\":\\\"\\\\u041b\\\\u0441\\\",\\\"gm\\\":81,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":1199538,\\\"sha256\\\":\\\"l4zKUkDfEqmDQHse/sqvFKdBuDpVEWDS2LcM0mQfM8o=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-saw-lead-1\\\",\\\"bytes\\\":49678,\\\"sha256\\\":\\\"3Yy42fMaGr1q8jd9CXCNsrBJGXF69rYnpL2ejtsvH5A=\\\"}},{\\\"id\\\":\\\"lib-gu-fantasia-1\\\",\\\"asset\\\":\\\"bank-gu-fantasia-1\\\",\\\"name\\\":\\\"\\\\u041f\\\\u044d\\\\u0434 \\\\u00b7 \\\\u0444\\\\u0430\\\\u043d\\\\u0442\\\\u0430\\\\u0437\\\\u0438\\\\u044f\\\",\\\"short\\\":\\\"\\\\u041f\\\\u0434\\\",\\\"gm\\\":88,\\\"demo\\\":60,\\\"revision\\\":1,\\\"bytes\\\":1199566,\\\"sha256\\\":\\\"NPd06z+07brAh1FIDvDLzlxKgI0OQJfWJSGFEee8zvg=\\\",\\\"preview\\\":{\\\"asset\\\":\\\"preview-gu-fantasia-1\\\",\\\"bytes\\\":49678,\\\"sha256\\\":\\\"qIcLN/sYMbFWaAAwIfmBRiQN/1IGjJjybd+uy1GQUls=\\\"}}]}\",\"signature\":\"Mit8xdQkw/XCjA/ENZ6bpHBmWeQ7JVCt9qlRCgd6RT5BTgmtNkrPQcoPlnl4FS4ceyPv1Fi1c35PjhnvVFBpUt5Kr1uC5MT6N2mD1obE5Pbxk2u3wLJe0TM3v+t0YhoKJFJJr53PZmGcoEul7C2w5cc37iLQRuK62kA7VsSSOvAZd4W4q0462VTkG3fJ47L1KMsDYwWF5mmiZZxAYdd37g1A4zdBNEUkYTVuzIeyFguRwCRwGaq0Qe9NzqqSeAnFyVC7iA1twyx1lwK47vDKK/TNdggjpLGhTzgollgn4zhM+wTYQqkN/2Ox58TRmdgAoT0vJOko931uhwWXmkg4P71WvHYMT8pvhocxSC+zdzoRe//VoGgfshIRCWpbLHf7EjuWa6UO4E6F2pF8WzZMoxA4GOUpUhbkC+qWTrJRUBWHKMbiwu/C/2JsBhk4y1ntv3vHTUAfhJhKiloCWb8hRdKhCko6o3AppiqNPlkJ/VojtACmMX5OAc1yak/guHdq\"}";
function restoreSoundCatalog(){
 if(!catalogHost)return;
 try{mergeSoundCatalog(parseSoundCatalog(shippedSoundCatalog))}catch{}
 for(const kind of ['pending-catalog','pending-bank','pending-preview']){
  try{const id=catalogHost.soundRead(kind);if(/^\d+$/.test(id||''))catalogHost.soundDiscard(id);catalogHost.soundDelete(kind)}catch{}
 }
 try{const raw=catalogHost.soundRead(catalogKey);if(raw)mergeSoundCatalog(parseSoundCatalog(raw))}catch{}
}
function soundMessage(message){byId('instrumentStatus').textContent=message}
async function fetchSound(asset,job,timeout,kind='bank'){
 const id=catalogHost.soundDownload(asset);
 if(!id||!/^\d+$/.test(id))throw Error('Не удалось начать загрузку.');
 job.id=id;const pending=asset===catalogKey?'pending-catalog':kind==='preview'?'pending-preview':'pending-bank';
 if(!catalogHost.soundWrite(pending,id)){catalogHost.soundDiscard(id);throw Error('Недостаточно места для загрузки.')}
 const until=Date.now()+timeout;
 try{
  while(true){
   if(job.cancelled)throw Error('Загрузка отменена.');
   const status=catalogHost.soundStatus(id);
   if(status===8)return {raw:catalogHost.soundText(id),hash:asset===catalogKey?null:catalogHost.soundHash(id)};
   if(status===16)throw Error('Загрузка не удалась. Проверь интернет и свободное место.');
   if(Date.now()>until)throw Error('Загрузка заняла слишком много времени. Попробуй ещё раз.');
   await new Promise(resolve=>setTimeout(resolve,450));
  }
 }finally{catalogHost.soundDiscard(id);if(catalogHost.soundRead(pending)===id)catalogHost.soundDelete(pending)}
}
async function checkSoundCatalog(){
 if(!catalogHost||catalogStarted)return;
 catalogStarted=true;catalogJob={};
 try{
  const result=await fetchSound(catalogKey,catalogJob,20000),entries=parseSoundCatalog(result.raw);
  if(!catalogHost.soundWrite(catalogKey,result.raw))throw Error('Не удалось сохранить каталог. Проверь свободное место.');
  mergeSoundCatalog(entries);
 }catch(e){if(!bankJob)soundMessage('Каталог недоступен. Загруженные инструменты работают без интернета.')}
 finally{catalogJob=null;if(!byId('instrumentSheet').hidden)renderInstruments()}
}
function checkBank(data,def){
 if(data?.format!=='notka.instrument.1'||data.id!==def.asset||data.revision!==(def.revision||1)||!Array.isArray(data.samples)||!data.samples.length||data.samples.length>128)throw Error('Файл не соответствует выбранному инструменту.');
 if(![data.sampleRate,data.gain,data.attack,data.release].every(Number.isFinite)||data.sampleRate<8000||data.sampleRate>96000||data.gain<=0||data.gain>1||data.attack<0||data.attack>1||data.release<.01||data.release>3)throw Error('Повреждены параметры инструмента.');
 if(data.roundRobins!==undefined&&(!Number.isInteger(data.roundRobins)||data.roundRobins<1||data.roundRobins>8))throw Error('Повреждены варианты удара.');
 for(const s of data.samples){
  if(s.rr!==undefined&&(!Number.isInteger(s.rr)||s.rr<0||s.rr>=(data.roundRobins||1)))throw Error('Повреждён вариант удара.');
  if(!Number.isInteger(s.root)||s.root<0||s.root>127||!Number.isFinite(s.tune)||Math.abs(s.tune)>1200||typeof s.data!=='string'||s.data.length>2097152||s.data.length<60)throw Error('Повреждён набор звуков.');
  if(s.loop&&(!Array.isArray(s.loop)||s.loop.length!==2||!s.loop.every(Number.isInteger)||s.loop[0]<0||s.loop[0]>=s.loop[1]))throw Error('Повреждена петля инструмента.');
 }
}
function readInstrumentData(def){
 if(!def.remote){
  const raw=pendingBuiltinData.get(def.id)||sampleHost.instrumentData(def.asset);pendingBuiltinData.delete(def.id);
  if(raw){builtinPresence.set(def.id,true);return JSON.parse(raw)}
  builtinPresence.set(def.id,false);
  if(remoteAlternatives.has(def.id))return readInstrumentData(remoteAlternatives.get(def.id));
  renderMissingSounds();
  if(instrumentSources.has(def.id))throw Error('Шкатулка FrozenPlain отсутствует. Скачай пакет у автора и импортируй его в библиотеке инструментов.');
  throw Error('Встроенный инструмент недоступен. Обнови APK.');
 }
 if(!catalogHost)throw Error(catalogError);
 if(!downloadedInstruments.has(def.id))throw Error('Сначала скачай «'+def.name+'» в списке инструментов.');
 try{const data=verifySound(catalogHost.soundRead(def.asset));checkBank(data,def);return data}
 catch(e){downloadedInstruments.delete(def.id);renderInstruments();throw Error('Не удалось прочитать «'+def.name+'». Скачай инструмент ещё раз.')}
}
async function downloadInstrument(id){
 const def=downloadableInstrument(id);if(!catalogHost||!def?.remote||bankJob)return;
 const job={def,cancelled:false};bankJob=job;renderInstruments();soundMessage('Скачиваем «'+def.name+'»…');
 try{
  const result=await fetchSound(def.asset,job,180000);
  if(job.cancelled)throw Error('Загрузка отменена.');
  if(typeof result.raw!=='string'||result.raw.length!==def.bytes||result.hash!==def.sha256)throw Error('Загруженный файл повреждён. Попробуй ещё раз.');
  checkBank(verifySound(result.raw),def);
  if(!catalogHost.soundWrite(def.asset,result.raw))throw Error('Не удалось сохранить инструмент. Проверь свободное место.');
  downloadedInstruments.add(id);soundMessage('Инструмент «'+def.name+'» загружен.');
 }catch(e){soundMessage(job.cancelled?'Загрузка отменена.':e.message||'Не удалось скачать инструмент.')}
 finally{bankJob=null;renderInstruments()}
}
function cancelInstrumentDownload(){if(bankJob){bankJob.cancelled=true;if(bankJob.id)catalogHost.soundDiscard(bankJob.id)}}
function askInstrumentDelete(id){
 const def=downloadableInstrument(id);
 if(!def)return;
 if(!def.remote&&!(id===floeId&&importedMusicbox())){soundMessage('Этот инструмент входит в APK.');return}
 if(sourceUsed(id)){soundMessage('Инструмент используется в треке.');return}
 if(instrumentLoads.has(id)||importJob)return;
 pendingInstrumentDelete=id;byId('instrumentDeleteText').textContent='Удалить «'+def.name+'» с телефона?';byId('instrumentDeleteConfirm').hidden=false;
}
function cancelInstrumentDelete(){pendingInstrumentDelete=null;byId('instrumentDeleteConfirm').hidden=true}
function deleteInstrument(){
 stopLibraryAudition();
 const id=pendingInstrumentDelete,def=downloadableInstrument(id);
 if((!def?.remote&&!(id===floeId&&importedMusicbox()))||!catalogHost||sourceUsed(id)||instrumentLoads.has(id)||importJob){cancelInstrumentDelete();return}
 if(id===floeId&&importedMusicbox()?importHost.deleteImportedInstrument():catalogHost.soundDelete(def.asset)){downloadedInstruments.delete(id);instrumentCache.delete(id);builtinPresence.delete(id);pendingBuiltinData.delete(id);renderMissingSounds();soundMessage('Инструмент удалён. Его можно скачать снова.')}
 else soundMessage('Не удалось удалить инструмент.');
 cancelInstrumentDelete();renderInstruments();
}
const instrumentGroups=[['keys','Клавишные'],['bells','Колокольчики и шкатулки'],['organs','Органы'],['guitars','Гитары'],['bass','Басы'],['strings','Струнные'],['brass','Медные духовые'],['winds','Деревянные духовые'],['synth','Синтезаторы'],['world','Народные'],['percussion','Ударные'],['other','Прочее']];
function instrumentGroup(def){
 const gm=def.gm;
 return gm<8?'keys':gm<16?'bells':gm<24?'organs':gm<32?'guitars':gm<40?'bass':gm<56?'strings':gm<64?'brass':gm<80?'winds':gm<104?'synth':gm<112?'world':gm<120?'percussion':'other';
}
const normalizeInstrumentSearch=s=>String(s||'').toLowerCase().replace(/ё/g,'е').trim();
const instrumentSearchAliases={0:'piano пианино рояль',10:'music box musicbox шкатулка',32:'bass контрабас',40:'violin скрипка',56:'trumpet труба',73:'flute флейта'};
let instrumentQuery='',instrumentCategory='all';
function matchingInstruments(){
 const words=normalizeInstrumentSearch(instrumentQuery).split(/\s+/).filter(Boolean);
 return instruments.filter(def=>{
  if(!visibleInstrumentIds.has(def.id))return false;
  const group=instrumentGroup(def);
  if(instrumentCategory==='installed'&&!availableInstrument(def)&&!downloadedInstruments.has(def.id))return false;
  if(!['all','installed',group].includes(instrumentCategory))return false;
  const text=normalizeInstrumentSearch(def.name+' '+(instrumentSearchAliases[def.gm]||'')+(def.id==='lib-mda-grand-1'?' гранд':''));
  return words.every(word=>text.includes(word));
 });
}
byId('instrumentSearch').oninput=e=>{instrumentQuery=e.target.value;renderInstruments()};
byId('instrumentCategory').onchange=e=>{instrumentCategory=e.target.value;renderInstruments()};
function renderInstruments(){
 const sourceBox=byId('instrumentSource');sourceBox.replaceChildren();
 const missingBox=instrumentById('lib-floe-musicbox-1');sourceBox.hidden=availableInstrument(missingBox);
 if(!sourceBox.hidden&&!importHost){const hint=document.createElement('p');hint.textContent='Для импорта установи APK 0.51.';sourceBox.append(hint)}
 cancelInstrumentHold();auditionButtons.clear();const list=byId('instrumentChoices');list.replaceChildren();
 const categories=byId('instrumentCategory');categories.replaceChildren();
 for(const [value,label] of [['all','Все инструменты'],['installed','Загруженные'],...instrumentGroups.filter(([id])=>instruments.some(def=>visibleInstrumentIds.has(def.id)&&instrumentGroup(def)===id))]){
  const option=document.createElement('option');option.value=value;option.textContent=label;categories.append(option);
 }
 categories.value=instrumentCategory;
 const matches=matchingInstruments();byId('instrumentEmpty').hidden=matches.length>0;
 let previousGroup='';
 for(const def of matches.sort((a,b)=>instrumentGroups.findIndex(g=>g[0]===instrumentGroup(a))-instrumentGroups.findIndex(g=>g[0]===instrumentGroup(b)))){
  const group=instrumentGroup(def);
  if(group!==previousGroup){const heading=document.createElement('h3');heading.className='instrument-group';heading.textContent=instrumentGroups.find(g=>g[0]===group)[1];list.append(heading);previousGroup=group}
  const row=document.createElement('div'),button=document.createElement('button'),meta=document.createElement('small');row.className='instrument-row';
  const builtin=!def.remote&&builtinAvailable(def),installed=builtin||downloadedInstruments.has(def.id);
  button.className='button instrument-pick';button.textContent=def.name;
  button.setAttribute('aria-pressed',String((lanes[activeLane].instrument||'vsco-piano-1')===def.id));
  button.disabled=!installed||running||isBackground(lanes[activeLane]);button.setAttribute('aria-label','Добавить в проект · '+def.name);
  button.onclick=()=>selectInstrument(def.id);if(installed)bindInstrumentHold(button,def);row.append(button);row.setAttribute('data-installed',String(installed));
  meta.textContent='('+((def.id===floeId&&importedMusicbox()?Number(importHost.importedBytes?.())||def.bytes:def.bytes||0)/1048576).toFixed(1).replace('.',',')+' МБ)';row.append(meta);
  const listen=document.createElement('button');listen.type='button';listen.className='button instrument-audition';listen.innerHTML=earIcon;
  listen.disabled=running||(!installed&&!(remoteAlternatives.get(def.id)||def).preview);
  listen.onclick=()=>auditionInstrument(def.id);auditionButtons.set(def.id,listen);row.append(listen);
  if(!installed){
   const action=document.createElement('button');action.type='button';action.className='button instrument-action';
   const loading=bankJob?.def.id===def.id;
   action.textContent=loading?'Отмена':'Скачать';
   action.setAttribute('aria-label',(loading?'Отменить загрузку':'Скачать')+' · '+def.name);
   action.disabled=loading?bankJob.cancelled:!!bankJob;
   action.onclick=()=>loading?cancelInstrumentDownload():downloadInstrument(def.id);
   if(instrumentSources.has(def.id)){const link=authorLink(def.id);link.className+=' instrument-action';row.append(link);meta.textContent='';}else row.append(action);
  }
  list.append(row);
 }
 syncLibraryAudition();

}
async function selectInstrument(id){
 const def=instrumentById(id),lane=lanes[activeLane];
 if(!def||running||isBackground(lane)||byId('instrumentSheet').hidden)return;
 stopLibraryAudition();const token=++instrumentRequest;cancelInstrumentDelete();
 soundMessage(def.asset&&!instrumentCache.has(id)?'Загрузка звуков…':'');
 try{
  await unlock();await prepareInstrument(id);
  if(token!==instrumentRequest||lane!==lanes[activeLane]||isBackground(lane)||running||byId('instrumentSheet').hidden||document.hidden)return;
  previewSerial++;for(const sources of voices)silenceVoice(sources);
  const item=addProjectInstrument(id);lane.instrument=id;lane.instrumentId=item.id;renderLanes();renderInstruments();showInstrumentView('library');trackChanged();paintSoon();
  soundMessage('');instrumentNote(id,def.demo||60,audio.currentTime+.006,.8,80);
 }catch(e){if(token===instrumentRequest)soundMessage(e.message||'Не удалось загрузить звук.')}
}
function closeInstrument(){
 stopLibraryAudition();cancelInstrumentHold();
 flushDraft();instrumentRequest++;previewSerial++;cancelInstrumentDelete();byId('instrumentSheet').hidden=true;if(!byId('laneSheet').hidden)syncLaneSheet();byId('closeLane').focus?.();
 if(!running)for(const sources of voices)silenceVoice(sources);
}
function openLaneInstrument(){
 if(running||isBackground(lanes[activeLane]))return;
 finishGesture();clearSelection();paintSoon();renderInstruments();
 byId('instrumentSheet').hidden=false;reconcileRack();showInstrumentView('library');byId('closeInstrument').focus?.();
};
byId('closeInstrument').onclick=closeInstrument;
byId('cancelInstrumentDelete').onclick=cancelInstrumentDelete;
byId('confirmInstrumentDelete').onclick=deleteInstrument;

let editingInstrument=null,instrumentView='library';
function showInstrumentView(view){
 if(view!=='library'){stopLibraryAudition();cancelInstrumentHold()}
 instrumentView=view;byId('currentInstrument').hidden=view==='edit';byId('instrumentLibrary').hidden=view!=='library';byId('instrumentEditor').hidden=view!=='edit';
 byId('instrumentTitle').textContent=view==='edit'?'Настройка инструмента':'Инструменты';
 renderCurrentInstrument();
}
function assignProjectInstrument(id){
 const item=projectInstruments.find(i=>i.id===id);if(!item||running)return;
 const lane=lanes[activeLane];lane.instrument=item.source;lane.instrumentId=item.id;
 renderLanes();renderCurrentInstrument();paintSoon();trackChanged();
}
function renderCurrentInstrument(){
 const list=byId('currentInstrument');list.replaceChildren();
 const item=laneInstrument(lanes[activeLane]);
 const row=document.createElement('div');row.className='current-sound';
 const name=document.createElement('button');name.className='button';name.textContent=item.name;name.setAttribute('aria-label','Текущий инструмент · '+item.name);name.onclick=()=>openInstrumentSettings(item.id);
 const settings=document.createElement('button');settings.className='button';settings.textContent='⚙';settings.setAttribute('aria-label','Настроить '+item.name);settings.onclick=name.onclick;
 const copy=document.createElement('button');copy.className='button';copy.textContent='⧉';copy.setAttribute('aria-label','Копировать '+item.name);copy.onclick=()=>{try{const next=addProjectInstrument(item.source,item);assignProjectInstrument(next.id);openInstrumentSettings(next.id)}catch(e){soundMessage(e.message)}};
 row.append(name,settings,copy);list.append(row);
}
const soundFields=[
 ['volume','Громкость','%',1,'basic'],['pan','Панорама','Л ↔ П',1,'basic'],['transpose','Высота','полутонов',1,'basic'],['attack','Атака · Attack','с',.005,'basic'],['release','Затухание · Release','с',.01,'basic'],
 ['delay','Задержка · Delay','с',.01,'envelope'],['hold','Удержание · Hold','с',.01,'envelope'],['decay','Спад · Decay','с',.01,'envelope'],['sustain','Уровень · Sustain','%',1,'envelope'],['velocity','Отклик на громкость нот','×',.05,'envelope'],
 ['fine','Точная высота','центов',1,'tuning'],['cutoff','Частота среза','Гц',10,'filter'],['resonance','Резонанс','Q',.1,'filter'],['start','Начало сэмпла','%',.1,'sample'],['end','Конец сэмпла','%',.1,'sample']
];
for(const [key,label,unit,step,group] of soundFields){
 const row=document.createElement('div');row.className='sound-field';
 const title=document.createElement('label');title.textContent=label+' · '+unit;title.setAttribute('for','sound-'+key);
 const input=document.createElement('input'),slider=document.createElement('input');input.id='sound-'+key;input.type='number';slider.id='soundRange-'+key;slider.type='range';
 for(const el of [input,slider]){el.min=soundBounds[key][0];el.max=soundBounds[key][1];el.step=step;el.setAttribute('aria-label',label+' · '+unit)}
 if(key==='attack'||key==='release')input.placeholder='Авто';
 const update=(el,defer)=>{
  const item=projectInstruments.find(i=>i.id===editingInstrument);if(!item||running)return;
  const value=el.value===''&&(key==='attack'||key==='release')?null:Number(el.value);
  try{item.settings=soundSettings({...item.settings,[key]:value},true);soundMessage('');syncSoundEditor();trackChanged(defer)}catch(e){if(!defer){soundMessage(e.message);syncSoundEditor()}}
 };
 input.onchange=()=>update(input,false);slider.oninput=()=>update(slider,true);slider.onchange=()=>flushDraft();
 row.append(title,input,slider);byId('sound-'+group).append(row);
}
function syncSoundEditor(){
 const item=projectInstruments.find(i=>i.id===editingInstrument);if(!item)return;
 byId('soundName').value=item.name;byId('soundSource').textContent=instrumentById(item.source)?.name||item.source;
 for(const [key] of soundFields){const value=item.settings[key];byId('sound-'+key).value=value===null?'':String(value);byId('soundRange-'+key).value=String(value??instrumentCache.get(item.source)?.[key]??(key==='attack'?.005:.3))}
 for(const key of ['filter','loop'])byId(key==='filter'?'sound-filterType':'sound-'+key).value=item.settings[key];byId('sound-reverse').checked=item.settings.reverse;
 for(const key of ['cutoff','resonance'])for(const prefix of ['sound-','soundRange-'])byId(prefix+key).disabled=item.settings.filter==='off';
 const s=item.settings,a=s.attack??instrumentCache.get(item.source)?.attack??.005,r=s.release??instrumentCache.get(item.source)?.release??.3,total=s.delay+a+s.hold+s.decay+1+r,px=t=>8+t/total*284,sy=64-s.sustain*.5;
 byId('soundEnvelope').innerHTML='<svg viewBox="0 0 300 72" role="img" aria-label="Огибающая громкости"><path d="M8 64 H292" stroke="currentColor" opacity=".2"/><path d="M8 64 L'+px(s.delay)+' 64 L'+px(s.delay+a)+' 14 L'+px(s.delay+a+s.hold)+' 14 L'+px(s.delay+a+s.hold+s.decay)+' '+sy+' L'+px(total-r)+' '+sy+' L292 64" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
}
function soundPage(advanced){byId('sound-basic').hidden=advanced;byId('soundAdvanced').hidden=!advanced;byId('soundBasicTab').setAttribute('aria-pressed',String(!advanced));byId('soundAdvancedTab').setAttribute('aria-pressed',String(advanced))}
function openInstrumentSettings(id){if(running)return;editingInstrument=id;soundMessage('');showInstrumentView('edit');soundPage(false);syncSoundEditor()}
byId('soundBasicTab').onclick=()=>soundPage(false);byId('soundAdvancedTab').onclick=()=>soundPage(true);
byId('soundName').onchange=()=>{const i=projectInstruments.find(i=>i.id===editingInstrument),name=byId('soundName').value.trim();if(!i||running)return;if(name&&name.length<=48){i.name=name;renderLanes();trackChanged()}syncSoundEditor()};
for(const key of ['filter','loop','reverse'])byId(key==='filter'?'sound-filterType':'sound-'+key).onchange=()=>{const i=projectInstruments.find(i=>i.id===editingInstrument);if(!i||running)return;i.settings=soundSettings({...i.settings,[key]:key==='reverse'?byId('sound-'+key).checked:byId(key==='filter'?'sound-filterType':'sound-'+key).value},true);syncSoundEditor();trackChanged()};
byId('soundReset').onclick=()=>{const i=projectInstruments.find(i=>i.id===editingInstrument);if(i&&!running){i.settings=soundSettings();syncSoundEditor();trackChanged()}};
byId('soundPreview').onclick=async()=>{
 const item=projectInstruments.find(i=>i.id===editingInstrument);if(!item||running)return;const token=++instrumentRequest;
 try{await unlock();await prepareInstrument(item.source);if(token!==instrumentRequest||byId('instrumentSheet').hidden||editingInstrument!==item.id||running)return;
  for(const voice of voices)silenceVoice(voice);syncSoundEditor();instrumentNote(item.source,instrumentById(item.source)?.demo||60,audio.currentTime+.01,1.5,85,item.settings);soundMessage('');
 }catch(e){if(token===instrumentRequest)soundMessage(e.message)}
};

