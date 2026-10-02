const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),media=path.join(root,'vscode','media');
fs.mkdirSync(media,{recursive:true});
for(const file of ['index.html','style.css','app.js','renderer.js','pdf.js','desktop/bridge.js','desktop/ink-renderer.js','desktop/workspace.js','vendor/content.js','vendor/pdf-api.js','vendor/katex.min.css','vendor/highlight.min.css','vendor/pdf_viewer.css']){
  const destination=path.join(media,file);fs.mkdirSync(path.dirname(destination),{recursive:true});let data=fs.readFileSync(path.join(root,file));
  if(file==='index.html')data=Buffer.from(data.toString().replace('<script src="vendor/terminal.js"></script>','').replace('<script src="desktop/titlebar.js"></script>','').replace('<script src="desktop/explorer.js"></script>','').replace('<link rel="stylesheet" href="vendor/terminal.css">','').replace('<script src="desktop/files.js"></script>','').replace('<script src="desktop/workbench.js"></script>','').replace('<script src="vendor/text-editor.js"></script>','').replace('<link rel="stylesheet" href="vendor/text-editor.css">',''));
  if(file==='pdf.js')data=Buffer.from(data.toString().replaceAll('location.href',"document.querySelector('#inkspace-assets').content").replace('async function openPdf(asset){','async function openPdf(asset){await window.inkspacePdfWorkerReady;'));
  if(file==='app.js')data=Buffer.from(data.toString().replace("brush:hasNativeInk()?'xournal':'raw-contour'","brush:'xournal'"));
  if(file==='app.js')data=Buffer.from(data.toString().replace("inputSource:e.nativeInk?","inputSource:e.nativeFixture?'native-fixture':e.nativeBackend==='raw-hid'?'windows-raw-hid':e.nativeInk?"));
  if(file==='renderer.js')data=Buffer.from(data.toString().replace('dpr=window.devicePixelRatio||1;','dpr=window.inkspaceRasterDpr||window.devicePixelRatio||1;'));
  if(file==='desktop/ink-renderer.js')data=Buffer.from(data.toString().replace('nativeInk:{value:true},','nativeFixture:{value:!!packet.synthetic},nativeInk:{value:true},')+"\nduplicateBrowserPen=function(event){return event.pointerType==='pen'&&(!event.nativeInk||!event.nativePrecision)};\n");
  fs.writeFileSync(destination,data);
}
// Copy the PDF worker, formula fonts and dependency licenses along with bundles.
for(const name of fs.readdirSync(path.join(root,'vendor'))){if(name==='fonts'||/worker|license|licenses|^pdf-/i.test(name))fs.cpSync(path.join(root,'vendor',name),path.join(media,'vendor',name),{recursive:true})}
for(const file of ['adapter.js','codium.css','native-client.js','native-render-async.js','engine-client.js'])fs.copyFileSync(path.join(root,'vscode',file),path.join(media,file));
fs.copyFileSync(path.join(root,'LICENSE'),path.join(root,'vscode','LICENSE'));
fs.copyFileSync(path.join(root,'ink-engine','calibration.js'),path.join(media,'engine-calibration.js'));
console.log('Built VSCodium webview assets');
