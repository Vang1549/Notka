const {boot}=require('./test-instruments.cjs'),assert=require('assert/strict');
let now=0,serial=0;const timers=new Map();
const t=boot(false,{}, {setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id},clearTimeout(id){timers.delete(id)}}),r=t.run;
function advance(ms){now+=ms;for(const [id,v]of timers)if(v.at<=now){timers.delete(id);v.fn()}}
const row=i=>t.els.ghostChoices.children[i],name=i=>row(i).children[1],down=el=>el.onpointerdown({clientX:50,clientY:50,pointerId:1,button:0,isPrimary:true});
t.els.editLane.onclick();t.els.addLane.onclick();assert.equal(r('lanes.length'),2);
// A tap selects and dismisses the rack; it does not rename.
let el=name(0);down(el);advance(200);el.onpointerup();el.onclick();assert.equal(r('activeLane'),0);assert(t.els.laneSheet.hidden);assert(t.els.laneRename.hidden);
t.els.editLane.onclick();el=name(1);down(el);advance(999);assert(t.els.laneRename.hidden);advance(1);assert(!t.els.laneRename.hidden);assert.equal(r('activeLane'),1);el.onpointerup();el.onclick();assert(!t.els.laneSheet.hidden);
t.els.laneName.oninput({target:{value:'Мелодия'}});r('notkaBack()');assert(t.els.laneRename.hidden);assert(!t.els.laneSheet.hidden);assert.equal(name(1).textContent,'Мелодия');assert.equal(JSON.parse((t.run('flushDraft(true)'),t.draft)).lanes[1].name,'Мелодия');
// Drag, cancellation, closing and backgrounding never leave a pending rename.
for(const cancel of [el=>el.onpointermove({clientX:50,clientY:75}),el=>el.onpointercancel(),()=>r('closeLane()'),()=>r('suspendEditor()')]){
 t.els.editLane.onclick();el=name(0);down(el);cancel(el);advance(1100);assert(t.els.laneRename.hidden);
}
t.els.editLane.onclick();el=name(0);down(el);el.onpointermove({clientX:50,clientY:75});el.onclick();assert.equal(r('activeLane'),1);assert(!t.els.laneSheet.hidden);
// Row-specific instrument choice and Back preserve the containing rack.
row(0).children[0].onclick();assert.equal(r('activeLane'),0);assert(!t.els.instrumentSheet.hidden);assert(!t.els.laneSheet.hidden);
r("const extra=addProjectInstrument('lib-mda-grand-1');assignProjectInstrument(extra.id)");assert.equal(r('lanes[0].instrument'),'lib-mda-grand-1');assert.equal(r('lanes[1].instrument'),'vsco-piano-1');r('notkaBack()');assert(t.els.instrumentSheet.hidden);assert(!t.els.laneSheet.hidden);assert.match(row(0).children[0].attrs['aria-label'],/Grand Piano/);
const background=row(0).children[2].children[0];background.checked=true;background.onchange();assert.equal(background.className,'deferred');assert(!r('isBackground(lanes[0])'));name(1).onclick();assert(r('isBackground(lanes[0])'));
// Keyboard rename and delete require explicit confirmation.
t.els.editLane.onclick();name(1).onkeydown({key:'F2',preventDefault(){}});t.els.deleteLane.onclick();r('notkaBack()');assert(t.els.laneDeleteConfirm.hidden);assert(!t.els.laneRename.hidden);t.els.deleteLane.onclick();t.els.confirmLane.onclick();assert.equal(r('lanes.length'),1);assert.equal(r('lanes[0].instrument'),'lib-mda-grand-1');
console.log('PASS tap selection, 1s hold, scrolling/cancellation/background, rename persistence, row instrument assignment, layered Back, deferred background and confirmed deletion.');
