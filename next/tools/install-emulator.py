"""Optional isolated Android test device; does not use or change personal AVDs."""
import hashlib,json,zipfile,shutil
from pathlib import Path,PurePosixPath
root=Path('D:/Tools/Notka/next');sdk=root/'android-sdk';repo=Path(__file__).resolve().parents[1]
for item in json.loads((repo/'emulator-downloads.json').read_text()):
    archive=root/'downloads'/item['file'];stamp=root/('installed-'+item['package'].replace(';','-')+'.json')
    if stamp.exists() or not archive.exists():continue
    assert hashlib.sha1(archive.read_bytes()).hexdigest()==item['sha1']
    target=sdk/item['package'].replace(';','/');target.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        roots={PurePosixPath(info.filename).parts[0] for info in z.infolist() if not info.is_dir()}
        for info in z.infolist():
            parts=PurePosixPath(info.filename).parts
            if len(roots)==1:parts=parts[1:]
            if not parts:continue
            assert '..' not in parts and not PurePosixPath(info.filename).is_absolute()
            path=target.joinpath(*parts)
            if info.is_dir():path.mkdir(parents=True,exist_ok=True)
            else:
                path.parent.mkdir(parents=True,exist_ok=True)
                with z.open(info) as source,path.open('wb') as output:shutil.copyfileobj(source,output)
    stamp.write_text(json.dumps({'package':item['package'],'sha1':item['sha1']}));print('Installed '+item['package'],flush=True)
if (sdk/'system-images/android-35/default/x86_64/system.img').exists():
    avds=root/'avd';device=avds/'Notka35.avd';device.mkdir(parents=True,exist_ok=True)
    (avds/'Notka35.ini').write_text(f'avd.ini.encoding=UTF-8\npath={device}\ntarget=android-35\n')
    config={'AvdId':'Notka35','avd.ini.displayname':'Notka Android 35','PlayStore.enabled':'false','abi.type':'x86_64','tag.id':'default','tag.display':'Default','image.sysdir.1':str(sdk/'system-images/android-35/default/x86_64')+'\\','hw.cpu.arch':'x86_64','hw.cpu.ncore':'4','hw.ramSize':'3072','disk.dataPartition.size':'4G','hw.lcd.width':'1080','hw.lcd.height':'1920','hw.lcd.density':'420','hw.gpu.enabled':'yes','hw.gpu.mode':'swiftshader_indirect','hw.keyboard':'yes','hw.audioInput':'no','hw.audioOutput':'no','showDeviceFrame':'no','skin.dynamic':'yes','fastboot.forceColdBoot':'yes'}
    (device/'config.ini').write_text(''.join(f'{k}={v}\n' for k,v in config.items()));print('Isolated Notka35 device configured.',flush=True)
for name in ['adb.exe','AdbWinApi.dll','AdbWinUsbApi.dll']:
    source=Path('D:/Tools/Android/platform-tools')/name
    if source.exists():shutil.copyfile(source,sdk/'platform-tools'/name)
