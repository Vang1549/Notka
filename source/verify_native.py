"""Check constructor-failure cleanup paths before assembling Android bytecode.

A throwing constructor leaves an uninitialized reference. Exception cleanup
must not use it as a stream (ART rejects such a class before it can launch).
This is a focused preflight, not a replacement for the Android verifier.
"""
from pathlib import Path

def constructor_cleanup_errors(source):
 methods=[];current=None
 for line_number,line in enumerate(source.splitlines(),1):
  parts=line.strip().split()
  if not parts or parts[0].startswith('#'):continue
  if parts[0]=='method':
   current={'name':parts[1],'guarded':'catch' in parts,'body':[]};methods.append(current)
  else:current['body'].append((line_number,parts[0],parts[1:]))
 errors=[]
 for method in methods:
  body=method['body'];labels={op[:-1]:i for i,(_,op,_) in enumerate(body) if op.endswith(':')}
  if not method['guarded']:continue
  handler=labels['error'];begin=labels.get('tryStart',0)
  for at,(line,op,args) in enumerate(body):
   if not(begin<=at<handler and op=='direct' and ':<init>:' in args[0]):continue
   # The receiver remains uninitialized if this invokespecial throws.
   queue=[(handler,frozenset([int(args[1])]))];seen=set()
   while queue:
    pc,tainted=queue.pop()
    if not tainted or pc>=len(body) or (pc,tainted) in seen:continue
    seen.add((pc,tainted));ln,operation,a=body[pc];tainted=set(tainted)
    if operation in ['virtual','interface','static','super','direct']:
     used=tainted.intersection(map(int,a[1:]))
     if used:errors.append((method['name'],line,ln,sorted(used)));break
    if operation in ['ret','retobj','arraylen','cast','putwide'] and tainted.intersection(map(int,a[1:2] if operation=='arraylen' else a[:1] if operation in ['ret','retobj','cast'] else a)):
     errors.append((method['name'],line,ln,sorted(tainted)));break
    if operation in ['done','ret','retobj']:continue
    if operation=='moveobj':
     dest,src=map(int,a);copied=src in tainted;tainted.discard(dest)
     if copied:tainted.add(dest)
    elif operation in ['exception','resultobj','result','resultw','str','const','high','new','array','arraylen']:
     tainted.discard(int(a[0]))
     if operation=='resultw':tainted.discard(int(a[0])+1)
    target=frozenset(tainted)
    if operation in ['zero','negative','ne','lt','goto']:queue.append((labels[a[-1]],target))
    if operation!='goto':queue.append((pc+1,target))
 return errors

def check_native(path='host.ops'):
 errors=constructor_cleanup_errors(Path(path).read_text())
 if errors:raise ValueError('Unsafe uninitialized object in exception cleanup: '+repr(errors))

if __name__=='__main__':
 import sys
 check_native(sys.argv[1] if len(sys.argv)>1 else 'host.ops')
 print('PASS native constructor exception cleanup')
