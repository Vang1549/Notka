"""Publish hash-pinned public APKs/assets; never accept unverified replacement assets."""
import argparse,base64,hashlib,json,os,re,subprocess,tempfile,urllib.request
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
REPO='Vang1549/Notka'
def gh(*args):
 p=subprocess.run(['gh',*args,'--repo',REPO],check=True,capture_output=True,text=True)
 return p.stdout

def verified_catalogs(root):
 public=x509.load_der_x509_certificate((root/'source/signing.der').read_bytes()).public_key()
 for path in [root/'dist/channel.json',*sorted((root/'dist/editions').glob('*.json')),*sorted((root/'dist/soundbank').glob('*.json'))]:
  env=json.loads(path.read_text());public.verify(base64.b64decode(env['signature']),env['record'].encode(),padding.PKCS1v15(),hashes.SHA256())
  record=json.loads(env['record'])
  if record.get('kind')=='notka.editor.1':
   raw=base64.b64decode(record['body'],validate=True)
   if hashlib.sha256(raw).hexdigest()!=record['sha256']:raise ValueError('Editor hash mismatch')
 return json.loads(json.loads((root/'dist/channel.json').read_text())['record'])

def publish(root,verify_only=False):
 channel=verified_catalogs(root)
 manifest=json.loads((root/'publication.json').read_text())
 if manifest['repository']!=REPO:raise ValueError('Wrong repository')
 if verify_only:return
 with tempfile.TemporaryDirectory(prefix='notka-release-') as td:
  cache=Path(td)
  # Fetch/check every artifact before creating any release.
  for release in manifest['releases']:
   if not re.fullmatch(r'(?:archive|apk-[1-9][0-9]*)',release['tag']):raise ValueError('Invalid tag')
   for asset in release['assets']:
    name=asset['name'];dest=cache/name
    if Path(name).name!=name or not re.fullmatch(r'[A-Za-z0-9_.-]+',name):raise ValueError('Unsafe filename')
    if not dest.exists():
     if os.environ.get('NOTKA_ASSET_DIR'):
      dest.write_bytes((Path(os.environ['NOTKA_ASSET_DIR'])/name).read_bytes())
     elif 'path' in asset:
      src=(root/asset['path']).resolve()
      if not src.is_relative_to(root.resolve()):raise ValueError('Path escapes repository')
      dest.write_bytes(src.read_bytes())
     else:
      url=asset['url']
      if not (url.startswith('https://notka-piano-updates.zentas.chatgpt.site/') or url.startswith('https://github.com/Vang1549/Notka/releases/download/')):raise ValueError('Unexpected artifact source')
      with urllib.request.urlopen(url,timeout=180) as response,dest.open('wb') as out:
       while data:=response.read(1024*1024):out.write(data)
    if dest.stat().st_size!=asset['bytes'] or hashlib.sha256(dest.read_bytes()).hexdigest()!=asset['sha256']:raise ValueError('Artifact hash mismatch: '+name)
    if name==f"Notka-{channel['code']}.apk":
     if base64.b64encode(hashlib.sha256(dest.read_bytes()).digest()).decode()!=channel['sha256']:raise ValueError('Channel hash mismatch')
  for release in manifest['releases']:
   tag=release['tag'];existing=subprocess.run(['gh','release','view',tag,'--repo',REPO,'--json','assets,isDraft'],capture_output=True,text=True)
   if existing.returncode:
    # Distinguish a missing tag from network/auth errors before creation.
    all_releases=json.loads(gh('release','list','--limit','100','--json','tagName'))
    if any(x['tagName']==tag for x in all_releases):raise RuntimeError('Cannot inspect existing release')
    note=cache/(tag+'.md');note.write_text(release['notes'])
    gh('release','create',tag,'--target',os.environ.get('NOTKA_RELEASE_COMMIT','main'),'--title',release['title'],'--notes-file',str(note),'--draft')
    known={}
   else:known={x['name']:x for x in json.loads(existing.stdout)['assets']}
   for asset in release['assets']:
    name=asset['name']
    if name in known:
     # Never overwrite an immutable published APK, even on a retry.
     check=cache/'existing';check.mkdir(exist_ok=True)
     gh('release','download',tag,'--pattern',name,'--dir',str(check),'--clobber')
     if hashlib.sha256((check/name).read_bytes()).hexdigest()!=asset['sha256']:raise ValueError('Existing release differs: '+name)
    else:gh('release','upload',tag,str(cache/name))
   gh('release','edit',tag,'--draft=false','--latest='+str(release.get('latest',False)).lower())
   print('Published',tag,flush=True)
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--verify-only',action='store_true');args=parser.parse_args()
 publish(Path(__file__).resolve().parent.parent,args.verify_only)
