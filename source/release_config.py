"""Synchronize checked-in release labels from release.json before building."""
import json,re,sys
from pathlib import Path

ROOT=Path(__file__).resolve().parent
def sync(check=False):
    r=json.loads((ROOT/'release.json').read_text(encoding='utf-8'))
    for name in ['apk','editor','panel']:
        assert isinstance(r[name+'_code'],int) and 0<r[name+'_code']<2147483648
        assert re.fullmatch(r'\d+(?:\.\d+){1,3}',r[name+'_version'])
    assert 69<=r['editor_min_apk']<=r['apk_code']
    edits={
      'app/launcher.html':[(r"const currentVersion=\d+,currentApk='[^']+',currentPanel=\{code:\d+,version:'[^']+'\}",f"const currentVersion={r['apk_code']},currentApk='{r['apk_version']}',currentPanel={{code:{r['panel_code']},version:'{r['panel_version']}'}}"),
                           (r'APK 0\.\d+ \(—\)',f"APK {r['apk_version']} (—)"),(r'Панель 0\.\d+ \(—\)',f"Панель {r['panel_version']} (—)")],
      'app/editor/export.js':[(r"const editorVersion='[^']+'",f"const editorVersion='{r['editor_version']}'")],
      'app/editor/diagnostics.js':[(r"editor:'[^']+'",f"editor:'{r['editor_version']}'")],
      'native/studio/notka/piano/EditorStore.java':[(r'info.getInt\("minApk"\)>\d+',f'info.getInt("minApk")>{r["apk_code"]}')],
      'native/studio/notka/piano/Diagnostics.java':[(r'\.put\("panel","[^"]+"\)',f'.put("panel","{r["panel_version"]}")')]
    }
    stale=[]
    for name,replacements in edits.items():
        p=ROOT/name; original=p.read_text(encoding='utf-8'); updated=original
        for pattern,value in replacements:
            updated,count=re.subn(pattern,lambda m:value,updated)
            if not count:raise ValueError('Release field missing in '+name+': '+pattern)
        if updated!=original:
            stale.append(name)
            if not check:p.write_text(updated,encoding='utf-8')
    if check and stale:raise ValueError('Stale release fields: '+', '.join(stale))
    return r

if __name__=='__main__':
    sync('--check' in sys.argv)
    print('Release fields match release.json.')
