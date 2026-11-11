"""Import the reviewed snapshot from a pinned transport commit."""
import hashlib,json,tarfile
from pathlib import Path,PurePosixPath
root=Path(__file__).resolve().parent.parent
meta=json.loads((root/'migration.json').read_text())
archive=root/'transport/notka-transfer.tar.xz'
with archive.open('wb') as out:
 for part in sorted((root/'transport').glob('part[0-9][0-9][0-9]')):out.write(part.read_bytes())
raw=archive.read_bytes()
if len(raw)!=meta['bytes'] or hashlib.sha256(raw).hexdigest()!=meta['sha256']:raise ValueError('Snapshot verification failed')
with tarfile.open(archive,'r:xz') as tar:
 for info in tar:
  p=PurePosixPath(info.name)
  if not info.isfile() or p.is_absolute() or '..' in p.parts:raise ValueError('Unsafe archive entry')
  if not (p.parts[0] in ['source','dist','scripts','release-assets'] or str(p) in ['README.md','.gitignore','publication.json']):raise ValueError('Unexpected archive file')
  if str(p)=='scripts/publish.py':continue
  data=tar.extractfile(info).read()
  if p.name=='signing.pem' or b'PRIVATE KEY-----' in data:raise ValueError('Private file in archive')
  dest=root/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
manifest=json.loads((root/'publication.json').read_text())
for release in manifest['releases']:
 for asset in release['assets']:
  asset['url']='https://github.com/Vang1549/Notka/releases/download/'+release['tag']+'/'+asset['name']
(root/'publication.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
with (root/'.gitignore').open('a') as f:f.write('\n/transport/\n/release-assets/\n')
print('Imported verified source and release assets')
