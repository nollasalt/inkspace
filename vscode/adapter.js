// Writing is allowed only through the high-precision native host bridge.
const codium=(window.inkspaceCalibrationApi||acquireVsCodeApi()),boot=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob($('#inkspace-boot').content),c=>c.charCodeAt(0))));
if(typeof codium.getState()?.diagramSidebarCollapsed==='boolean')setDiagramSidebarCollapsed(codium.getState().diagramSidebarCollapsed,false);
window.addEventListener('inkspace-sidebar-change',event=>codium.setState({...codium.getState(),diagramSidebarCollapsed:event.detail.collapsed}));
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
function clipboardFocus(){codium.postMessage({type:'clipboard-focus',focused:document.hasFocus()})}
window.addEventListener('focus',clipboardFocus);window.addEventListener('blur',clipboardFocus);clipboardFocus();
// A focused webview owns its history key. Stop the shared canvas listener and
// VS Code's forwarded key event; an unfocused webview uses the host keybinding.
window.addEventListener('keydown',event=>{
  if(!(event.ctrlKey||event.metaKey)||event.altKey)return;
  const key=event.key.toLowerCase(),command=key==='z'?(event.shiftKey?'redo':'undo'):key==='y'?'redo':null;
  if(!command||window.inkspaceDiagram?.editing()||$('#editor').open||event.target.matches?.('input,textarea,select')||event.target.closest?.('[contenteditable="true"],.monaco-editor,#terminal-panel'))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(!event.repeat){command==='undo'?undo():redo()}
},{capture:true});
// Load the bundled module through the webview resource service, then keep its
// worker on a same-origin blob URL. Cross-origin module imports can stall here.
window.inkspacePdfWorkerReady=fetch(PdfApi.GlobalWorkerOptions.workerSrc).then(async response=>{if(!response.ok)throw Error('PDF worker resource '+response.status);const url=URL.createObjectURL(new Blob([await response.text()],{type:'text/javascript'})),worker=new Worker(url,{type:'module'});PdfApi.GlobalWorkerOptions.workerPort=worker;window.addEventListener('beforeunload',()=>{worker.terminate();URL.revokeObjectURL(url)},{once:true});return worker});
window.inkspacePdfWorkerReady.catch(error=>toast('PDF 初始化失败：'+error.message));
function pageMessage(){codium.postMessage({type:'pages',pages:notebook.pages.map(p=>({id:p.id,title:p.title})),activePage:notebook.activePage})}
function rememberDraft(){if(boot.binary){codium.setState({...codium.getState(),text:undefined,version:hostVersion,dirty:contentSignature()!==lastContent,patch:binaryBaseline?InkNotebookDelta.diff(binaryBaseline,captureBinary()):null});return}codium.setState({...codium.getState(),text:documentJSON(true),version:hostVersion,dirty:contentSignature()!==lastContent})}
function sendEdit(){if(boot.binary){sendBinaryEdit();return}if(!hostLoaded||applyingHost||active||window.inkspaceDiagram?.interacting()||draftTimer!==null&&!forceSaveView)return;if(conflict)return;const signature=contentSignature();if(signature===lastContent&&!editFlight&&(!forceSaveView||documentJSON(true)===lastHostText))return;rememberDraft();if(editFlight)return;editFlight={id:++editSequence,text:documentJSON(true),signature};codium.postMessage({type:'edit',id:editFlight.id,text:editFlight.text,version:hostVersion,baseText:lastHostText,autoSave:true})}
function flushed(){return new Promise((resolve,reject)=>{if(conflict){reject(Error('文件冲突，请另存草稿或重新打开'));return}finishInteraction();clearTimeout(draftTimer);draftTimer=null;forceSaveView=true;sendEdit();if(!editFlight){forceSaveView=false;resolve();return}flushWaiters.push({resolve,reject})})}
persist=function(){clearTimeout(saveTimer);if(!hostLoaded||applyingHost)return;if(boot.binary){binaryRevision++;clearTimeout(draftTimer);draftTimer=null;sendBinaryEdit();return}clearTimeout(draftTimer);draftTimer=setTimeout(()=>{draftTimer=null;if(active&&(!boot.binary||active.type!=='pen')||window.inkspaceDiagram?.interacting()){persist();return}pageMessage();forceSaveView=true;sendEdit()},boot.binary?80:700)};
viewport.addEventListener('wheel',()=>persist(),{passive:true});for(const id of ['#in','#out','#home'])$(id)?.addEventListener('click',()=>persist());
flushPersist=function(){clearTimeout(draftTimer);draftTimer=null;sendEdit()};
saveNotebook=async function(saveAs=false){if(conflict&&saveAs){download(documentJSON(true),'application/json',notebook.title+'-草稿.inkspace.json');return true}codium.postMessage({type:'save',saveAs});return true};
openNotebook=function(){codium.postMessage({type:'command',command:'open'})};
$('#new').onclick=()=>codium.postMessage({type:'command',command:'new'});$('#load').onclick=openNotebook;$('#save').onclick=()=>saveNotebook();$('#save-as').onclick=()=>saveNotebook(true);
document.querySelector('header').insertBefore($('#tool-options'),$('.toolbar-actions'));
// VS Code owns file navigation and saving. Keep document resources beside the
// palette, and leave a narrow edge rail available when the sidebar is closed.
const sidebar=$('#diagram-sidebar'),rail=document.createElement('nav');rail.id='sidebar-rail';rail.setAttribute('aria-label','画布侧栏');
const sidebarToggle=$('#diagram-sidebar-toggle');sidebarToggle.textContent='◧';rail.append(sidebarToggle);sidebar.before(rail);
const diagramHeading=document.createElement('div');diagramHeading.className='sidebar-section-heading';diagramHeading.innerHTML='<strong>图形</strong>';
for(const [id,text,title]of [['diagram-import','⇥','导入 draw.io 图形'],['diagram-export','⇧','导出 draw.io 图形']]){const button=$('#'+id);button.textContent=text;button.title=title;button.setAttribute('aria-label',title);diagramHeading.append(button)}sidebar.querySelector('h3').replaceWith(diagramHeading);
const pdfHeading=document.createElement('div');pdfHeading.className='sidebar-section-heading';pdfHeading.innerHTML='<strong>PDF</strong>';const importPdf=$('#pdf-import');importPdf.textContent='＋';importPdf.title='导入 PDF 到当前页';importPdf.setAttribute('aria-label',importPdf.title);pdfHeading.append(importPdf);$('#pdf-library').before(pdfHeading);$('#pdf-library h3').remove();
for(const id of ['pdf-manage','pdf-export'])$('#pdf-library').append($('#'+id));
const utilities=document.createElement('div');utilities.id='sidebar-utilities';const svgExport=$('#svg');svgExport.textContent='导出 SVG';utilities.append(svgExport);sidebar.append(utilities);
for(const id of ['new','load','save','save-as'])$('#'+id).hidden=true;
$('.document-controls').hidden=true;
const statusBar=document.createElement('div');statusBar.id='input-status-bar';const statusText=document.createElement('span');statusText.id='input-status';statusText.textContent='Windows 原生输入 · 正在连接';const pagesButton=document.createElement('button');pagesButton.id='show-pages';pagesButton.textContent='页面';pagesButton.onclick=()=>codium.postMessage({type:'command',command:'pages'});statusBar.append(statusText,pagesButton);$('#editor-shell').append(statusBar);
function updateNativeStatus(){const state=window.inkspaceNative.status(),engine=window.desktop?.inkStatus();statusText.textContent=!engine?'高精度笔输入必需 · 请使用墨境 VSCodium 原生版':!state.connected?'高精度笔输入未就绪 · '+state.error:state.lastPrecise===false?'设备未提供高精度笔数据 · 已停止书写':state.lastPrecise===true?'Windows 原生高精度笔迹 · Cairo '+engine.cairo:'Windows 原生采样已接入 · Cairo '+engine.cairo+' · 等待触控笔';}
const nativeStatusTimer=setInterval(updateNativeStatus,1000);updateNativeStatus();window.addEventListener('beforeunload',()=>clearInterval(nativeStatusTimer),{once:true});
download=async function(data,mime,name){try{const bytes=typeof data==='string'?null:Array.from(new Uint8Array(await new Blob([data]).arrayBuffer()));codium.postMessage({type:'export',mime,name,...(bytes?{bytes}:{text:data})})}catch(error){toast('导出失败：'+error.message)}};
const hostPageRender=renderPageList;renderPageList=function(){hostPageRender();if(hostLoaded&&!applyingHost)pageMessage()};
function receiveDocument(message){
  const initial=!hostLoaded;
  if(message.history){finishInteraction();clearTimeout(draftTimer);draftTimer=null;editFlight=null;forceSaveView=false;conflict=false;codium.setState({...codium.getState(),text:message.text,version:message.version,dirty:false})}
  if(editFlight||contentSignature()!==lastContent&&hostLoaded){conflict=true;rememberDraft();toast('文件在画布外改变，已保留草稿；请另存或重新打开');return}
  try{const data=JSON.parse(message.text);if(!valid(data))throw Error('笔记内容无效');const state=codium.getState();applyingHost=true;adoptDocument(data);hostVersion=message.version;lastHostText=message.text;lastContent=contentSignature();savedDocument=lastContent;hostLoaded=true;applyingHost=false;conflict=false;
    if(initial&&state?.dirty&&state.text!==message.text){const draft=JSON.parse(state.text);if(valid(draft)){adoptDocument(draft);toast('已恢复尚未写入文件的画布草稿');persist()}}
    pageMessage();applyingHost=true;resize();applyingHost=false;if(message.history){codium.postMessage({type:'save-history',version:hostVersion});for(const waiter of flushWaiters.splice(0))waiter.resolve()}
  }catch(error){applyingHost=false;toast('打开失败：'+error.message);statusText.textContent='笔记无法打开：'+error.message}
}
window.addEventListener('message',async event=>{const message=event.data;
  if(message.type==='binary-external-change'){conflict=true;rememberDraft();toast('笔记在外部发生变化，已保留草稿；请重新打开文件');return}
  if(message.type==='binary-document'){
    try{if(!valid(message.model))throw Error('二进制笔记内容无效');if(hostLoaded&&!message.history&&(editFlight||contentSignature()!==lastContent))throw Error('文件在外部改变，请保存草稿后重新打开');const state=codium.getState();applyingHost=true;finishInteraction();clearTimeout(draftTimer);draftTimer=null;editFlight=null;adoptDocument(message.model);hostVersion=message.version;binaryBaseline=captureBinary();binaryRevision=0;lastContent=0;savedDocument=0;hostLoaded=true;conflict=false;
      if(state?.dirty&&state.patch&&state.version===hostVersion){InkNotebookDelta.apply(notebook,state.patch);adoptDocument(notebook);binaryRevision++;}
      resize();applyingHost=false;pageMessage();if(binaryRevision)persist();
    }catch(error){applyingHost=false;conflict=true;toast('打开失败：'+error.message)}return;
  }
  if(message.type==='document'){receiveDocument(message);return}
  if(message.type==='ack'&&editFlight?.id===message.id){const sent=editFlight;editFlight=null;hostVersion=message.version;if(message.error){conflict=true;rememberDraft();for(const waiter of flushWaiters.splice(0))waiter.reject(Error(message.error));toast(message.error);return}if(boot.binary)binaryBaseline=sent.captured;lastHostText=sent.text;lastContent=sent.signature;sendEdit();if(!editFlight&&!active&&draftTimer===null){forceSaveView=false;codium.setState({...codium.getState(),text:boot.binary?undefined:documentJSON(true),patch:undefined,version:hostVersion,dirty:false});for(const waiter of flushWaiters.splice(0))waiter.resolve()}return}
  if(message.type==='request'){try{let result=true;if(message.command==='tool'){if(!['pen','erase','pan','text','select','shape','diagram'].includes(message.tool))throw Error('未知工具');if(!window.inkspaceDiagram?.editing()&&!$('#editor').open){activateTool(message.tool,true,false);await flushed()}}else if(message.command==='copy')result=selectionClipboardText();else if(message.command==='paste'){if(!pasteSelectionText(message.text))await pasteItems([],message.text);await flushed()}else if(message.command==='undo'||message.command==='redo'){message.command==='undo'?undo():redo();await flushed()}else if(message.command==='flush')await flushed();else if(message.command==='page'){switchPage(message.page);pageMessage()}else if(message.command==='addPage'){$('#page-add').click();await flushed()}else if(message.command==='renamePage'){const page=notebook.pages.find(p=>p.id===message.page);if(page){page.title=message.title;renderPageList();persist();await flushed()}}else if(message.command==='deletePage'){if(notebook.pages.length===1)throw Error('至少保留一个页面');finishInteraction();rememberPage();const index=notebook.pages.findIndex(p=>p.id===message.page);if(index>=0){notebook.pages.splice(index,1);pageSessions.delete(message.page);if(notebook.activePage===message.page)switchPage(notebook.pages[Math.min(index,notebook.pages.length-1)].id);else{renderPageList();persist()}await flushed()}}else if(message.command==='diagnostic'&&boot.test)result=await runCodiumDiagnostic(message.action);else throw Error('不支持的画布操作');codium.postMessage({type:'response',id:message.id,result})}catch(error){codium.postMessage({type:'response',id:message.id,error:error.message})}}
});
async function runCodiumDiagnostic(action){
  if(action==='text-hit-testing'){
    await window.inkspaceCairoIdle();const saved={doc,view:{...view},history,future,tool,lastCanvasPointer};
    try{
      doc={...doc,notes:[{id:'hit-lower',x:40,y:80,width:320,markdown:'Lower'},{id:'hit-right',x:180,y:40,width:320,markdown:'Right'},{id:'hit-upper',x:40,y:40,width:320,markdown:'Upper'}],strokes:[],shapes:[],pdfs:[],diagram:undefined};history=[];future=[];tool='pen';clearSelection();
      const textHit=id=>{const cache=noteCache.get(id),range=document.createRange();range.selectNodeContents(cache.body.querySelector('p'));const rect=range.getClientRects()[0],hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);if(hit?.closest('.note')?.dataset.id!==id)throw Error('Adjacent text hit intercepted: '+id);return hit};
      for(const scale of [.75,1,2]){view={x:40,y:30,scale};render();for(const note of doc.notes)textHit(note.id)}
      view={x:40,y:30,scale:1};render();lastCanvasPointer='pen';textHit('hit-lower').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,button:0}));const input=$('.inline-note-editor');if(!input||input.value!=='Lower'||document.activeElement!==input||$('#editor').open)throw Error('Mouse double click after pen did not edit correct text');
      const r=input.getBoundingClientRect(),hit=document.elementFromPoint(r.left+8,r.top+10);if(hit!==input)throw Error('Inline text input is blocked');textHit('hit-right');window.inkspaceInlineText.finish();
      return{adjacentVertical:true,adjacentHorizontal:true,scales:3,doubleClickAfterPen:true,correctTextEdited:true,inputReceivesMouse:true};
    }finally{window.inkspaceInlineText.finish();finishInteraction();doc=saved.doc;view=saved.view;history=saved.history;future=saved.future;tool=saved.tool;lastCanvasPointer=saved.lastCanvasPointer;clearSelection();render();await window.inkspaceCairoIdle();persist();await flushed()}
  }
  if(action==='text-scale-hover'){
    await window.inkspaceCairoIdle();const saved={doc,view:{...view},history,future,tool};
    try{
      doc={...doc,notes:[{id:'scale-hover-text',x:40,y:40,width:320,markdown:'A long line of text to scale.'}],strokes:[],shapes:[],pdfs:[],diagram:undefined};history=[];future=[];tool='pan';view={x:80,y:60,scale:1};clearSelection();render();
      const cache=noteCache.get('scale-hover-text'),hit=cache.el.querySelector('.note-hit'),handle=cache.el.querySelector('.note-scale'),bar=cache.el.querySelector('.note-bar');clearPenCursor();
      hit.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}));if(!cache.el.classList.contains('mouse-hover')||getComputedStyle(handle).opacity!=='1')throw Error('Mouse hover does not expose text scale');
      updatePenCursor({pointerType:'pen',clientX:100,clientY:100});if(cache.el.classList.contains('mouse-hover')||getComputedStyle(handle).opacity!=='0'||getComputedStyle(cache.el,'::after').opacity!=='0')throw Error('Raw pen hover exposes text controls');
      hit.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'pen'}));if(cache.el.classList.contains('mouse-hover'))throw Error('Browser pen hover exposes text controls');clearPenCursor();hit.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}));
      const toolbar=bar.getBoundingClientRect();if(Math.abs(toolbar.width-parseFloat(cache.el.style.getPropertyValue('--text-width'))-12)>.6||Math.abs(toolbar.height-6)>.6)throw Error('Text toolbar dimensions incorrect');
      const n=doc.notes[0],width=n.width,markdown=n.markdown,b=window.inkspaceInlineText.bounds(n);selectBox({x:b.x-.1,y:b.y-.1,w:b.w+.2,h:b.h+.2});if(selected.notes.length!==1||selected.notes[0]!==0)throw Error('Tight text box selection failed');overlaySelection();const box=selectionBounds(),selection=$('#selection').getBoundingClientRect();if(Object.keys(b).some(key=>Math.abs(box[key]-b[key])>1e-6)||Math.abs(selection.width-b.w-8)>.6||Math.abs(selection.height-b.h-8)>.6)throw Error('Text selection includes transparent container');const r=handle.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
      const pointer=(target,type,dx,dy)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:223,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,clientX:x+dx,clientY:y+dy}));
      pointer(handle,'pointerdown',0,0);if(active?.type!=='resize-selection')throw Error('Text scale does not use group scale engine');const paints=renderStats.scenePaints;pointer(viewport,'pointermove',b.w*.5,b.h*.5);await new Promise(requestAnimationFrame);if(renderStats.scenePaints!==paints)throw Error('Text scaling repaints scene');pointer(viewport,'pointerup',b.w*.5,b.h*.5);await window.inkspaceCairoIdle();
      if(Math.abs(n.scale-1.5)>1e-6||n.width!==width||n.markdown!==markdown)throw Error('Text scale changes wrapping or size incorrectly');const after=window.inkspaceInlineText.bounds(n);if(Math.abs(after.x-b.x)>1e-6||Math.abs(after.y-b.y)>1e-6)throw Error('Text scale does not preserve opposite corner');if(view.x!==80||view.y!==60)throw Error('Canvas pan intercepts text scale');undo();await window.inkspaceCairoIdle();if(doc.notes[0].scale!==undefined)throw Error('Text scale undo failed');redo();await window.inkspaceCairoIdle();if(Math.abs(doc.notes[0].scale-1.5)>1e-6)throw Error('Text scale redo failed');
      return{mouseHoverOnly:true,rawAndBrowserPenIgnored:true,toolbarFullWidth:true,toolbarHeight:6,tightTextSelection:true,sharedSelectionScale:true,noScenePaintDuringDrag:true,wrappingPreserved:true,oppositeCornerFixed:true,mousePanNotIntercepted:true,undoRedo:true};
    }finally{clearPenCursor();finishInteraction();doc=saved.doc;view=saved.view;history=saved.history;future=saved.future;tool=saved.tool;clearSelection();render();await window.inkspaceCairoIdle();persist();await flushed()}
  }
  if(action==='text-guides'){
    await window.inkspaceCairoIdle();const saved={doc,view:{...view},history,future,tool};
    try{
      doc={...doc,notes:[{id:'guide-text',x:40,y:40,width:280,markdown:'Alpha beta\n\nGamma'}],strokes:[],shapes:[],pdfs:[],diagram:undefined};history=[];future=[];tool='pan';clearSelection();
      for(const scale of [.75,1,2]){
        view={x:80,y:60,scale};render();const cache=noteCache.get('guide-text'),n=doc.notes[0],paragraphs=cache.body.querySelectorAll('p'),first=document.createRange(),last=document.createRange();first.selectNodeContents(paragraphs[0].firstChild);last.selectNodeContents(paragraphs[1].firstChild);
        const start=first.getClientRects()[0],end=[...last.getClientRects()].at(-1),bar=cache.el.querySelector('.note-bar'),handle=cache.el.querySelector('.note-resize'),barRect=bar.getBoundingClientRect(),handleRect=handle.getBoundingClientRect();
        if(Math.abs(barRect.left-(start.left-6*scale))>.6||barRect.bottom>start.top||Math.abs(handleRect.right-barRect.right)>.6||Math.abs(handleRect.top-barRect.top)>.6)throw Error('Text handles do not align at scale '+scale);
        if(getComputedStyle(cache.el,'::after').borderTopStyle!=='solid')throw Error('Missing solid text guide');
        for(const y of [start.top-1,start.top-3,start.top-5]){const hit=document.elementFromPoint(start.left+5*scale,y);if(hit?.closest('.note')!==cache.el)throw Error('Gap interrupts text control hover at scale '+scale)}cache.el.classList.add('selected');for(const control of [bar,handle]){const r=control.getBoundingClientRect();if(!control.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)))throw Error('Text control obscured')}
        const pointer=(target,type,x,y)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:221,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y}));
        const originalView={...view};let x=handleRect.left+handleRect.width/2,y=handleRect.top+handleRect.height/2,width=n.width;pointer(handle,'pointerdown',x,y);pointer(viewport,'pointermove',x+8*scale,y);pointer(viewport,'pointerup',x+8*scale,y);if(Math.abs(n.width-width-8)>1e-6)throw Error('Text resize jumped to container edge');
        const move=bar.getBoundingClientRect(),oldX=n.x,oldY=n.y;x=move.left+move.width/2;y=move.top+move.height/2;pointer(bar,'pointerdown',x,y);pointer(viewport,'pointermove',x+10*scale,y+5*scale);pointer(viewport,'pointerup',x+10*scale,y+5*scale);if(Math.abs(n.x-oldX-10)>1e-6||Math.abs(n.y-oldY-5)>1e-6)throw Error('Text move handle failed');if(view.x!==originalView.x||view.y!==originalView.y)throw Error('Canvas pan intercepted text controls');
      }
      return{solidGrayGuide:true,controlsAboveText:true,continuousHoverRegion:true,controlsOverrideMousePan:true,scales:3,resizeWithoutJump:true,moveHandle:true};
    }finally{finishInteraction();doc=saved.doc;view=saved.view;history=saved.history;future=saved.future;tool=saved.tool;clearSelection();render();await window.inkspaceCairoIdle();persist();await flushed()}
  }
  if(action==='inline-text'){
    await window.inkspaceCairoIdle();const saved={doc,view:{...view},history,future,tool};
    try{
      doc={...doc,strokes:doc.strokes.slice(),notes:doc.notes.slice()};history=[];future=[];tool='pen';clearSelection();render();const originalCount=doc.notes.length,rect=viewport.getBoundingClientRect();
      lastCanvasPointer='mouse';viewport.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,button:0,clientX:rect.left+100,clientY:rect.top+120}));
      let input=$('.inline-note-editor');if(!input||document.activeElement!==input||$('#editor').open||doc.notes.length!==originalCount+1)throw Error('Double click did not create an inline editor');
      const noteId=doc.notes.at(-1).id,source='# 中文标题\n\n$x^2$';input.value=source;input.dispatchEvent(new Event('input',{bubbles:true}));await flushed();
      const textStyle=getComputedStyle(noteCache.get(noteId).el);if(textStyle.backgroundColor!=='rgba(0, 0, 0, 0)'||textStyle.borderTopColor!=='rgba(0, 0, 0, 0)'||textStyle.boxShadow!=='none'||textStyle.outlineStyle!=='none')throw Error('Text still has a visible frame');
      if(!window.inkspaceInlineText.isEditing()||doc.notes.at(-1).markdown!==source)throw Error('Inline typing was not saved or save closed the editor');
      const caret=input.selectionStart;interactiveZoom(view.scale*1.2,150,150);settleZoom();await window.inkspaceCairoIdle();if($('.inline-note-editor')!==input||input.selectionStart!==caret)throw Error('Zoom replaced the focused input');
      input.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter',ctrlKey:true}));if($('.inline-note-editor')||!noteCache.get(noteId).body.querySelector('.katex'))throw Error('Inline commit did not render Markdown/formula');
      undo();await window.inkspaceCairoIdle();if(doc.notes.length!==originalCount)throw Error('Creating and typing was not one undo step');redo();await window.inkspaceCairoIdle();
      const restored=doc.notes.find(n=>n.id===noteId);noteCache.get(noteId).el.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,button:0}));input=$('.inline-note-editor');if(!input||input.value!==source||$('#editor').open)throw Error('Existing text could not be edited inline');
      const inputRect=input.getBoundingClientRect(),sample={x:inputRect.left+15,y:inputRect.top+15,p:.7,id:201,precise:true,eraser:false},count=doc.strokes.length;
      await window.inkspaceNative.test('fixture',{packets:[{type:'pointerdown',samples:[sample]},{type:'pointermove',samples:[{...sample,x:sample.x+12}]},{type:'pointerup',samples:[{...sample,x:sample.x+12,p:0}]}]});await window.inkspaceCairoIdle();
      if(doc.strokes.length!==count+1||$('.inline-note-editor')!==input||restored.markdown!==source)throw Error('Pen writing over the inline text failed');
      window.inkspaceInlineText.finish();const filledCount=doc.notes.length;edit({id:crypto.randomUUID(),x:40,y:40,width:320,markdown:''});window.inkspaceInlineText.finish();if(doc.notes.length!==filledCount)throw Error('An unused text box was retained');await flushed();return{doubleClickCreates:true,noDialog:true,inputFocused:true,markdownFormula:true,autoSaved:true,zoomKeepsCaret:true,oneUndoStep:true,existingTextInline:true,penOverText:true,emptyBoxRemoved:true};
    }finally{window.inkspaceInlineText.finish();finishInteraction();doc=saved.doc;view=saved.view;history=saved.history;future=saved.future;tool=saved.tool;clearSelection();render();await window.inkspaceCairoIdle();persist();await flushed()}
  }
  if(action==='tool-state')return{tool,keyboardFocused:document.hasFocus()};
  if(action==='layout-state')return{fileMenuHidden:$('.document-controls').hidden,sidebarSwitchAtEdge:$('#diagram-sidebar-toggle').parentElement.id==='sidebar-rail',resourceImportInSidebar:sidebar.contains($('#pdf-import'))&&sidebar.contains($('#diagram-import')),calibrationInSidebar:!!$('#sidebar-utilities button'),background:backgroundSettings().type,visiblePaperCells:$('#a4-pages')?.querySelectorAll('rect[data-cell]').length||0};
  if(action==='erase-performance'){
    await window.inkspaceCairoIdle();const oldDoc=doc,oldView=view,oldTool=tool,oldHistory=history,oldFuture=future;
    try{
      doc={...doc,strokes:Array.from({length:1000},(_,i)=>({brush:'xournal',hasPressure:true,width:2,color:'#142632',points:Array.from({length:50},(_,j)=>({x:20+(i%50)*14+j*.05,y:20+Math.floor(i/50)*14+j*.002,p:.5}))})),notes:[],shapes:[],pdfs:[],diagram:undefined};view={x:40,y:30,scale:1};tool='erase';history=[];future=[];clearSelection();render();await window.inkspaceCairoIdle();
      const original=doc.strokes.slice(),rect=viewport.getBoundingClientRect(),sample=(x,y)=>({x:rect.left+view.x+x,y:rect.top+view.y+y,p:.6,id:191,precise:true,eraser:false}),points=Array.from({length:400},(_,i)=>sample(120,30+i*.6));
      const paints=renderStats.fullScenePaints,notesBuilt=renderStats.noteBuilds,segments=renderStats.eraseSegmentChecks||0,candidates=renderStats.eraseCandidates||0,frames=renderStats.eraseFrames||0,t=performance.now();
      await window.inkspaceNative.test('fixture',{packets:[{type:'pointerdown',samples:points.slice(0,1)},{type:'pointermove',samples:points.slice(1)},{type:'pointerup',samples:points.slice(-1)}]});await window.inkspaceCairoIdle();await flushed();
      const removed=1000-doc.strokes.length,checks=(renderStats.eraseSegmentChecks||0)-segments,nearby=(renderStats.eraseCandidates||0)-candidates,paintFrames=(renderStats.eraseFrames||0)-frames,elapsed=performance.now()-t;
      if(!removed||renderStats.fullScenePaints!==paints||renderStats.noteBuilds!==notesBuilt||paintFrames>2||checks>5000||nearby>200000)throw Error('Eraser did not stay incremental: '+JSON.stringify({removed,checks,nearby,paintFrames}));
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data.slice();render();await window.inkspaceCairoIdle();
      const full=ctx.getImageData(0,0,canvas.width,canvas.height).data;if(pixels.some((v,i)=>v!==full[i]))throw Error('Eraser region pixels differ from a full render');
      const remaining=doc.strokes.slice();undo();await window.inkspaceCairoIdle();if(doc.strokes.length!==1000||doc.strokes.some((s,i)=>s!==original[i]))throw Error('Eraser contact was not a single undo step');redo();await window.inkspaceCairoIdle();if(doc.strokes.length!==remaining.length)throw Error('Eraser redo failed');
      // A single coalesced jump crosses a stroke with neither endpoint nearby.
      doc={...doc,strokes:[{brush:'xournal',width:2,color:'#000000',points:[{x:300,y:100,p:.5},{x:300,y:200,p:.5}]}]};render();await window.inkspaceCairoIdle();
      await window.inkspaceNative.test('fixture',{packets:[{type:'pointerdown',samples:[sample(250,150)]},{type:'pointermove',samples:[sample(350,150)]},{type:'pointerup',samples:[sample(350,150)]}]});if(doc.strokes.length)throw Error('Fast eraser sweep skipped a crossed stroke');
      return{baselineStrokes:1000,samples:400,removed,segmentChecks:checks,nearbyCandidates:nearby,regionFrames:paintFrames,fullScenePaintsDuringErase:0,noteRebuilds:0,elapsedMs:elapsed,pixelsExact:true,oneUndoPerContact:true,fastSweep:true};
    }finally{finishInteraction();doc=oldDoc;view=oldView;tool=oldTool;history=oldHistory;future=oldFuture;clearSelection();render();await window.inkspaceCairoIdle();persist();await flushed()}
  }
  if(action==='ink-overlay-navigation'){
    await window.inkspaceCairoIdle();
    const oldDoc=doc,oldView=view,oldTool=tool,oldHistory=history,oldFuture=future,raster=desktop.inkRasterAsync;
    let release;let gate=new Promise(resolve=>release=resolve),block=false;
    desktop.inkRasterAsync=async payload=>{const bytes=await raster(payload);if(block)await gate;return bytes};
    try{
      doc={...doc,strokes:[],notes:[],shapes:[],pdfs:[],diagram:undefined};view={x:60,y:40,scale:1};history=[];future=[];tool='pen';clearSelection();render();
      const rect=viewport.getBoundingClientRect(),sample=(x,y)=>({x:rect.left+view.x+x,y:rect.top+view.y+y,p:.7,id:161,precise:true,eraser:false}),fixture=packets=>window.inkspaceNative.test('fixture',{packets});
      const alpha=(layer,x,y)=>layer.ctx.getImageData(Math.round((x+surface.padding)*surface.dpr)-4,Math.round((y+surface.padding)*surface.dpr)-4,8,8).data.some((v,i)=>i%4===3&&v);
      const blank=layer=>!layer.ctx.getImageData(0,0,layer.canvas.width,layer.canvas.height).data.some((v,i)=>i%4===3&&v);
      await fixture([{type:'pointerdown',samples:[sample(100,100)]},{type:'pointermove',samples:[sample(130,100)]}]);await window.inkspaceCairoIdle();block=true;
      await fixture([{type:'pointerup',samples:[sample(130,100)]}]);
      if(!window.inkspaceRetainedInkCount()||!blank(inkLayers[1]))throw Error('Pen-up left a second screen-fixed preview');
      const pointer=(type,x,y)=>viewport.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'mouse',pointerId:171,button:1,buttons:type==='pointerup'?0:4,clientX:rect.left+x,clientY:rect.top+y}));
      pointer('pointerdown',200,200);pointer('pointermove',220,210);await new Promise(r=>requestAnimationFrame(r));
      if(!$('#scene').style.transform)throw Error('Small pan did not use compositor preview');
      pointer('pointermove',380,270);await new Promise(r=>requestAnimationFrame(r));pointer('pointerup',380,270);
      if(window.inkspaceRetainedInkCount()||!blank(inkLayers[1])||!blank(inkLayers[2]))throw Error('Pan rebase left stale overlay pixels');
      release();await window.inkspaceCairoIdle();
      if(alpha(inkLayers[0],175,140)||!alpha(inkLayers[0],view.x+115,view.y+100))throw Error('Last stroke failed to follow pan');
      block=false;await fixture([{type:'pointerdown',samples:[sample(160,100)]},{type:'pointermove',samples:[sample(190,100)]}]);await window.inkspaceCairoIdle();
      gate=new Promise(resolve=>release=resolve);block=true;await fixture([{type:'pointerup',samples:[sample(190,100)]}]);
      pointer('pointerdown',200,200);pointer('pointermove',230,210);await new Promise(r=>requestAnimationFrame(r));release();await window.inkspaceCairoIdle();
      if(!alpha(inkLayers[0],paintedView.x+175,paintedView.y+100))throw Error('Async ink committed at the translated view during compositor pan');
      pointer('pointerup',230,210);if(!alpha(inkLayers[0],view.x+175,view.y+100)||!blank(inkLayers[1])||!blank(inkLayers[2]))throw Error('Ink completion during pan left stale pixels');
      interactiveZoom(1.2,200,150);settleZoom();await window.inkspaceCairoIdle();
      if(!blank(inkLayers[1])||!blank(inkLayers[2])||!alpha(inkLayers[0],view.x+115*view.scale,view.y+100*view.scale))throw Error('Zoom left stale or missing ink');
      for(const pointerType of ['pen','mouse']){const event=new PointerEvent('contextmenu',{bubbles:true,cancelable:true,pointerType,button:2});viewport.dispatchEvent(event);if(!event.defaultPrevented)throw Error('Canvas context menu was not suppressed')}
      const penDown=new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'pen',pointerId:181,clientX:rect.left+100,clientY:rect.top+100});viewport.dispatchEvent(penDown);if(!penDown.defaultPrevented)throw Error('Browser pen press-and-hold default remained enabled');
      return{liveLayerClearedOnPenUp:true,pendingInkFollowedPan:true,rebaseClearedOverlays:true,completionDuringPanCorrect:true,zoomPixelsCorrect:true,penAndMouseContextMenuSuppressed:true};
    }finally{release();desktop.inkRasterAsync=raster;finishInteraction();doc=oldDoc;view=oldView;tool=oldTool;history=oldHistory;future=oldFuture;clearSelection();render();await window.inkspaceCairoIdle();persist();await flushed()}
  }
  if(action==='binary-writing'){
    if(!boot.binary)throw Error('Binary editor required');await window.inkspaceCairoIdle();
    const serialize=documentJSON,raster=desktop.inkRasterAsync,paints=renderStats.fullScenePaints,initial=doc.strokes.length;let serializations=0;
    documentJSON=()=>{serializations++;throw Error('Full JSON serialization entered the writing path')};
    desktop.inkRasterAsync=async payload=>{const bytes=await raster(payload);if(payload.points.length<100)await new Promise(r=>setTimeout(r,60));return bytes};
    try{
      tool='pen';const r=viewport.getBoundingClientRect(),sample=(x,y,id=151)=>({x:r.left+view.x+x*view.scale,y:r.top+view.y+y*view.scale,p:.6,id,precise:true,eraser:false}),fixture=packets=>window.inkspaceNative.test('fixture',{packets});
      await fixture([{type:'pointerdown',samples:[sample(30,400)]},{type:'pointermove',samples:[sample(60,400)]}]);await window.inkspaceCairoIdle();
      await fixture([{type:'pointerup',samples:[sample(60,400)]}]);
      if(!window.inkspaceRetainedInkCount())throw Error('Completed ink not retained');
      await fixture([{type:'pointerdown',samples:[sample(90,400)]}]);
      const c=inkLayers[2].ctx,px=Math.round((view.x+surface.padding+45*view.scale)*surface.dpr),py=Math.round((view.y+surface.padding+400*view.scale)*surface.dpr);
      if(!c.getImageData(px-4,py-4,8,8).data.some((v,i)=>i%4===3&&v))throw Error('Previous stroke disappeared on next pen-down');
      await fixture([{type:'pointermove',samples:[sample(120,400)]},{type:'pointerup',samples:[sample(120,400)]}]);
      for(let i=0;i<28;i++)await fixture([{type:'pointerdown',samples:[sample(30+i*6,430)]},{type:'pointermove',samples:[sample(31+i*6,435)]},{type:'pointerup',samples:[sample(31+i*6,435)]}]);
      await window.inkspaceCairoIdle();await flushed();
      if(doc.strokes.length!==initial+30||window.inkspaceRetainedInkCount())throw Error('Completed ink failed to commit');
      if(renderStats.fullScenePaints!==paints)throw Error('Writing rebuilt complete scene');
      const stroke=doc.strokes.at(-1);undo();await flushed();redo();await flushed();if(doc.strokes.at(-1)!==stroke)throw Error('Binary undo/redo lost stroke');
      return{baselineStrokes:initial,addedStrokes:30,fullJsonSerializations:serializations,fullScenePaintsDuringWriting:0,previousStrokeStayedVisible:true,retainedLayerDrained:true,autoSaved:true,undoRedo:true};
    }finally{documentJSON=serialize;desktop.inkRasterAsync=raster}
  }
  if(action==='selection-scale'){
    await window.inkspaceCairoIdle();const oldDoc=doc,oldHistory=history,oldFuture=future,oldTool=tool;
    const image=document.createElement('canvas');image.width=image.height=1;
    doc={...doc,strokes:[{brush:'xournal',color:'#000000',width:3,points:[{x:100,y:100,p:.2},{x:140,y:120,p:.8}]}],shapes:[{kind:'rect',x:150,y:100,x2:180,y2:140,width:2,color:'#000000'}],notes:[{id:'selection-scale-text',x:200,y:100,width:160,markdown:'A long text keeps the same wrapping when its block is scaled.'},{id:'selection-scale-image',kind:'image',x:380,y:100,width:160,markdown:'',src:image.toDataURL('image/png'),aspect:1}]};history=[];future=[];tool='select';selected={strokes:[0],shapes:[0],notes:[0,1]};render();await window.inkspaceCairoIdle();
    try{const b=selectionBounds(),rect=viewport.getBoundingClientRect(),handle=$('#selection').querySelector('.selection-scale');if(!handle)throw Error('Missing scale handle');const pointer=(type,factor,target)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:41,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,clientX:rect.left+view.x+(b.x+b.w*factor)*view.scale,clientY:rect.top+view.y+(b.y+b.h*factor)*view.scale}));pointer('pointerdown',1,handle);pointer('pointermove',2,viewport);pointer('pointerup',2,viewport);await window.inkspaceCairoIdle();if(Math.abs(doc.strokes[0].width-6)>1e-6||Math.abs(doc.notes[0].scale-2)>1e-6||doc.notes[0].width!==160)throw Error('Mixed scale drag failed');if(Math.abs(doc.notes[1].scale-2)>1e-6||doc.notes[1].aspect!==1)throw Error('Image scale failed');if(doc.strokes[0].points[1].p!==.8)throw Error('Scale changed pressure');undo();if(doc.strokes[0].width!==3||doc.notes[0].scale!==undefined)throw Error('Scale undo failed');redo();if(Math.abs(doc.notes[0].scale-2)>1e-6)throw Error('Scale redo failed');return{mouseHandle:true,mixedBlocks:true,imageScaled:true,textLayoutPreserved:true,undoRedo:true};}
    finally{doc=oldDoc;history=oldHistory;future=oldFuture;tool=oldTool;clearSelection();render();await window.inkspaceCairoIdle();await flushed()}
  }
  if(action==='pen-pan-sidebar'){
    await window.inkspaceCairoIdle();const saved={doc,history,future,tool,view:{...view},collapsed:document.body.classList.contains('diagram-sidebar-hidden')};
    try{
      const image=document.createElement('canvas');image.width=image.height=1;
      doc={...doc,strokes:[],shapes:[],pdfs:[],diagram:undefined,notes:[{id:'pan-text',x:40,y:30,width:160,markdown:'[Link](https://example.com)\n\nText body for panning.'},{id:'pan-image',kind:'image',x:230,y:30,width:80,markdown:'',src:image.toDataURL('image/png'),aspect:1}]};history=[];future=[];tool='pan';clearSelection();setDiagramSidebarCollapsed(false);
      const original=JSON.stringify(doc.notes);
      for(const scale of [.75,1,2])for(const selector of ['.note:not(.image-note) .note-hit','.note:not(.image-note) .note-bar','.note:not(.image-note) .note-resize','.image-note img','.note-body a']){
        view={x:80,y:60,scale};render();await window.inkspaceNative.register();
        noteCache.get('pan-text').el.classList.add('selected');const target=$(selector),initialRect=target.getBoundingClientRect(),viewportRect=viewport.getBoundingClientRect();view.x-=Math.max(0,initialRect.right-viewportRect.right+40);render();noteCache.get('pan-text').el.classList.add('selected');const startView={...view},rect=target.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2,hit=document.elementFromPoint(x,y);if(!hit||!target.contains(hit))throw Error('Pen pan target obscured: '+selector);
        const sample=(dx,dy)=>({x:x+dx,y:y+dy,p:.6,id:131,precise:true,eraser:false});
        await window.inkspaceNative.test('fixture',{packets:[{type:'pointerdown',samples:[sample(0,0)]},{type:'pointermove',samples:[sample(24,16)]}]});
        if(active?.type!=='pan'||view.x!==startView.x+24||view.y!==startView.y+16)throw Error('Native pen did not pan over '+selector);
        await window.inkspaceNative.test('fixture',{packets:[{type:'pointerup',samples:[sample(24,16)]}]});
        if(active||JSON.stringify(doc.notes)!==original||doc.strokes.length||history.length)throw Error('Panning changed content or history');
      }
      const before=viewport.clientWidth;$('#diagram-sidebar-toggle').click();if(getComputedStyle($('#diagram-sidebar')).display!=='none'||viewport.clientWidth<=before||$('#diagram-sidebar-toggle').getAttribute('aria-expanded')!=='false'||codium.getState()?.diagramSidebarCollapsed!==true)throw Error('Sidebar did not collapse or remember');
      render();rememberDraft();if(getComputedStyle($('#diagram-sidebar')).display!=='none'||codium.getState()?.diagramSidebarCollapsed!==true)throw Error('Render or save reopened sidebar');
      $('#diagram-sidebar-toggle').click();if(viewport.clientWidth!==before||$('#diagram-sidebar-toggle').getAttribute('aria-expanded')!=='true'||codium.getState()?.diagramSidebarCollapsed!==false)throw Error('Sidebar did not reopen');
      return{nativePen:true,surfaces:5,zooms:3,canvasMoved:true,contentUnchanged:true,sidebarCollapseExpand:true,canvasExpanded:true,stateRemembered:true};
    }finally{finishInteraction();doc=saved.doc;history=saved.history;future=saved.future;tool=saved.tool;view=saved.view;setDiagramSidebarCollapsed(saved.collapsed);clearSelection();render();await window.inkspaceCairoIdle();await flushed()}
  }
  if(action==='selection-pen-preview'){
    await window.inkspaceCairoIdle();const saved={doc,history,future,tool,view:{...view}};
    try{
      doc={...doc,strokes:[{brush:'xournal',color:'#000000',width:3,points:Array.from({length:1000},(_,i)=>({x:40+i*.1,y:40+i*.04,p:.5}))}],notes:[],shapes:[]};history=[];future=[];tool='select';view={x:80,y:60,scale:1};clearSelection();render();await window.inkspaceCairoIdle();await window.inkspaceNative.register();
      const rect=viewport.getBoundingClientRect(),sample=(x,y)=>({x:rect.left+view.x+x,y:rect.top+view.y+y,p:.6,id:91,precise:true,eraser:false});
      const fixture=packets=>window.inkspaceNative.test('fixture',{packets});
      const selectPaints=renderStats.scenePaints;
      await fixture([{type:'pointerdown',samples:[sample(20,20)]},...Array.from({length:200},(_,i)=>({type:'pointermove',samples:[sample(20+(i+1)*.9,20+(i+1)*.9)]}))]);
      if(active?.type!=='select'||renderStats.scenePaints!==selectPaints)throw Error('Pen selection repainted the scene');
      await fixture([{type:'pointerup',samples:[sample(200,200)]}]);
      if(selected.strokes.length!==1)throw Error('Native pen selection failed');
      const b=selectionBounds(),h=$('#selection .selection-scale').getBoundingClientRect();
      await fixture([{type:'pointerdown',samples:[{...sample(0,0),x:h.left+h.width/2,y:h.top+h.height/2}]}]);
      if(active?.type!=='resize-selection')throw Error('Native pen scale handle failed');
      const paints=renderStats.scenePaints,outlines=renderStats.outlineBuilds;
      await fixture(Array.from({length:200},(_,i)=>({type:'pointermove',samples:[sample(b.x+b.w*(1+(i+1)/400),b.y+b.h*(1+(i+1)/400))]})));
      await new Promise(requestAnimationFrame);
      if(renderStats.scenePaints!==paints||renderStats.outlineBuilds!==outlines||doc.strokes[0].width!==3)throw Error('Pen scale regenerated ink during drag');
      await fixture([{type:'pointerup',samples:[sample(b.x+b.w*1.5,b.y+b.h*1.5)]}]);await window.inkspaceCairoIdle();
      if(Math.abs(doc.strokes[0].width-4.5)>1e-6)throw Error('Pen scale commit failed');
      return{nativePen:true,samples:400,scenePaintsDuringDrag:0,outlineBuildsDuringDrag:0,committed:true};
    }finally{finishInteraction();doc=saved.doc;history=saved.history;future=saved.future;tool=saved.tool;view=saved.view;clearSelection();render();await window.inkspaceCairoIdle();await flushed()}
  }
  if(action==='view-loading'){
    await window.inkspaceCairoIdle();const oldDoc=doc,oldView={...view},raster=desktop.inkRasterAsync;
    const strokes=Array.from({length:20},(_,i)=>({brush:'xournal',color:'#18232a',width:3,hasPressure:true,points:[{x:25000+100+(i%5)*60,y:25000+100+Math.floor(i/5)*40,p:.8},{x:25000+130+(i%5)*60,y:25000+110+Math.floor(i/5)*40,p:.8}]}));
    doc={...doc,strokes,notes:[],shapes:[]};view.x=0;view.y=0;view.scale=1;render();desktop.inkRasterAsync=async p=>{const data=await raster(p);await new Promise(r=>setTimeout(r,50));return data};
    try{const before=renderStats.fullScenePaints;view.x=-25000;view.y=-25000;render();const preview=document.createElement('canvas');preview.width=canvas.width;preview.height=canvas.height;const c=preview.getContext('2d',{willReadFrequently:true});worldTransform(c);for(const stroke of strokes){c.fillStyle=stroke.color;c.fill(new Path2D(cachedStroke(stroke).d))}const expected=c.getImageData(0,0,canvas.width,canvas.height).data,actual=ctx.getImageData(0,0,canvas.width,canvas.height).data;if(expected.some((v,i)=>v!==actual[i]))throw Error('Newly exposed strokes were missing before raster completed');await window.inkspaceCairoIdle();const paints=renderStats.fullScenePaints-before;if(paints>2)throw Error('Visible strokes were replaced incrementally');return{uncachedStrokes:20,immediateCompletePreview:true,scenePaints:paints};}
    finally{desktop.inkRasterAsync=raster;doc=oldDoc;Object.assign(view,oldView);render();await window.inkspaceCairoIdle()}
  }
  if(action==='a4-layout'){const layout=$('#page-layout');layout.value='a4-portrait';layout.dispatchEvent(new Event('change'));await flushed();const portrait=$('#a4-pages').dataset.pageWidth;layout.value='a4-landscape';layout.dispatchEvent(new Event('change'));await flushed();const landscape=$('#a4-pages').dataset.pageWidth;if(portrait===landscape||!$('#a4-pages g').getAttribute('stroke-dasharray'))throw Error('A4 layout dimensions failed');return{layout:doc.background.layout,portrait,landscape}}
  if(action==='pdf-layout'){
    await window.inkspacePdfWorkerReady;const source=await PdfApi.PDFDocument.create();for(const size of [[595.28,841.89],[841.89,595.28],[600,600]]){const page=source.addPage(size);page.drawText('A4 alignment test',{x:20,y:20})}
    const bytes=await source.save(),file=new File([bytes],'alignment.pdf',{type:'application/pdf'}),anchor=world(viewport.clientWidth/2,viewport.clientHeight/2),[w,h]=a4Dimensions();
    await $('#pdf-file').onchange({target:{files:[file],value:''}});const asset=doc.pdfs.at(-1);if(!asset||asset.pages.length!==3)throw Error('PDF import failed');
    for(let i=0;i<3;i++){const page=asset.pages[i];if(Math.abs(page.x+page.width/2-(Math.floor(anchor.x/w)+.5)*w)>1e-6||Math.abs(page.y+page.height/2-(Math.floor(anchor.y/h)+i+.5)*h)>1e-6||page.width>w+.001||page.height>h+.001)throw Error('PDF did not align with current A4 tile')}
    const exported=await exportAnnotatedPdf(),document=await PdfApi.PDFDocument.load(exported);if(document.getPageCount()!==3)throw Error('Scaled PDF export failed');
    const strokeCount=doc.strokes.length,noteCount=doc.notes.length,button=$('#pdf-assets button');if(!button||!button.getAttribute('aria-label').includes('alignment.pdf'))throw Error('PDF delete entry missing');button.click();if(doc.pdfs.some(a=>a.id===asset.id)||pdfSessions.has(asset.id)||doc.strokes.length!==strokeCount||doc.notes.length!==noteCount)throw Error('PDF delete lost annotations or kept resource');undo();if(doc.pdfs.at(-1).data!==asset.data)throw Error('PDF undo did not restore original');redo();if(doc.pdfs.some(a=>a.id===asset.id))throw Error('PDF delete redo failed');undo();undo();await flushed();return{aligned:true,mixedOrientation:true,gaplessTiles:true,exported:true,deleteUndoRedo:true,annotationsPreserved:true};
  }
  if(action==='diagram-interactions'){
    await window.inkspaceCairoIdle();const saved={doc,history,future,tool,view:{...view}},g=window.inkspaceDiagram.graph,api=window.inkspaceDiagram;
    try{
      doc={...doc,strokes:[],notes:[],shapes:[],pdfs:[],diagram:undefined};history=[];future=[];tool='diagram';view={x:20,y:20,scale:.75};render();
      const a=api.add('rect',{x:180,y:160}),b=api.add('rect',{x:500,y:250});g.setSelectionCell(a);
      const pointer=(target,type,x,y,options={})=>{const r=viewport.getBoundingClientRect();target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'mouse',pointerId:130,button:0,buttons:type==='pointerup'?0:1,clientX:r.left+x,clientY:r.top+y,...options}))};
      const bs=g.view.getState(b);for(const type of ['pointerdown','pointerup'])pointer(bs.shape.node,type,bs.x+bs.width/2,bs.y+bs.height/2,{shiftKey:true});if(g.getSelectionCount()!==2)throw Error('Shift click did not add to selection');
      g.clearSelection();pointer(viewport,'pointerdown',70,90);pointer(viewport,'pointermove',480,280);pointer(viewport,'pointerup',480,280);if(g.getSelectionCount()!==2)throw Error('Mouse selection box omitted diagrams');
      for(const button of [1,2]){const state=g.view.getState(a),x=state.x+state.width/2,y=state.y+state.height/2,old={...view};pointer(state.shape.node,'pointerdown',x,y,{button,buttons:button===1?4:2});pointer(state.shape.node,'pointermove',x+40,y+30,{button,buttons:button===1?4:2});pointer(state.shape.node,'pointerup',x+40,y+30,{button,buttons:0});if(view.x===old.x||view.y===old.y||g.getSelectionCount()!==2)throw Error('Mouse pan moved selection or lost selected cells')}
      const scale=view.scale,x=view.x,y=view.y;viewport.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaX:20,deltaY:30}));if(view.scale!==scale||view.x!==x-20||view.y!==y-30)throw Error('Diagram wheel did not scroll');settleZoom();
      viewport.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-100,clientX:viewport.getBoundingClientRect().left+300,clientY:viewport.getBoundingClientRect().top+200}));if(view.scale===scale)throw Error('Ctrl wheel did not zoom');settleZoom();
      g.setSelectionCell(a);const state=g.view.getState(a),target=state.shape.node,sx=state.x+state.width/2,sy=state.y+state.height/2,dx=(b.geometry.x-a.geometry.x+3)*view.scale;
      pointer(target,'pointerdown',sx,sy);pointer(target,'pointermove',sx+dx,sy+35);await new Promise(resolve=>requestAnimationFrame(resolve));if(!g.graphHandler.guide?.guideX||g.graphHandler.guide.guideX.node.style.visibility!=='visible')throw Error('Shape alignment guide missing');pointer(target,'pointerup',sx+dx,sy+35);if(Math.abs(a.geometry.x-b.geometry.x)>1e-7)throw Error('Shape alignment snap failed');
      return{shiftMultiSelect:true,boxSelect:true,middleAndRightPan:true,selectionPreservedOnPan:true,wheelScroll:true,ctrlWheelZoom:true,alignmentGuides:true};
    }finally{doc=saved.doc;history=saved.history;future=saved.future;tool=saved.tool;view=saved.view;clearSelection();render();await window.inkspaceCairoIdle();await flushed()}
  }
  if(action==='diagram-resize'){
    await window.inkspaceCairoIdle();const saved={doc,history,future,tool,view:{...view}},g=window.inkspaceDiagram.graph,api=window.inkspaceDiagram;
    try{
      doc={...doc,strokes:[],notes:[],shapes:[],pdfs:[],diagram:undefined,background:{...doc.background,layout:'a4-portrait'}};history=[];future=[];view={x:20,y:20,scale:.75};render();
      const a=api.add('rect',{x:250,y:220});
      for(const scale of [.75,1,2])for(const index of [0,2,5,7]){
        view.scale=scale;render();const geo=a.geometry.clone();geo.x=200;geo.y=180;geo.width=160;geo.height=90;g.resizeCell(a,geo);g.setSelectionCell(a);
        const handler=g.selectionCellsHandler.getHandler(a),sizer=handler.sizers[index],target=sizer.node,rect=viewport.getBoundingClientRect(),x=rect.left+sizer.bounds.getCenterX(),y=rect.top+sizer.bounds.getCenterY(),left=index===0||index===5,top=index<3,dx=left?-40:40,dy=top?-30:30;
        const pointer=(type,factor)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'mouse',pointerId:127,button:0,buttons:type==='pointerup'?0:1,clientX:x+dx*scale*factor,clientY:y+dy*scale*factor}));
        pointer('pointermove',0);pointer('pointerdown',0);if(g.connectionHandler.first||handler.index!==index)throw Error('Corner handle started a connector instead of resize');pointer('pointermove',1);
        await new Promise(resolve=>requestAnimationFrame(resolve));if(Math.abs(g.view.getState(a).shape.bounds.width-200*scale)>1e-7)throw Error('Corner resize did not visibly grow toward pointer: '+JSON.stringify({scale,index,bounds:handler.bounds,shape:g.view.getState(a).shape.bounds}));pointer('pointerup',1);
        if(Math.abs(a.geometry.x-(left?160:200))>1e-7||Math.abs(a.geometry.y-(top?150:180))>1e-7||a.geometry.width!==200||a.geometry.height!==120||g.getChildCells(g.getDefaultParent(),false,true).length)throw Error('Corner resize moved wrong anchor or created edge');
      }
      const [w,h]=a4Dimensions();view={x:0,y:0,scale:.75};render();const geo=a.geometry.clone();Object.assign(geo,{x:w-200,y:h-150,width:160,height:90});g.resizeCell(a,geo);g.setSelectionCell(a);
      const handler=g.selectionCellsHandler.getHandler(a),sizer=handler.sizers[7],target=sizer.node,rect=viewport.getBoundingClientRect(),sx=rect.left+sizer.bounds.getCenterX(),sy=rect.top+sizer.bounds.getCenterY();
      for(const type of ['pointermove','pointerdown','pointermove','pointerup']){const moved=type==='pointerup'||type==='pointermove'&&g.isMouseDown;target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'mouse',pointerId:128,button:0,buttons:type==='pointerup'?0:1,clientX:sx+(moved?37*.75:0),clientY:sy+(moved?58*.75:0)}))}
      if(Math.abs(a.geometry.x+a.geometry.width-w)>1e-7||Math.abs(a.geometry.y+a.geometry.height-h)>1e-7)throw Error('Resize did not align exact A4 edges');
      if([...$('#a4-pages').querySelectorAll('rect[data-cell]')].some(element=>element.dataset.cell!=='0,0'))throw Error('Resize allocated blank paper past page boundary');
      undo();redo();return{corners:4,zooms:3,oppositeAnchorFixed:true,livePreview:true,noConnectorCreated:true,exactPageEdges:true,noExtraPaper:true,undoRedo:true};
    }finally{doc=saved.doc;history=saved.history;future=saved.future;tool=saved.tool;view=saved.view;clearSelection();render();await window.inkspaceCairoIdle();await flushed()}
  }
  if(action==='diagram-drag'){
    await window.inkspaceCairoIdle();const saved={doc,history,future,tool,view:{...view}},api=window.inkspaceDiagram,g=api.graph;
    try{
      doc={...doc,diagram:undefined};history=[];future=[];view={x:150,y:100,scale:.8};render();await window.inkspaceCairoIdle();
      const a=api.add('rect',{x:90,y:100}),b=api.add('ellipse',{x:400,y:150});g.setSelectionCells([a,b]);const edge=api.connect();g.setSelectionCell(a);const initial=a.geometry.clone(),fullPaints=renderStats.fullScenePaints,originalRedraw=g.cellRenderer.redraw;let redraws=0;
      g.cellRenderer.redraw=function(...args){redraws++;return originalRedraw.apply(this,args)};
      let coalescedFrames=0;
      async function drag(x,y,altKey=false,samples=1){
        const state=g.view.getState(a),target=state.shape.node,rect=viewport.getBoundingClientRect(),start={x:rect.left+state.x+state.width/2,y:rect.top+state.y+state.height/2},dx=(x-a.geometry.x)*view.scale,dy=(y-a.geometry.y)*view.scale;
        const pointer=(type,factor)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:125,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,altKey,clientX:start.x+dx*factor,clientY:start.y+dy*factor}));
        pointer('pointermove',0);pointer('pointerdown',0);const count=redraws,frames=renderStats.diagramMoveFrames||0,border=g.selectionCellsHandler.getHandler(a)?.selectionBorder?.node;
        for(let i=1;i<=samples;i++)pointer('pointermove',i/samples);await new Promise(resolve=>requestAnimationFrame(resolve));
        if(samples===400){coalescedFrames=(renderStats.diagramMoveFrames||0)-frames;if(coalescedFrames!==1)throw Error('High-rate mouse events were not coalesced')}
        if(redraws!==count||renderStats.fullScenePaints!==fullPaints)throw Error('Drag rebuilt cells or full ink scene');
        if(!target.style.translate||!$('#diagram-layer [data-inkspace-drag]'))throw Error('Compositor drag preview missing');
        if(g.connectionHandler.marker.markedState)throw Error('Connection highlight stayed behind');if(border&&border.style.visibility!=='hidden')throw Error('Original selection border stayed behind');
        pointer('pointerup',1);if(target.style.translate||$('#diagram-layer [data-inkspace-drag]'))throw Error('Drag preview not cleaned');
      }
      try{
        await drag(3,4,false,400);if(Math.abs(a.geometry.x)>1e-8||Math.abs(a.geometry.y)>1e-8)throw Error('Top-left page snapping failed');
        const [w,h]=a4Dimensions();await drag(w-a.geometry.width-3,h-a.geometry.height-2);if(Math.abs(a.geometry.x+a.geometry.width-w)>1e-8||Math.abs(a.geometry.y+a.geometry.height-h)>1e-8)throw Error('Fractional A4 bottom-right snapping failed');
        const last=g.view.getState(edge).absolutePoints[0];if(!Number.isFinite(last.x))throw Error('Connector lost on drag commit');
        await drag(3,4,true);if(Math.abs(a.geometry.x-3)>1e-8||Math.abs(a.geometry.y-4)>1e-8)throw Error('Alt did not bypass snapping');
        undo();redo();
        const model=g.getModel();model.beginUpdate();try{for(let i=0;i<200;i++)g.insertVertex(g.getDefaultParent(),null,'Node '+i,500+(i%20)*100,200+Math.floor(i/20)*70,80,50);for(const cell of g.getChildCells(g.getDefaultParent(),true,false).slice(-20))g.insertEdge(g.getDefaultParent(),null,'',a,cell)}finally{model.endUpdate()}
        g.setSelectionCell(a);const state=g.view.getState(a),target=state.shape.node,rect=viewport.getBoundingClientRect(),sx=rect.left+state.x+state.width/2,sy=rect.top+state.y+state.height/2,latencies=[],count=redraws;
        const pointer=(type,x,y)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'mouse',pointerId:129,button:0,buttons:type==='pointerup'?0:1,altKey:true,clientX:sx+x,clientY:sy+y}));
        pointer('pointerdown',0,0);for(let frame=0;frame<60;frame++){for(let sample=0;sample<4;sample++)pointer('pointermove',40+frame+sample/4,30+Math.sin(frame/8)*20);await new Promise(resolve=>requestAnimationFrame(resolve));latencies.push(renderStats.diagramMoveLastMs)}
        if(redraws!==count||renderStats.fullScenePaints!==fullPaints)throw Error('Continuous drag rebuilt scene');pointer('pointerup',100,30+Math.sin(59/8)*20);
        latencies.sort((a,b)=>a-b);return{samples:400,coalescedFrames,stressVertices:202,stressConnectedEdges:21,continuousFrames:60,frameP95Ms:latencies[Math.floor(latencies.length*.95)],frameMaxMs:latencies.at(-1),cellRedrawsDuringDrag:0,inkScenePaintsDuringDrag:0,highlightClean:true,pageCornersExact:true,altBypass:true,undoRedo:true};
      }finally{g.cellRenderer.redraw=originalRedraw}
    }finally{doc=saved.doc;history=saved.history;future=saved.future;tool=saved.tool;view=saved.view;clearSelection();render();await window.inkspaceCairoIdle();await flushed()}
  }
  if(action==='diagram'){
    const api=window.inkspaceDiagram;if(!api?.graph)throw Error('Diagram editor did not initialize');
    const g=api.graph,model=g.getModel();
    const a=api.add('rect');g.cellLabelChanged(a,'Node $x^2$');g.moveCells([a],-400,0);
    const state=g.view.getState(a),rect=viewport.getBoundingClientRect(),target=state.shape.node,start={x:rect.left+state.x+state.width/2,y:rect.top+state.y+state.height/2},oldX=a.geometry.x,strokeCount=doc.strokes.length;
    const mouse=(type,dx,dy)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'mouse',pointerId:97,button:0,buttons:type==='pointerup'?0:1,clientX:start.x+dx,clientY:start.y+dy}));
    mouse('pointermove',0,0);mouse('pointerdown',0,0);mouse('pointermove',40,20);mouse('pointerup',40,20);
    if(a.geometry.x===oldX||doc.strokes.length!==strokeCount||g.getSelectionCell()!==a)throw Error('Actual mouse drag failed or started ink');
    const b=api.add('ellipse');g.cellLabelChanged(b,'Target');g.setSelectionCells([a,b]);const edge=api.connect();
    if(!edge||edge.source!==a||edge.target!==b)throw Error('Attached connector failed');
    g.clearSelection();const bs=g.view.getState(b),br=viewport.getBoundingClientRect(),bx=br.left+bs.x+bs.width/2,by=br.top+bs.y+bs.height/2,hit=document.elementFromPoint(bx,by);if(!hit?.closest('#diagram-layer'))throw Error('Vertex hit test failed');
    for(const type of ['pointermove','pointerdown','pointerup'])hit.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'mouse',pointerId:98,button:0,buttons:type==='pointerdown'?1:0,clientX:bx,clientY:by}));if(g.getSelectionCell()!==b||g.connectionHandler.isConnecting())throw Error('Node centre click was stolen by connector');
    viewport.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse',pointerId:99,button:0,buttons:1,clientX:br.right-15,clientY:br.bottom-60}));viewport.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'mouse',pointerId:99,button:0,clientX:br.right-15,clientY:br.bottom-60}));if(g.getSelectionCount())throw Error('Blank click kept diagram selection');
    // Hover first, then connect from the actual right boundary point.
    g.moveCells([a],200,0);const ast=g.view.getState(a),ar=viewport.getBoundingClientRect(),hover=g.view.getState(a).shape.node;
    const eventAt=(type,target,x,y)=>{if(!target)throw Error('Missing boundary event target: '+type);return target.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'mouse',pointerId:100,button:0,buttons:type==='pointerdown'||type==='pointermove'&&g.isMouseDown?1:0,clientX:ar.left+x,clientY:ar.top+y}))};
    eventAt('pointermove',hover,ast.x+ast.width/2,ast.y+ast.height/2);
    const point=g.connectionHandler.constraintHandler.focusIcons?.[1];if(!point)throw Error('Boundary connection points missing');
    const px=point.bounds.getCenterX(),py=point.bounds.getCenterY(),sourceIcon=point.node;eventAt('pointermove',sourceIcon,px,py);const currentIcon=g.connectionHandler.constraintHandler.focusIcons?.[1]?.node||sourceIcon;eventAt('pointerdown',currentIcon,px,py);
    if(!g.connectionHandler.first)throw Error('Boundary drag did not start connection');
    const targetState=g.view.getState(b),beforeConnect=g.getChildCells(g.getDefaultParent(),false,true).length;
    eventAt('pointermove',targetState.shape.node,targetState.x+targetState.width/2,targetState.y+targetState.height/2);eventAt('pointerup',targetState.shape.node,targetState.x+targetState.width/2,targetState.y+targetState.height/2);
    if(g.getChildCells(g.getDefaultParent(),false,true).length!==beforeConnect+1)throw Error('Boundary drag did not attach connection');undo();
    const before=edge.geometry?.clone(),oldState=g.view.getState(edge).absolutePoints.map(p=>p&&{x:p.x,y:p.y});
    g.moveCells([a],60,30);const after=g.view.getState(edge).absolutePoints;
    if(after[0].x===oldState[0].x&&after[0].y===oldState[0].y)throw Error('Connector did not follow its node');
    const replayBefore=api.replayCount,paintsBefore=renderStats.fullScenePaints,geo=a.geometry.clone();geo.width*=1.5;geo.height*=1.5;g.resizeCell(a,geo);
    if(Math.abs(a.geometry.width-240)>1e-6)throw Error('Node resize failed');
    undo();if(a.geometry.width!==160||api.replayCount!==replayBefore+1||renderStats.fullScenePaints!==paintsBefore)throw Error('Incremental diagram undo failed');redo();if(a.geometry.width!==240)throw Error('Incremental diagram redo failed');
    if(!$('#diagram-layer .katex'))throw Error('Offline formula label did not render');
    g.view.getState(a).shape.node.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,button:0}));if(!g.isEditing()||!nodeEditor())throw Error('Node text editor failed');g.cellEditor.textarea.textContent='Edited $\\frac{a}{b}$';g.stopEditing(false);
    if(!String(a.value).includes('Edited'))throw Error('Node text edit not committed');
    g.setSelectionCells([a,b,edge]);const clip=selectionClipboardText();pasteAnchor={x:viewport.clientWidth/2,y:viewport.clientHeight/2+200};
    const initial=g.getChildCells(g.getDefaultParent(),true,true).length;if(!pasteSelectionText(clip))throw Error('Diagram clipboard not accepted');
    if(g.getChildCells(g.getDefaultParent(),true,true).length!==initial+3)throw Error('Diagram copy/paste lost cells');
    const pastedEdge=g.getSelectionCells().find(c=>c.edge);if(!pastedEdge?.source||!pastedEdge.target||pastedEdge.source===a)throw Error('Pasted connector did not reference new nodes');
    undo();if(g.getChildCells(g.getDefaultParent(),true,true).length!==initial)throw Error('Diagram undo failed');redo();if(g.getChildCells(g.getDefaultParent(),true,true).length!==initial+3)throw Error('Diagram redo failed');
    const exportXML=doc.diagram,encoded=encodeURIComponent(exportXML),compressed=new Uint8Array(await new Response(new Blob([encoded]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    let binary='';for(const byte of compressed)binary+=String.fromCharCode(byte);
    const count=g.getChildCells(g.getDefaultParent(),true,true).length;
    await api.importXML('<mxfile><diagram>'+btoa(binary)+'</diagram></mxfile>');
    if(g.getChildCells(g.getDefaultParent(),true,true).length!==count*2)throw Error('Compressed draw.io import failed');undo();
    const formulaNode=$('#diagram-layer .katex .vlist');if(!formulaNode||getComputedStyle(formulaNode).position!=='relative')throw Error('Formula layout styles missing');
    const previewContainer=document.createElement('div');previewContainer.style.cssText='position:absolute;left:0;top:0;width:'+viewport.clientWidth+'px;height:'+viewport.clientHeight+'px';previewContainer.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="'+viewport.clientWidth+'" height="'+viewport.clientHeight+'">'+api.svg()+'</svg>';document.body.appendChild(previewContainer);const preview=await PdfApi.toPng(previewContainer,{backgroundColor:'#ffffff'});previewContainer.remove();
    await flushed();return{mouseEditor:true,mouseDragEvents:true,nodeResize:true,attachedArrows:true,formula:true,textEditing:true,copyPaste:true,undoRedo:true,drawioImport:true,boundaryDrag:true,centreDrag:true,blankDeselect:true,incrementalUndo:true,xml:doc.diagram,preview};
    function nodeEditor(){return $('#diagram-layer [contenteditable="true"]')}
  }
  if(action==='clipboard-roundtrip'){
    const before={strokes:doc.strokes.length,notes:doc.notes.length,shapes:doc.shapes.length};
    checkpoint();doc.strokes.push({brush:'xournal',color:'#000000',width:3,points:[{x:100,y:100,p:0},{x:130,y:120,p:.8}]});doc.shapes.push({kind:'rect',color:'#000000',width:2,x:140,y:100,x2:180,y2:140});
    const image=document.createElement('canvas');image.width=image.height=1;
    doc.notes.push({id:crypto.randomUUID(),x:200,y:100,width:160,markdown:'Copied text',scale:1.5},{id:crypto.randomUUID(),x:380,y:100,width:160,markdown:'',kind:'image',src:image.toDataURL('image/png'),aspect:1});
    selected={strokes:[before.strokes],shapes:[before.shapes],notes:[before.notes,before.notes+1]};render();
    const text=selectionClipboardText();pasteAnchor={x:viewport.clientWidth/2,y:viewport.clientHeight/2};
    if(!pasteSelectionText(text))throw Error('Selection paste not recognized');await flushed();
    if(doc.strokes.length!==before.strokes+2||doc.notes.length!==before.notes+4||doc.shapes.length!==before.shapes+2)throw Error('Mixed selection paste lost items');
    const stroke=doc.strokes.at(-1);if(stroke.points[0].p!==0||stroke.points[1].p!==.8||doc.notes.at(-2).scale!==1.5||doc.notes.at(-1).src!==doc.notes[before.notes+1].src)throw Error('Copied pressure/image/text changed');
    if(new Set(doc.notes.map(n=>n.id)).size!==doc.notes.length)throw Error('Copied note IDs reused');
    undo();await flushed();if(doc.strokes.length!==before.strokes+1||doc.notes.length!==before.notes+2)throw Error('Paste undo was not atomic');
    redo();await flushed();if(doc.strokes.length!==before.strokes+2)throw Error('Paste redo failed');
    return{mixedBlocks:true,pressurePreserved:true,imagesPreserved:true,uniqueIds:true,atomicUndoRedo:true,saved:true};
  }
  if(action==='history-key-once'){
    const count=doc.strokes.length;
    for(let i=0;i<3;i++){checkpoint();doc.strokes.push({brush:'xournal',width:3,color:'#000000',points:[{x:130+i*10,y:130,p:.5}]})}persist();await flushed();
    async function keyOnce(key,shiftKey=false){
      const before=doc.strokes.length,direction=shiftKey||key==='y'?1:-1;
      window.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key,code:key==='z'?'KeyZ':'KeyY',ctrlKey:true,shiftKey}));
      for(let i=0;i<5;i++)window.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key,ctrlKey:true,shiftKey,repeat:true}));
      for(let i=0;i<100&&doc.strokes.length===before;i++)await new Promise(r=>setTimeout(r,10));
      await flushed();if(doc.strokes.length!==before+direction)throw Error('A history key changed multiple strokes');
    }
    await keyOnce('z');await keyOnce('z');await keyOnce('z');
    if(doc.strokes.length!==count)throw Error('Three keys did not undo three strokes');
    await keyOnce('z',true);await keyOnce('y');await keyOnce('y');
    return{strokes:doc.strokes.length,oneStepPerKey:true,repeatedKeyIgnored:true};
  }
  if(action==='pending-edit'){checkpoint();doc.strokes.push({brush:'xournal',width:3,color:'#000000',points:[{x:120,y:120,p:.5}]});persist();return true}
  if(action==='undo-edit'){
    const count=doc.strokes.length;checkpoint();doc.strokes.push({brush:'xournal',width:3,color:'#000000',points:[{x:100,y:100,p:.5}]});persist();await flushed();return{strokes:count+1};
  }
  if(action==='auto-save'){await window.inkspaceNative.register();const rect=viewport.getBoundingClientRect(),sample={x:rect.left+160,y:rect.top+140,p:.7,id:51,precise:true,eraser:false};await window.inkspaceNative.test('fixture',{packets:[{type:'pointerdown',samples:[sample]},{type:'pointerup',samples:[{...sample,p:0}]}]});await new Promise(r=>setTimeout(r,1200));return{strokes:doc.strokes.length,pending:!!editFlight}}
  if(action==='settings'){const input=$('#background-kind');input.value='grid';input.dispatchEvent(new Event('change'));await flushed();return{background:doc.background.type}}
  if(action==='inspect')return{model:documentData(),hasNativeInk:hasNativeInk(),native:window.desktop?.inkStatus()||null,nativeState:window.inkspaceNative.status(),formula:!!document.querySelector('.katex'),version:hostVersion,dirty:contentSignature()!==lastContent,conflict,width:viewport.clientWidth,height:viewport.clientHeight};
  if(action==='write'){
    const rect=viewport.getBoundingClientRect(),count=doc.strokes.length;const pointer=(type,pointerType,x,y,p,buttons)=>viewport.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:77,pointerType,clientX:rect.left+x,clientY:rect.top+y,pressure:p,button:0,buttons}));
    pointer('pointerdown','mouse',100,100,.5,1);pointer('pointerup','mouse',130,130,0,0);if(doc.strokes.length!==count)throw Error('Mouse wrote ink');
    pointer('pointerdown','pen',100.125,100.375,.4,1);pointer('pointerup','pen',165.375,111.25,0,0);if(doc.strokes.length!==count)throw Error('Browser pen bypassed strict input guard');
    if(!hasNativeInk())return{pen:false,mouseIgnored:true,browserBlocked:true};
    let registration=await window.inkspaceNative.ready;for(let i=0;i<4&&!registration?.hooks;i++)registration=await window.inkspaceNative.register();if(!registration?.hooks)throw Error('Native HWND hook not ready: '+window.inkspaceNative.status().error);
    const samples=Array.from({length:30},(_,i)=>({x:rect.left+100.125+i*2.25,y:rect.top+100.375+i*.375,p:.4+i*.01,id:77,frame:i,precise:true,eraser:false}));await window.inkspaceNative.test('fixture',{packets:[{type:'pointerdown',samples:samples.slice(0,1)},{type:'pointermove',samples:samples.slice(1)},{type:'pointerup',samples:samples.slice(-1)}]});if(doc.strokes.length!==count+1)throw Error('Native packet did not write');
    checkpoint();doc.notes.push({id:crypto.randomUUID(),x:40,y:150,width:560,markdown:'# VSCodium 测试\n\n$x^2$'});render();persist();await flushed();return{pen:true,mouseIgnored:true,browserBlocked:true,samples:doc.strokes.at(-1).points.length,formula:!!document.querySelector('.katex'),nativeFixture:true};
  }
  if(action==='addPage'){$('#page-add').click();await flushed();return{pages:notebook.pages.length,activePage:notebook.activePage}}
  if(action==='cairo'){
    const payload={points:new Float64Array(Array.from({length:80},(_,i)=>[20.125+i*.625,40.375+15*Math.sin(i/10),.1+.85*i/80]).flat()),width:4,hasPressure:true,color:0x263f43,pixelWidth:160,pixelHeight:120,scale:1.5,tx:3.25,ty:2.375};const started=performance.now(),rgba=await desktop.inkRasterAsync(payload);return{payload:{...payload,points:Array.from(payload.points)},rgba:Array.from(rgba),elapsed:performance.now()-started};
  }
  if(action==='performance'){
    await window.inkspaceNative.register();await window.inkspaceCairoIdle();
    const rect=viewport.getBoundingClientRect(),original=desktop.inkRaster,started=performance.now(),initialPaints=renderStats.livePaints;
    let syncCalls=0,ticks=0,maxGap=0,last=performance.now();desktop.inkRaster=()=>{syncCalls++;throw Error('Synchronous raster on writing path')};
    const timer=setInterval(()=>{const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;ticks++},5);
    const points=Array.from({length:1500},(_,i)=>({x:rect.left+90.125+i*.35,y:rect.top+190.375+65*Math.sin(i/55),p:.35+.25*Math.sin(i/110),id:96,precise:true,eraser:false}));
    try{
      await window.inkspaceNative.test('fixture',{packets:[{type:'pointerdown',samples:points.slice(0,1)}]});
      for(let i=1;i<points.length;i+=50){await window.inkspaceNative.test('fixture',{packets:[{type:'pointermove',samples:points.slice(i,i+50)}]});await new Promise(resolve=>setTimeout(resolve,5))}
      let releaseSerializations=0,releaseSceneCommits=0;
      const originalJSON=documentJSON,originalSignature=contentSignature,originalCommit=commitScene;
      documentJSON=function(...args){releaseSerializations++;return originalJSON(...args)};contentSignature=function(...args){releaseSerializations++;return originalSignature(...args)};commitScene=function(...args){releaseSceneCommits++;return originalCommit(...args)};
      try{await window.inkspaceNative.test('fixture',{packets:[{type:'pointerup',samples:[{...points.at(-1),p:0}]}]})}
      finally{documentJSON=originalJSON;contentSignature=originalSignature;commitScene=originalCommit}
      await window.inkspaceCairoIdle();const stroke=doc.strokes.at(-1),cache=cachedStroke(stroke);
      if(stroke.points.length!==1500||!cache.cairoCanvas||syncCalls||renderStats.livePaints===initialPaints)throw Error('Async rendering lost samples or blocked on sync raster');
      const reference=document.createElement('canvas');reference.width=canvas.width;reference.height=canvas.height;const referenceContext=reference.getContext('2d');worldTransform(referenceContext);paintScene(referenceContext);const expected=referenceContext.getImageData(0,0,canvas.width,canvas.height).data,actualPixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      if(expected.some((value,index)=>value!==actualPixels[index]))throw Error('Partial release composition differs from full native scene');
      if(releaseSerializations||releaseSceneCommits)throw Error('Pointerup synchronously serialized or rebuilt the scene');
      const result={samples:stroke.points.length,synchronousRasterCalls:syncCalls,releaseSerializations,releaseSceneCommits,releasePixelsExact:true,livePaints:renderStats.livePaints-initialPaints,eventLoopTicks:ticks,maxEventLoopGapMs:maxGap,totalMs:performance.now()-started};
      undo();await window.inkspaceCairoIdle();await flushed();return result;
    }finally{clearInterval(timer);desktop.inkRaster=original}
  }
  if(action==='geometry')return window.inkspaceNative.test('layout');
  if(action==='dots'){
    await window.inkspaceNative.register();await window.inkspaceCairoIdle();
    const rect=viewport.getBoundingClientRect(),before=doc.strokes.length,oldWidth=$('#width').value,originalRaster=desktop.inkRasterAsync;
    $('#width').value='2';let requests=0;
    desktop.inkRasterAsync=async payload=>{const index=requests++;const data=await originalRaster(payload);await new Promise(resolve=>setTimeout(resolve,index%3===0?60:5));return data};
    try{
      const packets=[];for(let i=0;i<60;i++){const sample={x:rect.left+280.125+(i%10)*5,y:rect.top+220.375+Math.floor(i/10)*5,p:.7,id:97,precise:true,eraser:false};packets.push({type:'pointerdown',samples:[sample]},{type:'pointerup',samples:[{...sample,p:0}]})}
      await window.inkspaceNative.test('fixture',{packets});await window.inkspaceCairoIdle();
      const added=doc.strokes.slice(before);if(added.length!==60||added.some(s=>s.points.length!==1))throw Error('Rapid dot input lost strokes');
      const reference=document.createElement('canvas');reference.width=canvas.width;reference.height=canvas.height;const context=reference.getContext('2d');worldTransform(context);paintScene(context);
      const expected=context.getImageData(0,0,canvas.width,canvas.height).data,actual=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      if(expected.some((value,index)=>value!==actual[index]))throw Error('Rapid dot composition erased neighbouring pixels');
      const result={dots:added.length,reusedPointerId:true,outOfOrderRaster:true,pixelsExact:true};
      doc.strokes.splice(before);history.splice(Math.max(0,history.length-60));render();await window.inkspaceCairoIdle();await flushed();return result;
    }finally{$('#width').value=oldWidth;desktop.inkRasterAsync=originalRaster}
  }
  if(action==='zoom'){
    await window.inkspaceNative.register();await window.inkspaceCairoIdle();
    const rect=viewport.getBoundingClientRect(),before=doc.strokes.length,original={...view},raster=desktop.inkRasterAsync;
    const sample={x:rect.left+210.25,y:rect.top+160.75,p:.7,id:99,precise:true,eraser:false};
    await window.inkspaceNative.test('fixture',{packets:[{type:'pointerdown',samples:[sample]},{type:'pointermove',samples:[{...sample,x:sample.x+40}]},{type:'pointerup',samples:[{...sample,x:sample.x+40,p:0}]}]});await window.inkspaceCairoIdle();
    desktop.inkRasterAsync=async p=>{const data=await raster(p);await new Promise(r=>setTimeout(r,40));return data};
    try{
      let continuous=true;for(const scale of [1.3,.8,1.5,.9,1.2]){view.scale=original.scale*scale;render();const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;continuous&&=pixels.some((v,i)=>i%4===3&&v>0)}
      await window.inkspaceCairoIdle();const reference=document.createElement('canvas');reference.width=canvas.width;reference.height=canvas.height;const c=reference.getContext('2d');worldTransform(c);paintScene(c);
      const expected=c.getImageData(0,0,canvas.width,canvas.height).data,actual=ctx.getImageData(0,0,canvas.width,canvas.height).data;if(!continuous||expected.some((v,i)=>v!==actual[i]))throw Error('Zoom lost visible ink or retained stale pixels');
      let panRequests=0;desktop.inkRasterAsync=async p=>{panRequests++;return raster(p)};view.x+=24;render();await window.inkspaceCairoIdle();view.x-=24;render();await window.inkspaceCairoIdle();if(panRequests)throw Error('Pan unnecessarily rerasterized cached strokes');return{continuous:true,finalPixelsExact:true,rapidZooms:5,panRasterRequests:panRequests};
    }finally{desktop.inkRasterAsync=raster;Object.assign(view,original);doc.strokes.splice(before);history.pop();render();await window.inkspaceCairoIdle();await flushed()}
  }
  if(action==='dense'){
    await window.inkspaceNative.register();const rect=viewport.getBoundingClientRect(),count=doc.strokes.length,points=Array.from({length:300},(_,i)=>({x:rect.left+160.123+i*.0192,y:rect.top+120.234+i*.0275,p:.5+i*.001,id:88,precise:true,eraser:false}));await window.inkspaceNative.test('fixture',{packets:[{type:'pointerdown',samples:points.slice(0,1)},{type:'pointermove',samples:points.slice(1)},{type:'pointerup',samples:[{...points.at(-1),p:0}]}]});const stored=doc.strokes.at(-1).points;for(let i=0;i<300;i++){const expected=world(points[i].x-rect.left,points[i].y-rect.top);if(Math.abs(stored[i].x-expected.x)>1e-8||Math.abs(stored[i].y-expected.y)>1e-8)throw Error('Dense native coordinates rounded or misaligned')}if(doc.strokes.length!==count+1||stored.length!==300)throw Error('Native samples lost');undo();await flushed();return{samples:stored.length,unrounded:true,dpr:surface.dpr};
  }
  if(action==='cancel'){
    const rect=viewport.getBoundingClientRect(),count=doc.strokes.length,sample={x:rect.left+220.125,y:rect.top+100.375,p:.4,id:78,precise:true,eraser:false};await window.inkspaceNative.register();await window.inkspaceNative.test('fixture',{packets:[{type:'pointerdown',samples:[sample]},{type:'pointermove',samples:[{...sample,x:10000,y:10000,precise:false}]},{type:'pointerup',samples:[{...sample,precise:false}]}]});if(active||nativeContact||doc.strokes.length!==count+1||doc.strokes.at(-1).points.length!==1)throw Error('Lost precision did not cancel native contact safely');const pixelSample={...sample,id:79,precise:false};await window.inkspaceNative.test('fixture',{packets:[{type:'pointerdown',samples:[pixelSample]},{type:'pointerup',samples:[pixelSample]}]});if(doc.strokes.length!==count+1)throw Error('Pixel-only pen wrote ink');await flushed();return{cancelled:true,pixelInputBlocked:true};
  }
  if(action==='capture'){await window.inkspaceCairoIdle();return window.inkspaceNative.capture()}
  if(action==='assets'){
    await document.fonts.ready;
    const imageCanvas=document.createElement('canvas');imageCanvas.width=32;imageCanvas.height=16;imageCanvas.getContext('2d').fillRect(0,0,32,16);const blob=await new Promise(resolve=>imageCanvas.toBlob(resolve));await pasteItems([new File([blob],'test.png',{type:'image/png'})],'');await flushed();
    const fixture=await PdfApi.PDFDocument.create();fixture.addPage().drawText('VSCodium PDF fixture');const asset={id:crypto.randomUUID(),name:'fixture.pdf',data:pdfBase64(await fixture.save()),pages:[]};const entry=await openPdf(asset),pdf=await Promise.race([entry.promise,new Promise((_,reject)=>setTimeout(()=>reject(Error('PDF worker did not initialize: '+PdfApi.GlobalWorkerOptions.workerSrc)),7000))]),text=(await(await pdf.getPage(1)).getTextContent()).items.map(item=>item.str).join(' ');await pdf.loadingTask.destroy();pdfSessions.delete(asset.id);
    return{image:doc.notes.some(note=>note.kind==='image'),pdf:text,fonts:document.fonts.check('16px KaTeX_Main')};
  }
  throw Error('Unknown diagnostic action');
}
window.addEventListener('beforeunload',()=>{if(hostLoaded)rememberDraft()});
codium.postMessage({type:'ready'});resize();
