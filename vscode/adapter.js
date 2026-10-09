// Writing is allowed only through the high-precision native host bridge.
const codium=(window.inkspaceCalibrationApi||acquireVsCodeApi()),boot=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob($('#inkspace-boot').content),c=>c.charCodeAt(0))));
inputTools.restore(codium.getState()?.inputTools);tool=inputTools.get();
window.addEventListener('inkspace-input-tools-change',()=>codium.setState({...codium.getState(),inputTools:inputTools.snapshot()}));
if(typeof codium.getState()?.diagramSidebarCollapsed==='boolean')setDiagramSidebarCollapsed(codium.getState().diagramSidebarCollapsed,false);
window.addEventListener('inkspace-sidebar-change',event=>codium.setState({...codium.getState(),diagramSidebarCollapsed:event.detail.collapsed}));
let textDraftTimer=null;window.addEventListener('inkspace-text-draft',event=>{clearTimeout(textDraftTimer);const draft=event.detail?{...event.detail,version:hostVersion}:null;if(!draft){codium.setState({...codium.getState(),contentDraft:null});return}textDraftTimer=setTimeout(()=>codium.setState({...codium.getState(),contentDraft:draft}),400)});
syncInputMode();
let hostVersion=0,hostLoaded=false,applyingHost=false,editFlight=null,editSequence=0,lastHostText='',lastContent='',conflict=false,forceSaveView=false,flushWaiters=[],draftTimer=null;
let binaryBaseline=null,binaryRevision=0;
const originalContentSignature=contentSignature;
if(boot.binary)contentSignature=()=>binaryRevision;
function captureBinary(){return InkNotebookDelta.capture(documentData(),active?.type==='pen'?active.s:null)}
function sendBinaryEdit(){
  if(!hostLoaded||applyingHost||conflict||editFlight||active&&active.type!=='pen'||window.inkspaceDiagram?.interacting()||!binaryBaseline)return;
  const captured=captureBinary(),patch=InkNotebookDelta.diff(binaryBaseline,captured);
  if(!patch){lastContent=contentSignature();return}
  editFlight={id:++editSequence,captured,signature:contentSignature()};
  codium.postMessage({type:'delta-edit',id:editFlight.id,patch,version:hostVersion});
}
// Browser clipboard events keep image/text paste intact when the webview has
// keyboard focus. A raw-pen-only focus uses VS Code's system clipboard bridge.
function clipboardFocus(){codium.postMessage({type:'clipboard-focus',focused:document.hasFocus(),textEditing:document.hasFocus()&&document.activeElement?.classList.contains('inline-note-editor')})}
document.addEventListener('focusin',clipboardFocus);document.addEventListener('focusout',()=>queueMicrotask(clipboardFocus));window.addEventListener('focus',clipboardFocus);window.addEventListener('blur',clipboardFocus);clipboardFocus();
// A focused webview owns its history key. Stop the shared canvas listener and
// VS Code's forwarded key event; an unfocused webview uses the host keybinding.
window.inkspaceInteraction.registerShortcut('host-history',event=>{
  if(!(event.ctrlKey||event.metaKey)||event.altKey)return false;
  const key=event.key.toLowerCase(),command=key==='z'?(event.shiftKey?'redo':'undo'):key==='y'?'redo':null;
  if(!command||window.inkspaceDiagram?.editing()||$('#editor').open||event.target.matches?.('input,textarea,select')||event.target.closest?.('[contenteditable="true"],.monaco-editor,#terminal-panel'))return false;
  event.preventDefault();event.stopImmediatePropagation();
  if(!event.repeat){command==='undo'?undo():redo()}return true;
});
// Load the bundled module through the webview resource service, then keep its
// worker on a same-origin blob URL. Cross-origin module imports can stall here.
window.inkspacePdfWorkerReady=fetch(PdfApi.GlobalWorkerOptions.workerSrc).then(async response=>{if(!response.ok)throw Error('PDF worker resource '+response.status);const url=URL.createObjectURL(new Blob([await response.text()],{type:'text/javascript'})),worker=new Worker(url,{type:'module'});const shared=new PdfApi.PDFWorker({port:worker});PdfApi.setSharedWorker(shared);window.addEventListener('beforeunload',()=>{PdfApi.setSharedWorker(null);shared.destroy();worker.terminate();URL.revokeObjectURL(url)},{once:true});return worker});
window.inkspacePdfWorkerReady.catch(error=>toast('PDF 初始化失败：'+error.message));
function pageMessage(){if($('#show-pages'))$('#show-pages').hidden=false;codium.postMessage({type:'pages',pages:notebook.pages.map(p=>({id:p.id,title:p.title})),activePage:notebook.activePage})}
function rememberDraft(){if(boot.binary){codium.setState({...codium.getState(),text:undefined,version:hostVersion,dirty:contentSignature()!==lastContent,patch:binaryBaseline?InkNotebookDelta.diff(binaryBaseline,captureBinary()):null});return}codium.setState({...codium.getState(),text:documentJSON(true),version:hostVersion,dirty:contentSignature()!==lastContent})}
function sendEdit(){if(boot.binary){sendBinaryEdit();return}if(!hostLoaded||applyingHost||active||window.inkspaceDiagram?.interacting()||draftTimer!==null&&!forceSaveView)return;if(conflict)return;const signature=contentSignature();if(signature===lastContent&&!editFlight&&(!forceSaveView||documentJSON(true)===lastHostText))return;rememberDraft();if(editFlight)return;editFlight={id:++editSequence,text:documentJSON(true),signature};codium.postMessage({type:'edit',id:editFlight.id,text:editFlight.text,version:hostVersion,baseText:lastHostText,autoSave:true})}
function flushed(){return new Promise((resolve,reject)=>{if(conflict){reject(Error('文件冲突，请另存草稿或重新打开'));return}window.inkspaceInlineText?.finish();finishInteraction();clearTimeout(draftTimer);draftTimer=null;forceSaveView=true;sendEdit();if(!editFlight){forceSaveView=false;resolve();return}flushWaiters.push({resolve,reject})})}
persist=function(){clearTimeout(saveTimer);if(!hostLoaded||applyingHost)return;if(boot.binary){binaryRevision++;clearTimeout(draftTimer);draftTimer=null;sendBinaryEdit();return}clearTimeout(draftTimer);draftTimer=setTimeout(()=>{draftTimer=null;if(active&&(!boot.binary||active.type!=='pen')||window.inkspaceDiagram?.interacting()){persist();return}pageMessage();forceSaveView=true;sendEdit()},boot.binary?80:700)};
viewport.addEventListener('wheel',()=>persist(),{passive:true});for(const id of ['#in','#out','#home'])$(id)?.addEventListener('click',()=>persist());
flushPersist=function(){clearTimeout(draftTimer);draftTimer=null;sendEdit()};
saveNotebook=async function(saveAs=false){if(conflict&&saveAs){download(documentJSON(true),'application/json',notebook.title+'-草稿.inkspace.json');return true}codium.postMessage({type:'save',saveAs});return true};
openNotebook=function(){codium.postMessage({type:'command',command:'open'})};
$('#new').onclick=()=>codium.postMessage({type:'command',command:'new'});$('#load').onclick=openNotebook;$('#save').onclick=()=>saveNotebook();$('#save-as').onclick=()=>saveNotebook(true);
// The host bridge owns persistence; the workbench owns layout and commands.
const workbench=window.inkspaceWorkbench.install(codium.getState()||{});
window.addEventListener('inkspace-workbench-layout',event=>codium.setState({...codium.getState(),...event.detail}));
const sidebar=workbench.sidebar,propertyTitle=workbench.propertyTitle;
function showSidebarMode(mode,toggle=true){if(mode==='tool')workbench.exitResource();else workbench.openResource(mode,toggle)}
const statusBar=document.createElement('div');statusBar.id='input-status-bar';const statusText=document.createElement('span');statusText.id='input-status';statusText.textContent='Windows 原生输入 · 正在连接';const pagesButton=document.createElement('button');pagesButton.id='show-pages';pagesButton.textContent='画布';pagesButton.title='切换和管理笔记中的画布';pagesButton.hidden=false;pagesButton.onclick=()=>codium.postMessage({type:'command',command:'pages'});statusBar.append(statusText,pagesButton);$('#editor-shell').append(statusBar);window.inkspaceNavigation.attach();workbench.attachFooter(statusBar);
function updateNativeStatus(){const state=window.inkspaceNative.status(),engine=window.desktop?.inkStatus();statusText.textContent=!engine?'Ink Engine 未连接 · 请查看输入诊断':!state.connected?'高精度笔输入未就绪 · '+state.error:state.lastPrecise===false?'设备未提供高精度笔数据 · 已停止书写':state.lastPrecise===true?'Windows 原生高精度笔迹 · Cairo '+engine.cairo:'Windows 原生采样已接入 · Cairo '+engine.cairo+' · 等待触控笔';}
const nativeStatusTimer=setInterval(updateNativeStatus,1000);updateNativeStatus();window.addEventListener('beforeunload',()=>clearInterval(nativeStatusTimer),{once:true});
download=async function(data,mime,name){try{const bytes=typeof data==='string'?null:Array.from(new Uint8Array(await new Blob([data]).arrayBuffer()));codium.postMessage({type:'export',mime,name,...(bytes?{bytes}:{text:data})})}catch(error){toast('导出失败：'+error.message)}};
const hostPageRender=renderPageList;renderPageList=function(){hostPageRender();workbench.refresh();if(hostLoaded&&!applyingHost)pageMessage()};
function receiveDocument(message){
  const initial=!hostLoaded;
  if(message.history){finishInteraction();clearTimeout(draftTimer);draftTimer=null;editFlight=null;forceSaveView=false;conflict=false;codium.setState({...codium.getState(),text:message.text,version:message.version,dirty:false})}
  if(editFlight||contentSignature()!==lastContent&&hostLoaded){conflict=true;rememberDraft();toast('文件在画布外改变，已保留草稿；请另存或重新打开');return}
  try{const data=JSON.parse(message.text);if(!valid(data))throw Error('笔记内容无效');const state=codium.getState();applyingHost=true;adoptDocument(data);hostVersion=message.version;lastHostText=message.text;lastContent=contentSignature();savedDocument=lastContent;hostLoaded=true;applyingHost=false;conflict=false;
    if(initial&&state?.dirty&&state.text!==message.text){const draft=JSON.parse(state.text);if(valid(draft)){adoptDocument(draft);toast('已恢复尚未写入文件的画布草稿');persist()}}
    pageMessage();applyingHost=true;resize();applyingHost=false;if(initial&&state?.contentDraft&&state.contentDraft.version===hostVersion)window.inkspaceInlineText.restoreDraft(state.contentDraft);if(message.history){codium.postMessage({type:'save-history',version:hostVersion});for(const waiter of flushWaiters.splice(0))waiter.resolve()}
  }catch(error){applyingHost=false;toast('打开失败：'+error.message);statusText.textContent='笔记无法打开：'+error.message}
}
window.addEventListener('message',async event=>{const message=event.data;
  if(message.type==='binary-external-change'){conflict=true;rememberDraft();toast('笔记在外部发生变化，已保留草稿；请重新打开文件');return}
  if(message.type==='binary-document'){
    try{const initial=!hostLoaded;if(!valid(message.model))throw Error('二进制笔记内容无效');if(hostLoaded&&!message.history&&(editFlight||contentSignature()!==lastContent))throw Error('文件在外部改变，请保存草稿后重新打开');const state=codium.getState();applyingHost=true;finishInteraction();clearTimeout(draftTimer);draftTimer=null;editFlight=null;adoptDocument(message.model);hostVersion=message.version;binaryBaseline=captureBinary();binaryRevision=0;lastContent=0;savedDocument=0;hostLoaded=true;conflict=false;
      if(state?.dirty&&state.patch&&state.version===hostVersion){InkNotebookDelta.apply(notebook,state.patch);adoptDocument(notebook);binaryRevision++;}
      resize();applyingHost=false;pageMessage();if(initial&&state?.contentDraft&&state.contentDraft.version===hostVersion)window.inkspaceInlineText.restoreDraft(state.contentDraft);if(binaryRevision)persist();
    }catch(error){applyingHost=false;conflict=true;toast('打开失败：'+error.message)}return;
  }
  if(message.type==='document'){receiveDocument(message);return}
  if(message.type==='ack'&&editFlight?.id===message.id){const sent=editFlight;editFlight=null;hostVersion=message.version;if(message.error){conflict=true;rememberDraft();for(const waiter of flushWaiters.splice(0))waiter.reject(Error(message.error));toast(message.error);return}if(boot.binary)binaryBaseline=sent.captured;lastHostText=sent.text;lastContent=sent.signature;sendEdit();if(!editFlight&&!active&&draftTimer===null){forceSaveView=false;codium.setState({...codium.getState(),text:boot.binary?undefined:documentJSON(true),patch:undefined,version:hostVersion,dirty:false});for(const waiter of flushWaiters.splice(0))waiter.resolve()}return}
  if(message.type==='request'){try{let result=true;if(message.command==='tool'){if(!['pen','erase','pan','text','select','shape','diagram'].includes(message.tool))throw Error('未知工具');if(!window.inkspaceDiagram?.editing()&&!$('#editor').open){if(['diagram','shape'].includes(message.tool))showSidebarMode('diagram');else activateTool(message.tool,true,false);await flushed()}}else if(message.command==='group')result=window.inkspaceBlocks.groupSelection();else if(message.command==='ungroup')result=window.inkspaceBlocks.ungroupSelection();else if(message.command==='copy')result=selectionClipboardText();else if(message.command==='paste'){if(!pasteSelectionText(message.text))await pasteItems([],message.text);await flushed()}else if(message.command==='undo'||message.command==='redo'){if(!window.inkspaceInlineText?.history(message.command)){message.command==='undo'?undo():redo();await flushed()}}else if(message.command==='flush')await flushed();else if(message.command==='page'){switchPage(message.page);pageMessage()}else if(message.command==='addPage'){$('#page-add').click();await flushed()}else if(message.command==='renamePage'){const page=notebook.pages.find(p=>p.id===message.page);if(page){page.title=message.title;renderPageList();persist();await flushed()}}else if(message.command==='deletePage'){if(notebook.pages.length===1)throw Error('至少保留一个页面');finishInteraction();rememberPage();const index=notebook.pages.findIndex(p=>p.id===message.page);if(index>=0){notebook.pages.splice(index,1);pageSessions.delete(message.page);if(notebook.activePage===message.page)switchPage(notebook.pages[Math.min(index,notebook.pages.length-1)].id);else{renderPageList();persist()}await flushed()}}else if(message.command==='find')window.inkspaceNavigation.open();else if(message.command==='navigate')result=window.inkspaceNavigation.travel(message.direction);else if(message.command==='movePage'){result=window.inkspaceNavigation.movePage(message.page,message.direction);await flushed()}else if(message.command==='performance-report')result=window.inkspacePerformance.report();else if(message.command==='recovery-snapshot'){finishInteraction();rememberPage();result=InkNotebookDelta.capture(documentData())}else if(message.command==='diagnostic'&&boot.test)result=await runCodiumDiagnostic(message.action);else throw Error('不支持的画布操作');codium.postMessage({type:'response',id:message.id,result})}catch(error){codium.postMessage({type:'response',id:message.id,error:error.message})}}
});
window.addEventListener('beforeunload',()=>{if(hostLoaded)rememberDraft()});
codium.postMessage({type:'ready'});resize();

window.inkspaceBlockClipboard=command=>codium.postMessage({type:'command',command:command==='copy'?'copy-blocks':'paste-blocks'});

void 0;
