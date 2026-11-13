"""Key migration preserves old signatures and rejects tampering/unrelated keys."""
import base64,json,os,tempfile
from pathlib import Path
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import padding,rsa
from editor_channel import sign
from signing_identity import load_signing_key,verify_envelope

key=load_signing_key();current=sign({'kind':'notka.test','value':'new identity'},key)
verify_envelope(current)
legacy=json.loads(Path('../dist/editions/71.json').read_text());verify_envelope(legacy)
for original in [current,legacy]:
    changed=dict(original,record=original['record']+' ')
    try:verify_envelope(changed)
    except ValueError:pass
    else:raise AssertionError('Tampered record accepted')
foreign=rsa.generate_private_key(public_exponent=65537,key_size=2048)
try:verify_envelope(sign({'kind':'untrusted'},foreign))
except ValueError:pass
else:raise AssertionError('Unrelated key accepted')
old=os.environ.get('NOTKA_SIGNING_KEY')
with tempfile.TemporaryDirectory() as directory:
    candidate=Path(directory)/'wrong.pem'
    candidate.write_bytes(foreign.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
    os.environ['NOTKA_SIGNING_KEY']=str(candidate)
    try:
        try:load_signing_key()
        except ValueError:pass
        else:raise AssertionError('Mismatching signing identity accepted')
        os.environ['NOTKA_SIGNING_KEY']=str(candidate.with_name('missing.pem'))
        try:load_signing_key()
        except FileNotFoundError:pass
        else:raise AssertionError('Missing key silently replaced')
    finally:
        if old is None:os.environ.pop('NOTKA_SIGNING_KEY',None)
        else:os.environ['NOTKA_SIGNING_KEY']=old
print('PASS current and legacy signatures, tamper/unrelated-key rejection, key/certificate matching and no automatic key replacement.')
