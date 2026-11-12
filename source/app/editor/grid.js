const roll=byId('roll'),keys=byId('keys'),notes=byId('notes'),ruler=byId('ruler');
const keyWidth=32,rulerHeight=32;
const lowestPitch=24,highestPitch=119; // До1 (C1) — Си8 (H8).
const pitchCount=highestPitch-lowestPitch+1;
let row=34;
let lastPaint="";
let x=0,y=0,col=40,cols=0,rows=0,w=0,h=0,initialized=false,frame=0;
function clampY(value){return Math.max(0,Math.min(value,pitchCount*row-h))}
function paintSoon(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;paint()})}
function fill(layer,count,click){
 while(layer.children.length>count)layer.lastElementChild.remove();
 if(layer.children.length===count)return;
 const fragment=document.createDocumentFragment();
 for(let i=layer.children.length;i<count;i++){
  const el=document.createElement('button');el.className='tile';
  el.onclick=e=>{if(e.detail===0)click(el)};
  fragment.append(el);
 }
 layer.append(fragment);
}
const PPQ=960,bar=4*PPQ;
let templateNote=null,copyNoteLength=false;
let noteDivision=0,viewDivision=0;
const divisions=[0,1,2,3,4,6,8,12,16];
let division=4,selected=null,gesture=null,edgeFrame=0;
const selection=new Set();
function clearSelection(){selection.clear();selected=null}
const selectedNotes=()=>selected?(selection.has(selected)?[...selection]:[selected]):[];
const inspector=byId('inspector'),blocks=byId('blocks'),blockViews=new Map();
const gridStep=()=>PPQ/(viewDivision||division||4);
const minimum=()=>division?PPQ/division:1;
const pixels=t=>t*col/gridStep();
const ticks=px=>px*gridStep()/col;
const barStart=t=>Math.floor(t/bar)*bar;

const snap=t=>Math.max(0,Math.round(t/minimum())*minimum());
const pitchAt=py=>highestPitch-Math.floor((y+py-rulerHeight)/row);
function resize(){
 w=roll.clientWidth-keyWidth;h=roll.clientHeight-rulerHeight;
 if(w<=0||h<=0)return;
 if(!initialized){
  col=w/Math.max(4,Math.round(w/40));
  y=(highestPitch-66)*row-h/2;initialized=true;
 }
 y=clampY(y);
 if(pinch)beginPinch();
 paint();
}
// Per-pitch interval trees also find long notes containing many shorter notes.
const rowIndexes=new WeakMap();
function noteIndex(lane){
 let index=rowIndexes.get(lane.notes);
 if(!index){
  index=new Map();index.layers=new WeakMap();
  for(const note of lane.notes){
   let bucket=index.get(note.pitch);if(!bucket){bucket=[];index.set(note.pitch,bucket)}
   bucket.push({note,start:note.start,end:note.start+note.len});
  }
  for(const bucket of index.values()){
   bucket.sort((a,b)=>a.start-b.start);
   // Short notes remain visible over sustained notes; ties follow score order.
   bucket.slice().sort((a,b)=>(b.end-b.start)-(a.end-a.start)||a.start-b.start).forEach((e,i)=>index.layers.set(e.note,i+1));
   bucket.ends=new Float64Array(bucket.length*4);
   const build=(node,lo,hi)=>{if(hi-lo===1)return bucket.ends[node]=bucket[lo].end;const mid=(lo+hi)>>1;return bucket.ends[node]=Math.max(build(node*2,lo,mid),build(node*2+1,mid,hi))};
   build(1,0,bucket.length);
  }
  rowIndexes.set(lane.notes,index);
 }
 return index;
}
function queryNotes(bucket,from,to,visit,point=false){
 if(!bucket?.length)return false;
 const walk=(node,lo,hi)=>{
  if(bucket.ends[node]<=from||(point?bucket[lo].start>to:bucket[lo].start>=to))return false;
  if(hi-lo===1)return visit(bucket[lo])===true;
  const mid=(lo+hi)>>1;
  return walk(node*2,lo,mid)||walk(node*2+1,mid,hi);
 };
 return walk(1,0,bucket.length);
}
function firstStartingAt(bucket,time){
 let lo=0,hi=bucket.length;
 while(lo<hi){const mid=(lo+hi)>>1;if(bucket[mid].start<time)lo=mid+1;else hi=mid}return lo;
}
function visibleNotes(lane,top,rowsNeeded,draw){
 const index=noteIndex(lane);
 const from=ticks(x-7),to=ticks(x+w),moving=lane===lanes[activeLane]?gesture?.items:null;
 const movingNotes=new Set(moving?.map(item=>item.note));
 for(let r=Math.max(0,top-1);r<=Math.min(pitchCount-1,top+rowsNeeded);r++){
  queryNotes(index.get(highestPitch-r),from,to,e=>{if(!movingNotes.has(e.note))draw(e.note)});
 }
 if(moving)for(const item of moving)draw(item.note);
}
function setView(object,key,value){if(object[key]!==value)object[key]=value}
function labelView(el,text){if(el._label!==text){el._label=text;el.setAttribute('aria-label',text)}}
function paintCursor(){
 const ph=byId('playhead');ph.hidden=current<0;ph.style.left=(pixels(current)-x)+'px';
}
function paint(){
 if(!initialized)return;
 const columns=Math.ceil(w/col)+1,rowsNeeded=Math.min(pitchCount,Math.ceil(h/row)+1);
 if(cols!==columns||rows!==rowsNeeded){
  cols=columns;rows=rowsNeeded;lastPaint='';
  roll.style.setProperty('--cols',cols);
  fill(keys,rows,el=>preview(Number(el.dataset.pitch)));
  fill(ruler,cols,el=>seek(Number(el.dataset.tick)));
  fill(notes,rows*cols,el=>{const i=Array.prototype.indexOf.call(notes.children,el);tapCell((Math.floor(x/col)+i%cols)*gridStep(),highestPitch-Math.floor(y/row)-Math.floor(i/cols))});
 }
 if(roll._col!==col){roll._col=col;roll.style.setProperty('--col',col+'px')}if(roll._row!==row){roll._row=row;roll.style.setProperty('--row',row+'px')}
 const first=Math.floor(x/col),top=Math.floor(y/row),dx=first*col-x,dy=top*row-y;
 keys.style.transform='translateY('+dy+'px)';ruler.style.transform='translateX('+dx+'px)';notes.style.transform='translate('+dx+'px,'+dy+'px)';
 const stamp=[first,top,gridStep()].join('/');
 if(stamp!==lastPaint){
  lastPaint=stamp;
  for(let c=0;c<cols;c++){
   const tick=(first+c)*gridStep(),el=ruler.children[c],inBar=tick%bar;
   el.dataset.tick=tick;el.textContent=inBar===0?String(1+Math.floor(tick/bar)):(tick%PPQ===0?String(1+inBar/PPQ):'·');
   el.className='tile time'+(inBar===0?' bar':'')+(c===0?' start':'');
   el.setAttribute('aria-label','Перейти к такту '+(1+Math.floor(tick/bar))+', доля '+(1+inBar/PPQ));
  }
  for(let r=0;r<rows;r++){
   const pitch=highestPitch-top-r,key=keys.children[r],valid=pitch>=lowestPitch,sharp=valid&&names[pitch%12].includes('♯'),name=valid?pitchName(pitch):'';
   key.hidden=!valid;key.dataset.pitch=pitch;key.textContent=valid?['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][pitch%12]:'';key.dataset.octave=pitch%12===0?Math.floor(pitch/12)-1:'';key.setAttribute('aria-label',name);key.className='tile key'+(sharp?' sharp':'')+(pitch%12===0?' c':'');
   for(let c=0;c<cols;c++){
    const tick=(first+c)*gridStep(),el=notes.children[r*cols+c];
    setView(el,'hidden',!valid);setView(el,'className','tile'+(sharp?' sharp':'')+(tick%bar===0?' bar':(tick%PPQ===0?' beat':'')));
    labelView(el,name+', такт '+(Math.floor(tick/bar)+1));
   }
  }
 }
 setView(blocks.style,'transform','translate('+(-x)+'px,'+(-y)+'px)');
 const visible=new Set();
 for(const lane of lanes){
  const background=isBackground(lane);if(!background&&lane!==lanes[activeLane])continue;
  const def=instrumentById(lane.instrument||'vsco-piano-1'),layers=noteIndex(lane).layers;
  visibleNotes(lane,top,rowsNeeded,n=>{
   const left=pixels(n.start)-x,ntop=(highestPitch-n.pitch)*row-y+2,width=Math.max(6,pixels(n.len)-1);
   if(left+width<=0||left>=w||ntop+row<=0||ntop>=h)return;
   visible.add(n);
   let el=blockViews.get(n);if(!el){el=document.createElement('span');blocks.append(el);blockViews.set(n,el)}
   setView(el,'className',(background?'note-block ghost':'note-block')+(selected&&(n===selected||selection.has(n))?' active':''));setView(el.style,'left',pixels(n.start)+'px');setView(el.style,'top',((highestPitch-n.pitch)*row+2)+'px');setView(el.style,'width',width+'px');
   setView(el.style,'zIndex',String(background?0:selected&&(n===selected||selection.has(n))?lane.notes.length+2:layers.get(n)||1));
   paintInstrumentMark(el,def,width);
  });
 }
 for(const [n,el] of blockViews)if(!visible.has(n)){el.remove();blockViews.delete(n)}
 paintCursor();
 const picked=selectedNotes(),anchor=picked.find(n=>visible.has(n));
 inspector.classList.toggle('group',picked.length>1);
 byId('volumeToggle').setAttribute('aria-label',picked.length>1?'Громкость выбранных нот':'Громкость ноты');
 byId('deleteNote').setAttribute('aria-label',picked.length>1?'Удалить выбранные ноты':'Удалить выбранную ноту');
 inspector.hidden=!anchor||running||gesture?.mode==='select'||!!gesture?.moved;
 if(!inspector.hidden){
  const rect=roll.getBoundingClientRect(),ntop=rect.top+rulerHeight+(highestPitch-anchor.pitch)*row-y;
  const left=rect.left+keyWidth+Math.max(0,pixels(anchor.start)-x);
  inspector.style.left=Math.max(4,Math.min(left,window.innerWidth-inspector.offsetWidth-4))+'px';
  const above=ntop-inspector.offsetHeight-5;
  inspector.style.top=Math.max(4,Math.min(above<4?ntop+row+3:above,window.innerHeight-inspector.offsetHeight-4))+'px';
  byId('noteName').textContent=picked.length>1?'Нот: '+picked.length:pitchName(selected.pitch);
  byId('duration').textContent=picked.every(n=>n.len===selected.len)?Number((selected.len/PPQ).toFixed(3))+' уд.':'Разная длина';
  byId('volume').value=selected.volume;byId('volLabel').textContent=picked.every(n=>n.volume===selected.volume)?selected.volume+'%':'Разная';
 }
}
function controls(){
 const audible=lanes.some(lane=>!lane.muted&&lane.notes.length);
 byId('editLane').disabled=byId('addLane').disabled=running;
 byId('visualPlay').disabled=!audible||running;byId('play').disabled=!audible&&!running;byId('play').textContent=running?'■ Стоп':'▶ Играть';byId('playStart').disabled=!audible||running;
 const playLabel=running?'Остановить воспроизведение':'Играть с левого края сетки';
 byId('play').setAttribute('aria-label',playLabel);byId('play').title=playLabel;
 byId('minus').disabled=running||bpm<=40;byId('plus').disabled=running||bpm>=220;byId('bpm').disabled=running;if(document.activeElement!==byId('bpm'))byId('bpm').value=String(bpm);byId('stepMenu').disabled=running;
}
function hit(t,p){
 if(isBackground(lanes[activeLane]))return null;
 if(selected&&selected.pitch===p&&t>=selected.start&&t<selected.start+selected.len)return selected;
 const index=noteIndex(lanes[activeLane]);let found=null,layer=-1;
 queryNotes(index.get(p),t,t,entry=>{const rank=index.layers.get(entry.note);if(rank>layer){found=entry.note;layer=rank}},true);
 return found;
}
function overlap(start,len,pitch,except=null){
 return queryNotes(noteIndex(lanes[activeLane]).get(pitch),start,start+len,entry=>entry.note!==except);
}
function showVolume(open){
 byId('volumeRow').hidden=!open;byId('volumeToggle').setAttribute('aria-expanded',String(open));paintSoon();
}
byId('volumeToggle').onclick=()=>{if(selected)showVolume(byId('volumeRow').hidden)};
function selectNote(note){
 showVolume(false);
 if(!selected||!selection.has(note)){selection.clear();selection.add(note)}
 selected=templateNote=note;copyNoteLength=true;
 preview(note.pitch,note.volume);paintSoon();
}
function removeNotes(notes){
 const removing=new Set(notes);if(!removing.size)return;
 if(removing.has(templateNote))templateNote={len:templateNote.len,volume:templateNote.volume};
 let kept=0;for(const n of score)if(!removing.has(n))score[kept++]=n;
 score.length=kept;rowIndexes.delete(score);clearSelection();trackChanged();controls();paintSoon();
}
function removeNote(note){if(score.includes(note))removeNotes([note])}
function addNote(t,p){
 if(isBackground(lanes[activeLane]))return;
 const start=division?Math.floor(t/minimum())*minimum():snap(t);
 const volume=templateNote?.volume??100;
 const len=copyNoteLength&&templateNote?templateNote.len:noteDivision?PPQ/noteDivision:gridStep();
 if(overlap(start,len,p)){
  byId('status').textContent='Для этой длины здесь не хватает места. Выбери другую позицию.';
  return;
 }
 const note={start,len,pitch:p,volume};
 score.push(note);rowIndexes.delete(score);templateNote=note;clearSelection();
 byId('status').textContent='';trackChanged();preview(p,volume);controls();paintSoon();
}
function tapCell(t,p){if(running)return;const n=hit(t,p);if(n)selectNote(n);else addNote(t,p)}
function seek(t){if(!running){clearSelection();x=pixels(barStart(Math.max(0,t)));paintSoon()}}
byId('volume').oninput=e=>{if(selected){for(const n of selectedNotes())n.volume=Number(e.target.value);trackChanged(true);byId('volLabel').textContent=selected.volume+'%'}};
byId('volume').onchange=()=>{flushDraft();if(selected)preview(selected.pitch,selected.volume)};
byId('copyNotes').onclick=()=>{
 if(running||fileBusy||gesture||pinch||isBackground(lanes[activeLane]))return;
 const picked=selectedNotes();if(!picked.length)return;
 let first=Infinity,last=0;for(const n of picked){first=Math.min(first,n.start);last=Math.max(last,n.start+n.len)}
 const offset=last-first;
 if(!Number.isSafeInteger(last+offset)){byId('status').textContent='Копия выходит за пределы длины трека.';return}
 const copies=picked.map(n=>({...n,start:n.start+offset})),anchor=copies[picked.indexOf(selected)]||copies[0];
 for(const n of copies)score.push(n);
 clearSelection();for(const n of copies)selection.add(n);selected=templateNote=anchor;copyNoteLength=true;lastNoteTap=null;
 const left=pixels(anchor.start);if(left<x||left>=x+w)x=Math.max(0,left-col);
 const top=(highestPitch-anchor.pitch)*row;if(top<y||top>=y+h)y=clampY(top-h/2);
 rowIndexes.delete(score);showVolume(false);byId('status').textContent='';trackChanged();controls();paintSoon();
};
byId('deleteNote').onclick=()=>removeNotes(selectedNotes());
byId('closeNote').onclick=()=>{flushDraft();clearSelection();paintSoon()};
function renderGridPreview(){
 const d=viewDivision||division||4,len=(copyNoteLength&&templateNote?templateNote.len:noteDivision?PPQ/noteDivision:gridStep())/PPQ;
 let svg='<svg viewBox="0 0 320 140" aria-hidden="true"><path fill="var(--panel)" d="M0 0h320v140H0z"/>';
 for(let r=0;r<5;r++)svg+='<rect x="30" y="'+(22+r*18)+'" width="280" height="18" fill="var(--'+(r%2?'black':'cell')+')"/><text x="14" y="'+(35+r*18)+'" text-anchor="middle" font-size="10" fill="var(--muted)">'+['G','F','E','D','C'][r]+'</text>';
 for(let i=0;i<=4*d;i++){const px=30+i*70/d;svg+='<path d="M'+px+' 22v90" stroke="var(--'+(i%d?'border':'line')+')"/>'}
 for(let i=0;i<=5;i++)svg+='<path d="M30 '+(22+i*18)+'h280" stroke="var(--border)"/>';
 for(let i=0;i<4;i++)svg+='<text x="'+(34+i*70)+'" y="15" font-size="10" fill="var(--muted)">'+(i+1)+'</text>';
 svg+='<rect x="31" y="60" width="'+Math.max(2,Math.min(4,len)*70-2)+'" height="14" rx="3" fill="var(--accent)"/>';
 const label=division?'Привязка: 1/'+division:'Без привязки';
 svg+='<text x="8" y="131" font-size="10" fill="var(--muted)">'+label+'</text>';
 const el=byId('gridPreview');el.innerHTML=svg+'</svg>';el.setAttribute('aria-label','Пример одного такта. Сетка: 1/'+d+'. '+label+'. Длина новой ноты: '+Number(len.toFixed(3))+' удара.');
}
function closeStep(){flushDraft();byId('stepSheet').hidden=true;byId('stepMenu').focus?.()}
byId('stepMenu').onclick=()=>{
 if(running)return;
 finishGesture(true);contacts.clear();pinch=null;
 renderGridPreview();byId('stepSheet').hidden=false;byId('closeStep').focus?.();
};
byId('closeStep').onclick=closeStep;
byId('noteSize').onchange=e=>{noteDivision=Number(e.target.value);copyNoteLength=false;renderGridPreview();trackChanged()};
function updateGrid(setting,value){
 const left=ticks(x);
 if(setting==='view')viewDivision=value;else division=value;
 x=pixels(left);renderGridPreview();trackChanged();paintSoon();
}
byId('snap').onchange=e=>updateGrid('snap',Number(e.target.value));
byId('gridDivision').onchange=e=>updateGrid('view',Number(e.target.value));
function point(e){const rect=roll.getBoundingClientRect();return {px:e.clientX-rect.left,py:e.clientY-rect.top}}
// Each pointer retains its own position even when Android changes the primary touch.
const contacts=new Map();
let pinch=null,lastNoteTap=null;
function spans(first,second){
 return {cx:(first.px+second.px)/2-keyWidth,cy:(first.py+second.py)/2-rulerHeight,
  sx:Math.abs(first.px-second.px),sy:Math.abs(first.py-second.py)};
}
function beginPinch(){
 const [a,b]=contacts.keys();
 const span=spans(contacts.get(a),contacts.get(b));
 // A nearly horizontal or vertical pair locks the other axis against finger jitter.
 pinch={a,b,span,col,row,colAtCenter:(x+span.cx)/col,rowAtCenter:(y+span.cy)/row,
  scaleX:span.sx>=Math.max(12,span.sy*.40),scaleY:span.sy>=Math.max(12,span.sx*.40)};
}
function applyPinch(){
 const g=pinch,now=spans(contacts.get(g.a),contacts.get(g.b));
 if(g.scaleX)col=Math.max(12,Math.min(160,g.col*now.sx/g.span.sx));
 if(g.scaleY)row=Math.max(16,Math.min(96,g.row*now.sy/g.span.sy));
 x=Math.max(0,g.colAtCenter*col-now.cx);
 y=clampY(g.rowAtCenter*row-now.cy);
 paintSoon();
}
function endContact(e){
 if(!contacts.delete(e.pointerId))return false;
 if(!pinch)return false;
 if(e.pointerId!==pinch.a&&e.pointerId!==pinch.b)return true;
 pinch=null;
 if(contacts.size>=2)beginPinch();
 else if(contacts.size===1){
  const [[id,pos]]=contacts;
  gesture={id,...pos,mx:pos.px,my:pos.py,x,y,mode:'pan',moved:true,n:null,originalTemplate:templateNote,originalCopyLength:copyNoteLength};
 }
 return true;
}
roll.oncontextmenu=e=>e.preventDefault();
roll.onpointerdown=e=>{
 if(e.button!==0||contacts.has(e.pointerId))return;
 const pos=point(e),previousTap=lastNoteTap;lastNoteTap=null;
 contacts.set(e.pointerId,pos);roll.setPointerCapture(e.pointerId);
 if(contacts.size>=2){
  if(!pinch){
   if(gesture){templateNote=gesture.originalTemplate;copyNoteLength=gesture.originalCopyLength;finishGesture(true)}
   if(selection.size<2)clearSelection();beginPinch();paintSoon();
  }
  return;
 }
 const {px,py}=pos,t=ticks(x+px-keyWidth),pitch=pitchAt(py);
 const inside=!running&&!isBackground(lanes[activeLane])&&px>=keyWidth&&py>=rulerHeight;
 let n=inside?hit(t,pitch):null;
 // A sub-pixel free note keeps the same selectable width as its drawn block.
 if(inside&&!n){
  const bucket=noteIndex(lanes[activeLane]).get(pitch)||[];
  for(let i=firstStartingAt(bucket,t-ticks(6));i<bucket.length&&bucket[i].start<=t;i++)
   if(pixels(t-bucket[i].start)<6)n=bucket[i].note;
 }
 const now=Date.now();
 const doubleTap=selection.size<2&&n&&previousTap?.note===n&&previousTap.score===score&&now-previousTap.time<=320&&Math.hypot(px-previousTap.px,py-previousTap.py)<=24;
 const g={id:e.pointerId,px,py,mx:px,my:py,x,y,n,mode:'tap',moved:false,downTime:now,doubleTap,originalTemplate:templateNote,originalCopyLength:copyNoteLength,previousSelection:selectedNotes(),previousSelected:selected};
 gesture=g;
 if(n){
  g.start=n.start;g.len=n.len;g.pitch=n.pitch;
  const width=Math.max(6,pixels(n.len)),fromEnd=width-pixels(t-n.start);
  g.mode=fromEnd<=Math.min(14,width*.35)?'resize':'move';
  selectNote(n);
  g.items=selectedNotes().map(note=>({note,start:note.start,len:note.len,pitch:note.pitch}));
 }else if(inside&&pitch>=lowestPitch&&pitch<=highestPitch){
  g.hold=setTimeout(()=>{if(gesture!==g||g.moved||contacts.size!==1)return;g.mode='select';lastNoteTap=null;showVolume(false);selectRegion(g)},350);
 }
};
function selectRegion(g){
 const ax=Math.max(0,g.x+g.px-keyWidth),ay=Math.max(0,g.y+g.py-rulerHeight),bx=Math.max(0,x+g.mx-keyWidth),by=Math.max(0,y+g.my-rulerHeight);
 const left=Math.min(ax,bx),right=Math.max(ax,bx),top=Math.min(ay,by),bottom=Math.max(ay,by),box=byId('selectionBox');
 box.hidden=false;box.style.left=left-x+'px';box.style.top=top-y+'px';box.style.width=Math.max(1,right-left)+'px';box.style.height=Math.max(1,bottom-top)+'px';
 selection.clear();
 const index=noteIndex(lanes[activeLane]);
 for(let p=Math.max(lowestPitch,highestPitch-Math.floor(bottom/row));p<=Math.min(highestPitch,highestPitch-Math.floor(top/row));p++){
  queryNotes(index.get(p),ticks(left-6),ticks(right),e=>{const n=e.note,ny=(highestPitch-p)*row+2;if(ny<bottom&&ny+row-4>top&&pixels(n.start)+Math.max(6,pixels(n.len)-1)>left)selection.add(n)});
 }
 selected=selection.values().next().value||null;paintSoon();
}
function edit(g){
 if(g.mode==='select'){selectRegion(g);return}
 let delta=Math.round(ticks(x-g.x+g.mx-g.px)/minimum())*minimum();
 const items=g.items;
 if(g.mode==='move'){
  delta=Math.max(delta,-items.reduce((m,n)=>Math.min(m,n.start),Infinity));
  const low=items.reduce((m,n)=>Math.min(m,n.pitch),highestPitch),high=items.reduce((m,n)=>Math.max(m,n.pitch),lowestPitch);
  const pitch=Math.max(lowestPitch-low,Math.min(highestPitch-high,-Math.round((y-g.y+g.my-g.py)/row)));
  for(const item of items){item.note.start=item.start+delta;item.note.pitch=item.pitch+pitch}
 }else{
  delta=Math.max(delta,items.reduce((m,n)=>Math.max(m,Math.min(n.len,minimum())-n.len),-Infinity));
  for(const item of items)item.note.len=item.len+delta;
 }
 paintSoon();
}
function edge(g){
 if(edgeFrame||!g.moved)return;
 const speed=(p,lo,hi)=>p<lo+14?-Math.min(10,(lo+14-p)*.35):p>hi-14?Math.min(10,(p-hi+14)*.35):0;
 const vx=speed(g.mx,keyWidth,keyWidth+w),vy=g.mode!=='resize'?speed(g.my,rulerHeight,rulerHeight+h):0;
 if((vx===0||vx<0&&x===0)&&(!vy||clampY(y+vy)===y))return;
 edgeFrame=requestAnimationFrame(()=>{edgeFrame=0;if(gesture!==g)return;x=Math.max(0,x+vx);y=clampY(y+vy);edit(g);edge(g)});
}
function move(e){
 const g=gesture;if(!g||e.pointerId!==g.id)return;
 const {px,py}=point(e);g.mx=px;g.my=py;const dx=px-g.px,dy=py-g.py;
 if(g.mode==='select'){g.moved=true;selectRegion(g);edge(g);return}
 if(!g.moved&&Math.hypot(dx,dy)<(g.mode==='resize'||g.mode==='move'?2:7))return;
 clearTimeout(g.hold);g.moved=true;
 if(g.mode==='move'||g.mode==='resize'){edit(g);edge(g);return}
 g.mode='pan';if(selection.size<2)clearSelection();
 if(g.px>=keyWidth&&!running)x=Math.max(0,g.x-dx);
 if(g.py>=rulerHeight)y=clampY(g.y-dy);
 paintSoon();
}
function finishGesture(cancelled=false){
 if(cancelled)lastNoteTap=null;
 const g=gesture;if(!g)return;
 clearTimeout(g.hold);if(edgeFrame)cancelAnimationFrame(edgeFrame);edgeFrame=0;gesture=null;byId('selectionBox').hidden=true;
 if(g.items){
  rowIndexes.delete(score);
  if(cancelled){for(const item of g.items)Object.assign(item.note,{start:item.start,len:item.len,pitch:item.pitch})}
  else if(g.items.some(i=>i.note.start!==i.start||i.note.len!==i.len||i.note.pitch!==i.pitch))trackChanged();
 }
 if(g.mode==='select'){
  if(cancelled){selection.clear();for(const n of g.previousSelection)selection.add(n);selected=g.previousSelected}
  else if(selected){templateNote=selected;copyNoteLength=true}
 }
 paintSoon();
}
roll.onpointermove=e=>{
 if(!contacts.has(e.pointerId))return;
 contacts.set(e.pointerId,point(e));
 if(pinch)applyPinch();else move(e);
};
roll.onpointerup=e=>{
 if(!contacts.has(e.pointerId))return;
 if(pinch){contacts.set(e.pointerId,point(e));applyPinch()}
 if(endContact(e))return;
 const g=gesture;if(!g||e.pointerId!==g.id)return;
 move(e);finishGesture();
 // Only two completed taps on the same note count; drags, holds and pinches do not.
 if(g.n&&selection.size<2&&!running&&!isBackground(lanes[activeLane])&&!g.moved&&Date.now()-g.downTime<=300){
  if(g.doubleTap){removeNote(g.n);lastNoteTap=null}
  else lastNoteTap={note:g.n,score,time:Date.now(),px:g.px,py:g.py};
  return;
 }
 if(g.mode!=='tap'||running)return;
 const t=ticks(x+g.px-keyWidth),p=pitchAt(g.py);
 if(p<lowestPitch&&g.py>=rulerHeight)return;
 if(g.px<keyWidth){if(g.py>=rulerHeight)preview(p)}
 else if(g.py<rulerHeight)seek(t);
 else if(g.previousSelection.length>1){clearSelection();paintSoon()}else addNote(t,p);
};
function cancelContact(e){
 if(!endContact(e)&&gesture?.id===e.pointerId)finishGesture(true);
}
roll.onpointercancel=cancelContact;
roll.onlostpointercapture=e=>{if(e.target===roll)cancelContact(e)};
roll.addEventListener('wheel',e=>{e.preventDefault();if(!running)x=Math.max(0,x+(e.shiftKey?e.deltaY:e.deltaX));if(!e.shiftKey)y=clampY(y+e.deltaY);paintSoon()},{passive:false});
