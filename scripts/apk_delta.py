"""Store only changed ZIP regions. Reconstructs the exact already-signed APK.

This is a release upload optimization; Android still downloads the complete APK.
No private signing key or build tool is needed on the publishing runner.
"""
import base64,hashlib,io,json,struct,zlib,zipfile
LIMIT=32*1024*1024
def sha(data):return hashlib.sha256(data).hexdigest()
def payload(raw,item):
    start=item.header_offset+30+sum(struct.unpack_from('<HH',raw,item.header_offset+26))
    return start,raw[start:start+item.compress_size]
def create(old,new):
    copies=[]
    with zipfile.ZipFile(io.BytesIO(old)) as before,zipfile.ZipFile(io.BytesIO(new)) as after:
        for item in after.infolist():
            if item.filename not in before.namelist():continue
            source,data=payload(old,before.getinfo(item.filename));target,changed=payload(new,item)
            if len(data)>1024 and data==changed:copies.append((target,source,len(data)))
    ops=[];at=0
    for target,source,size in sorted(copies):
        if target>at:ops.append(base64.b64encode(new[at:target]).decode())
        ops.append([source,size]);at=target+size
    if at<len(new):ops.append(base64.b64encode(new[at:]).decode())
    return zlib.compress(json.dumps(dict(format='notka.apk-delta.1',base=sha(old),sha256=sha(new),bytes=len(new),ops=ops),separators=(',',':')).encode(),9)
def apply(old,patch):
    decoder=zlib.decompressobj();raw=decoder.decompress(patch,LIMIT+1)
    if len(raw)>LIMIT or not decoder.eof or decoder.unused_data:raise ValueError('Invalid APK delta size')
    data=json.loads(raw)
    if data['format']!='notka.apk-delta.1' or sha(old)!=data['base'] or not 0<data['bytes']<=LIMIT:raise ValueError('Wrong APK delta base')
    result=bytearray()
    for op in data['ops']:
        if isinstance(op,str):chunk=base64.b64decode(op,validate=True)
        else:
            offset,size=op
            if not isinstance(offset,int) or not isinstance(size,int) or offset<0 or size<0 or offset+size>len(old):raise ValueError('Invalid copy region')
            chunk=old[offset:offset+size]
        if len(result)+len(chunk)>data['bytes']:raise ValueError('APK delta overflow')
        result.extend(chunk)
    if len(result)!=data['bytes'] or sha(result)!=data['sha256']:raise ValueError('Reconstructed APK checksum mismatch')
    return bytes(result)
