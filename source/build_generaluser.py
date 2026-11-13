from signing_identity import load_signing_key,verify_envelope
"""Reproducible compact adaptations of 30 GeneralUser GS presets, plus auditions.

Usage: python build_generaluser.py /path/to/pinned/GeneralUser-GS.sf2
Requires system libfluidsynth, ffmpeg, numpy, scipy and the existing signing key.
Original SoundFont is downloaded separately; it is not included in the APK.
"""
import argparse,base64,ctypes as C,hashlib,io,json,subprocess
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from cryptography.hazmat.primitives import serialization,hashes
from cryptography.hazmat.primitives.asymmetric import padding

ROOT=Path(__file__).resolve().parent
DIST=ROOT.parent/'dist/soundbank'
COMMIT='684543d5e5efaef08d02be50dcda8d552478fa60'
RATE=32000
# GM program, filename, Russian name, short label, sustained loop, demo pitch.
CONFIG=[
 (4,'epiano','Электропианино','ЭП',False,60),
 (5,'fm-piano','FM-пианино','ФМ',False,60),
 (6,'harpsichord','Клавесин','Кл',False,60),
 (7,'clavinet','Клавинет','Кв',False,60),
 (8,'celesta','Челеста','Чл',False,72),
 (9,'glockenspiel','Глокеншпиль','Гл',False,72),
 (11,'vibraphone','Вибрафон','Вб',False,60),
 (12,'marimba','Маримба','Мр',False,60),
 (13,'xylophone','Ксилофон','Кс',False,72),
 (14,'tubular-bells','Трубчатые колокола','Тк',False,60),
 (15,'dulcimer','Цимбалы','Цм',False,60),
 (16,'organ','Электроорган','Ор',True,60),
 (17,'percussive-organ','Ударный орган','Уо',True,60),
 (19,'church-organ','Церковный орган','Цо',True,48),
 (21,'accordion','Аккордеон','Ак',True,60),
 (22,'harmonica','Губная гармоника','Гг',True,60),
 (24,'nylon-guitar','Гитара · нейлон','Гн',False,60),
 (25,'steel-guitar','Гитара · сталь','Гс',False,60),
 (26,'jazz-guitar','Джазовая гитара','Дж',False,60),
 (27,'clean-guitar','Чистая электрогитара','Эг',False,60),
 (29,'overdrive','Гитара · овердрайв','Ов',True,60),
 (30,'distortion','Гитара · дисторшн','Дс',True,60),
 (33,'finger-bass','Бас · пальцы','Бп',False,48),
 (34,'pick-bass','Бас · медиатор','Бм',False,48),
 (35,'fretless-bass','Безладовый бас','Бб',True,48),
 (38,'synth-bass','Синтезаторный бас','Сб',True,48),
 (42,'cello','Виолончель','Вч',True,48),
 (45,'pizzicato','Струнные · пиццикато','Пц',False,60),
 (46,'harp','Арфа','Ар',False,60),
 (48,'strings','Струнный ансамбль','Са',True,60),
 (52,'choir','Хор · А-а','Хр',True,60),
 (57,'trombone','Тромбон','Тб',True,48),
 (60,'horn','Валторна','Вл',True,60),
 (65,'alto-sax','Альт-саксофон','Ск',True,60),
 (68,'oboe','Гобой','Гб',True,72),
 (71,'clarinet','Кларнет','Кр',True,60),
 (75,'pan-flute','Пан-флейта','Пф',True,72),
 (80,'square-lead','Лид · прямоугольник','Лп',True,60),
 (81,'saw-lead','Лид · пила','Лс',True,60),
 (88,'fantasia','Пэд · фантазия','Пд',True,60),
]

# First downloadable selection fits the current hosting publication quota.
DEFERRED={'fm-piano','vibraphone','tubular-bells','harpsichord','finger-bass','clean-guitar','jazz-guitar','dulcimer','steel-guitar','pick-bass'}
CONFIG=[row for row in CONFIG if row[1] not in DEFERRED]

def compact(data):return json.dumps(data,ensure_ascii=True,separators=(',',':'))
def wav(y):
 out=io.BytesIO();wavfile.write(out,RATE,np.round(np.clip(y,-1,1)*32767).astype(np.int16));return out.getvalue()
def immutable(path,data):
 if path.exists() and path.read_bytes()!=data:raise ValueError('Immutable asset differs: '+str(path))
 path.write_bytes(data)

class Synth:
 def __init__(self,path):
  self.lib=C.CDLL('libfluidsynth.so.3')
  def fn(name,restype,args):
   f=getattr(self.lib,name);f.restype=restype;f.argtypes=args;return f
  ptr=C.c_void_p;integer=C.c_int;string=C.c_char_p
  self.settings=fn('new_fluid_settings',ptr,[])()
  fn('fluid_settings_setnum',integer,[ptr,string,C.c_double])(self.settings,b'synth.sample-rate',RATE)
  self.setint=fn('fluid_settings_setint',integer,[ptr,string,integer])
  for k,v in [(b'synth.reverb.active',0),(b'synth.chorus.active',0),(b'synth.polyphony',64),(b'synth.cpu-cores',1)]:self.setint(self.settings,k,v)
  fn('fluid_settings_setnum',integer,[ptr,string,C.c_double])(self.settings,b'synth.gain',.5)
  self.synth=fn('new_fluid_synth',ptr,[ptr])(self.settings)
  assert fn('fluid_synth_sfload',integer,[ptr,string,integer])(self.synth,str(path).encode(),1)>=0
  self.program=fn('fluid_synth_program_change',integer,[ptr,integer,integer])
  self.on=fn('fluid_synth_noteon',integer,[ptr,integer,integer,integer])
  self.off=fn('fluid_synth_all_sounds_off',integer,[ptr,integer])
  self.write=fn('fluid_synth_write_float',integer,[ptr,integer,ptr,integer,integer,ptr,integer,integer])
 def note(self,gm,pitch,seconds):
  self.off(self.synth,0);self.program(self.synth,0,gm);self.on(self.synth,0,pitch,100)
  n=int(RATE*seconds);left=np.zeros(n,dtype=np.float32);right=left.copy()
  assert self.write(self.synth,n,left.ctypes.data,0,1,right.ctypes.data,0,1)==0
  return (left.astype(float)+right)/2

def audition(bank,pitch):
 sample=min(bank['samples'],key=lambda s:abs(s['root']-pitch))
 rate,pcm=wavfile.read(io.BytesIO(base64.b64decode(sample['data'])))
 if pcm.ndim>1:pcm=pcm.mean(axis=1)
 y=pcm.astype(float)/32768
 ratio=2**((pitch-sample['root']+sample['tune']/100)/12)
 n=int(RATE*3);positions=np.arange(n)*rate/RATE*ratio
 if sample.get('loop'):
  lo,hi=sample['loop'];positions=np.where(positions>=hi,lo+(positions-lo)%(hi-lo),positions)
 out=np.interp(positions,np.arange(len(y)),y,left=0,right=0)
 attack=max(1,int(bank['attack']*RATE));release=max(1,int(bank['release']*RATE));hold=int(RATE*1.8)
 env=np.ones(n);env[:attack]=np.linspace(0,1,attack);env[hold:]=np.maximum(0,1-np.arange(n-hold)/release)
 return out*env*bank['gain']*.8

def main(sf):
 assert hashlib.sha256(sf.read_bytes()).hexdigest()=='9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe','Use the pinned GeneralUser GS source from source.json'
 key=load_signing_key()
 def signed(data):
  record=compact(data);return compact({'record':record,'signature':base64.b64encode(key.sign(record.encode(),padding.PKCS1v15(),hashes.SHA256())).decode()}).encode()
 original=json.loads((DIST/'catalog.json').read_text());verify_envelope(original)
 catalog=json.loads(original['record']);entries={x['id']:x for x in catalog['instruments']}
 license=(sf.parent/'LICENSE.txt').read_text()
 credits='GeneralUser GS 2.0.3 — S. Christian Collins. https://www.schristiancollins.com/generaluser\nhttps://github.com/mrbumpy409/GeneralUser-GS/tree/'+COMMIT+'\nНотка: адаптация, моно 32 кГц/16 бит, один слой velocity=100, FluidSynth без реверберации и хоруса, плавные петли. Не оригинальный SoundFont.'
 provenance=ROOT/'sample-source/generaluser';provenance.mkdir(exist_ok=True)
 (provenance/'LICENSE.txt').write_text(license)
 (provenance/'source.json').write_text(json.dumps({'url':'https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/'+COMMIT+'/GeneralUser-GS.sf2','sha256':hashlib.sha256(sf.read_bytes()).hexdigest(),'bytes':sf.stat().st_size,'adaptation':credits},ensure_ascii=False,indent=2))
 synth=Synth(sf);report=[]
 for gm,slug,name,short,sustain,demo in CONFIG:
  asset='bank-gu-'+slug+'-1';ident='lib-gu-'+slug+'-1'
  # Seven octave-spaced recordings preserve changes in timbre over the keyboard.
  roots=[24,36,48,60,72,84,96];waves=[synth.note(gm,r,2.2 if sustain else 5.5) for r in roots]
  peak=max(np.max(abs(y)) for y in waves);assert peak>1e-4
  bank=dict(format='notka.instrument.1',id=asset,revision=1,name=name,gmProgram=gm,sampleRate=RATE,gain=.65,attack=.003,release=.3,samples=[],license=license,credits=credits)
  for root,y in zip(roots,waves):
   y*=.8/peak;loop=None
   if sustain:
    start,end,fade=RATE,int(RATE*2),int(RATE*.12);t=np.linspace(0,1,fade)
    y[end-fade:end]=y[end-fade:end]*(1-t)+y[start-fade:start]*t;y=y[:end+1];loop=[start,end]
   else:y[-1600:]*=np.linspace(1,0,1600)
   y[:32]*=np.linspace(0,1,32)
   raw=wav(y);bank['samples'].append(dict(root=root,tune=0,loop=loop,data=base64.b64encode(raw).decode()))
  raw=signed(bank);assert len(raw)<8388608;immutable(DIST/(asset+'.json'),raw)
  entry=dict(id=ident,asset=asset,name=name,short=short,gm=gm,demo=demo,revision=1,bytes=len(raw),sha256=base64.b64encode(hashlib.sha256(raw).digest()).decode())
  if ident in entries:
   assert all(entries[ident].get(k)==v for k,v in entry.items())
  else:entries[ident]=entry
  report.append(dict(id=ident,program=gm,name=name,bytes=len(raw),peak=float(peak),roots=roots))
  print(name,len(raw),flush=True)
 # Preview every public bank, without changing any previously released bank bytes.
 for entry in entries.values():
  bank=json.loads(json.loads((DIST/(entry['asset']+'.json')).read_text())['record'])
  y=audition(bank,entry['demo']);audio=subprocess.run(['ffmpeg','-v','error','-f','wav','-i','pipe:0','-map_metadata','-1','-codec:a','libmp3lame','-b:a','96k','-f','mp3','pipe:1'],input=wav(y),capture_output=True,check=True).stdout
  asset='preview-'+entry['asset'][5:];raw=signed(dict(format='notka.preview.1',id=asset,mime='audio/mpeg',duration=3,data=base64.b64encode(audio).decode()))
  immutable(DIST/(asset+'.json'),raw);entry['preview']=dict(asset=asset,bytes=len(raw),sha256=base64.b64encode(hashlib.sha256(raw).digest()).decode())
 catalog['instruments']=list(entries.values())
 if catalog!=json.loads(original['record']):catalog['version']+=1
 raw=signed(catalog);assert len(raw)<262144;(DIST/'catalog.json').write_bytes(raw)
 # Ship verified metadata so the library opens immediately, including offline.
 p=ROOT/'app/editor/library.js';lines=p.read_text().splitlines();lines=[('const shippedSoundCatalog='+json.dumps(raw.decode())+';') if l.startswith('const shippedSoundCatalog=') else l for l in lines];p.write_text('\n'.join(lines)+'\n')
 (provenance/'instruments.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 (DIST/'GENERALUSER-LICENSE.txt').write_text(license+'\n'+credits+'\n')
 print('Built',len(CONFIG),'new banks;',len(entries),'catalogue entries; catalogue',len(raw),'bytes')

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('soundfont',type=Path);main(p.parse_args().soundfont)
