const vscode=require('vscode'),path=require('node:path');
const {editorHtml}=require('./html.cjs');
const VIEW='inkspace.notebook';
const normalizedText=text=>text.replace(/\r\n/g,'\n');
function emptyNotebook(title='未命名笔记'){return{format:'inkspace',version:2,title,activePage:'page-1',pages:[{id:'page-1',title:'第 1 页',view:{x:100,y:80,scale:1},document:{format:'inkspace',version:1,strokes:[],notes:[],shapes:[],pdfs:[],background:{type:'blank',color:'#ffffff',spacing:'auto',fontSize:16}}}]}}
function assertNotebook(text){if(typeof text!=='string'||Buffer.byteLength(text)>150*1024*1024)throw Error('笔记超过 150 MB');const model=JSON.parse(text);if(model?.format!=='inkspace'||![1,2].includes(model.version)||model.version===2&&!Array.isArray(model.pages)||model.version===1&&!Array.isArray(model.strokes))throw Error('不是有效的墨境笔记');return model}
function activate(context){
  const states=new Map(),pending=new Map();let active=null,sequence=0;
  const emitter=new vscode.EventEmitter();
  const pages={onDidChangeTreeData:emitter.event,getTreeItem:item=>item,getChildren:()=>{
    if(!active?.pages)return[];return active.pages.map((page,index)=>{const item=new vscode.TreeItem(`${String(index+1).padStart(2,'0')}  ${page.title}`);item.id=page.id;item.contextValue='inkspace.page';item.iconPath=new vscode.ThemeIcon(page.id===active.activePage?'circle-filled':'circle-outline');item.command={command:'inkspace.switchPage',title:'切换页面',arguments:[page.id]};return item})
  }};
  function refresh(){vscode.commands.executeCommand('setContext','inkspace.hasNotebook',!!active);emitter.fire()}
  function request(state,command,args={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('画布响应超时'))},15000);pending.set(id,{state,resolve,reject,timer});state.panel.webview.postMessage({type:'request',id,command,...args})})}
  async function copySelection(state=active){if(!state)return;const text=await request(state,'copy');if(text)await vscode.env.clipboard.writeText(text)}
  async function pasteSelection(state=active){if(!state)return;const text=await vscode.env.clipboard.readText();if(text)await request(state,'paste',{text})}
  async function newNote(folder){let base=vscode.workspace.workspaceFolders?.[0]?.uri;if(folder instanceof vscode.Uri){const info=await vscode.workspace.fs.stat(folder);base=info.type&vscode.FileType.Directory?folder:folder.with({path:path.posix.dirname(folder.path)})}else if(active)base=active.document.uri.with({path:path.posix.dirname(active.document.uri.path)});else if(vscode.window.activeTextEditor)base=vscode.window.activeTextEditor.document.uri.with({path:path.posix.dirname(vscode.window.activeTextEditor.document.uri.path)});if(!base){vscode.window.showInformationMessage('请先打开文件夹');return}let target;for(let i=0;i<10000;i++){target=vscode.Uri.joinPath(base,(i?'笔记 '+i:'笔记')+'.inkspace.json');try{await vscode.workspace.fs.stat(target)}catch(error){if(error.code!=='FileNotFound')throw error;break}target=null}if(!target)throw Error('无法生成新笔记名称');await vscode.workspace.fs.writeFile(target,Buffer.from(JSON.stringify(emptyNotebook(path.basename(target.path).replace(/\.inkspace\.json$/,'')),null,2)));await vscode.commands.executeCommand('vscode.openWith',target,VIEW)}
  async function openNote(uri){if(!uri){const files=await vscode.window.showOpenDialog({canSelectMany:false,filters:{'墨境笔记':['json']}});uri=files?.[0]}if(uri)await vscode.commands.executeCommand('vscode.openWith',uri,VIEW)}
  const provider={async resolveCustomTextEditor(document,panel){
    assertNotebook(document.getText());const media=vscode.Uri.joinPath(context.extensionUri,'media');
    const state={document,panel,ready:false,applying:false,queue:Promise.resolve(),pages:[],activePage:null};states.set(document.uri.toString(),state);
    const disposables=[];disposables.push(vscode.window.onDidChangeWindowState(inputFocus));panel.webview.options={enableScripts:true,localResourceRoots:[media]};
    function inputFocus(){if(panel.active)vscode.commands.executeCommand('setContext','inkspace.canvasKeyboardFocused',!!state.clipboardFocused);panel.webview.postMessage({type:'engine-focus',windowFocused:vscode.window.state.focused,editorActive:panel.active})}
    function update(history=false){panel.webview.postMessage({type:'document',text:normalizedText(document.getText()),version:document.version,history})}
    disposables.push(vscode.workspace.onDidChangeTextDocument(event=>{if(event.document===document&&event.contentChanges.length&&state.ready){const history=event.reason===vscode.TextDocumentChangeReason.Undo||event.reason===vscode.TextDocumentChangeReason.Redo;if(history){state.historyVersion=document.version;update(true)}else if(!state.applying&&normalizedText(document.getText())!==state.lastOwn)update()}}));
    disposables.push(panel.onDidChangeViewState(()=>{inputFocus();if(panel.active){active=state;refresh()}else if(active===state){active=null;refresh()}}));
    disposables.push(panel.webview.onDidReceiveMessage(message=>{
      if(message.type==='clipboard-focus'){state.clipboardFocused=!!message.focused;if(panel.active)vscode.commands.executeCommand('setContext','inkspace.canvasKeyboardFocused',state.clipboardFocused);return}
      if(message.type==='history-shortcut'&&['undo','redo'].includes(message.command)){request(state,message.command).catch(error=>vscode.window.showErrorMessage(error.message));return}
      if(message.type==='response'){const entry=pending.get(message.id);if(entry?.state===state){clearTimeout(entry.timer);pending.delete(message.id);message.error?entry.reject(Error(message.error)):entry.resolve(message.result)}return}
      state.queue=state.queue.catch(()=>{}).then(async()=>{
        if(message.type==='calibration'){const record=message.record;if(record&&typeof record.deviceKey==='string'&&typeof record.display==='string'&&['x','y'].every(axis=>Array.isArray(record.matrix?.[axis])&&record.matrix[axis].length===3&&record.matrix[axis].every(Number.isFinite))){const records=context.globalState.get('inkspace.calibrations',{});records[record.deviceKey+'|'+record.display]=record;await context.globalState.update('inkspace.calibrations',records)}return}
        if(message.type==='ready'){inputFocus();state.ready=true;active=state;refresh();update();return}
        if(message.type==='pages'){state.pages=message.pages;state.activePage=message.activePage;if(panel.active){active=state;refresh()}return}
        if(message.type==='edit'){
          try{assertNotebook(message.text);if(message.version<(state.historyVersion||0)){panel.webview.postMessage({type:'ack',id:message.id,version:document.version,superseded:true});return}if(message.version!==document.version&&normalizedText(message.baseText||'')!==normalizedText(document.getText()))throw Error('文件在画布外发生修改，已保留画布草稿。请另存草稿或重新打开文件。');if(normalizedText(message.text)!==normalizedText(document.getText())){const edit=new vscode.WorkspaceEdit();edit.replace(document.uri,new vscode.Range(0,0,document.lineCount,0),message.text);state.applying=true;state.lastOwn=normalizedText(message.text);try{if(!await vscode.workspace.applyEdit(edit))throw Error('无法更新笔记文件')}finally{state.applying=false}}if(message.autoSave){state.applying=true;try{if(!await document.save())throw Error('自动保存失败，请检查文件权限或磁盘空间')}finally{state.applying=false}} panel.webview.postMessage({type:'ack',id:message.id,version:document.version})}
          catch(error){panel.webview.postMessage({type:'ack',id:message.id,version:document.version,error:error.message});vscode.window.showErrorMessage(error.message)}return;
        }
        if(message.type==='command'){
          if(message.command==='new')await newNote();else if(message.command==='open')await openNote();else if(message.command==='pages')await vscode.commands.executeCommand('inkspace.pages.focus');
          return;
        }
        if(message.type==='export'){
          if(typeof message.name!=='string'||!['application/pdf','image/svg+xml','application/json','application/xml'].includes(message.mime))return;const target=await vscode.window.showSaveDialog({defaultUri:vscode.Uri.file(path.join(path.dirname(document.uri.fsPath),path.basename(message.name)))});if(!target)return;
          const bytes=typeof message.text==='string'?Buffer.from(message.text):Buffer.from(message.bytes);if(bytes.length>150*1024*1024)throw Error('导出内容过大');await vscode.workspace.fs.writeFile(target,bytes);vscode.window.showInformationMessage('已导出 '+path.basename(target.path));
        }
      }).catch(error=>vscode.window.showErrorMessage(error.message));
    }));
    // Save is handled outside the edit queue, so flushing cannot deadlock it.
    disposables.push(panel.webview.onDidReceiveMessage(async message=>{if(message.type==='save-history'){try{await state.queue;if(message.version===document.version&&!await document.save())throw Error('自动保存失败，请检查文件权限或磁盘空间')}catch(error){vscode.window.showErrorMessage(error.message)}return}if(message.type!=='save')return;try{await request(state,'flush');await state.queue;if(message.saveAs)await vscode.commands.executeCommand('workbench.action.files.saveAs');else if(!await document.save())throw Error('保存失败，请检查文件权限或磁盘空间')}catch(error){vscode.window.showErrorMessage(error.message)}}));
    disposables.push(panel.onDidDispose(()=>{states.delete(document.uri.toString());if(active===state){active=null;refresh()}for(const [id,entry] of pending)if(entry.state===state){clearTimeout(entry.timer);entry.reject(Error('画布已关闭'));pending.delete(id)}for(const item of disposables)item.dispose()}));
    const nativeConfig=await require('./engine-config.cjs').ensure();
    panel.webview.html=editorHtml(panel.webview,media,vscode,{windowFocused:vscode.window.state.focused,editorActive:panel.active,calibrations:context.globalState.get('inkspace.calibrations',{}),test:context.extensionMode===vscode.ExtensionMode.Test,native:nativeConfig,client:require('node:crypto').randomUUID()});
  }};
  context.subscriptions.push(emitter,vscode.window.registerTreeDataProvider('inkspace.pages',pages),vscode.window.registerCustomEditorProvider(VIEW,provider,{webviewOptions:{retainContextWhenHidden:true},supportsMultipleEditorsPerDocument:false}),
    vscode.commands.registerCommand('inkspace.new',newNote),vscode.commands.registerCommand('inkspace.open',openNote),
    vscode.commands.registerCommand('inkspace.showPages',()=>vscode.commands.executeCommand('inkspace.pages.focus')),
    vscode.commands.registerCommand('inkspace.addPage',()=>active&&request(active,'addPage')),
    vscode.commands.registerCommand('inkspace.renamePage',async item=>{const state=active,page=state?.pages.find(p=>p.id===(item?.id||state.activePage));if(!page)return;const title=await vscode.window.showInputBox({title:'页面名称',value:page.title,validateInput:value=>value.trim()?null:'请输入名称'});if(title!==undefined)await request(state,'renamePage',{page:page.id,title:title.trim().slice(0,100)})}),
    vscode.commands.registerCommand('inkspace.deletePage',async item=>{const state=active,page=state?.pages.find(p=>p.id===(item?.id||state.activePage));if(!page)return;if(state.pages.length===1){vscode.window.showInformationMessage('至少保留一个页面');return}if(await vscode.window.showWarningMessage('删除“'+page.title+'”及其全部内容？',{modal:true},'删除')==='删除')await request(state,'deletePage',{page:page.id})}),
    vscode.commands.registerCommand('inkspace.switchPage',id=>active&&request(active,'page',{page:id})),
    vscode.commands.registerCommand('inkspace.copy',()=>copySelection()),
    vscode.commands.registerCommand('inkspace.paste',()=>pasteSelection()),
    vscode.commands.registerCommand('inkspace.undo',()=>active&&request(active,'undo')),
    vscode.commands.registerCommand('inkspace.redo',()=>active&&request(active,'redo')),
    vscode.commands.registerCommand('inkspace.save',async()=>{if(active){await request(active,'flush');await active.queue;await active.document.save()}}));
  return{async diagnostic(uri,action){if(context.extensionMode!==vscode.ExtensionMode.Test)throw Error('Diagnostics disabled');const state=states.get(uri.toString());if(!state?.ready)throw Error('Canvas not ready');return request(state,'diagnostic',{action})},ready:uri=>!!states.get(uri.toString())?.ready,pages:()=>pages.getChildren()};
}
module.exports={activate,emptyNotebook,assertNotebook};
