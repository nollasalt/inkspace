const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){const electron=require(path.join(root,'node_modules','electron'));const child=spawn(electron,[__filename,...process.argv.slice(2)],{cwd:__dirname,stdio:'inherit',windowsHide:true});child.on('exit',code=>process.exitCode=code);return}
const {app,BrowserWindow,ipcMain,dialog}=require('electron'),{fileURLToPath}=require('node:url'),net=require('node:net');
const smoke=process.argv.includes('--smoke-test');let win,backend,currentFile=null,pendingFile=null,origin;
// Diagnostic launches can outlive their terminal. A broken log pipe must not crash the UI.
if(smoke)for(const stream of [process.stdout,process.stderr])stream.on('error',error=>{if(!['EPIPE','EBADF'].includes(error.code))throw error});
// Keep Theia's isolated preview origins while resolving their localhost subdomains on Windows.
app.commandLine.appendSwitch('host-resolver-rules','MAP *.mini-browser.localhost 127.0.0.1, MAP localhost 127.0.0.1');
let backendStop;
function stopBackend(){if(!backend||backend.exitCode!==null)return Promise.resolve();if(!backendStop)backendStop=new Promise(resolve=>{backend.once('exit',resolve);backend.stdin.end('stop\n')});return backendStop}
app.setName('Inkspace-Theia-Validation');app.setPath('userData',path.join(smoke?path.join(root,'artifacts'):app.getPath('appData'),smoke?'theia-test-profile-'+process.pid:'Inkspace-Theia-Validation'));
const allowed=event=>event.sender===win.webContents&&new URL(event.senderFrame.url).origin===origin;
const native=require(path.join(root,'desktop','native','ink-native.node'));
const dataGuard=(event,data)=>{if(!allowed(event)||typeof data!=='string'||Buffer.byteLength(data)>150*1024*1024)throw Error('Invalid note data');const note=JSON.parse(data);if(note.format!=='inkspace')throw Error('Invalid Inkspace document')};
for(const [channel,fn]of [['theia-ink-raster',native.raster],['theia-ink-path',native.path]])ipcMain.on(channel,(event,payload)=>{if(!allowed(event)){event.returnValue=null;return}try{event.returnValue=fn(payload)}catch(error){event.returnValue=null;console.error(error)}});
ipcMain.on('theia-ink-status',event=>{event.returnValue=allowed(event)?native.status():null});
ipcMain.handle('theia-save',async(event,data,saveAs)=>{dataGuard(event,data);let file=currentFile;if(!file||saveAs){const choice=await dialog.showSaveDialog(win,{defaultPath:file||'笔记.inkspace.json',filters:[{name:'Inkspace',extensions:['json']}]});if(choice.canceled)return null;file=choice.filePath}const temp=file+'.inkspace-tmp';await fs.promises.writeFile(temp,data,'utf8');await fs.promises.rename(temp,file);currentFile=file;return file});
ipcMain.handle('theia-open',async event=>{if(!allowed(event))throw Error('Invalid sender');const choice=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Inkspace',extensions:['json']}]});if(choice.canceled)return null;pendingFile=choice.filePaths[0];const stat=await fs.promises.stat(pendingFile);if(stat.size>150*1024*1024)throw Error('Note too large');return{file:pendingFile,data:await fs.promises.readFile(pendingFile,'utf8')}});
ipcMain.handle('theia-open-accepted',event=>{if(allowed(event)&&pendingFile){currentFile=pendingFile;pendingFile=null}});ipcMain.handle('theia-new',event=>{if(allowed(event))currentFile=pendingFile=null});
ipcMain.handle('theia-use-document',async(event,uri)=>{if(!allowed(event))throw Error('Invalid sender');const file=fileURLToPath(uri);const stat=await fs.promises.stat(file);if(!stat.isFile()||!file.toLowerCase().endsWith('.inkspace.json'))throw Error('Invalid canvas file');currentFile=file;return true});
function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port))})})}
app.whenReady().then(async()=>{
 const port=await freePort();origin='http://localhost:'+port;
 const node=process.env.INKSPACE_NODE_EXE||require('node:child_process').execFileSync('where.exe',['node'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/)[0];
 const config=path.join(app.getPath('userData'),'settings');fs.mkdirSync(config,{recursive:true});
 if(smoke)fs.writeFileSync(path.join(config,'settings.json'),JSON.stringify({'security.workspace.trust.enabled':false}));
 const env={...process.env,THEIA_CONFIG_DIR:config};delete env.ELECTRON_RUN_AS_NODE;for(const key of Object.keys(env))if(key.toLowerCase()==='psmodulepath')delete env[key];env.PSModulePath=[path.join(app.getPath('documents'),'WindowsPowerShell','Modules'),path.join(process.env.ProgramFiles,'WindowsPowerShell','Modules'),path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','Modules')].join(';');
 backend=spawn(node,[path.join(__dirname,'backend-supervisor.cjs'),path.join(__dirname,'lib','backend','main.js'),'--hostname','127.0.0.1','--port',String(port)],{cwd:__dirname,env,stdio:['pipe','pipe','pipe'],windowsHide:true});let serverLog='';for(const stream of [backend.stdout,backend.stderr])stream.on('data',data=>{serverLog+=data;if(smoke)process.stdout.write(data)});
 for(let i=0;i<300;i++){if(backend.exitCode!==null)throw Error('Theia backend exited: '+serverLog);try{const response=await fetch(origin);if(response.ok)break}catch{}await new Promise(r=>setTimeout(r,100));if(i===299)throw Error('Theia startup timed out: '+serverLog)}
 win=new BrowserWindow({width:1440,height:940,minWidth:900,minHeight:600,show:!smoke||process.argv.includes('--show-test'),title:'Inkspace · Theia 验证版',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});win.setMenuBarVisibility(false);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault()});win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 // Theia is built for browser menus/services; the outer desktop shell supplies native ink only.
 win.webContents.setUserAgent(win.webContents.getUserAgent().replace(/Electron\/\S+\s?/g,''));
 win.webContents.on('will-prevent-unload',event=>{if(dialog.showMessageBoxSync(win,{type:'question',message:'当前工作区有尚未保存的修改。',detail:'切换工作区前请先保存文本文件和手写笔记。',buttons:['取消切换','放弃修改并继续'],defaultId:0,cancelId:0})===1)event.preventDefault()});
 if(smoke)win.webContents.on('console-message',event=>{if(event.level==='error')console.log('renderer:',event.message)});
 if(smoke)win.webContents.session.webRequest.onErrorOccurred(details=>console.log('resource failed:',details.url,details.error));
 const attach=()=>{if(!win.isDestroyed())native.attach(win.getNativeWindowHandle())};attach();win.webContents.on('dom-ready',attach);const scan=setInterval(attach,500),drain=setInterval(()=>{const packets=native.drain();if(packets.length&&!win.isDestroyed())win.webContents.send('theia-pen',packets)},4);
 win.on('closed',()=>{clearInterval(scan);clearInterval(drain);stopBackend()});
 let closing=false;win.on('close',event=>{if(smoke)return;event.preventDefault();if(closing)return;closing=true;win.webContents.executeJavaScript('window.inkspaceTheiaValidation?inkspaceTheiaValidation.requestClose():true').then(ok=>{if(ok)win.destroy()}).catch(error=>dialog.showErrorBox('关闭失败',error.message)).finally(()=>{closing=false})});
 if(smoke){const fixture=path.join(root,'artifacts','theia-workspace');fs.mkdirSync(fixture,{recursive:true});fs.cpSync(path.join(__dirname,'demo-workspace'),fixture,{recursive:true})}
 const workspace=process.argv.find(value=>value.startsWith('--workspace='))?.slice('--workspace='.length)||(smoke?path.join(root,'artifacts','theia-workspace'):path.join(__dirname,'demo-workspace'));await win.loadURL(origin+'/#'+encodeURI('/'+path.resolve(workspace).replaceAll('\\','/')));
 if(smoke){try{await require('./smoke.cjs')({win,root,native,workspace,origin});win.destroy();await stopBackend();app.exit(0)}catch(error){console.error(error);win.destroy();await stopBackend();app.exit(1)}}
}).catch(error=>{console.error(error);stopBackend();if(!smoke)dialog.showErrorBox('Theia 验证版启动失败',error.message);app.exit(1)});
app.on('window-all-closed',()=>{if(!smoke)stopBackend().finally(()=>app.quit())});app.on('before-quit',stopBackend);
