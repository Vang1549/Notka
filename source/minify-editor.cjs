// Preserve public names and native bridge entry points when packing the editor.
const fs=require('node:fs');
const {minify}=require('terser');
// Edition 54+ may shorten this fixed set of private implementation names.
// All other top-level bindings (including the native sourceResume bridge) stay intact.
const internalNames=new Set(('pitchName visibleInstrumentIds legacyInstruments normalizeInstrument instrumentIcons instrumentIconPrograms paintInstrumentMark soundDefaults soundBounds addProjectInstrument sourceUsed builtinPresence remoteAlternatives floeId saveSourceStep restoreSourceStep sourceVisibility builtinAvailable downloadableInstrument instrumentReferences availableInstrument authorLink importReadError renderMissingSounds laneViews laneFlag renderLaneFlags syncLaneSheet audioFail instrumentError decodeInstrumentBank silenceVoice reverseBuffers createInstrumentVoice auditionVariants catalogError catalogKey verifySound mergeSoundCatalog shippedSoundCatalog restoreSoundCatalog soundMessage fetchSound instrumentGroups instrumentGroup normalizeInstrumentSearch instrumentSearchAliases showInstrumentView renderProjectInstruments soundFields syncSoundEditor soundPage clampY paintSoon fill barStart pitchAt firstStartingAt paintCursor showVolume updateGrid spans beginPinch applyPinch endContact cancelContact sceneDefaults palettes sceneBounds sceneChoices sceneLooks sceneRGBA sceneRound renderSceneColors syncSceneControls refreshScenePreview drawScenePreview crcTable').split(' '));
// Extra private names are shortened only in edition 57+, preserving older packing.
if(process.argv.includes('--presets'))for(const name of ('sampleHost importHost sourceAway importJob importedMusicbox master generation instrumentLoads previewSerial instrumentRequest catalogHost catalogJob catalogStarted bankJob editingInstrument instrumentView lowestPitch pitchCount lastPaint initialized copyNoteLength edgeFrame clearSelection selectedNotes blocks removeNotes lastNoteTap selectRegion finishGesture sceneFrame prefReturn scenePreviewLayout sceneColorKey showPrefs syncLoopButton applySceneLoop endScene beginScene drawScene leaveStage trackHost songHost panelHint draftTimer trackStarted pendingTrack readNotes trackMessage recoverDraft trackActions importTrack pendingSongDelete folderHint songUpdateHint renderSongs tempoInput setTempo instrumentInk suspendEditor exportHost exportJob exportBase exportRate exportLimit joinBytes numberBytes midiVar crcUpdate exportCheck exportWrite renderWave exportBusy exportMusic scenePresets presetReady presetAction presetMessage cancelPresetAction renderScenePresets presetButtons readScenePresets writeScenePresets confirmPresetAction').split(' '))internalNames.add(name);
if(process.argv.includes('--refine'))for(const name of ['presetNaming','presetIndex','presetSnapshot','byId','PPQ'])internalNames.add(name);
(async()=>{
 const html=fs.readFileSync(0,'utf8'),match=html.match(/<script>([\s\S]*?)<\/script>/);
 if(!match)throw Error('Editor script not found');
 let source=match[1];
 // Edition 59+: share repeated literal strings, without touching keys or directives.
 if(process.argv.includes('--strings')){
  const tree=require('acorn').parse(source,{ecmaVersion:'latest'}),literals=new Map();
  function visit(n,parent,key){
   if(!n||typeof n!=='object')return;
   if(n.type==='Literal'&&typeof n.value==='string'&&!parent?.directive&&!(key==='key'&&!parent.computed)){
    const list=literals.get(n.value)||[];list.push(n);literals.set(n.value,list);
   }
   for(const [k,v] of Object.entries(n)){
    if(Array.isArray(v))v.forEach(child=>visit(child,n,k));else if(v&&typeof v==='object')visit(v,n,k);
   }
  }
  visit(tree);const values=[],edits=[];
  for(const [value,nodes] of literals){
   const cost=Buffer.byteLength(JSON.stringify(value));
   if((nodes.length-1)*cost-nodes.length*6-1<8)continue;
   const index=values.push(value)-1;for(const n of nodes)edits.push({start:n.start,end:n.end,text:'__notkaStrings['+index+']'});
  }
  for(const e of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.text+source.slice(e.end);
  const directives=tree.body.filter(n=>n.directive),at=directives.length?directives.at(-1).end:0;
  source=source.slice(0,at)+';const __notkaStrings='+JSON.stringify(values)+';'+source.slice(at);
  internalNames.add('__notkaStrings');
 }
 // Edition 64+: shorten function declarations; native/HTML entry points stay public.
 const navigation=process.argv.includes('--navigation'),nameCache={},functionNames=[];
 if(navigation)for(const name of ['draftPending','pendingLaneDelete'])internalNames.add(name);
 if(navigation)for(const n of require('acorn').parse(source,{ecmaVersion:'latest'}).body){
  if(n.type==='FunctionDeclaration'&&!['notkaBack','sourceResume'].includes(n.id.name)){internalNames.add(n.id.name);functionNames.push(n.id.name)}
 }
 if(process.argv.includes('--performance'))for(const name of ['instrumentById','isBackground','pixels','gridStep','minimum','sceneTravel','newLane','exportText']){internalNames.add(name);functionNames.push(name)}
 if(process.argv.includes('--media'))for(const name of ['instruments','highestPitch','downloadedInstruments','instrumentCache','instrumentSources','rulerHeight','pendingBuiltinData','keyWidth','rowIndexes','blockViews','ticks','snap','pitchAt','sharp','soundSettings','selectedNotes','crcUpdate','joinBytes','numberBytes','exportBase','sceneColorKey']){internalNames.add(name);functionNames.push(name)}
 if(process.argv.includes('--channels'))for(const name of ['laneHold'])internalNames.add(name);
 let mangle={toplevel:false};
 if(process.argv.includes('--internals')){
  const tree=require('acorn').parse(source,{ecmaVersion:'latest'});
  const names=tree.body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations.map(d=>d.id.name):n.id?[n.id.name]:[]).filter(Boolean);
  mangle={toplevel:true,reserved:names.filter(name=>!internalNames.has(name))};
 }
 const result=await minify(source,{...(navigation?{nameCache}:{}),ecma:2020,compress:process.argv.includes('--compact')?{passes:process.argv.includes('--refine')?2:1}:false,mangle,format:{comments:false,inline_script:true}});
 if(navigation&&process.env.NOTKA_EDITOR_MAP)fs.writeFileSync(process.env.NOTKA_EDITOR_MAP,JSON.stringify(Object.fromEntries(functionNames.map(n=>[n,nameCache.vars?.props['$'+n]]).filter(([,v])=>v))));
 let shell=html;
 if(process.argv.includes('--channels')){const at=shell.indexOf(match[0]);shell=shell.slice(0,at).replace(/="([a-zA-Z0-9_:-]+)"(?=[\s>])/g,'=$1')+shell.slice(at)}
 process.stdout.write(shell.replace(match[0],()=>'<script>'+result.code+'</script>'));
})().catch(e=>{console.error(e);process.exitCode=1});
