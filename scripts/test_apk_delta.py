import io,zipfile
from apk_delta import create,apply

def archive(change):
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w') as z:
  z.writestr('unchanged',bytes(range(256))*100)
  z.writestr('changed',change)
 return out.getvalue()
old,new=archive(b'old'),archive(b'new version');patch=create(old,new)
assert apply(old,patch)==new and len(patch)<len(new)//4
for base,delta in [(b'wrong',patch),(old,patch[:-1]),(old,patch+b'trailing')]:
 try:apply(base,delta)
 except (ValueError,KeyError):pass
 else:raise AssertionError('Invalid delta accepted')
print('PASS release delta reconstructs exact APK and rejects wrong base, truncation and trailing data.')
