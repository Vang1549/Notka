"""All routine downloads use the same original host, without GitHub redirects."""
from pathlib import Path
from updater_dex import mkdex
origin='https://notka-piano-updates.zentas.chatgpt.site'
ops=Path('host.ops').read_text();dex=mkdex(origin)
for path in ['/Notka-','/channel.json','/editions/','/editions/catalog.json','/bundles/','/bundles/catalog.json','/soundbank/']:
 assert (origin+path).encode()+b'\0' in dex,path
assert b'https://github.com/Vang1549/Notka/releases' not in dex
assert b'https://raw.githubusercontent.com/Vang1549/Notka' not in dex
begin=ops.split('method Main:begin:',1)[1].split('method ',1)[0]
assert 'str 0 @ORIGIN@/Notka-' in begin and 'str 2 /Notka-' not in begin
import json
assert json.loads(Path('release.json').read_text())['update_origin']==origin
assert "mkdex(release['update_origin'])" in Path('build.py').read_text()
print('PASS APK, editor, bundles, sounds and release-page URLs use the original host.')
