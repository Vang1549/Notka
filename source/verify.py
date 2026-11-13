import zipfile,hashlib,struct,zlib,io,json
from cryptography import x509
from cryptography.hazmat.primitives import serialization,hashes
from cryptography.hazmat.primitives.asymmetric import padding
from pathlib import Path
release=json.loads(Path('release.json').read_text())
from release_config import sync
sync(check=True)
b=Path('Notka-'+release['apk_version']+'.apk').read_bytes()
get=lambda data,i:struct.unpack_from('<I',data,i)[0]
e=b.rindex(b'PK\x05\x06');cd=get(b,e+16);assert b[cd-16:cd]==b'APK Sig Block 42'
size=struct.unpack_from('<Q',b,cd-24)[0];start=cd-size-8
assert int.from_bytes(b[start:start+8],'little')==size
def parts(blob):
 p=0
 while p<len(blob):
  n=get(blob,p);p+=4;assert p+n<=len(blob);yield blob[p:p+n];p+=n
 assert p==len(blob)
assert get(b,start+16)==0x7109871a
layer,=parts(b[start+20:cd-24]);signer,=parts(layer);signed,sigs,public=parts(signer)
digs,certs,attrs=parts(signed);cert,=parts(certs);key=x509.load_der_x509_certificate(cert).public_key()
assert key.public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)==public
assert cert==Path('signing.der').read_bytes(), 'APK signing certificate changed'
sig,=parts(sigs);s,=parts(sig[4:]);key.verify(s,signed,padding.PKCS1v15(),hashes.SHA256())
dig,=parts(digs);stored,=parts(dig[4:]);assert get(dig,0)==get(sig,0)==0x103
sha=lambda data:hashlib.sha256(data).digest()
sections=[b[:start],b[cd:e],b[e:e+16]+struct.pack('<I',start)+b[e+20:]]
chunks=[section[i:i+1048576] for section in sections for i in range(0,len(section),1048576)]
assert stored==sha(b'\x5a'+struct.pack('<I',len(chunks))+b''.join(sha(b'\xa5'+struct.pack('<I',len(c))+c) for c in chunks))
with zipfile.ZipFile(io.BytesIO(b)) as z:
 assert z.read('assets/editor-signing.der')==Path('signing.der').read_bytes()
 assert z.read('assets/editor-signing-legacy.der')==Path('signing-legacy.der').read_bytes()
 assert z.read('assets/editor-signing.der')!=z.read('assets/editor-signing-legacy.der')
 builtin=z.read('assets/editor-builtin.zip');builtin_info=json.loads(z.read('assets/editor-builtin.json'))
 launcher=z.read('assets/index.html').decode()
 assert f"currentVersion={release['apk_code']},currentApk='{release['apk_version']}'" in launcher
 assert builtin_info['minApk']==release['editor_min_apk']<=release['apk_code']
 assert hashlib.sha256(builtin).hexdigest()==builtin_info['sha256'] and builtin_info['code']==release['editor_code']
 with zipfile.ZipFile(io.BytesIO(builtin)) as editor:
  envelope=json.loads(editor.read('manifest.json'))
  import base64
  key.verify(base64.b64decode(envelope['signature']),envelope['record'].encode(),padding.PKCS1v15(),hashes.SHA256())
 dex=z.read('classes.dex');assert dex[:8]==b'dex\n035\0' and get(dex,8)==zlib.adler32(dex[12:]) and dex[12:32]==hashlib.sha1(dex[32:]).digest() and get(dex,32)==len(dex)
 second=z.read('classes2.dex');assert second[:8]==b'dex\n035\0' and get(second,8)==zlib.adler32(second[12:]) and second[12:32]==hashlib.sha1(second[32:]).digest()
 xml=z.read('AndroidManifest.xml');assert get(xml,4)==len(xml)
 p=8;stack=[];events=[]
 while p<len(xml):
  tag,header,length=struct.unpack_from('<HHI',xml,p)
  if tag==1:
   pool=[]
   for i in range(get(xml,p+8)):
    j=p+get(xml,p+20)+get(xml,p+header+4*i);n=int.from_bytes(xml[j:j+2],'little');pool.append(xml[j+2:j+2+2*n].decode('utf-16le'))
  if tag==0x102:
   name=pool[get(xml,p+20)];stack.append(name);a={}
   for i in range(int.from_bytes(xml[p+28:p+30],'little')):
    at=p+36+i*20;keyname=pool[get(xml,at+4)];v=get(xml,at+16);a[keyname]=pool[v] if xml[at+15]==3 else v
   events.append((name,a))
  if tag==0x103:assert stack.pop()==pool[get(xml,p+20)]
  p+=length
 assert ('uses-sdk',{'minSdkVersion':21,'targetSdkVersion':32}) in events
 assert ('manifest',{'package':'studio.notka.piano','versionCode':release['apk_code'],'versionName':release['apk_version']}) in events
 assert not stack
 app=next(v for kind,v in events if kind=='application');assert app['icon']==0x7f010000
 resource=z.getinfo('resources.arsc');assert resource.compress_type==zipfile.ZIP_STORED
 assert (resource.header_offset+30+len(resource.filename.encode())+len(resource.extra))%4==0
 for density,size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
  png=z.read('res/mipmap-'+density+'-v4/ic_launcher.png');assert png[:8]==b'\x89PNG\r\n\x1a\n';assert struct.unpack('>II',png[16:24])==(size,size)
 assert ('action',{'name':'android.intent.action.MAIN'}) in events and ('category',{'name':'android.intent.category.LAUNCHER'}) in events
 activities={v['name']:v for kind,v in events if kind=='activity'}
 assert activities['studio.notka.piano.Main']['exported']
 assert activities['studio.notka.piano.Player']['process']==':editor'
 assert all(activities['studio.notka.piano.'+name]['configChanges'] & 0x480 == 0x480 for name in ['Player','PlayerLegacy'])
 assert not activities['studio.notka.piano.Player']['exported'] and not activities['studio.notka.piano.PlayerLegacy']['exported']
 services={v['name']:v for kind,v in events if kind=='service'}
 assert services['studio.notka.piano.ExportService']['process']==':editor'
 assert 'process' not in services['studio.notka.piano.LegacyExportService']
 for service in services.values():assert not service['exported'] and service['stopWithTask'] and service['foregroundServiceType']==8193
 permissions={v['name'] for kind,v in events if kind=='uses-permission'}
 assert {'android.permission.WAKE_LOCK','android.permission.FOREGROUND_SERVICE','android.permission.FOREGROUND_SERVICE_DATA_SYNC','android.permission.FOREGROUND_SERVICE_MEDIA_PROCESSING','android.permission.POST_NOTIFICATIONS'}<=permissions
 print('OK: Android launcher manifest, DEX checksums, APK RSA signature, current/legacy trust assets and built-in editor signed by the new key')
