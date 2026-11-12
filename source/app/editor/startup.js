restoreSourceStep();restoreSoundCatalog();renderLanes();resize();controls();
// Fixed personal library: no automatic remote catalogue requests.
window.addEventListener('pagehide',suspendEditor);
if(!trackHost)byId('status').textContent=panelHint;
else if(trackHost.restoreRequested()){showPrefs(false,byId('prefs'));byId('loadTrack').onclick();recoverDraft()}
