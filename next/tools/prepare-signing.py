"""Create the separate application's key once, outside the repository.
Never replaces an existing key or affects the legacy Notka certificate.
"""
from pathlib import Path
import datetime,secrets
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
root=Path('/mnt/d/Tools/Notka/next/keys');root.mkdir(parents=True,exist_ok=True)
keyfile=root/'notka-next.p12';passwordfile=root/'password.txt'
if keyfile.exists():
    if not passwordfile.exists():raise SystemExit('Key exists but password file is missing; key was not changed.')
    key,cert,_=pkcs12.load_key_and_certificates(keyfile.read_bytes(),passwordfile.read_bytes().strip())
else:
    if (Path(__file__).resolve().parents[1]/'app/src/main/assets/trust/native.der').exists():
        raise SystemExit('Public identity already exists. Restore the original private key; refusing to generate a replacement.')
    if passwordfile.exists():raise SystemExit('Incomplete signing setup; refusing to replace it.')
    key=rsa.generate_private_key(public_exponent=65537,key_size=3072)
    name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Notka Native'),x509.NameAttribute(NameOID.ORGANIZATION_NAME,'Notka')])
    now=datetime.datetime.now(datetime.timezone.utc)
    cert=x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-datetime.timedelta(days=1)).not_valid_after(now+datetime.timedelta(days=365*30)).sign(key,hashes.SHA256())
    password=secrets.token_urlsafe(40).encode()
    with passwordfile.open('xb') as f:f.write(password+b'\n')
    with keyfile.open('xb') as f:f.write(pkcs12.serialize_key_and_certificates(b'notka-next',key,cert,None,serialization.BestAvailableEncryption(password)))
    passwordfile.chmod(0o600);keyfile.chmod(0o600)
public=Path(__file__).resolve().parents[1]/'app/src/main/assets/trust/native.der';public.parent.mkdir(parents=True,exist_ok=True)
public.write_bytes(cert.public_bytes(serialization.Encoding.DER))
print('Separate Android signing identity ready. Public certificate SHA-256: '+cert.fingerprint(hashes.SHA256()).hex())
