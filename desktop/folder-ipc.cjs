// Only the folder selected by the user is exposed to the renderer.
module.exports=async function({ipcMain,dialog,win,app,senderOK,atomicWrite,onRead,getCurrent,setCurrent}){
  const fs=require('node:fs/promises'),path=require('node:path'),{createFolderBrowser,markdown}=require('./folder-files.cjs'),browser=createFolderBrowser();
  const config=path.join(app.getPath('userData'),'folder.json');const markdownRevisions=new Map();
  try{const saved=JSON.parse(await fs.readFile(config,'utf8'));await browser.open(saved.root)}catch{}
  const guard=event=>{if(!senderOK(event))throw Error('Invalid sender')};
  ipcMain.handle('folder-state',event=>{guard(event);return browser.state()});
  ipcMain.handle('folder-open',async event=>{guard(event);const choice=await dialog.showOpenDialog(win,{properties:['openDirectory'],title:'打开笔记文件夹'});if(choice.canceled)return null;const state=await browser.open(choice.filePaths[0]);await atomicWrite(config,JSON.stringify(state));return state});
  ipcMain.handle('folder-close',async event=>{guard(event);browser.close();await atomicWrite(config,'{}');return true});
  ipcMain.handle('folder-list',async(event,relative)=>{guard(event);return browser.list(relative)});
  ipcMain.handle('folder-read',async(event,relative)=>{guard(event);const result=await browser.read(relative);onRead(result.file);if(result.kind==='markdown')markdownRevisions.set(result.file,result);return result});
  ipcMain.handle('markdown-save',async(event,data,saveAs=false)=>{
    guard(event);if(typeof data!=='string'||Buffer.byteLength(data,'utf8')>10*1024*1024)throw Error('Markdown 超过 10 MB');let file=getCurrent();if(!file||!markdown(file)||saveAs){const choice=await dialog.showSaveDialog(win,{defaultPath:file&&markdown(file)?file:'笔记.md',filters:[{name:'Markdown',extensions:['md','markdown']}]});if(choice.canceled)return null;file=choice.filePath;if(!markdown(file))file+='.md'}
    const markdownRevision=markdownRevisions.get(file);if(markdownRevision){const stat=await fs.stat(file);if(stat.mtimeMs+':'+stat.size!==markdownRevision.revision)throw Error('文件已被其他程序修改，请重新打开或另存为')}
    const format=markdownRevision?.file===file?markdownRevision:null,content=(format?.bom?'\uFEFF':'')+data.replace(/\r\n|\r/g,'\n').replace(/\n/g,format?.newline||'\n');await atomicWrite(file,content);const stat=await fs.stat(file);markdownRevisions.set(file,{file,bom:!!format?.bom,newline:format?.newline||'\n',revision:stat.mtimeMs+':'+stat.size});setCurrent(file);return file;
  });
  return{openExternal:async directory=>{const state=await browser.open(directory);await atomicWrite(config,JSON.stringify(state));return state},trackRead:result=>{if(result.kind==='markdown')markdownRevisions.set(result.file,result)}};
};
