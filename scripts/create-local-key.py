"""Explicit, non-overwriting creation of a local Android signing identity."""
import argparse,datetime,hashlib,os
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

p=argparse.ArgumentParser();p.add_argument('private_key',type=Path);p.add_argument('certificate',type=Path);a=p.parse_args()
if a.private_key.exists() or a.certificate.exists():raise SystemExit('Refusing to overwrite an existing identity')
key=rsa.generate_private_key(public_exponent=65537,key_size=3072)
name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Notka local development 2026')])
now=datetime.datetime.now(datetime.timezone.utc)
cert=x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-datetime.timedelta(days=1)).not_valid_after(now+datetime.timedelta(days=365*30)).sign(key,hashes.SHA256())
a.private_key.parent.mkdir(parents=True,exist_ok=True);a.certificate.parent.mkdir(parents=True,exist_ok=True)
with os.fdopen(os.open(a.private_key,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as f:
 f.write(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
data=cert.public_bytes(serialization.Encoding.DER)
with a.certificate.open('xb') as f:f.write(data)
print('Created signing identity; certificate SHA-256: '+hashlib.sha256(data).hexdigest())
