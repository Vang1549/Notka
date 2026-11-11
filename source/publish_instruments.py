"""Append immutable, signed instruments to the in-app catalogue (no APK/editor rebuild)."""
import argparse,base64,hashlib,json,re
from pathlib import Path
from cryptography.hazmat.primitives import serialization,hashes
from cryptography.hazmat.primitives.asymmetric import padding
p=argparse.ArgumentParser();p.add_argument('dist',type=Path);p.add_argument('source',type=Path);p.add_argument('id');p.add_argument('asset');p.add_argument('name');p.add_argument('short');p.add_argument('--demo',type=int,default=60);args=p.parse_args()
assert re.fullmatch(r'lib-[a-z0-9-]{1,43}',args.id) and re.fullmatch(r'bank-[a-z0-9-]{1,42}',args.asset)
assert 1<=len(args.name)<=48 and 1<=len(args.short)<=3 and 24<=args.demo<=119
key=serialization.load_pem_private_key(Path('signing.pem').read_bytes(),password=None)
compact=lambda x:json.dumps(x,ensure_ascii=True,separators=(',',':'))
def sign(data):
 record=compact(data);return compact({'record':record,'signature':base64.b64encode(key.sign(record.encode(),padding.PKCS1v15(),hashes.SHA256())).decode()})
out=args.dist/'soundbank';out.mkdir(exist_ok=True);catalog=out/'catalog.json'
data=json.loads(args.source.read_text());assert data['format']=='notka.instrument.1';data['id']=args.asset
signed=sign(data);assert len(signed)<8388608
file=out/(args.asset+'.json')
if file.exists():assert file.read_text()==signed,'An instrument release is immutable; use a new id and asset.'
entry={'id':args.id,'asset':args.asset,'name':args.name,'short':args.short,'gm':data['gmProgram'],'demo':args.demo,'revision':data['revision'],'bytes':len(signed),'sha256':base64.b64encode(hashlib.sha256(signed.encode()).digest()).decode()}
current={'kind':'notka.instruments.1','version':0,'instruments':[]}
if catalog.exists():
 env=json.loads(catalog.read_text());key.public_key().verify(base64.b64decode(env['signature']),env['record'].encode(),padding.PKCS1v15(),hashes.SHA256());current=json.loads(env['record'])
old=next((i for i in current['instruments'] if i['id']==args.id),None)
if old:assert old==entry,'Use a new id to change a published instrument.'
else:current['instruments'].append(entry);current['version']+=1
file.write_text(signed);stage=catalog.with_suffix('.tmp');stage.write_text(sign(current));stage.replace(catalog)
print(args.name,len(signed),'bytes; catalogue version',current['version'])
