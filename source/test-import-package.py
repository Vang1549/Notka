"""Validate the supported upstream package, metadata, native bridge and public APK boundary."""
from pathlib import Path
import base64,hashlib,io,json,os,zipfile
from verify_native import check_native
from updater_dex import mkdex
source=Path('host.ops').read_text()
template=json.loads(Path('app/instruments/musicbox-import-template.json').read_text());files=template['files']
assert len(files)==31 and len(set(files))==31
assert {v['rr'] for v in files.values()}=={0,1,2,3}
# The public bridge/APK checks below always run. Only original-audio validation
# needs the separately obtained upstream package; never substitute synthetic data here.
def check_upstream(package):
 import soundfile as sf
 raw=package.read_bytes();digest=base64.b64encode(hashlib.sha256(raw).digest()).decode()
 assert 'str 3 '+digest in source
 assert len(raw)<16*1024*1024
 with zipfile.ZipFile(io.BytesIO(raw)) as z:
  for name,meta in files.items():
   data=z.read(name);assert len(data)<512*1024 and data[:4]==b'fLaC'
   audio,rate=sf.read(io.BytesIO(data),always_2d=True)
   assert rate==template['sampleRate']==44100 and audio.shape[1]==2 and len(audio)>0
   assert str(meta['root'])+'.flac' in name
  license=z.read('Libraries/FrozenPlain - Music Box Suite Free/License.pdf')
  assert len(license)<65536 and license.startswith(b'%PDF')
# Independent picker result slot, bounded archive and entry reads, stage-before-commit.
assert 'const 0 4213' in source and 'str 1 instrumentUri' in source and 'str 1 trackUri' in source
assert 'musicbox-import.pending' in source and 'musicbox-import.json' in source
reader=source.split('method Player:readInstrumentPackage:')[1].split('method Player:importPackageFile:')[0]
assert 'ZipInput:' not in reader and 'ZipFile:entries:Enumeration' in reader and 'ZipFile:getInputStream:IS:ZipEntry' in reader
assert 'dropImportPackage' in reader and '!access' in reader and '!bank-save' in reader
check_native();dex=mkdex(json.loads(Path('release.json').read_text())['update_origin'])
for name in ['pickInstrument','readInstrumentPackage','commitInstrumentImport','instrumentAvailable','hasImportedInstrument','deleteImportedInstrument','onResume']:
 assert (name+'\0').encode() in dex
channel=json.loads(json.loads(Path('../dist/channel.json').read_text())['record'])
apk=Path('../dist')/('Notka-'+str(channel['code'])+'.apk')
with zipfile.ZipFile(apk) as app:
 assert app.read('classes.dex')==dex
 names=app.namelist();assert 'assets/instruments/piano.json' in names and 'assets/instruments/bank-mda-grand-1.json' in names
 assert 'assets/instruments/musicbox-floe.json' not in names
 assert not any(n.endswith(('.flac','.floe-pkg')) or 'PERSONAL-USE' in n for n in names)
 assert json.loads(app.read('assets/instruments/musicbox-import-template.json'))==template
print('PASS 31-entry/four-variant template, independent picker/atomic staging, native assembly and current public APK boundaries.')
package=Path(os.environ.get('NOTKA_FLOE_PACKAGE','private-48/musicbox.floe-pkg'))
if package.is_file():
 check_upstream(package)
 print('PASS original upstream SHA-256, archive limits, 31 stereo FLAC files, four variants and PDF license.')
elif 'NOTKA_FLOE_PACKAGE' in os.environ:
 raise FileNotFoundError(package)
else:
 print('SKIP original Floe audio subtest: set NOTKA_FLOE_PACKAGE to the author package; public checks passed.')
