"""Build the same compact CC0 multisamples for Android and portable SFZ/WAV packs."""
from pathlib import Path
import base64,concurrent.futures,hashlib,io,json,math,re,urllib.parse,urllib.request,zipfile
import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly
ROOT=Path(__file__).parent
CACHE=ROOT/'sample-source'
OUT=ROOT/'instruments'
ASSETS=ROOT/'app'/'instruments'
COMMIT='440300901dfe9275fd84e0b7763af1f8443ae62e'
CONFIG=[
 ('piano','Пианино','UprightPiano.sfz',0,[21,29,37,45,53,61,69,77,85,93,101,108],False,.25),
 ('violin','Скрипка','SViolinVib.sfz',40,[55,60,67,72,79,84,91,96],True,.22),
 ('flute','Флейта','FluteSusNV.sfz',73,[60,64,69,76,81,88,96],True,.14),
 ('bass','Контрабас','ContrabassPizz.sfz',32,[28,34,40,45,49,56,59],False,.25),
 ('trumpet','Труба','TrumpetSus.sfz',56,[53,60,67,74,81,84],True,.18)]
RATE=32000

def selected(sfz,roots):
 text=(CACHE/sfz).read_text();prefix=re.search(r'default_path=(.*)',text)[1].strip().replace('\\','/')
 choices={}
 for block in text.split('<region>')[1:]:
  d=dict(re.findall(r'(\w+)=([^\r\n]+)',block.split('<group>')[0]));root=int(d['pitch_keycenter'])
  if root not in roots:continue
  # Middle piano dynamic; forte violin; a single consistent soft wind layer.
  name=d['sample']
  if sfz=='UprightPiano.sfz' and 'dyn2' not in name:continue
  if sfz=='SViolinVib.sfz' and '_f.wav' not in name:continue
  if sfz=='TrumpetSus.sfz' and '_v1_' not in name:continue
  if sfz=='FluteSusNV.sfz' and '_v1_' not in name:continue
  if sfz=='ContrabassPizz.sfz' and ('_v1_' not in name or '_rr1' not in name):continue
  choices[root]={'root':root,'path':prefix+name,'tune':int(d.get('tune',0))}
 assert sorted(choices)==roots,(sfz,choices)
 return list(choices.values())

def download(r):
 path=CACHE/r['path'];path.parent.mkdir(parents=True,exist_ok=True)
 if not path.exists():
  url='https://raw.githubusercontent.com/sgossner/VSCO-2-CE/'+COMMIT+'/'+urllib.parse.quote(r['path'])
  for attempt in range(3):
   try:
    data=urllib.request.urlopen(url,timeout=60).read();assert data[:4]==b'RIFF';path.write_bytes(data);break
   except Exception:
    if attempt==2:raise
 return path

def convert(r,sustain):
 path=download(r);rate,y=wavfile.read(path)
 if np.issubdtype(y.dtype,np.integer):y=y.astype(np.float64)/(2**(np.iinfo(y.dtype).bits-1))
 else:y=y.astype(np.float64)
 if y.ndim==2:y=y.mean(axis=1)
 div=math.gcd(rate,RATE);y=resample_poly(y,RATE//div,rate//div)
 # Trim leading recording silence but retain the original attack.
 a=np.abs(y);window=160;activity=np.convolve(a,np.ones(window)/window,mode='same');hits=np.flatnonzero(activity>max(activity.max()*.012,1e-7));begin=max(0,int(hits[0])-256)
 y=y[begin:begin+RATE*(3 if sustain else 6)];y-=np.mean(y)
 peak=np.abs(y).max();assert peak>1e-5;y*=.68/peak
 loop=None
 if sustain:
  assert len(y)>RATE*2.8
  start,end,fade=RATE,int(RATE*2.8),int(RATE*.12)
  t=np.linspace(0,1,fade,endpoint=True)
  y[end-fade:end]=y[end-fade:end]*(1-t)+y[start-fade:start]*t
  loop=[start,end] # end is exclusive in Web Audio; SFZ below uses inclusive end.
  y=y[:end+1]
 else:
  fade=min(1600,len(y)//8);y[-fade:]*=np.linspace(1,0,fade)
 y[:64]*=np.linspace(0,1,64)
 out=io.BytesIO();wavfile.write(out,RATE,np.round(np.clip(y,-1,1)*32767).astype(np.int16));data=out.getvalue()
 return {'root':r['root'],'tune':r['tune'],'loop':loop,'data':base64.b64encode(data).decode()},data,hashlib.sha256(path.read_bytes()).hexdigest()

def main():
 OUT.mkdir(exist_ok=True);ASSETS.mkdir(parents=True,exist_ok=True)
 allregs={c[0]:sorted(selected(c[2],c[4]),key=lambda r:r['root']) for c in CONFIG}
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
  for _ in ex.map(download,[r for regs in allregs.values() for r in regs]):pass
 for ident,name,sfz,gm,roots,sustain,release in CONFIG:
  folder=OUT/('Notka-'+ident);(folder/'samples').mkdir(parents=True,exist_ok=True)
  bank={'format':'notka.instrument.1','id':ident,'revision':1,'name':name,'gmProgram':gm,'sampleRate':RATE,'gain':.5,'attack':.004,'release':release,'samples':[]}
  lines=['// Notka compact VSCO 2 CE. CC0. GM program (0-based): '+str(gm),'<group> ampeg_attack=0.004 ampeg_release='+str(release)+' volume=-6.0206']
  sources=[]
  for i,r in enumerate(allregs[ident]):
   entry,data,sha=convert(r,sustain);bank['samples'].append(entry)
   filename='samples/midi-'+str(r['root'])+'.wav';(folder/filename).write_bytes(data)
   lo=0 if i==0 else (roots[i-1]+r['root'])//2+1
   hi=127 if i==len(roots)-1 else (r['root']+roots[i+1])//2
   line=f'<region> sample={filename} lokey={lo} hikey={hi} pitch_keycenter={r["root"]} tune={r["tune"]}'
   if entry['loop']:line+=f' loop_mode=loop_continuous loop_start={entry["loop"][0]} loop_end={entry["loop"][1]-1}'
   else:line+=' loop_mode=no_loop'
   lines.append(line);sources.append({'file':filename,'original':r['path'],'sha256':sha,'rootMidi':r['root'],'tuneCents':r['tune']})
  (folder/(ident+'.sfz')).write_text('\n'.join(lines)+'\n')
  (folder/'LICENSE-CC0.txt').write_bytes((CACHE/'LICENSE').read_bytes())
  (folder/'sources.json').write_text(json.dumps({'repository':'https://github.com/sgossner/VSCO-2-CE','commit':COMMIT,'samples':sources},ensure_ascii=False,indent=2))
  delivery='Пианино встроено в APK 0.32 и новее.' if ident == 'piano' else 'Этот инструмент можно скачать через каталог в APK 0.33 и новее.'
  (folder/'README.txt').write_text(f'''Нотка — {name}\n\nРаспакуй весь архив, сохранив папку samples рядом с {ident}.sfz.\nОткрой {ident}.sfz в SFZ-совместимом сэмплере, например Sforzando или полной версии DirectWave для FL Studio на ПК. WAV можно загружать отдельно; MIDI-номер исходной ноты указан в имени файла.\nЭто инструмент, не готовая мелодия и не MIDI-файл. Импорт произвольных SFZ в «Нотку» пока не добавлен: {delivery}\n\nЗаписи: VSCO 2 Community Edition, Versilian Studios / Sam Gossner; пианино Simon Dalzell / Ivy Audio; нарезка Elan Hickler / Soundemote. CC0 1.0.\nИсточник: https://github.com/sgossner/VSCO-2-CE\nОбработка для «Нотки»: моно PCM WAV, 32 кГц / 16 бит, удаление начальной тишины, нормализация; плавные петли для скрипки и флейты. Один динамический слой. Те же обработанные WAV используются в приложении.\nНа крайних нотах диапазона используется транспонирование ближайшего сэмпла. Оттенки громкости и эффекты зависят от сэмплера.\nGM program (с нуля): {gm}. Версия набора: 1.\n''')
  (ASSETS/(ident+'.json')).write_text(json.dumps(bank,ensure_ascii=True,separators=(',',':')))
  with zipfile.ZipFile(OUT/('Notka-'+ident+'.zip'),'w',zipfile.ZIP_DEFLATED) as z:
   for p in sorted(folder.rglob('*')):
    if p.is_file():z.write(p,p.relative_to(OUT))
  print(ident,'samples',len(bank['samples']),'bank bytes',(ASSETS/(ident+'.json')).stat().st_size,flush=True)
if __name__=='__main__':main()
