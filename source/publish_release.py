"""Stage only the APK and its signed release record for the update host."""
import argparse,base64,hashlib,json,shutil,zipfile
from pathlib import Path
from cryptography.hazmat.primitives import serialization,hashes
from cryptography.hazmat.primitives.asymmetric import padding
p=argparse.ArgumentParser();p.add_argument('dist',type=Path);p.add_argument('code',type=int);p.add_argument('version');p.add_argument('--panel-code',type=int);p.add_argument('--panel-version');args=p.parse_args()
b64=lambda b:base64.b64encode(b).decode()
apk=Path(f'Notka-{args.version}.apk')
with zipfile.ZipFile(apk) as archive:
 if 'assets/instruments/PERSONAL-USE.txt' in archive.namelist() and args.dist.resolve()!=Path('private-48').resolve():
  raise ValueError('Personal APK must not be staged on the public update host')
data=dict(app='studio.notka.piano',code=args.code,version=args.version,sha256=b64(hashlib.sha256(apk.read_bytes()).digest()))
if (args.panel_code is None)!=(args.panel_version is None):raise ValueError('Provide both panel code and version')
if args.panel_code is not None:data['panel']=dict(code=args.panel_code,version=args.panel_version)
record=json.dumps(data,separators=(',',':'))
key=serialization.load_pem_private_key(Path('signing.pem').read_bytes(),password=None)
sig=key.sign(record.encode(),padding.PKCS1v15(),hashes.SHA256())
shutil.copyfile(apk,args.dist/f'Notka-{args.code}.apk')
(args.dist/'channel.json').write_text(json.dumps(dict(record=record,signature=b64(sig))))
