"""Personal-use FrozenPlain conversion. Never publish the input/output sample banks."""
from pathlib import Path
import base64,io,json,math,re
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from scipy.io import wavfile
root=Path('private-48/floe/Libraries/FrozenPlain - Music Box Suite Free')
bank=dict(format='notka.instrument.1',id='musicbox-floe',revision=1,name='Music Box · FrozenPlain',gmProgram=10,sampleRate=32000,gain=.5,attack=.002,release=.5,roundRobins=4,samples=[],license='FrozenPlain Personal License. Personal conversion only; no redistribution. https://www.frozenplain.com/support/personal-license',credits='Music Box Suite Free — Copyright FrozenPlain Ltd. Source FLAC recordings, four round-robin groups; Notka personal adaptation: stereo PCM 32000 Hz / 16-bit. Original License.pdf included in APK.')
for p in sorted(root.rglob('*.flac')):
 rr,pitch=map(int,re.search(r'rr(\d+)_(\d+)\.flac$',p.name).groups())
 data,rate=sf.read(p,always_2d=True);d=math.gcd(rate,32000);data=resample_poly(data,32000//d,rate//d,axis=0)
 out=io.BytesIO();wavfile.write(out,32000,np.round(np.clip(data,-1,1)*32767).astype(np.int16))
 bank['samples'].append(dict(root=pitch,tune=0,rr=rr,loop=None,data=base64.b64encode(out.getvalue()).decode()))
out=Path('private-48/musicbox-floe.json');out.write_text(json.dumps(bank,separators=(',',':')));print('FrozenPlain bank',len(bank['samples']),'unique recordings,',out.stat().st_size,'bytes')
# The same existing grand piano bank, unchanged.
p=Path('/workspace/sites/notka-updates/dist/soundbank/bank-mda-grand-1.json');Path('private-48/bank-mda-grand-1.json').write_text(json.loads(p.read_text())['record'])
