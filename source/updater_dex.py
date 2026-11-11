"""Assemble the small Android WebView host and its fixed-origin download bridge."""
import hashlib,struct,zlib
from pathlib import Path

def u32(n): return struct.pack('<I',n)
def words(*values): return struct.pack('<'+'H'*len(values),*values)
def leb(n):
    out=bytearray()
    while n>=128:
        out.append((n&127)|128);n>>=7
    out.append(n);return bytes(out)

T=dict(Main='Lstudio/notka/piano/Main;',Activity='Landroid/app/Activity;',Web='Landroid/webkit/WebView;',Settings='Landroid/webkit/WebSettings;',Bundle='Landroid/os/Bundle;',View='Landroid/view/View;',String='Ljava/lang/String;',Object='Ljava/lang/Object;',Context='Landroid/content/Context;',DM='Landroid/app/DownloadManager;',Request='Landroid/app/DownloadManager$Request;',Query='Landroid/app/DownloadManager$Query;',Cursor='Landroid/database/Cursor;',Uri='Landroid/net/Uri;',Intent='Landroid/content/Intent;',IS='Ljava/io/InputStream;',Resolver='Landroid/content/ContentResolver;',Digest='Ljava/security/MessageDigest;',B64='Landroid/util/Base64;',Long='Ljava/lang/Long;',Bytes='[B',Longs='[J',JS='Landroid/webkit/JavascriptInterface;',Output='Ljava/io/ByteArrayOutputStream;',Ex='Ljava/lang/Exception;')
T.update(KeyFactory='Ljava/security/KeyFactory;',KeySpec='Ljava/security/spec/KeySpec;',X509Key='Ljava/security/spec/X509EncodedKeySpec;',PublicKey='Ljava/security/PublicKey;',Signature='Ljava/security/Signature;')
T.update(Out='Ljava/io/OutputStream;',Closeable='Ljava/io/Closeable;')
T.update(Player='Lstudio/notka/piano/Player;',Legacy='Lstudio/notka/piano/PlayerLegacy;',System='Ljava/lang/System;',Class='Ljava/lang/Class;',Field='Ljava/lang/reflect/Field;')
T.update(File='Ljava/io/File;',Atomic='Landroid/util/AtomicFile;',FileOut='Ljava/io/FileOutputStream;')
T.update(Downloads='Landroid/provider/MediaStore$Downloads;',Uris='Landroid/content/ContentUris;',Values='Landroid/content/ContentValues;',Integer='Ljava/lang/Integer;',Cancel='Landroid/os/CancellationSignal;',Strings='[Ljava/lang/String;',Json='Lorg/json/JSONObject;',JsonArray='Lorg/json/JSONArray;',FileInput='Ljava/io/FileInputStream;')
T.update(ZipFile='Ljava/util/zip/ZipFile;',Enumeration='Ljava/util/Enumeration;')
T.update(ZipInput='Ljava/util/zip/ZipInputStream;',ZipEntry='Ljava/util/zip/ZipEntry;',ByteInput='Ljava/io/ByteArrayInputStream;')
def typ(name): return T.get(name,name)
def method(s):
    owner,name,ret,*args=s.split(':')
    return (typ(owner),name,typ(ret),tuple(map(typ,args)))
def mkdex(origin):
    source=Path('host.ops').read_text().replace('@ORIGIN@',origin)
    definitions={}; literals=set(); types={typ('JS'),typ('Ex')}; refs=set()
    for line in source.splitlines():
        tokens=line.strip().split()
        if not tokens or tokens[0].startswith('#'):continue
        op,*args=tokens
        if op=='str':args=[args[0],' '.join(args[1:])]
        if op=='method':
            m=method(args[0]);registers=int(args[1]);exposed='bridge' in args;guarded='catch' in args
            body=[];definitions[m]=(registers,exposed,guarded,body);refs.add(m)
        else:
            if op in ('virtual','direct','static','super','interface'):refs.add(method(args[0]))
            if op in ('new','cast','array'):types.add(typ(args[-1]))
            if op=='str':literals.add(args[1])
            body.append((op,args))
    for cls,name,ret,args in refs:types.update([cls,ret,*args])
    types=sorted(types);ti=types.index
    protos=sorted({m[2:] for m in refs},key=lambda p:(ti(p[0]),tuple(map(ti,p[1]))))
    def short(r,args):return ''.join(t if len(t)==1 else 'L' for t in (r,*args))
    strings=sorted(literals|set(types)|{m[1] for m in refs}|{short(*p) for p in protos})
    si=strings.index
    methods=sorted(refs,key=lambda m:(ti(m[0]),si(m[1]),protos.index(m[2:])))
    mi=methods.index
    s0=112;t0=s0+4*len(strings);p0=t0+4*len(types);m0=p0+12*len(protos);c0=m0+8*len(methods);data0=c0+96
    data=bytearray()
    def pos():return data0+len(data)
    def add(b):
        addr=pos();data.extend(b);return addr
    def align():data.extend(bytes(-pos()%4))
    sections=[(0,1,0),(1,len(strings),s0),(2,len(types),t0),(3,len(protos),p0),(5,len(methods),m0),(6,3,c0),(0x2002,len(strings),data0)]
    strids=b''.join(u32(add(leb(len(s))+s.encode('ascii')+b'\0')) for s in strings)
    lists={}
    for args in (args for _,args in protos):
        if args and args not in lists:
            align();lists[args]=add(u32(len(args))+words(*map(ti,args)))
    sections.append((0x1001,len(lists),min(lists.values())))
    annotation=add(b'\x01'+leb(ti(typ('JS')))+b'\x00')
    sections.append((0x2004,1,annotation));align();aset=add(u32(1)+u32(annotation));sections.append((0x1003,1,aset))
    classes=[typ('Main'),typ('Player'),typ('Legacy')]
    directories={}
    for cls in classes:
        annotated=sorted(mi(m) for m,v in definitions.items() if v[1] and m[0]==cls)
        if annotated:
            align();directories[cls]=add(struct.pack('<4I',0,0,len(annotated),0)+b''.join(u32(i)+u32(aset) for i in annotated))
    sections.append((0x2006,len(directories),min(directories.values())))
    codes={}
    for m,(registers,exposed,guarded,body) in definitions.items():
        ins=1+sum(2 if t in ('J','D') else 1 for t in m[3]);outs=0
        code=[];labels={};patches=[]
        for op,a in body:
            if op.endswith(':'):labels[op[:-1]]=len(code);continue
            if op in ('virtual','super','direct','static','interface'):
                opcode={'virtual':0x6e,'super':0x6f,'direct':0x70,'static':0x71,'interface':0x72}[op]
                target=method(a[0]);regs=list(map(int,a[1:]));n=len(regs);outs=max(outs,n)
                assert all(0<=r<registers for r in regs)
                assert n==int(op!='static')+sum(2 if t in ('J','D') else 1 for t in target[3]),(op,a)
                if n>5:
                    assert n<=255 and regs==list(range(regs[0],regs[0]+n))
                    code.extend([opcode+6|(n<<8),mi(target),regs[0]])
                    continue
                assert all(r<16 for r in regs)
                code.extend([opcode|(n<<12)|((regs[4] if n==5 else 0)<<8),mi(target),sum(r<<(4*i) for i,r in enumerate(regs[:4]))])
            elif op in ('str','new','cast','const'):
                r=int(a[0]);v=a[1]
                idx=si(v) if op=='str' else (int(v)&65535 if op=='const' else ti(typ(v)))
                code.extend([{'str':0x1a,'new':0x22,'cast':0x1f,'const':0x13}[op]|r<<8,idx])
            elif op=='high':code.extend([0x15|int(a[0])<<8,int(a[1])])
            elif op=='arraylen':code.append(0x21|int(a[0])<<8|int(a[1])<<12)
            elif op=='moveobj':code.append(0x07|int(a[0])<<8|int(a[1])<<12)
            elif op=='array':code.extend([0x23|int(a[0])<<8|int(a[1])<<12,ti(typ(a[2]))])
            elif op=='putwide':code.extend([0x4c|int(a[0])<<8,int(a[1])|int(a[2])<<8])
            elif op in ('zero','negative','goto','ne','lt'):
                addr=len(code);patches.append((addr,a[-1]))
                r=0 if op=='goto' else int(a[0]);r|=int(a[1])<<4 if op in ('ne','lt') else 0
                code.extend([{'zero':0x38,'negative':0x3a,'goto':0x29,'ne':0x33,'lt':0x34}[op]|r<<8,0])
            else:
                opcode={'result':0x0a,'resultw':0x0b,'resultobj':0x0c,'exception':0x0d,'done':0x0e,'ret':0x0f,'retobj':0x11}[op]
                code.append(opcode|((int(a[0]) if a else 0)<<8))
        for addr,label in patches:code[addr+1]=(labels[label]-addr)&65535
        align();raw=struct.pack('<4H2I',registers,ins,outs,int(guarded),0,len(code))+words(*code)
        if guarded:
            end=labels['error']
            raw+=bytes((len(code)%2)*2)+struct.pack('<IHH',labels.get('tryStart',0),end-labels.get('tryStart',0),1)+b'\x01\x01'+leb(ti(typ('Ex')))+leb(end)
        codes[m]=add(raw)
    sections.append((0x2001,len(codes),min(codes.values())))
    classdata={}
    for cls in classes:
        own=[m for m in definitions if m[0]==cls]
        direct=[m for m in own if m[1]=='<init>'];virtual=sorted((m for m in own if m not in direct),key=mi)
        cd=b'\0\0'+leb(len(direct))+leb(len(virtual))
        for group in (direct,virtual):
            last=0
            for m in group:
                idx=mi(m);access=0x10001 if m[1]=='<init>' else 4 if m[1]=='onCreate' else 1
                cd+=leb(idx-last)+leb(access)+leb(codes[m]);last=idx
        classdata[cls]=add(cd)
    sections.append((0x2000,len(classes),min(classdata.values())))
    align();maps=pos();sections.append((0x1000,1,maps))
    add(u32(len(sections))+b''.join(struct.pack('<HHII',t,0,n,o) for t,n,o in sections))
    head=b'dex\n035\0'+bytes(24)+struct.pack('<20I',pos(),112,0x12345678,0,0,maps,len(strings),s0,len(types),t0,len(protos),p0,0,0,len(methods),m0,3,c0,len(data),data0)
    b=bytearray(head+strids+b''.join(u32(si(t)) for t in types)+b''.join(struct.pack('<3I',si(short(r,a)),ti(r),lists.get(a,0)) for r,a in protos)+b''.join(struct.pack('<HHI',ti(c),protos.index((r,a)),si(n)) for c,n,r,a in methods)+b''.join(struct.pack('<8I',ti(cls),1,ti(typ('Player') if cls==typ('Legacy') else typ('Activity')),0,0xffffffff,directories.get(cls,0),classdata[cls],0) for cls in classes)+data)
    b[12:32]=hashlib.sha1(b[32:]).digest();b[8:12]=u32(zlib.adler32(b[12:]));return b
