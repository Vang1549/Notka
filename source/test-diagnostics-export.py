import os,shutil,subprocess
from pathlib import Path
java=os.environ.get('NOTKA_JAVA') or shutil.which('java')
subprocess.run([java,'-jar','.native-tools/ecj.jar','-source','8','-target','8','-warn:none','-encoding','UTF-8','-d','.native-build/diagnostic-tests','native/studio/notka/piano/DiagnosticExport.java','native-tests/studio/notka/piano/DiagnosticExportTest.java'],check=True)
subprocess.run([java,'-cp','.native-build/diagnostic-tests','studio.notka.piano.DiagnosticExportTest'],check=True)
