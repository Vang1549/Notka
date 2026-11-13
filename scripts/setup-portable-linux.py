"""Extract portable tools without filesystem symlinks; keep all files under D:/Tools/Notka."""
import json,os,posixpath,shutil,subprocess,tarfile
from pathlib import Path
root=Path('/mnt/d/Tools/Notka')
def unpack(archive,dest):
 links=[]
 with tarfile.open(archive,mode='r|*') as tar:
  for m in tar:
   parts=Path(m.name).parts[1:]
   if not parts:continue
   if dest.name=='node' and parts[0] in ('include','share'):continue
   target=dest.joinpath(*parts)
   if not target.resolve().is_relative_to(dest.resolve()):raise ValueError('Archive path escapes destination')
   if m.isdir():target.mkdir(parents=True,exist_ok=True);continue
   if m.issym() or m.islnk():
    name=posixpath.normpath(posixpath.join(posixpath.dirname(m.name),m.linkname) if m.issym() else m.linkname)
    links.append((target,dest.joinpath(*Path(name).parts[1:])))
    continue
   if not m.isfile():continue
   target.parent.mkdir(parents=True,exist_ok=True)
   if target.exists():target.chmod(m.mode|0o200)
   with tar.extractfile(m) as incoming,target.open('wb') as out:shutil.copyfileobj(incoming,out)
   target.chmod(m.mode)
 for target,source in links:
  if not source.resolve().is_relative_to(dest.resolve()):raise ValueError('Link escapes destination')
  if target.exists():target.chmod(0o755)
  if source.is_dir():shutil.copytree(source,target,dirs_exist_ok=True)
  else:shutil.copy2(source,target)

jdk=json.loads((root/'downloads/jdk-package.json').read_text(encoding='utf-8-sig'))
node=json.loads((root/'downloads/node-release.json').read_text(encoding='utf-8-sig'))['version']
if not (root/'jdk/bin/java').exists() or subprocess.run([str(root/'jdk/bin/java'),'-version'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
 unpack(root/'downloads'/jdk['name'],root/'jdk')
if not (root/'node/lib/node_modules/npm/bin/npm-cli.js').exists():
 unpack(root/'downloads'/f'node-{node}-linux-x64.tar.xz',root/'node')
for name,script in [('npm','npm-cli.js'),('npx','npx-cli.js')]:
 p=root/'node/bin'/name;p.write_text(f'#!/bin/sh\nexec "{root}/node/bin/node" "{root}/node/lib/node_modules/npm/bin/{script}" "$@"\n');p.chmod(0o755)
# The mounted D: filesystem cannot create POSIX links. The venv is isolated,
# and --copies plus a materialized lib64 directory avoids changing WSL itself.
import venv
original=os.symlink
def copylink(src,dst,*args,**kwargs):
 source=Path(src)
 if not source.is_absolute():source=Path(dst).parent/source
 if source.is_dir():shutil.copytree(source,dst,dirs_exist_ok=True)
 else:shutil.copy2(source,dst)
os.symlink=copylink
try:venv.EnvBuilder(with_pip=False,symlinks=False).create(root/'venv')
finally:os.symlink=original
env=dict(os.environ,PIP_CACHE_DIR=str(root/'cache/pip'))
subprocess.run([str(root/'venv/bin/python'),str(root/'downloads/get-pip.py'),'--no-index','--find-links',str(root/'downloads/wheels')],env=env,check=True)
subprocess.run([str(root/'venv/bin/python'),'-m','pip','install','--no-index','--find-links',str(root/'downloads/wheels'),'cryptography','Pillow','mido==1.3.3'],env=env,check=True)
subprocess.run([str(root/'jdk/bin/java'),'-version'],check=True)
subprocess.run([str(root/'node/bin/node'),'--version'],check=True)
print('Portable Linux tools ready under D:/Tools/Notka')
