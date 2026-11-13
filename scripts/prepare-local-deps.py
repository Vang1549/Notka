"""Fetch Linux Node dependencies through Windows networking, inside the approved tools folder."""
import hashlib,shutil,subprocess,sys,json,urllib.request,concurrent.futures
from pathlib import Path
project=Path(__file__).resolve().parent.parent
tools=Path(sys.argv[1]) if len(sys.argv)>1 else Path('D:/Tools/Notka')
npm=tools/'npm';npm.mkdir(exist_ok=True)
digest=hashlib.sha256((project/'source/package-lock.json').read_bytes()).hexdigest();stamp=npm/'installed-lock.sha256'
if not(stamp.exists() and stamp.read_text()==digest and (npm/'node_modules').is_dir()):
 for name in ['package.json','package-lock.json']:shutil.copy2(project/'source'/name,npm/name)
 subprocess.run(['node',str(tools/'node/lib/node_modules/npm/bin/npm-cli.js'),'ci','--prefix',str(npm),'--cache',str(tools/'cache/npm-windows'),'--registry','https://registry.npmjs.org','--os=linux','--cpu=x64','--libc=glibc','--ignore-scripts','--bin-links=false','--no-audit','--no-fund'],check=True)
 stamp.write_text(digest)
android=tools/'android';android.mkdir(exist_ok=True)
def fetch(pair):
 name,item=pair;p=android/name
 if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256']:
  with urllib.request.urlopen(item['url'],timeout=90) as response,p.open('wb') as out:shutil.copyfileobj(response,out,1024*1024)
 if hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('Android tool checksum mismatch: '+name)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(fetch,json.loads((project/'source/native-tools.json').read_text()).items()))
