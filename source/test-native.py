from pathlib import Path
from verify_native import constructor_cleanup_errors,check_native
# Each constructor failure must leave the cleanup-owned stream null. Assign it
# only after successful initialization, as in compiler-generated Java bytecode.
for slot,temp,kind in [(0,5,'FileOut'),(0,4,'FileInput'),(1,5,'FileOut')]:
 method=f'''method Player:regression:Z 8 catch
const {slot} 0
tryStart:
new {slot} {kind}
direct {kind}:<init>:V:File {slot} 2
const 3 1
ret 3
error:
exception 2
zero {slot} failed
virtual Player:closeResource:V:Closeable 7 {slot}
failed:
const 3 0
ret 3
'''
 assert constructor_cleanup_errors(method),kind
 fixed=method.replace(f'new {slot} {kind}\ndirect {kind}:<init>:V:File {slot} 2',f'new {temp} {kind}\ndirect {kind}:<init>:V:File {temp} 2\nmoveobj {slot} {temp}')
 assert not constructor_cleanup_errors(fixed),kind
check_native()
# The full fixed host must preserve all previously exposed Android bridges.
from updater_dex import mkdex
blob=mkdex('https://notka-piano-updates.zentas.chatgpt.site')
for name in ['openEditor','onCreate','writeDraft','openSong','finishExport','instrumentData','soundRead','deleteSong','readBankStream']:
 assert (name+'\0').encode() in blob
print('PASS native regression: three invalid cleanup paths rejected; initialized stream paths and host assembly accepted.')

# Orientation changes reuse both editor activities and never recreate the WebView.
ops=Path('host.ops').read_text().split('method Player:setSceneMode:V:Z 3 bridge catch',1)[1].split('method ',1)[0]
assert 'const 0 -1' in ops and 'const 0 6' in ops and 'zero 2 apply' in ops
assert 'virtual Activity:setRequestedOrientation:V:I 1 0' in ops
assert b'setSceneMode\0' in blob and b'setRequestedOrientation\0' in blob
print('PASS landscape bridge and default orientation restoration assembled.')

back=Path('host.ops').read_text().split('method Player:onBackPressed:V 4 catch',1)[1].split('method ',1)[0]
assert "if(typeof notkaBack==='function')notkaBack();else NotkaPlayer.leave()" in back
assert 'virtual Web:evaluateJavascript:V:String:Landroid/webkit/ValueCallback; 0 1 2' in back
assert 'super Activity:onBackPressed:V 3' in back
assert b'onBackPressed\0' in blob
print('PASS native Back dispatch with legacy fallback assembled.')

# Media export uses the existing bounded atomic writer with explicit container MIME types.
ops=Path('host.ops').read_text()
assert '(mid|zip|wav|m4a|weba|webm|mp4|ogg)' in ops
for mime in ['audio/wav','audio/mp4','audio/webm','audio/ogg','video/mp4','video/webm']:
 assert mime in ops
assert 'method Player:mediaExportScript:String 3 bridge catch' in ops
assert 'EditorStore;:media:String:Activity' in ops
assert 'virtual View:setKeepScreenOn:V:Z 0 1' in ops
assert b'mediaExportScript\0' in blob
print('PASS fixed media asset bridge, media suffix/MIME allowlist and foreground keep-screen-on.')

# Offline muxing patches container headers in a fixed temporary export file.
writer=ops.split('method Player:writeExport:Z:I:String 10 bridge catch',1)[1].split('method ',1)[0]
for instruction in ['negative 8 failed','high 1 4095','high 2 1','virtual File:exists:Z 1','virtual Ljava/io/RandomAccessFile;:seek:V:J 0 3 4','virtual Ljava/io/RandomAccessFile;:write:V:Bytes 0 2']:
 assert instruction in writer
assert b'writeExport\0' in blob
player=ops.split('method Player:onCreate:',1)[1].split('method ',1)[0]
assert 'EditorStore;:load:V:Activity:Web:String 7 0 3' in player
assert 'https://appassets.androidplatform.net/notka/' in Path('native/studio/notka/piano/EditorStore.java').read_text()
assert 'virtual Settings:setBlockNetworkLoads:V:Z' in player
print('PASS bounded random-access media bridge, HTTPS local origin and file-based editor loading.')
