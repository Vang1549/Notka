from pathlib import Path
import argparse,json,subprocess,wave
import numpy as np
import imageio_ffmpeg
parser=argparse.ArgumentParser(description='Check media produced by NativeIntegrationTest (NumPy and imageio-ffmpeg required).')
parser.add_argument('directory',type=Path)
root=parser.parse_args().directory
with wave.open(str(root/'piano.wav')) as f:
    rate=f.getframerate();channels=f.getnchannels();samples=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').reshape(-1,channels)/32768
assert rate==48000 and channels==2 and np.isfinite(samples).all() and np.max(np.abs(samples))<=.95
report={'sample_rate':rate,'channels':channels,'seconds':len(samples)/rate,'peak':float(np.max(np.abs(samples))),'rms':float(np.sqrt(np.mean(samples*samples))),'notes':[]}
for start,pitch in [(0,60),(.5,64),(1,67)]:
    segment=samples[int((start+.04)*rate):int((start+.35)*rate)].mean(axis=1)
    spectrum=np.abs(np.fft.rfft(segment*np.hanning(len(segment)),131072));frequencies=np.fft.rfftfreq(131072,1/rate)
    expected=440*2**((pitch-69)/12);window=(frequencies>expected*.96)&(frequencies<expected*1.04)
    actual=frequencies[np.where(window)[0][spectrum[window].argmax()]]
    cents=1200*np.log2(actual/expected);assert abs(cents)<20,(pitch,actual,cents)
    assert float(np.sqrt(np.mean(segment*segment)))>.001
    report['notes'].append({'midi':pitch,'frequency':float(actual),'cents':float(cents)})
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
report['decoded_files']=[]
for filename in ['audio.m4a','scene.mp4','background.mp4','opus.ogg','webm-audio.webm','webm.webm','preview.mp3']:
    result=subprocess.run([ffmpeg,'-v','error','-i',str(root/filename),'-f','null','-'],capture_output=True)
    assert result.returncode==0,result.stderr.decode()
    report['decoded_files'].append(filename)
subprocess.run([ffmpeg,'-y','-v','error','-ss','0.15','-i',str(root/'scene.mp4'),'-frames:v','1',str(root/'video-frame.png')],check=True)
(root/'analysis.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
