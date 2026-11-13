(()=>{
'use strict';
function sceneRGBA(hex,a){const v=parseInt(hex.slice(1),16);return 'rgba('+[(v>>16)&255,(v>>8)&255,v&255,a].join(',')+')'}
function sceneRound(g,x,y,w,h,r){
 r=Math.max(0,Math.min(r,w/2,h/2));g.beginPath?.();g.moveTo(x+r,y);g.lineTo(x+w-r,y);g.quadraticCurveTo(x+w,y,x+w,y+r);g.lineTo(x+w,y+h-r);g.quadraticCurveTo(x+w,y+h,x+w-r,y+h);g.lineTo(x+r,y+h);g.quadraticCurveTo(x,y+h,x,y+h-r);g.lineTo(x,y+r);g.quadraticCurveTo(x,y,x+r,y);g.closePath();
}
const canvasCaches=new WeakMap();
function renderScene(canvas,s,now,mini=false){
 const g=canvas.getContext?.('2d'),width=canvas.clientWidth,height=canvas.clientHeight;
 if(!g||!s||width<1||height<1)return;
 const dpr=s.exporting?1:Math.min(options.quality,window.devicePixelRatio||1),cw=Math.round(width*dpr),ch=Math.round(height*dpr);
 if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch}
 g.setTransform(dpr,0,0,dpr,0,0);
 const bottom=height,keyH=Math.min(height*.3,Math.max(mini?18:36,height*options.keyboardHeight/100)),line=Math.max(20,bottom-keyH);
 const pad=mini?8:Math.min(24,width*.018),unit=(width-2*pad)/s.whites,travel=sceneTravel(),active=s.activeKeys||(s.activeKeys=new Map()),primary=palettes[options.palette][0];active.clear();
 // Magnifier is a uniform camera transform around the impact area. Keyboard layout,
 // note geometry and time remain unchanged; only the visible crop changes.
 let zoom=1;
 if(s.lensRange){
  const first=s.keys.get(s.lensRange[0]),last=s.keys.get(s.lensRange[1]);
  if(first&&last){
   const left=pad+(first.center-first.width/2)*unit,right=pad+(last.center+last.width/2)*unit;
   zoom=Math.max(1,width/(right-left));
   const tx=-zoom*left,ty=Math.max(height*(1-zoom),Math.min(0,height*.68-zoom*line));
   g.setTransform(dpr*zoom,0,0,dpr*zoom,dpr*tx,dpr*ty);
  }
 }
 const cacheKey=[cw,ch,dpr,line,keyH,pad,unit,zoom].join('/');let cache=canvasCaches.get(canvas);
 if(!cache||cache.key!==cacheKey||cache.context!==g){cache={key:cacheKey,context:g,gradients:new Map()};canvasCaches.set(canvas,cache)}
 const gradient=(key,make)=>{if(cache.gradients.has(key))return cache.gradients.get(key);const value=make();if(cache.gradients.size>=512)cache.gradients.delete(cache.gradients.keys().next().value);cache.gradients.set(key,value);return value};
 const glow=options.glow?options.glowAmount/100:0;
 g.fillStyle=options.background;g.fillRect(0,0,width,height);
 if(options.backdrop==='aurora'){
  const wash=gradient('aurora/'+options.palette,()=>{const v=g.createRadialGradient(width*.3,line,0,width*.3,line,width*.8);v.addColorStop(0,sceneRGBA(primary,.13));v.addColorStop(.5,sceneRGBA(palettes[options.palette][1],.045));v.addColorStop(1,sceneRGBA(primary,0));return v});g.fillStyle=wash;g.fillRect(0,0,width,line);
 }
 if(options.backdrop==='stars')for(let i=1;i<54;i++){
  const sx=((i*137.509)%97)/97*width,sy=((i*i*13.27)%89)/89*line;
  g.fillStyle='rgba(210,225,255,'+(.06+.12*(.5+.5*Math.sin(i+now*.35)))+')';g.fillRect(sx,sy,i%7===0?1.5:1,1);
 }
 if(options.guides)for(const [p,k] of s.keys)if(!k.black){g.fillStyle=p%12===0?'#bcd4f011':'#bcd4f006';g.fillRect(pad+(k.center-.5)*unit,0,1,line)}
 g.save();g.beginPath();g.rect(pad,0,width-2*pad,line);g.clip();
 const visible=sceneVisible(s,now);let particles=0,litNotes=0;
 for(const n of visible){
  const key=s.keys.get(n.pitch);if(!key)continue;
  const ink=sceneColor(n);if(ink==='transparent')continue;
  const cx=pad+key.center*unit,geo=sceneNoteGeometry(n,now,s.sec,line,travel),age=geo.age;
  if(geo.held&&n.volume>0&&(!active.has(n.pitch)||active.get(n.pitch).v<n.volume))active.set(n.pitch,{ink,v:n.volume});
  if(age<0&&geo.bottom<0)continue;
  if(geo.held&&options.rays>0&&n.volume>0){
   const rh=line*.48,ray=gradient('ray/'+ink+'/'+options.rays,()=>{const v=g.createLinearGradient(0,line-rh,0,line);v.addColorStop(0,sceneRGBA(ink,0));v.addColorStop(1,sceneRGBA(ink,options.rays/360));return v});g.fillStyle=ray;
   g.beginPath();g.moveTo(cx-unit*1.2,line-rh);g.lineTo(cx+unit*1.2,line-rh);g.lineTo(cx+unit*.45,line);g.lineTo(cx-unit*.45,line);g.closePath();g.fill();
  }
  if(geo.bottom>0&&geo.top<line&&n.start+n.len>now/s.sec){
   const bw=Math.max(2,unit*options.noteWidth/100*(key.black?.64:1)),bx=cx-bw/2,top=Math.max(-bw,geo.top),bh=Math.max(1,geo.bottom-top),r=bw*options.roundness/100;
   if(options.trails>0){const length=Math.min(line*.2,20+options.trails*.6),trail=g.createLinearGradient(0,top-length,0,top+3);trail.addColorStop(0,sceneRGBA(ink,0));trail.addColorStop(1,sceneRGBA(ink,options.trails/500));g.fillStyle=trail;g.fillRect(bx,top-length,bw,length)}
   const glowThis=glow>0&&litNotes++<100;if(glowThis){g.shadowColor=ink;g.shadowBlur=Math.min(18,bw*.8)*glow*zoom}
   const alpha=.48+.0052*n.volume;
   if(options.noteStyle==='glass'){
    const glass=gradient('glass/'+[bx,bw,ink,alpha].join('/'),()=>{const v=g.createLinearGradient(bx,0,bx+bw,0);v.addColorStop(0,sceneRGBA(ink,.7*alpha));v.addColorStop(.35,sceneRGBA(ink,alpha));v.addColorStop(1,sceneRGBA(ink,.62*alpha));return v});g.fillStyle=glass;
   }else g.fillStyle=sceneRGBA(ink,options.noteStyle==='neon'?.12:alpha*.88);
   sceneRound(g,bx,top,bw,bh,r);g.fill();g.shadowBlur=0;
   g.strokeStyle=sceneRGBA(ink,options.noteStyle==='neon'?.95:.65);g.lineWidth=options.noteStyle==='neon'?1.5:.7;g.stroke();
   if(options.noteStyle==='glass'&&bw>5&&bh>5){g.strokeStyle='#ffffff44';g.lineWidth=.7;sceneRound(g,bx+1.5,top+1.5,bw-3,bh-3,Math.max(0,r-1));g.stroke()}
  }
  if(age>=0&&age<.85&&n.volume>0){
   const phase=age/.85;
   if(options.rings>0){g.strokeStyle=sceneRGBA(ink,(1-phase)*options.rings/150);g.lineWidth=1;g.beginPath();g.ellipse(cx,line,unit*(.3+phase*1.6),3+phase*12,0,Math.PI,Math.PI*2);g.stroke()}
   if(options.sparks){
    const count=Math.round(options.sparkAmount/8);
    for(let i=0;i<count&&particles<160;i++,particles++){
     const seed=(i*2.399+n.pitch*.73+(n.lane||0)*1.7),dx=Math.sin(seed)*(14+i*4)*phase,dy=(24+Math.abs(Math.cos(seed))*60)*phase-20*phase*phase;
     g.fillStyle=sceneRGBA(ink,(1-phase)*.8);g.beginPath();g.arc(cx+dx,line-dy,mini?.6:1+i%2*.35,0,Math.PI*2);g.fill();
    }
   }
  }
 }
 g.restore();
 const shape=[line,keyH,pad,unit].join('/'),rebuild=s.shape!==shape;s.shape=shape;
 // A slim dark keybed and individually rounded keys replace the heavy block keyboard.
 g.fillStyle='#03060c';sceneRound(g,pad-2,line-1,width-pad*2+4,keyH+5,4);g.fill();
 for(const black of [false,true]){
  const kh=black?keyH*.62:keyH,ivory=gradient('ivory/'+black,()=>{const v=g.createLinearGradient(0,line,0,line+kh);v.addColorStop(0,black?'#283343':'#d7e0e8');v.addColorStop(.12,black?'#141d2c':'#f4f7f8');v.addColorStop(1,black?'#080c14':'#bdc9d5');return v});
  for(const [p,k] of s.keys){
   if(k.black!==black)continue;
   const kw=Math.max(1,unit*k.width-1),kx=pad+unit*k.center-unit*k.width/2,a=active.get(p),round=Math.min(3,unit*.1);
   if(typeof Path2D==='function'){if(rebuild||!k.path){k.path=new Path2D();sceneRound(k.path,kx,line,kw,kh,round)}}
   g.fillStyle=ivory;if(k.path)g.fill(k.path);else{sceneRound(g,kx,line,kw,kh,round);g.fill()}
   if(a&&options.keyLights){const light=gradient('light/'+a.ink+'/'+black,()=>{const v=g.createLinearGradient(0,line,0,line+kh);v.addColorStop(0,sceneRGBA(a.ink,.95));v.addColorStop(.4,sceneRGBA(a.ink,black?.6:.65));v.addColorStop(1,sceneRGBA(a.ink,.1));return v});g.fillStyle=light;if(k.path)g.fill(k.path);else{sceneRound(g,kx,line,kw,kh,round);g.fill()}}
   if(black){g.fillStyle='#ffffff0d';g.fillRect(kx+2,line+3,Math.max(0,kw-4),2)}
   if((!mini||s.audition)&&options.keyLabels!=='none'&&(options.keyLabels==='all'||p%12===0)&&unit>(black?28:18)){
    g.fillStyle=black?'#98a6b9':'#536175';g.font=Math.min(11,unit*.32)+'px system-ui,sans-serif';g.textAlign='center';g.fillText(pitchName(p),kx+kw/2,line+kh-7);
   }
  }
 }
 if(glow){g.shadowColor=primary;g.shadowBlur=(8+12*glow)*zoom}
 g.fillStyle=sceneRGBA(primary,.35+glow*.5);g.fillRect(pad,line-1,width-2*pad,1.5);g.shadowBlur=0;
 for(const [p,a] of active){const k=s.keys.get(p);if(!k)continue;const cx=pad+k.center*unit;g.fillStyle=a.ink;if(glow){g.shadowColor=a.ink;g.shadowBlur=14*glow*zoom}g.fillRect(cx-unit*.35,line-1,unit*.7,2);g.shadowBlur=0}
 if(!mini&&!s.exporting&&byId('stageHud').dataset.hidden!=='true'){
  const fade=gradient('fade/'+options.background,()=>{const v=g.createLinearGradient(0,0,0,72);v.addColorStop(0,sceneRGBA(options.background,.9));v.addColorStop(1,sceneRGBA(options.background,0));return v});g.fillStyle=fade;g.fillRect(0,0,width,72);
 }
}
window.NotkaSceneRenderer=renderScene;
})();
