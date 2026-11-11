"""Compile Android launcher-icon resources with the pinned Android AAPT2 tool."""
from pathlib import Path
import hashlib,json,subprocess,zipfile
from PIL import Image

cache=Path('.native-tools');build=Path('.native-build/icon');build.mkdir(parents=True,exist_ok=True)
jar=cache/'aapt2.jar';expected=json.loads(Path('native-tools.json').read_text())['aapt2.jar']['sha256']
assert hashlib.sha256(jar.read_bytes()).hexdigest()==expected
with zipfile.ZipFile(jar) as z:(cache/'aapt2').write_bytes(z.read('aapt2'))
aapt=cache/'aapt2';aapt.chmod(0o755)
source=Image.open('art/notka-icon.png').convert('RGB')
assert source.width==source.height
for density,size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
 folder=build/'res'/('mipmap-'+density);folder.mkdir(parents=True,exist_ok=True)
 source.resize((size,size),Image.Resampling.LANCZOS).save(folder/'ic_launcher.png',optimize=True)
manifest=build/'AndroidManifest.xml';manifest.write_text('<manifest package="studio.notka.piano"><application/></manifest>')
subprocess.run([str(aapt),'compile','--dir',str(build/'res'),'-o',str(build/'compiled.zip')],check=True)
subprocess.run([str(aapt),'link','-I',str(cache/'android.jar'),'--manifest',str(manifest),'--min-sdk-version','21','--output-text-symbols',str(build/'R.txt'),'-o',str(build/'resources.apk'),str(build/'compiled.zip')],check=True)
print('Launcher icon compiled at five Android display densities.')
