"""Install verified portable archives under the explicitly selected tool root.
Run with Linux Python. Does not change PATH, system Java, or global SDK settings.
"""
import hashlib,json,os,stat,sys,zipfile,shutil
from pathlib import Path,PurePosixPath
root=Path('D:/Tools/Notka/next' if sys.platform=='win32' else '/mnt/d/Tools/Notka/next');repo=Path(__file__).resolve().parents[1]
packages=json.loads((repo/'toolchain-downloads.json').read_text())
for package in packages:
    archive=root/'downloads'/package['file'];name=package['package']
    if not archive.exists():continue
    algorithm='sha256' if 'sha256' in package else 'sha1'
    if hashlib.new(algorithm,archive.read_bytes()).hexdigest()!=package[algorithm]:raise ValueError('Archive checksum mismatch: '+name)
    target=root if name=='gradle' else root/'android-sdk'/name.replace(';','/')
    stamp=root/('installed-'+name.replace(';','-')+'.json')
    if stamp.exists():continue
    target.mkdir(parents=True,exist_ok=True);links=[]
    with zipfile.ZipFile(archive) as z:
        roots={PurePosixPath(info.filename).parts[0] for info in z.infolist() if not info.is_dir()}
        strip_root=name!='gradle' and len(roots)==1
        for info in z.infolist():
            parts=PurePosixPath(info.filename).parts
            if strip_root:parts=parts[1:]
            if not parts:continue
            if '..' in parts or PurePosixPath(info.filename).is_absolute():raise ValueError('Unsafe archive path')
            path=target.joinpath(*parts)
            if info.is_dir():path.mkdir(parents=True,exist_ok=True);continue
            path.parent.mkdir(parents=True,exist_ok=True);mode=info.external_attr>>16
            if stat.S_ISLNK(mode):links.append((path,z.read(info).decode()));continue
            with z.open(info) as source,path.open('wb') as dest:shutil.copyfileobj(source,dest)
            path.chmod(0o755 if mode&0o111 or '/bin/' in '/'+str(PurePosixPath(*parts)) else 0o644)
        linkmap={path.resolve():relative for path,relative in links}
        for path,relative in links:
            source=(path.parent/relative).resolve();visited=set()
            while source in linkmap:
                if source in visited:raise ValueError('Archive symlink cycle')
                visited.add(source);source=(source.parent/linkmap[source]).resolve()
            if not source.is_relative_to(target.resolve()):raise ValueError('Unsafe archive symlink')
            try:path.symlink_to(relative)
            except OSError:
                if source.is_file():shutil.copyfile(source,path);path.chmod(0o755)
                elif source.is_dir():shutil.copytree(source,path,dirs_exist_ok=True)
                else:raise
    stamp.write_text(json.dumps({'package':name,'checksum':package[algorithm]}));print('Installed '+name,flush=True)
