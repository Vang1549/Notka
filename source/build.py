import io,struct,hashlib,zlib,zipfile,datetime,json,subprocess
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric import rsa,padding
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.x509 import CertificateBuilder,Name,NameAttribute,random_serial_number
from cryptography.x509.oid import NameOID
def pack(fmt,*args):return struct.pack('<'+fmt,*args)
def u32(n):return pack('I',n)
def u64(n):return pack('Q',n)
def pad(b):return b+b'\0'*(-len(b)%4)
def leb(n):
 out=b''
 while n>=128:out+=bytes([128+n%128]);n//=128
 return out+bytes([n])
def manifest():
 ids={'theme':0x01010000,'label':0x01010001,'icon':0x01010002,'name':0x01010003,'process':0x01010011,'noHistory':0x0101022d,'exported':0x01010010,'configChanges':0x0101001f,'minSdkVersion':0x0101020c,'versionCode':0x0101021b,'versionName':0x0101021c,'targetSdkVersion':0x01010270,'allowBackup':0x01010280,'foregroundServiceType':0x01010599,'stopWithTask':0x0101036a}
 pool=list(ids)
 def idx(s):
  if s not in pool:pool.append(s)
  return pool.index(s)
 ns='http://schemas.android.com/apk/res/android';nil=0xffffffff
 def node(t,b):return pack('HHIII',t,16,len(b)+16,1,nil)+b
 body=node(0x100,pack('II',idx('android'),idx(ns)))
 def start(name,attrs=()):
  nonlocal body
  rows=b''
  for key,value in sorted(attrs,key=lambda p:ids.get(p[0],0)):
   typ=3 if isinstance(value,str) else value[0]
   data=idx(value) if typ==3 else value[1]
   rows+=pack('IIIHBBI',idx(ns) if key in ids else nil,idx(key),data if typ==3 else nil,8,0,typ,data)
  body+=node(0x102,pack('II6H',nil,idx(name),20,20,len(attrs),0,0,0)+rows)
 def end(name):
  nonlocal body
  body+=node(0x103,pack('II',nil,idx(name)))
 start('manifest',[('package','studio.notka.piano'),('versionCode',(16,63)),('versionName','0.63')])
 start('uses-sdk',[('minSdkVersion',(16,21)),('targetSdkVersion',(16,32))]);end('uses-sdk')
 for permission in ['android.permission.INTERNET','android.permission.REQUEST_INSTALL_PACKAGES','android.permission.FOREGROUND_SERVICE','android.permission.FOREGROUND_SERVICE_DATA_SYNC','android.permission.FOREGROUND_SERVICE_MEDIA_PROCESSING','android.permission.WAKE_LOCK','android.permission.POST_NOTIFICATIONS']:
  start('uses-permission',[('name',permission)]);end('uses-permission')
 start('application',[('label','Нотка'),('icon',(1,icon_id)),('theme',(1,0x01030006)),('allowBackup',(18,0))])
 start('activity',[('name','studio.notka.piano.Main'),('exported',(18,0xffffffff)),('configChanges',(17,0x4a0))])
 start('intent-filter')
 for tag,value in [('action','android.intent.action.MAIN'),('category','android.intent.category.LAUNCHER')]:
  start(tag,[('name',value)]);end(tag)
 end('intent-filter');end('activity')
 for activity in ['Player','PlayerLegacy']:
  attrs=[('name','studio.notka.piano.'+activity),('exported',(18,0)),('configChanges',(17,0x4a0))]
  if activity=='Player':attrs.append(('process',':editor'))
  start('activity',attrs);end('activity')
 for service in ['ExportService','LegacyExportService']:
  attrs=[('name','studio.notka.piano.'+service),('exported',(18,0)),('foregroundServiceType',(17,8193)),('stopWithTask',(18,0xffffffff))]
  if service=='ExportService':attrs.append(('process',':editor'))
  start('service',attrs);end('service')
 end('application');end('manifest')
 body+=node(0x101,pack('II',idx('android'),idx(ns)))
 strings=b'';offsets=b''
 for s in pool:
  offsets+=u32(len(strings));strings+=pack('H',len(s))+s.encode('utf-16le')+b'\0\0'
 strings=pad(strings);base=28+len(offsets)
 sp=pack('HHIIIIII',1,28,base+len(strings),len(pool),0,0,base,0)+offsets+strings
 res=pack('HHI',0x180,8,8+4*len(ids))+b''.join(map(u32,ids.values()))
 return pack('HHI',3,8,8+len(sp+res+body))+sp+res+body
subprocess.run(['node','build-media.cjs'],check=True)
subprocess.run(['python','build-native.py'],check=True)
subprocess.run(['python','build-icon.py'],check=True)
icon_symbol=Path('.native-build/icon/R.txt').read_text().strip().split()
assert icon_symbol[:3]==['int','mipmap','ic_launcher']
icon_id=int(icon_symbol[3],16)
from verify_native import check_native
check_native()
from updater_dex import mkdex
def lp(b):return u32(len(b))+b
def sign(apk):
 tail=apk.rindex(b'PK\x05\x06');offset=struct.unpack_from('<I',apk,tail+16)[0]
 chunks=[section[i:i+1048576] for section in [apk[:offset],apk[offset:tail],apk[tail:]] for i in range(0,len(section),1048576)]
 sha=lambda b:hashlib.sha256(b).digest()
 digest=sha(b'\x5a'+u32(len(chunks))+b''.join(sha(b'\xa5'+lp(c)) for c in chunks))
 keypath=Path('signing.pem')
 if not keypath.exists():
  key=rsa.generate_private_key(public_exponent=65537,key_size=3072)
  keypath.touch(mode=0o600)
  keypath.write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
 else:key=serialization.load_pem_private_key(keypath.read_bytes(),password=None)
 certpath=Path('signing.der')
 if not certpath.exists():
  name=Name([NameAttribute(NameOID.COMMON_NAME,'Notka')])
  cert=CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(random_serial_number()).not_valid_before(datetime.datetime(2020,1,1)).not_valid_after(datetime.datetime(2050,1,1)).sign(key,hashes.SHA256())
  certpath.write_bytes(cert.public_bytes(serialization.Encoding.DER))
 alg=u32(0x0103);signed=lp(lp(alg+lp(digest)))+lp(lp(certpath.read_bytes()))+lp(b'')
 signature=key.sign(signed,padding.PKCS1v15(),hashes.SHA256())
 pub=key.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)
 value=lp(lp(lp(signed)+lp(lp(alg+lp(signature)))+lp(pub)))
 pair=u64(4+len(value))+u32(0x7109871a)+value
 block=u64(len(pair)+24)+pair+u64(len(pair)+24)+b'APK Sig Block 42'
 return apk[:offset]+block+apk[offset:tail+16]+u32(offset+len(block))+apk[tail+20:]
import base64
from cryptography import x509
from cryptography.hazmat.primitives.serialization import pkcs7

def jar_sign(z):
 def digest(data):
  return base64.b64encode(hashlib.sha256(data).digest())
 def section(name,data):
  return b'Name: '+name.encode()+b'\r\nSHA-256-Digest: '+digest(data)+b'\r\n\r\n'
 sections=[(name,section(name,z.read(name))) for name in z.namelist()]
 manifest_bytes=b'Manifest-Version: 1.0\r\n\r\n'+b''.join(data for _,data in sections)
 sf=(b'Signature-Version: 1.0\r\nX-Android-APK-Signed: 2\r\nSHA-256-Digest-Manifest: '
     +digest(manifest_bytes)+b'\r\n\r\n'+b''.join(section(name,data) for name,data in sections))
 key=serialization.load_pem_private_key(Path('signing.pem').read_bytes(),None)
 cert=x509.load_der_x509_certificate(Path('signing.der').read_bytes())
 signature=pkcs7.PKCS7SignatureBuilder().set_data(sf).add_signer(cert,key,hashes.SHA256())
 rsa=signature.sign(serialization.Encoding.DER,[pkcs7.PKCS7Options.Binary,pkcs7.PKCS7Options.DetachedSignature,pkcs7.PKCS7Options.NoAttributes])
 for name,data in [('MANIFEST.MF',manifest_bytes),('NOTKA.SF',sf),('NOTKA.RSA',rsa)]:
  z.writestr('META-INF/'+name,data)

iofile=io.BytesIO()
with zipfile.ZipFile(iofile,'w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('AndroidManifest.xml',manifest());z.writestr('classes.dex',mkdex('https://raw.githubusercontent.com/Vang1549/Notka/main/dist'));z.writestr('assets/index.html',Path('app/launcher.html').read_text().replace('/* PACKED_EDITIONS */',Path('bundled-editions.js').read_text()))
 with zipfile.ZipFile('.native-build/icon/resources.apk') as resources:
  for name in resources.namelist():
   if name=='resources.arsc' or name.startswith('res/'):
    z.writestr(name,resources.read(name),compress_type=zipfile.ZIP_STORED if name=='resources.arsc' else zipfile.ZIP_DEFLATED)
 z.writestr('classes2.dex',Path('.native-build/classes.dex').read_bytes())
 z.writestr('assets/MEDIABUNNY-LICENSE.txt',Path('node_modules/mediabunny/LICENSE').read_bytes())
 z.writestr('assets/media-export.js',Path('app/media-export.bundle.js').read_bytes())
 for asset in [Path('app/instruments/piano.json'),Path('app/instruments/bank-mda-grand-1.json'),Path('app/instruments/musicbox-import-template.json')]:z.writestr('assets/instruments/'+asset.name,asset.read_bytes())
 z.writestr('assets/instruments/LICENSE-CC0.txt',Path('sample-source/LICENSE').read_bytes())
 z.writestr('assets/instruments/CREDITS.txt','VSCO 2 Community Edition — Versilian Studios / Sam Gossner; upright piano Simon Dalzell / Ivy Audio; sample cutting Elan Hickler / Soundemote. CC0 1.0. https://github.com/sgossner/VSCO-2-CE ; Notka adaptation: mono 32 kHz PCM, onset trimming, normalization and sustain loops.')
 z.writestr('assets/instruments/EXTRA-CREDITS.txt',json.loads(Path('app/instruments/bank-mda-grand-1.json').read_text())['credits'])
 z.writestr('assets/instruments/MDA-LICENSE.txt',Path('sample-source/mda/LICENSE').read_bytes())
 jar_sign(z)
# Place the signing manifest first for streaming JAR readers on older devices.
ordered=io.BytesIO()
with zipfile.ZipFile(iofile) as src, zipfile.ZipFile(ordered,'w',zipfile.ZIP_DEFLATED) as dst:
 for entry in sorted(src.infolist(),key=lambda e:not e.filename.startswith('META-INF/')):
  if entry.filename=='resources.arsc':
   # Android 11+ requires an uncompressed, four-byte-aligned resource table.
   count=(-(dst.fp.tell()+30+len(entry.filename.encode('utf-8'))+4))%4
   entry.extra=pack('HH',0xd935,count)+b'\0'*count
  dst.writestr(entry,src.read(entry))
Path('Notka-0.63.apk').write_bytes(sign(ordered.getvalue()))
