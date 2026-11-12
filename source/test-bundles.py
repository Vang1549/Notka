import subprocess,os,shutil
from pathlib import Path
java=os.environ.get('NOTKA_JAVA') or shutil.which('java')
cp='.native-tools/android.jar'
subprocess.run([java,'-jar','.native-tools/ecj.jar','-source','8','-target','8','-warn:none','-encoding','UTF-8','-classpath',cp,'-d','.native-build/bundle-tests','native/studio/notka/piano/EditorStore.java','native-tests/studio/notka/piano/EditorStoreTest.java'],check=True)
subprocess.run([java,'-cp','.native-build/bundle-tests'+os.pathsep+cp,'studio.notka.piano.EditorStoreTest'],check=True)
from updater_dex import mkdex
blob=mkdex('https://raw.githubusercontent.com/Vang1549/Notka/main/dist')
ops=Path('host.ops').read_text()
launch=ops.split('method Main:startEditor:',1)[1].split('method ',1)[0]
assert 'EditorStore;:prepare:String:Context:String 7 8' in launch
assert 'str 1 editionToken' in launch and 'str 1 edition\n' not in launch
print('PASS native file transport assembled; legacy editors also launch via file token.')
