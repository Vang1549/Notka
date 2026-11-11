"""Build the small background-export service with pinned, verified tool jars."""
import os,shutil,subprocess,json,hashlib,urllib.request,zipfile
from pathlib import Path
cache=Path('.native-tools');cache.mkdir(exist_ok=True)
for name,item in json.loads(Path('native-tools.json').read_text()).items():
 p=cache/name
 if not p.exists():
  tmp=p.with_suffix('.tmp')
  with urllib.request.urlopen(item['url'],timeout=120) as r,tmp.open('wb') as f:shutil.copyfileobj(r,f)
  if hashlib.sha256(tmp.read_bytes()).hexdigest()!=item['sha256']:tmp.unlink();raise ValueError('Native tool checksum mismatch: '+name)
  tmp.replace(p)
 if hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256']:raise ValueError('Native tool checksum mismatch: '+name)
java=os.environ.get('NOTKA_JAVA') or shutil.which('java') or '/usr/lib/jvm/default-java/bin/java'
build=Path('.native-build');classes=build/'classes';classes.mkdir(parents=True,exist_ok=True)
for p in classes.rglob('*.class'):p.unlink()
subprocess.run([java,'-jar',str(cache/'ecj.jar'),'-source','8','-target','8','-encoding','UTF-8','-warn:none','-classpath',str(cache/'android.jar'),'-d',str(classes),*map(str,Path('native').rglob('*.java'))],check=True)
jar=build/'service.jar'
with zipfile.ZipFile(jar,'w') as z:
 for p in classes.rglob('*.class'):z.write(p,p.relative_to(classes))
subprocess.run([java,'-cp',str(cache/'r8.jar'),'com.android.tools.r8.D8','--release','--min-api','21','--lib',str(cache/'android.jar'),'--lib',str(Path(java).resolve().parent.parent),'--output',str(build),str(jar)],check=True)
print('Native export service compiled for Android 5+; classes2.dex ready.')
