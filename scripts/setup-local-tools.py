"""Explicit portable setup under D:/Tools/Notka; does not alter system installations."""
import concurrent.futures,hashlib,json,shutil,subprocess,urllib.request,sys
from pathlib import Path
root=Path('D:/Tools/Notka');downloads=root/'downloads';downloads.mkdir(parents=True,exist_ok=True)
jobs=json.loads(Path(__file__).with_name('toolchain-downloads.json').read_text(encoding='utf-8-sig'))
def download(item):
 p=downloads/item['file']
 if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256']:
  with urllib.request.urlopen(item['url'],timeout=90) as response,p.open('wb') as out:shutil.copyfileobj(response,out,1024*1024)
 if hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('Download checksum mismatch: '+item['file'])
 print('Verified '+item['file'],flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(download,jobs))
(downloads/'jdk-package.json').write_text(json.dumps({'name':jobs[0]['file']}))
(downloads/'node-release.json').write_text(json.dumps({'version':jobs[1]['file'].removeprefix('node-').removesuffix('-linux-x64.tar.xz')}))
wheels=downloads/'wheels';wheels.mkdir(exist_ok=True)
version=subprocess.check_output(['wsl','-d','Ubuntu','--','python3','-c','import sys;print(str(sys.version_info.major)+"."+str(sys.version_info.minor))'],text=True).strip()
if version!='3.14':raise SystemExit('The pinned Linux wheel set requires Python 3.14 in Ubuntu; update the wheel lock for a different interpreter')
wheel_jobs=json.loads(Path(__file__).with_name('python-wheels.json').read_text())
def wheel_download(item):
 p=wheels/item['file']
 if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256']:
  with urllib.request.urlopen(item['url'],timeout=90) as response,p.open('wb') as out:shutil.copyfileobj(response,out,1024*1024)
 if hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('Wheel checksum mismatch: '+item['file'])
with concurrent.futures.ThreadPoolExecutor(max_workers=7) as pool:list(pool.map(wheel_download,wheel_jobs))
installer=Path(__file__).with_name('setup-portable-linux.py').resolve()
linux=subprocess.check_output(['wsl','-d','Ubuntu','--','wslpath','-u',installer.as_posix()],text=True).strip()
subprocess.run(['wsl','-d','Ubuntu','--','python3',linux],check=True)
