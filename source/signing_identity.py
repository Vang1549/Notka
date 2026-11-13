"""Current signing identity and explicitly pinned legacy verification trust."""
import base64,os,binascii
from pathlib import Path
from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import padding

ROOT=Path(__file__).resolve().parent
def certificates():
    return [x509.load_der_x509_certificate(p.read_bytes()) for p in [ROOT/'signing.der',ROOT/'signing-legacy.der'] if p.exists()]

def verify_envelope(envelope):
    last=None
    for cert in certificates():
        try:
            cert.public_key().verify(base64.b64decode(envelope['signature'],validate=True),envelope['record'].encode(),padding.PKCS1v15(),hashes.SHA256())
            return
        except (ValueError,InvalidSignature,binascii.Error) as error:
            last=error
    raise ValueError('Signature does not match the current or pinned legacy identity') from last

def load_signing_key():
    configured=os.environ.get('NOTKA_SIGNING_KEY')
    local=ROOT/'signing.pem'
    path=Path(configured) if configured else local if local.exists() else Path('D:/Tools/Notka/keys/signing.pem' if os.name=='nt' else '/mnt/d/Tools/Notka/keys/signing.pem')
    if not path.is_file():raise FileNotFoundError('Original configured signing key is missing; no replacement key will be generated. Set NOTKA_SIGNING_KEY.')
    key=serialization.load_pem_private_key(path.read_bytes(),None)
    encoding=dict(encoding=serialization.Encoding.DER,format=serialization.PublicFormat.SubjectPublicKeyInfo)
    if key.public_key().public_bytes(**encoding)!=certificates()[0].public_key().public_bytes(**encoding):
        raise ValueError('Signing key does not match source/signing.der')
    return key
