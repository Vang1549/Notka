"""Catalogs use the activated GitHub snapshot; APKs use immutable Releases."""
from pathlib import Path
from updater_dex import mkdex
origin='https://raw.githubusercontent.com/Vang1549/Notka/updates/dist'
ops=Path('host.ops').read_text();dex=mkdex(origin)
for path in ['/channel.json','/editions/','/editions/catalog.json','/bundles/','/bundles/catalog.json','/soundbank/']:
 assert (origin+path).encode()+b'\0' in dex,path
assert b'https://github.com/Vang1549/Notka/releases/download/apk-\0' in dex
assert b'https://github.com/Vang1549/Notka/releases\0' in dex
assert b'notka-piano-updates.zentas.chatgpt.site' not in dex
begin=ops.split('method Main:begin:',1)[1].split('method ',1)[0]
assert 'str 2 /Notka-' in begin and 'virtual String:concat:String:String 0 1' in begin
import json
assert json.loads(Path('release.json').read_text())['update_origin']==origin
assert "mkdex(release['update_origin'])" in Path('build.py').read_text()
print('PASS activated GitHub catalogs/bundles/sounds, APK Release route and release page; old host absent from DEX.')
