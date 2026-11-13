"""Copy only public, licensed inputs from the frozen legacy tree. No personal banks/tracks."""
import hashlib,json,re,shutil
from pathlib import Path
repo=Path(__file__).resolve().parents[2]
assets=repo/'next/app/src/main/assets';assets.mkdir(parents=True,exist_ok=True)
files={
 'source/app/instruments/piano.json':'banks/piano.json',
 'source/app/instruments/bank-mda-grand-1.json':'banks/bank-mda-grand-1.json',
 'source/app/instruments/musicbox-import-template.json':'musicbox-import-template.json',
 'dist/soundbank/catalog.json':'catalog.json',
 'source/signing.der':'trust/legacy-current.der',
 'source/signing-legacy.der':'trust/legacy-original.der',
 'source/sample-source/LICENSE':'licenses/VSCO.txt',
 'source/sample-source/mda/LICENSE':'licenses/MDA.txt',
 'source/sample-source/generaluser/LICENSE.txt':'licenses/GeneralUser.txt',
}
manifest={}
for source,target in files.items():
    dest=assets/target;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(repo/source,dest)
    manifest[target]={'source':source,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()}
text=(repo/'source/app/editor/storage.js').read_text(encoding='utf-8')
presets=json.loads(re.search(r'const presetSongs=(\[.*?\]);',text).group(1))
for preset in presets:
    for lane in preset['track']['lanes']:
        lane['notes']=[dict(zip(['start','len','pitch','volume'],note)) for note in lane['notes']]
    dest=assets/'presets'/(preset['id']+'.notka');dest.parent.mkdir(exist_ok=True)
    dest.write_text(json.dumps(preset['track'],ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(assets/'provenance.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('Public assets and Memory prepared; private sound packages excluded.')
