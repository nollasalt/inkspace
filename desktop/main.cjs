const {app,BrowserWindow,protocol,net,ipcMain,dialog}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),smoke=process.argv.includes('--smoke-test'),verify=process.argv.includes('--verify-package');
const reportArgument=process.argv.find(value=>value.startsWith('--report-root='));
const reportRoot=reportArgument?path.resolve(reportArgument.slice('--report-root='.length)):process.cwd();
let win,currentFile=null,pendingFile=null;
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
  win=new BrowserWindow({width:1440,height:940,minWidth:860,minHeight:580,show:!smoke&&!verify,backgroundColor:'#f6f7f5',title:'墨境',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:!smoke&&!verify}});
  win.setMenuBarVisibility(false);
  const nativeInk=require('./native-ink.cjs')(win,ipcMain);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('inkspace://app/'))event.preventDefault()});
  win.webContents.session.setPermissionRequestHandler((wc,permission,callback)=>callback(false));
  const senderOK=event=>event.sender===win.webContents&&event.senderFrame.url.startsWith('inkspace://app/');
  const validData=(event,data)=>{if(!senderOK(event)||typeof data!=='string'||data.length>150*1024*1024)throw Error('Invalid document');JSON.parse(data)};
  ipcMain.handle('document-new',event=>{if(senderOK(event)){currentFile=null;pendingFile=null;win.setTitle('墨境 · 未命名筆记')}});
  ipcMain.handle('document-open-accepted',event=>{if(senderOK(event)&&pendingFile){currentFile=pendingFile;pendingFile=null;win.setTitle('墨境 · '+path.basename(currentFile))}});
  ipcMain.handle('document-save',async(event,data,saveAs)=>{
    validData(event,data);let file=currentFile;
    if(!file||saveAs){const choice=await dialog.showSaveDialog(win,{defaultPath:file||'笔记.inkspace.json',filters:[{name:'Inkspace JSON',extensions:['json']}]});if(choice.canceled)return null;file=choice.filePath}
    await atomicWrite(file,data);currentFile=file;win.setTitle('墨境 · '+path.basename(file));return file;
  });
  ipcMain.handle('document-open',async event=>{
    if(!senderOK(event))throw Error('Invalid sender');
    const choice=await dialog.showOpenDialog(win,{filters:[{name:'Inkspace JSON',extensions:['json']}],properties:['openFile']});if(choice.canceled)return null;
    const file=choice.filePaths[0],stat=await fs.stat(file);if(stat.size>150*1024*1024)throw Error('File too large');
    const data=await fs.readFile(file,'utf8');pendingFile=file;return{data,file};
  });
  const recovery=path.join(app.getPath('userData'),'recovery.json');await fs.mkdir(path.dirname(recovery),{recursive:true});
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
      const result=await win.webContents.executeJavaScript(`(async()=>{doc.notes=[{id:'package-test',x:0,y:0,width:560,markdown:'$x^2$'}];render();await document.fonts.ready;const fixture=await PdfApi.PDFDocument.create();fixture.addPage().drawText('Packaged PDF text');const task=PdfApi.getDocument({data:await fixture.save(),isEvalSupported:false});const pdf=await task.promise;const text=(await (await pdf.getPage(1)).getTextContent()).items.map(i=>i.str).join(' ');await task.destroy();return{passed:!!document.querySelector('.katex')&&text.includes('Packaged PDF text')&&desktop.inkStatus().cairo==='1.18.4'&&desktop.inkStatus().hooks>0,nativeInk:desktop.inkStatus(),formula:!!document.querySelector('.katex'),pdfText:text,bridge:!!window.desktop}})()`);
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
      await win.webContents.executeJavaScript('clearTimeout(toast.timer);document.querySelector("#toast").style.display="none"');
      await new Promise(r=>setTimeout(r,400));await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await new Promise(r=>setTimeout(r,100));const screenshot=await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
      await fs.writeFile(path.join(root,'artifacts','desktop-preview.png'),screenshot.toPNG());delete result.document;
      await fs.writeFile(path.join(root,'artifacts','desktop-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.exit(result.passed&&result.bridge?0:1);
    }catch(error){console.error(error);app.exit(1)}
  }
}).catch(error=>{console.error(error);app.exit(1)});
app.on('window-all-closed',()=>app.quit());
