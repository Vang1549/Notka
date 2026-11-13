"""Install pinned Linux sound-test wheels only inside the approved Notka venv."""
import concurrent.futures,hashlib,json,shutil,subprocess
from pathlib import Path
tools=Path('D:/Tools/Notka');downloads=tools/'downloads/wheels'
downloads.mkdir(parents=True,exist_ok=True)
lock=json.loads(Path(__file__).with_name('sound-test-wheels.json').read_text(encoding='utf-8'))
curl=Path('C:/Program Files/Git/mingw64/bin/curl.exe')
if not curl.exists():curl=shutil.which('curl.exe')
def fetch(item):
    target=downloads/item['file']
    if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest()!=item['sha256']:
        subprocess.run([str(curl),'-4','--fail','--silent','--show-error','--location','--retry','2','--max-time','1800','--continue-at','-','--output',str(target),item['url']],check=True)
    if hashlib.sha256(target.read_bytes()).hexdigest()!=item['sha256']:raise ValueError('Wheel checksum mismatch: '+item['file'])
    print('Verified '+item['file'],flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(fetch,lock))
subprocess.run(['wsl','-d','Ubuntu','--','/mnt/d/Tools/Notka/venv/bin/python','-m','pip','install','--no-index','--no-deps',*['/mnt/d/Tools/Notka/downloads/wheels/'+item['file'] for item in lock]],check=True)
print('Sound-test tools installed in D:/Tools/Notka; system environment unchanged.')
