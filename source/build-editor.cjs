// Shared lexical scope preserves the editor's existing initialization order.
// Source modules stay readable; the delivered runtime is minified once.
const fs=require('node:fs'),path=require('node:path'),{minify}=require('terser');
const root=path.join(__dirname,'app/editor');
function source(eager=false){
 const modules=JSON.parse(fs.readFileSync(path.join(root,'modules.json'),'utf8'));
 return modules.map(name=>(eager&&name==='startup.js'?fs.readFileSync(path.join(root,'scene-renderer.js'),'utf8'):'')+fs.readFileSync(path.join(root,name),'utf8')).join('');
}
function shell(){return fs.readFileSync(path.join(root,'shell.html'),'utf8')}
function development(){return shell().replace('<!-- EDITOR_STYLE -->',()=>'<style>'+fs.readFileSync(path.join(root,'editor.css'),'utf8')+'</style>').replace('<!-- EDITOR_RUNTIME -->',()=>'<script>'+source(true)+'</script>')}
async function build(){
 fs.writeFileSync(path.join(__dirname,'app/index.html'),development());
 const out=path.join(__dirname,'.native-build/editor');fs.mkdirSync(out,{recursive:true});
 // Keep cross-module/public names; local names and expressions can be reduced.
 const packed=await minify(source(),{ecma:2020,compress:{passes:2},mangle:{toplevel:false},format:{comments:false}});
 fs.writeFileSync(path.join(out,'runtime.js'),packed.code);
 const renderer=await minify(fs.readFileSync(path.join(root,'scene-renderer.js'),'utf8'),{ecma:2020,compress:{passes:2},mangle:true});
 fs.writeFileSync(path.join(out,'scene-renderer.js'),renderer.code);
 fs.copyFileSync(path.join(root,'editor.css'),path.join(out,'editor.css'));
 fs.writeFileSync(path.join(out,'index.html'),shell().replace("style-src 'unsafe-inline'; script-src 'unsafe-inline'","style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'").replace('<!-- EDITOR_STYLE -->','<link rel="stylesheet" href="editor.css">').replace('<!-- EDITOR_RUNTIME -->','<script src="runtime.js"></script>'));
 fs.copyFileSync(path.join(__dirname,'app/media-export.bundle.js'),path.join(out,'media-export.js'));
 fs.copyFileSync(path.join(__dirname,'node_modules/mediabunny/LICENSE'),path.join(out,'MEDIABUNNY-LICENSE.txt'));
 console.log('Editor source modules assembled; media exporter remains demand-loaded.');
}
module.exports={source,development};
if(require.main===module)build().catch(e=>{console.error(e);process.exitCode=1});
