from signing_identity import load_signing_key,verify_envelope
"""Build an immutable, signed, compressed editor package for APK 64+."""
import argparse,base64,hashlib,io,json,zipfile
from pathlib import Path
from cryptography.hazmat.primitives import serialization
from editor_channel import sign

def build(dist,code,version,name):
    key=load_signing_key()
    minimum=json.loads(Path('release.json').read_text())['editor_min_apk']
    folder=Path('.native-build/editor')
    files={p.name:p.read_bytes() for p in sorted(folder.iterdir()) if p.is_file()}
    info=dict(kind='notka.bundle.1',code=code,version=version,name=name,minApk=minimum,
              files={n:dict(bytes=len(b),sha256=hashlib.sha256(b).hexdigest()) for n,b in files.items()})
    raw=json.dumps(sign(info,key),separators=(',',':')).encode()
    buffer=io.BytesIO()
    with zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for filename,data in [('manifest.json',raw),*files.items()]:
            item=zipfile.ZipInfo(filename,(2026,1,1,0,0,0));item.compress_type=zipfile.ZIP_DEFLATED;item.external_attr=0o100644<<16
            z.writestr(item,data,compresslevel=9)
    blob=buffer.getvalue();digest=hashlib.sha256(blob).hexdigest()
    entry=dict(code=code,version=version,name=name,sha256=digest,format=2,minApk=minimum)
    out=dist/'bundles';out.mkdir(exist_ok=True)
    target=out/f'{code}.zip'
    if target.exists() and target.read_bytes()!=blob:raise ValueError('Published bundle is immutable')
    catalog_path=out/'catalog.json'
    source=catalog_path if catalog_path.exists() else dist/'editions/catalog.json'
    envelope=json.loads(source.read_text())
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives import hashes
    verify_envelope(envelope)
    catalog=json.loads(envelope['record']);entries={e['code']:e for e in catalog['editions']}
    if code<catalog['latest'] or code in entries and entries[code]!=entry:raise ValueError('Existing catalog version differs')
    target.write_bytes(blob)
    entries[code]=entry;catalog.update(latest=code,editions=list(entries.values()))
    catalog_path.write_text(json.dumps(sign(catalog,key),separators=(',',':')))
    Path('.native-build/editor-builtin.zip').write_bytes(blob)
    Path('.native-build/editor-builtin.json').write_text(json.dumps(entry,separators=(',',':')))
    print(f'Bundle {version}: {sum(map(len,files.values())):,} bytes -> {len(blob):,} bytes; {len(files)} files')
    return entry

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('dist',type=Path);p.add_argument('code',type=int);p.add_argument('version');p.add_argument('name');a=p.parse_args();build(a.dist,a.code,a.version,a.name)
