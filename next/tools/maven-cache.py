"""Optional local Maven transport for WSL behind a Windows-only VPN. No global settings."""
import concurrent.futures,hashlib,ipaddress,json,re,subprocess,sys,threading,time,urllib.parse
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
root=Path('D:/Tools/Notka/next' if sys.platform=='win32' else '/mnt/d/Tools/Notka/next')
cache=root/'maven-cache';queue=root/'maven-requests'
cache.mkdir(exist_ok=True);queue.mkdir(exist_ok=True)
origins={'google':'https://dl.google.com/dl/android/maven2/','central':'https://repo.maven.apache.org/maven2/','plugins':'https://plugins.gradle.org/m2/'}
def validate(path):
    if not re.fullmatch('[A-Za-z0-9_./+%-]+',path) or '..' in path:raise ValueError('Invalid artifact path')
    repo,_,relative=path.partition('/')
    if repo not in origins or not relative:raise ValueError('Unknown Maven repository')
    return origins[repo]+relative
class Handler(BaseHTTPRequestHandler):
    def do_HEAD(self):self.serve(False)
    def do_GET(self):self.serve(True)
    def serve(self,body):
        path=urllib.parse.urlsplit(self.path).path.strip('/')
        if path=='health':self.send_response(200);self.end_headers();return
        try:validate(path)
        except ValueError:self.send_error(400);return
        dest=cache/path;key=hashlib.sha256(path.encode()).hexdigest();request=queue/(key+'.request');status=queue/(key+'.done')
        if not dest.exists():
            request.write_text(path)
            until=time.monotonic()+1200
            while not status.exists() and not dest.exists() and time.monotonic()<until:time.sleep(.2)
            if not dest.exists():
                code=int(status.read_text()) if status.exists() else 504;self.send_error(code);return
        self.send_response(200);self.send_header('Content-Length',str(dest.stat().st_size));self.end_headers()
        if body:
            try:
                with dest.open('rb') as f:
                    while data:=f.read(1024*1024):self.wfile.write(data)
            except (BrokenPipeError,ConnectionResetError):pass
    def log_message(self,*args):pass
def download(request):
    path=request.read_text();url=validate(path);dest=cache/path;dest.parent.mkdir(parents=True,exist_ok=True)
    tmp=dest.with_name(dest.name+'.part')
    p=subprocess.run([r'C:\Program Files\Git\mingw64\bin\curl.exe','-4','--silent','--show-error','--location','--retry','2','--max-time','1000','--write-out','%{http_code}','--output',str(tmp),url],capture_output=True,text=True)
    code=200 if p.returncode==0 and p.stdout.strip()=='200' else 404 if p.stdout.strip()=='404' else 502
    if code==200:tmp.replace(dest)
    request.with_suffix('.done').write_text(str(code))
    return code
if sys.argv[1]=='serve':
    print('Local Maven endpoint: http://127.0.0.1:18763',flush=True)
    ThreadingHTTPServer(('127.0.0.1',18763),Handler).serve_forever()
else:
    print('Windows Maven download worker ready',flush=True);seen=set();futures=[];finished=0
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        while True:
            for request in queue.glob('*.request'):
                if request.name in seen or request.with_suffix('.done').exists():continue
                seen.add(request.name);futures.append(pool.submit(download,request))
            for future in list(futures):
                if future.done():
                    code=future.result();futures.remove(future);finished+=1
                    if finished%25==0:print(f'Resolved {finished} Maven requests',flush=True)
            time.sleep(.2)
