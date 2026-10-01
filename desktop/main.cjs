const {app,BrowserWindow,protocol,net,ipcMain,dialog}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),smoke=process.argv.includes('--smoke-test'),verify=process.argv.includes('--verify-package');
const reportArgument=process.argv.find(value=>value.startsWith('--report-root='));
const reportRoot=reportArgument?path.resolve(reportArgument.slice('--report-root='.length)):process.cwd();
let win,currentFile=null,pendingFile=null;const acceptedFiles=new Set();
protocol.registerSchemesAsPrivileged([{scheme:'inkspace',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
if(smoke||verify)app.setPath('userData',path.join(reportRoot,'artifacts',smoke?'test-profile':'package-profile'));
const writes=new Map();
function atomicWrite(file,data){
  const operation=(writes.get(file)||Promise.resolve()).catch(()=>{}).then(async()=>{const temp=file+'.tmp';await fs.writeFile(temp,data,'utf8');await fs.rename(temp,file)});
  writes.set(file,operation);return operation;
}
app.whenReady().then(async()=>{
  protocol.handle('inkspace',request=>{
    const url=new URL(request.url),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(url.host!=='app'||!file.startsWith(root+path.sep))return new Response('Forbidden',{status:403});
    return net.fetch(pathToFileURL(file).href);
  });
  win=new BrowserWindow({width:1440,height:940,minWidth:860,minHeight:580,show:!smoke&&!verify,backgroundColor:'#f6f7f5',title:'墨境',titleBarStyle:'hidden',titleBarOverlay:{color:'#f3f3f3',symbolColor:'#333333',height:34},webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:!smoke&&!verify}});
  win.setMenuBarVisibility(false);
  const nativeInk=require('./native-ink.cjs')(win,ipcMain);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('inkspace://app/'))event.preventDefault()});
  win.webContents.session.setPermissionRequestHandler((wc,permission,callback)=>callback(false));
  const senderOK=event=>event.sender===win.webContents&&event.senderFrame.url.startsWith('inkspace://app/');
  require('./terminal.cjs')({win,ipcMain,senderOK,app});
  const validData=(event,data)=>{if(!senderOK(event)||typeof data!=='string'||data.length>150*1024*1024)throw Error('Invalid document');JSON.parse(data)};
  ipcMain.handle('document-new',event=>{if(senderOK(event)){currentFile=null;pendingFile=null;win.setTitle('墨境 · 未命名筆记')}});
  ipcMain.handle('document-open-accepted',event=>{if(senderOK(event)&&pendingFile){currentFile=pendingFile;acceptedFiles.add(currentFile);pendingFile=null;win.setTitle('墨境 · '+path.basename(currentFile))}});
  ipcMain.handle('document-activate',(event,file)=>{if(!senderOK(event)||file!==null&&!acceptedFiles.has(file))throw Error('文件尚未打开');currentFile=file;pendingFile=null;win.setTitle('墨境 · '+(file?path.basename(file):'未命名笔记'));return true});
  ipcMain.handle('document-current',event=>{if(!senderOK(event))throw Error('Invalid sender');return currentFile});
  ipcMain.handle('document-save',async(event,data,saveAs)=>{
    validData(event,data);let file=currentFile&&!/\.(md|markdown)$/i.test(currentFile)?currentFile:null;
    if(!file||saveAs){const choice=await dialog.showSaveDialog(win,{defaultPath:file||'笔记.inkspace.json',filters:[{name:'Inkspace JSON',extensions:['json']}]});if(choice.canceled)return null;file=choice.filePath}
    await atomicWrite(file,data);currentFile=file;acceptedFiles.add(file);win.setTitle('墨境 · '+path.basename(file));return file;
  });
  ipcMain.handle('document-open',async event=>{
    if(!senderOK(event))throw Error('Invalid sender');
    const choice=await dialog.showOpenDialog(win,{filters:[{name:'笔记和 Markdown',extensions:['json','md','markdown']}],properties:['openFile']});if(choice.canceled)return null;
    const file=choice.filePaths[0],stat=await fs.stat(file);if(stat.size>150*1024*1024)throw Error('File too large');
    const raw=await fs.readFile(file,'utf8'),result={data:raw.replace(/^\uFEFF/,''),file,kind:/\.(md|markdown)$/i.test(file)?'markdown':'notebook',bom:raw.startsWith('\uFEFF'),newline:raw.includes('\r\n')?'\r\n':'\n',revision:stat.mtimeMs+':'+stat.size};if(result.kind==='markdown'&&stat.size>10*1024*1024)throw Error('Markdown 超过 10 MB');pendingFile=file;folderApi.trackRead(result);return result;
  });
  const recovery=path.join(app.getPath('userData'),'recovery.json');await fs.mkdir(path.dirname(recovery),{recursive:true});
  if(smoke){
    const fixture=path.join(root,'artifacts','folder-fixture');await fs.mkdir(path.join(fixture,'子目录'),{recursive:true});
    await fs.writeFile(path.join(fixture,'阅读.md'),'\uFEFF# 文件夹预览\r\n\r\n$x^2$\r\n');
    await fs.writeFile(path.join(fixture,'子目录','子文件.md'),'# 子文件');
    await fs.writeFile(path.join(fixture,'note.inkspace.json'),JSON.stringify({format:'inkspace',version:1,strokes:[],shapes:[],pdfs:[],notes:[{id:'fixture',x:0,y:0,width:560,markdown:'# 文件夹笔记'}]}));
    await fs.writeFile(path.join(app.getPath('userData'),'folder.json'),JSON.stringify({root:fixture}));await fs.unlink(recovery).catch(()=>{});
  }
  const folderApi=await require('./folder-ipc.cjs')({ipcMain,dialog,win,app,senderOK,atomicWrite,onRead:file=>{pendingFile=file},getCurrent:()=>currentFile,setCurrent:file=>{currentFile=file;acceptedFiles.add(file);pendingFile=null;win.setTitle('墨境 · '+path.basename(file))}});
  ipcMain.handle('recovery-write',async(event,data)=>{validData(event,data);await atomicWrite(recovery,data);return true});
  ipcMain.handle('recovery-read',async event=>{if(!senderOK(event))return null;try{return await fs.readFile(recovery,'utf8')}catch{return null}});
  let closing=false;
  win.on('close',event=>{
    if(closing||smoke||verify)return;event.preventDefault();closing=true;
    win.webContents.executeJavaScript('finishInteraction();documentJSON()').then(data=>atomicWrite(recovery,data)).then(()=>win.destroy()).catch(error=>{closing=false;dialog.showErrorBox('自动恢复保存失败',error.message)});
  });
  await win.loadURL('inkspace://app/index.html');
  if(verify){
    const report=path.join(reportRoot,'artifacts','package-verification.json');
    try{
      const result=await win.webContents.executeJavaScript(`(async()=>{doc.notes=[{id:'package-test',x:0,y:0,width:560,markdown:'$x^2$'}];render();await document.fonts.ready;const fixture=await PdfApi.PDFDocument.create();fixture.addPage().drawText('Packaged PDF text');const task=PdfApi.getDocument({data:await fixture.save(),isEvalSupported:false});const pdf=await task.promise;const text=(await (await pdf.getPage(1)).getTextContent()).items.map(i=>i.str).join(' ');await task.destroy();await inkspaceTerminal.toggle(true);const terminalReady=inkspaceTerminal.isRunning();await desktop.terminalStop();await inkspaceTerminal.toggle(false);return{terminal:terminalReady,passed:terminalReady&&!!document.querySelector('.katex')&&text.includes('Packaged PDF text')&&desktop.inkStatus().cairo==='1.18.4'&&desktop.inkStatus().hooks>0,nativeInk:desktop.inkStatus(),formula:!!document.querySelector('.katex'),pdfText:text,bridge:!!window.desktop}})()`);
      await fs.writeFile(report,JSON.stringify(result,null,2));app.exit(result.passed?0:1);
    }catch(error){await fs.writeFile(report,JSON.stringify({passed:false,error:error.message}));app.exit(1)}return;
  }
  if(smoke){
    try{
      await win.webContents.executeJavaScript('Promise.all([document.fonts.ready,new Promise(r=>setTimeout(r,100))])');
      const result=await win.webContents.executeJavaScript(await fs.readFile(path.join(root,'tests','desktop-smoke.js'),'utf8'));
      result.textLayout=await win.webContents.executeJavaScript(await fs.readFile(path.join(root,'tests','text-layout-smoke.js'),'utf8'));
      await win.webContents.executeJavaScript('doc='+JSON.stringify(result.document)+';view={x:30,y:30,scale:.8};render();clearTimeout(toast.timer);document.querySelector("#toast").style.display="none"');
      result.workspace=await win.webContents.executeJavaScript(await fs.readFile(path.join(root,'tests','workspace-smoke.js'),'utf8'));
      result.noteInk=await win.webContents.executeJavaScript(await fs.readFile(path.join(root,'tests','note-ink-smoke.js'),'utf8'));
      await win.webContents.executeJavaScript('clearTimeout(toast.timer);document.querySelector("#toast").style.display="none"');
      await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await new Promise(r=>setTimeout(r,100));
      const noteShot=await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
      await fs.writeFile(path.join(root,'artifacts','note-ink-preview.png'),noteShot.toPNG());
      const dimensions=await win.webContents.executeJavaScript('({width:innerWidth,height:innerHeight})'),size=noteShot.getSize(),probe=result.noteInk.probe;
      const px=Math.round(probe.x*size.width/dimensions.width),py=Math.round(probe.y*size.height/dimensions.height),bitmap=noteShot.toBitmap(),pixel=[...bitmap.subarray((py*size.width+px)*4,(py*size.width+px)*4+4)];
      if(!(pixel[2]>150&&pixel[2]>pixel[1]*2&&pixel[2]>pixel[0]*1.5))throw Error('Ink hidden behind text: '+JSON.stringify(pixel));
      result.noteInk.compositorPixel=pixel;await win.webContents.executeJavaScript('restoreNoteInkTest()');
      result.folder=await win.webContents.executeJavaScript(await fs.readFile(path.join(root,'tests','folder-smoke.js'),'utf8'));
      result.textEditor=await win.webContents.executeJavaScript(await fs.readFile(path.join(root,'tests','text-editor-smoke.js'),'utf8'));
      result.terminal=await win.webContents.executeJavaScript(await fs.readFile(path.join(root,'tests','terminal-smoke.js'),'utf8'));
      result.pdfLifecycle=await win.webContents.executeJavaScript(await fs.readFile(path.join(root,'tests','pdf-lifecycle-smoke.js'),'utf8'));
      await fs.appendFile(path.join(root,'artifacts','folder-fixture','阅读.md'),'外部修改');
      result.folder.externalConflict=await win.webContents.executeJavaScript('(async()=>{const previous=activeDocumentTab;await activateTab(documentTabs.find(t=>t.md).id);const blocked=!await saveNotebook();await activateTab(previous);return blocked})()');
      if(!result.folder.externalConflict)throw Error('External Markdown modification overwritten');
      await win.webContents.executeJavaScript('clearTimeout(toast.timer);document.querySelector("#toast").style.display="none"');
      await new Promise(r=>setTimeout(r,400));await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await new Promise(r=>setTimeout(r,100));const screenshot=await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
      await fs.writeFile(path.join(root,'artifacts','desktop-preview.png'),screenshot.toPNG());delete result.document;
      const previousTab=await win.webContents.executeJavaScript('(async()=>{const previous=activeDocumentTab;await activateTab(documentTabs.find(t=>t.md).id);inkspaceWorkbench.setMarkdownMode("split");return previous})()');
      await new Promise(resolve=>setTimeout(resolve,200));await fs.writeFile(path.join(root,'artifacts','editor-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
      await win.webContents.executeJavaScript('inkspaceTerminal.toggle(true)');await new Promise(resolve=>setTimeout(resolve,600));await fs.writeFile(path.join(root,'artifacts','terminal-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());await win.webContents.executeJavaScript('(async()=>{await desktop.terminalStop();await inkspaceTerminal.toggle(false)})()');
        await win.webContents.executeJavaScript('activateTab('+JSON.stringify(previousTab)+')');
      result.emptyWorkspace=await win.webContents.executeJavaScript(await fs.readFile(path.join(root,'tests','empty-workspace-smoke.js'),'utf8'));
      await fs.writeFile(path.join(root,'artifacts','desktop-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.exit(result.passed&&result.bridge?0:1);
    }catch(error){console.error(error);app.exit(1)}
  }
}).catch(error=>{console.error(error);app.exit(1)});
app.on('window-all-closed',()=>app.quit());
