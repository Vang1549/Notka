"""Check native cross-DEX bridge contracts and the concurrency/lifetime model."""
import struct,subprocess,os,shutil
from pathlib import Path
from updater_dex import mkdex

def methods(data):
 u=lambda p:struct.unpack_from('<I',data,p)[0]
 def leb(p):
  value=shift=0
  while True:
   b=data[p];p+=1;value|=(b&127)<<shift
   if not b&128:return value,p
   shift+=7
 strings=[]
 for i in range(u(56)):
  p=u(u(60)+i*4);_,p=leb(p);strings.append(data[p:data.index(0,p)].decode('utf-8',errors='replace'))
 types=[strings[u(u(68)+i*4)] for i in range(u(64))]
 protos=[]
 for i in range(u(72)):
  p=u(76)+i*12;r=types[u(p+4)];a=u(p+8)
  args=[] if not a else [types[struct.unpack_from('<H',data,a+4+j*2)[0]] for j in range(u(a))]
  protos.append('('+''.join(args)+')'+r)
 refs=[]
 for i in range(u(88)):
  p=u(92)+8*i;c,proto,n=struct.unpack_from('<HHI',data,p);refs.append((types[c],strings[n],protos[proto]))
 flags={}
 for i in range(u(96)):
  p=u(u(100)+32*i+24)
  if not p:continue
  counts=[]
  for _ in range(4):n,p=leb(p);counts.append(n)
  for _ in range(counts[0]+counts[1]):_,p=leb(p);_,p=leb(p)
  for count in counts[2:]:
   index=0
   for _ in range(count):
    delta,p=leb(p);index+=delta;access,p=leb(p);_,p=leb(p);flags[refs[index]]=access
 return refs,flags

host,_=methods(mkdex('https://notka-piano-updates.zentas.chatgpt.site'))
service,flags=methods(Path('.native-build/classes.dex').read_bytes())
links=[m for m in host if m[0]=='Lstudio/notka/piano/ExportRuntime;']
assert len(links)==6
for m in links:assert m in flags and flags[m]&9==9,m
# Resolve the immersive callbacks across DEX files too (including old Android).
ui_links=[m for m in host if m[0]=='Lstudio/notka/piano/SystemUi;']
assert len(ui_links)==2
for m in ui_links:assert m in flags and flags[m]&9==9,m
file_links=[m for m in host if m[0]=='Lstudio/notka/piano/StorageFiles;']
assert len(file_links)==2
for m in file_links:assert m in flags and flags[m]&9==9,m
editor_links=[m for m in host if m[0]=='Lstudio/notka/piano/EditorStore;']
assert len(editor_links)==8
for m in editor_links:assert m in flags and flags[m]&9==9,m
for name,proto in [('onBind','(Landroid/content/Intent;)Landroid/os/IBinder;'),('onStartCommand','(Landroid/content/Intent;II)I'),('onDestroy','()V'),('onTaskRemoved','(Landroid/content/Intent;)V'),('onTimeout','(II)V')]:
 assert flags[('Lstudio/notka/piano/ExportService;',name,proto)]&1
print('PASS all six bridge calls resolve to public static methods in classes2.dex; service lifecycle signatures valid.')
java=os.environ.get('NOTKA_JAVA') or shutil.which('java') or '/usr/lib/jvm/default-java/bin/java'
subprocess.run([java,'-jar','.native-tools/ecj.jar','-source','8','-target','8','-warn:none','-d','.native-build/tests','native/studio/notka/piano/ExportTask.java','native-tests/studio/notka/piano/ExportTaskTest.java'],check=True)
subprocess.run([java,'-cp','.native-build/tests','studio.notka.piano.ExportTaskTest'],check=True)

subprocess.run([java,'-jar','.native-tools/ecj.jar','-source','8','-target','8','-warn:none','-d','.native-build/tests','native/studio/notka/piano/StoragePolicy.java','native-tests/studio/notka/piano/StoragePolicyTest.java'],check=True)
subprocess.run([java,'-cp','.native-build/tests','studio.notka.piano.StoragePolicyTest'],check=True)
