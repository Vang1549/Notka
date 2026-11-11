"""Build downloadable MDA grand piano and Joseph Sardin's CC0 music box."""
from pathlib import Path
import base64,hashlib,io,json,math,re,zipfile
import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly
ROOT=Path(__file__).parent
RATE=32000
COMMIT='8ea6ef97946a617d73e48d245777e57fb984357f'
def pack(ident,name,gm,samples,license,credits,release):
 folder=ROOT/'instruments'/('Notka-'+ident);(folder/'samples').mkdir(parents=True,exist_ok=True)
 bank=dict(format='notka.instrument.1',id=ident,revision=1,name=name,gmProgram=gm,sampleRate=RATE,gain=.5,attack=.002,release=release,samples=[],license=license,credits=credits)
 roots=[r for r,y,tune in samples];lines=[f'<group> ampeg_attack=0.002 ampeg_release={release} volume=-6.0206'];sources=[]
 for i,(root,y,tune) in enumerate(samples):
  y=y.copy();fade=min(3200,len(y)//8);y[-fade:]*=np.linspace(1,0,fade);y[:32]*=np.linspace(0,1,32)
  f=io.BytesIO();wavfile.write(f,RATE,np.round(np.clip(y,-1,1)*32767).astype(np.int16));raw=f.getvalue();filename=f'samples/midi-{root}.wav';(folder/filename).write_bytes(raw)
  bank['samples'].append(dict(root=root,tune=tune,loop=None,data=base64.b64encode(raw).decode()))
  lo=0 if i==0 else (roots[i-1]+root)//2+1;hi=127 if i==len(roots)-1 else (root+roots[i+1])//2
  lines.append(f'<region> sample={filename} lokey={lo} hikey={hi} pitch_keycenter={root} tune={tune} loop_mode=no_loop')
  sources.append(dict(file=filename,sha256=hashlib.sha256(raw).hexdigest(),rootMidi=root,tuneCents=tune))
 (folder/(ident+'.sfz')).write_text('\n'.join(lines)+'\n');(folder/'LICENSE.txt').write_text(license);(folder/'README.txt').write_text(name+'\n\n'+credits+'\n\nТе же WAV используются в Нотке. Моно, 32 кГц, 16 бит; один динамический слой. Ноты вне записанного диапазона транспонируются. SFZ можно открыть в совместимом сэмплере.\n')
 (folder/'sources.json').write_text(json.dumps(dict(credits=credits,samples=sources),ensure_ascii=False,indent=2))
 (ROOT/'app/instruments'/f'{ident}.json').write_text(json.dumps(bank,ensure_ascii=True,separators=(',',':')))
 with zipfile.ZipFile(ROOT/'instruments'/f'Notka-{ident}.zip','w',zipfile.ZIP_DEFLATED) as z:
  for p in sorted(folder.rglob('*')):
   if p.is_file():z.write(p,p.relative_to(folder.parent))
 print(ident,len(samples),(ROOT/'app/instruments'/f'{ident}.json').stat().st_size)
def main():
 mda=ROOT/'sample-source/mda';data=np.array([int(v) for v in re.findall(r'-?\d+', (mda/'mdaPianoData.h').read_text().split('{')[1].split('}')[0])],dtype=float)/32768
 samples=[]
 for line in (mda/'mdaPiano.cpp').read_text().splitlines():
  if not re.search(r'kgrp\[\s*\d+\].root =',line):continue
  values={k:int(v) for k,v in re.findall(r'\.(root|pos|end|loop) = (\d+)',line)};root=values['root'];start=values['pos'];end=values['end'];loop=values['loop']
  # Expand the original sustain loop offline with MDA's default natural decay.
  idx=np.arange(22050*6)+start;idx=np.where(idx>end,end-loop+1+(idx-end-1)%loop,idx)
  y=data[idx]*np.exp(-np.arange(len(idx))/22050*np.exp(-.6+.033*max(44,root)-1))
  y=resample_poly(y,640,441);samples.append((root,y,0))
 peak=max(np.max(abs(y)) for _,y,_ in samples);samples=[(r,y*.68/peak,t) for r,y,t in samples]
 credits=f'MDA Piano — Paul Kellett. MIT. https://github.com/elk-audio/mda-vst2/tree/{COMMIT}\nНотка: исходные сэмплы 22050 Гц, развёрнутые петли и затухание, ресемплинг. Это адаптация MDA, не копия пресета FL Keys.'
 pack('grand-piano','Grand Piano · MDA',0,samples,(mda/'LICENSE').read_text(),credits,.25)
 samples=[]
 for ident,root,tune in [(1867,72,-2),(1874,84,-12),(1877,89,-4)]:
  rate,y=wavfile.read(ROOT/'sample-source/musicbox'/f'{ident}.wav');y=y.astype(float)/2**31
  if y.ndim==2:y=y.mean(axis=1)
  active=np.flatnonzero(abs(y)>max(abs(y))*.01);y=y[max(0,active[0]-96):];y-=y.mean();y*=.68/max(abs(y));div=math.gcd(rate,RATE);y=resample_poly(y,RATE//div,rate//div);samples.append((root,y,tune))
 credits='Music box — Joseph SARDIN / BigSoundBank, CC0 1.0.\nhttps://bigsoundbank.com/boite-a-musique-do-1-s1867.html\nhttps://bigsoundbank.com/music-box-c-2-s1874.html\nhttps://bigsoundbank.com/boite-a-musique-Fa-2-s1877.html\nНотка: удаление начальной тишины, нормализация, настройка высоты, 32 кГц / 16 бит.'
 pack('musicbox','Музыкальная шкатулка',10,samples,'CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/\n'+credits,credits,.5)
if __name__=='__main__':main()
