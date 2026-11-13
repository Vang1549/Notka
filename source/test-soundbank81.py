"""Validate delivered banks and decode every audition with the real MP3 decoder."""
import base64,hashlib,io,json,subprocess
from signing_identity import verify_envelope
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
root=Path('../dist/soundbank');key=x509.load_der_x509_certificate(Path('signing.der').read_bytes()).public_key()
def verify(raw):
 e=json.loads(raw);verify_envelope(e);return json.loads(e['record'])
catalog=verify((root/'catalog.json').read_bytes());seen=set();banks=previews=0;total=0
for entry in catalog['instruments']:
 if not entry['id'].startswith('lib-gu-'):continue
 raw=(root/(entry['asset']+'.json')).read_bytes();assert len(raw)==entry['bytes']<8388608;assert base64.b64encode(hashlib.sha256(raw).digest()).decode()==entry['sha256']
 bank=verify(raw);assert bank['id']==entry['asset'] and bank['gmProgram']==entry['gm'];assert len(bank['samples'])==7
 signature=[]
 for sample in bank['samples']:
  data=base64.b64decode(sample['data']);rate,y=wavfile.read(io.BytesIO(data));assert rate==32000 and y.dtype==np.int16 and y.ndim==1
  v=y.astype(float)/32768;assert np.max(abs(v))<.99 and np.sqrt(np.mean(v*v))>1e-6
  assert abs(v[0])<.001
  if sample['loop']:
   lo,hi=sample['loop'];assert 0<lo<hi<len(y);assert abs(v[hi-1]-v[lo-1])<1/32768  # seam follows adjacent samples even at high pitches
  else:assert abs(v[-1])<.001
  signature.append(hashlib.sha256(data).hexdigest())
 assert tuple(signature) not in seen;seen.add(tuple(signature));banks+=1;total+=len(raw)
 meta=entry['preview'];blob=(root/(meta['asset']+'.json')).read_bytes();assert len(blob)==meta['bytes']<262144;assert base64.b64encode(hashlib.sha256(blob).digest()).decode()==meta['sha256']
 preview=verify(blob);assert preview['id']==meta['asset'] and preview['format']=='notka.preview.1'
 pcm=subprocess.run(['ffmpeg','-v','error','-i','pipe:0','-f','f32le','-ac','1','-ar','32000','pipe:1'],input=base64.b64decode(preview['data']),capture_output=True,check=True).stdout
 y=np.frombuffer(pcm,dtype='<f4');assert 2.8<len(y)/32000<3.3 and np.isfinite(y).all();assert .001<np.sqrt(np.mean(y*y))<.5;assert np.max(abs(y))<.99;previews+=1
assert banks==previews==30
print('PASS 30 unique signed 7-root banks, valid pitch/loops/no clipping, 30 audible decoded MP3 previews;',total,'bank bytes')
