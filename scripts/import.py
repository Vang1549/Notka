"""One-time import of the reviewed, hash-pinned Notka project snapshot."""
import hashlib,io,json,urllib.request,zipfile
from pathlib import Path,PurePosixPath
root=Path(__file__).resolve().parent.parent
meta=json.loads((root/'migration.json').read_text())
raw=b''
for part in meta['parts']:
 if not part['url'].startswith('https://notka-piano-updates.zentas.chatgpt.site/migration/notka-github-63.part'):raise ValueError('Unexpected source')
 with urllib.request.urlopen(part['url'],timeout=180) as response:data=response.read(part['bytes']+1)
 if len(data)!=part['bytes'] or hashlib.sha256(data).hexdigest()!=part['sha256']:raise ValueError('Part verification failed')
 raw+=data
if len(raw)!=meta['bytes'] or hashlib.sha256(raw).hexdigest()!=meta['sha256']:raise ValueError('Snapshot verification failed')
with zipfile.ZipFile(io.BytesIO(raw)) as z:
 for info in z.infolist():
  p=PurePosixPath(info.filename)
  if p.is_absolute() or '..' in p.parts or ((info.external_attr>>16)&0o170000)==0o120000:raise ValueError('Unsafe archive path')
  if not (p.parts[0] in ['source','dist','scripts'] or str(p) in ['README.md','.gitignore','publication.json']):raise ValueError('Unexpected archive file')
  data=z.read(info)
  if p.name=='signing.pem' or b'PRIVATE KEY-----' in data:raise ValueError('Private file in archive')
  dest=root/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
print('Imported verified project snapshot')
