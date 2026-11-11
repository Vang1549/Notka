"""Run after node test-export.cjs. Requires the independent mido MIDI parser."""
import io,zipfile,wave,mido
m=mido.MidiFile('/tmp/notka-export.mid',charset='utf8')
assert m.type==1 and m.ticks_per_beat==960 and len(m.tracks)==3
assert m.tracks[0][1].type=='set_tempo' and m.tracks[0][1].tempo==600000
assert m.tracks[1].name=='Правая' and m.tracks[2].name=='Левая'
for i,t in enumerate(m.tracks[1:]):
 time=0;notes=[]
 for e in t:
  time+=e.time
  if e.type in ('note_on','note_off'):notes.append((time,e.type,e.channel,e.note,e.velocity))
 assert notes[0][0]==480 and notes[0][2]==i
 if i==0:
  assert [x[1] for x in notes if x[0]==960]==['note_off','note_on']
  assert notes[2][4]==64
assert len(mido.MidiFile('/tmp/notka-export-muted.mid').tracks)==4
many=mido.MidiFile('/tmp/notka-export-15.mid');channels={msg.channel for track in many.tracks for msg in track if msg.type=='note_on'}
assert len(many.tracks)==16 and channels==set(range(16))-{9}
with zipfile.ZipFile('/tmp/notka-export.zip') as z:
 assert z.testzip() is None and z.read('Русское имя.txt').decode()=='Тест'
 with wave.open(io.BytesIO(z.read('test.wav'))) as w:
  assert w.getnframes()==320 and w.getframerate()==32000 and w.getsampwidth()==2
print('PASS independent MIDI, ZIP CRC/UTF-8, WAV headers and sample counts.')
