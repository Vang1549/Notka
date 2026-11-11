"""Sign immutable editor editions and the compatible version catalog, separate from host APK releases."""
import base64,json,re,zipfile,hashlib,sys,subprocess
from pathlib import Path
from cryptography.hazmat.primitives import serialization,hashes
from cryptography.hazmat.primitives.asymmetric import padding

def adapt_editor(html):
    back='<button class="button" onclick="NotkaPlayer.leave()" aria-label="Вернуться к выбору версии">‹ Версии</button>'
    if 'const updateBox=' in html:
        html=re.sub(r'</main><section id="updateBox".*?<script>','</main><script>',html,flags=re.S)
        html=html.split('const updateBox=')[0]+'</script></html>'
        html=html.replace('<button class="button" id="updates">☰ Меню</button>',back)
    else:
        html=html.replace('</header>',back+'</header>',1)
    return html

def sign(data,key):
    record=json.dumps(data,ensure_ascii=True,separators=(',',':'))
    return {'record':record,'signature':base64.b64encode(key.sign(record.encode(),padding.PKCS1v15(),hashes.SHA256())).decode()}

def publish_editor(dist,code,version,name=None):
    out=dist/'editions'
    key=serialization.load_pem_private_key(Path('signing.pem').read_bytes(),password=None)
    catalog_path=out/'catalog.json'
    previous=json.loads(catalog_path.read_text())
    key.public_key().verify(base64.b64decode(previous['signature']),previous['record'].encode(),padding.PKCS1v15(),hashes.SHA256())
    catalog=json.loads(previous['record'])
    raw=Path('app/index.html').read_bytes()
    if code>=56:
        raw,count=re.subn(rb"const editorVersion='[^']*';",lambda _:('const editorVersion='+json.dumps(version)+';').encode(),raw)
        if count!=1:raise ValueError('Editor version declaration missing')
    if code>=47:
        raw=subprocess.check_output(['node','minify-editor.cjs',*(['--compact'] if code>=50 else []),*(['--internals'] if code>=54 else []),*(['--presets'] if code>=57 else []),*(['--refine'] if code>=58 else []),*(['--strings'] if code>=59 else []),*(['--navigation'] if code>=64 else []),*(['--performance'] if code>=65 else []),*(['--media'] if code>=66 else []),*(['--channels'] if code>=69 else [])],input=raw)
    if len(base64.b64encode(raw))>190000:
        raise ValueError('Editor exceeds the size supported by existing launchers')
    entry=dict(code=code,version=version,sha256=hashlib.sha256(raw).hexdigest())
    if name:entry["name"]=name
    envelope=sign(dict(kind='notka.editor.1',**entry,body=base64.b64encode(raw).decode()),key)
    content=json.dumps(envelope,separators=(',',':'))
    path=out/f'{code}.json'
    if path.exists() and path.read_text()!=content:raise ValueError(f'Edition {code} is immutable')
    if code<catalog['latest']:raise ValueError('Expected a new edition')
    entries={e['code']:e for e in catalog['editions']}
    if code in entries and entries[code]!=entry:raise ValueError('Existing catalog entry differs')
    entries[code]=entry
    path.write_text(content)
    catalog.update(latest=code,editions=list(entries.values()))
    staging=catalog_path.with_suffix('.tmp')
    staging.write_text(json.dumps(sign(catalog,key),separators=(',',':')))
    staging.replace(catalog_path)

if __name__=='__main__':
    publish_editor(Path(sys.argv[1]),int(sys.argv[2]),sys.argv[3],*sys.argv[4:])
