const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),media=path.join(root,'vscode','media');
fs.mkdirSync(media,{recursive:true});
for(const file of ['index.html','style.css','app.js','renderer.js','pdf.js','desktop/ink-renderer.js','desktop/workspace.js','vendor/content.js','vendor/pdf-api.js','vendor/katex.min.css','vendor/highlight.min.css','vendor/pdf_viewer.css']){
  const destination=path.join(media,file);fs.mkdirSync(path.dirname(destination),{recursive:true});let data=fs.readFileSync(path.join(root,file));
  if(file==='index.html')data=Buffer.from(data.toString().replace('<script src="desktop/bridge.js"></script>','').replace('<script src="desktop/files.js"></script>',''));
  if(file==='pdf.js')data=Buffer.from(data.toString().replaceAll('location.href',"document.querySelector('#inkspace-assets').content").replace('async function openPdf(asset){','async function openPdf(asset){await window.inkspacePdfWorkerReady;'));
  if(file==='app.js')data=Buffer.from(data.toString().replace("brush:hasNativeInk()?'xournal':'raw-contour'","brush:'xournal'"));
  if(file==='renderer.js')data=Buffer.from(data.toString().replace("if(active.s.brush==='raw-contour'){paintRawInk();return}","if(active.s.brush==='xournal'){clearLayer(inkLayers[1]);clearLayer(inkLayers[2]);inkLayers[1].ctx.fillStyle=active.s.color;inkLayers[1].ctx.fill(new Path2D(InkContent.strokePath(active.s)));renderStats.livePaints++;return}if(active.s.brush==='raw-contour'){paintRawInk();return}"));
  fs.writeFileSync(destination,data);
}
// Copy the PDF worker, formula fonts and dependency licenses along with bundles.
for(const name of fs.readdirSync(path.join(root,'vendor'))){if(name==='fonts'||/worker|license|licenses|^pdf-/i.test(name))fs.cpSync(path.join(root,'vendor',name),path.join(media,'vendor',name),{recursive:true})}
for(const file of ['adapter.js','codium.css'])fs.copyFileSync(path.join(root,'vscode',file),path.join(media,file));
fs.copyFileSync(path.join(root,'LICENSE'),path.join(root,'vscode','LICENSE'));
console.log('Built VSCodium webview assets');
