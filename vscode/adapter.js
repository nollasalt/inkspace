// Writing is allowed only through the high-precision native host bridge.
const codium=(window.inkspaceCalibrationApi||acquireVsCodeApi()),boot=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob($('#inkspace-boot').content),c=>c.charCodeAt(0))));
let hostVersion=0,hostLoaded=false,applyingHost=false,editFlight=null,editSequence=0,lastHostText='',lastContent='',conflict=false,forceSaveView=false,flushWaiters=[],draftTimer=null;
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
function rememberDraft(){codium.setState({text:documentJSON(true),version:hostVersion,dirty:contentSignature()!==lastContent})}
function sendEdit(){if(!hostLoaded||applyingHost||active||window.inkspaceDiagram?.interacting()||draftTimer!==null&&!forceSaveView)return;if(conflict)return;const signature=contentSignature();if(signature===lastContent&&!editFlight&&(!forceSaveView||documentJSON(true)===lastHostText))return;rememberDraft();if(editFlight)return;editFlight={id:++editSequence,text:documentJSON(true),signature};codium.postMessage({type:'edit',id:editFlight.id,text:editFlight.text,version:hostVersion,baseText:lastHostText,autoSave:true})}
function flushed(){return new Promise((resolve,reject)=>{if(conflict){reject(Error('文件冲突，请另存草稿或重新打开'));return}finishInteraction();clearTimeout(draftTimer);draftTimer=null;forceSaveView=true;sendEdit();if(!editFlight){forceSaveView=false;resolve();return}flushWaiters.push({resolve,reject})})}
persist=function(){clearTimeout(saveTimer);if(!hostLoaded||applyingHost)return;clearTimeout(draftTimer);draftTimer=setTimeout(()=>{draftTimer=null;if(active||window.inkspaceDiagram?.interacting()){persist();return}pageMessage();forceSaveView=true;sendEdit()},700)};
viewport.addEventListener('wheel',()=>persist(),{passive:true});for(const id of ['#in','#out','#home'])$(id)?.addEventListener('click',()=>persist());
flushPersist=function(){clearTimeout(draftTimer);draftTimer=null;sendEdit()};
saveNotebook=async function(saveAs=false){if(conflict&&saveAs){download(documentJSON(true),'application/json',notebook.title+'-草稿.inkspace.json');return true}codium.postMessage({type:'save',saveAs});return true};
openNotebook=function(){codium.postMessage({type:'command',command:'open'})};
$('#new').onclick=()=>codium.postMessage({type:'command',command:'new'});$('#load').onclick=openNotebook;$('#save').onclick=()=>saveNotebook();$('#save-as').onclick=()=>saveNotebook(true);
document.querySelector('header').insertBefore($('#tool-options'),$('.toolbar-actions'));
const statusBar=document.createElement('div');statusBar.id='input-status-bar';const statusText=document.createElement('span');statusText.id='input-status';statusText.textContent='Windows 原生输入 · 正在连接';const pagesButton=document.createElement('button');pagesButton.id='show-pages';pagesButton.textContent='页面';pagesButton.onclick=()=>codium.postMessage({type:'command',command:'pages'});statusBar.append(statusText,pagesButton);$('#editor-shell').append(statusBar);
function updateNativeStatus(){const state=window.inkspaceNative.status(),engine=window.desktop?.inkStatus();statusText.textContent=!engine?'高精度笔输入必需 · 请使用墨境 VSCodium 原生版':!state.connected?'高精度笔输入未就绪 · '+state.error:state.lastPrecise===false?'设备未提供高精度笔数据 · 已停止书写':state.lastPrecise===true?'Windows 原生高精度笔迹 · Cairo '+engine.cairo:'Windows 原生采样已接入 · Cairo '+engine.cairo+' · 等待触控笔';}
const nativeStatusTimer=setInterval(updateNativeStatus,1000);updateNativeStatus();window.addEventListener('beforeunload',()=>clearInterval(nativeStatusTimer),{once:true});
download=async function(data,mime,name){try{const bytes=typeof data==='string'?null:Array.from(new Uint8Array(await new Blob([data]).arrayBuffer()));codium.postMessage({type:'export',mime,name,...(bytes?{bytes}:{text:data})})}catch(error){toast('导出失败：'+error.message)}};
const hostPageRender=renderPageList;renderPageList=function(){hostPageRender();if(hostLoaded&&!applyingHost)pageMessage()};
function receiveDocument(message){
  const initial=!hostLoaded;
  if(message.history){finishInteraction();clearTimeout(draftTimer);draftTimer=null;editFlight=null;forceSaveView=false;conflict=false;codium.setState({text:message.text,version:message.version,dirty:false})}
  if(editFlight||contentSignature()!==lastContent&&hostLoaded){conflict=true;rememberDraft();toast('文件在画布外改变，已保留草稿；请另存或重新打开');return}
  try{const data=JSON.parse(message.text);if(!valid(data))throw Error('笔记内容无效');const state=codium.getState();applyingHost=true;adoptDocument(data);hostVersion=message.version;lastHostText=message.text;lastContent=contentSignature();savedDocument=lastContent;hostLoaded=true;applyingHost=false;conflict=false;
    if(initial&&state?.dirty&&state.text!==message.text){const draft=JSON.parse(state.text);if(valid(draft)){adoptDocument(draft);toast('已恢复尚未写入文件的画布草稿');persist()}}
    pageMessage();applyingHost=true;resize();applyingHost=false;if(message.history){codium.postMessage({type:'save-history',version:hostVersion});for(const waiter of flushWaiters.splice(0))waiter.resolve()}
  }catch(error){applyingHost=false;toast('打开失败：'+error.message);statusText.textContent='笔记无法打开：'+error.message}
}
window.addEventListener('message',async event=>{const message=event.data;
  if(message.type==='document'){receiveDocument(message);return}
  if(message.type==='ack'&&editFlight?.id===message.id){const sent=editFlight;editFlight=null;hostVersion=message.version;if(message.error){conflict=true;rememberDraft();for(const waiter of flushWaiters.splice(0))waiter.reject(Error(message.error));toast(message.error);return}lastHostText=sent.text;lastContent=sent.signature;sendEdit();if(!editFlight&&!active&&draftTimer===null){forceSaveView=false;codium.setState({text:documentJSON(true),version:hostVersion,dirty:false});for(const waiter of flushWaiters.splice(0))waiter.resolve()}return}
  if(message.type==='request'){try{let result=true;if(message.command==='copy')result=selectionClipboardText();else if(message.command==='paste'){if(!pasteSelectionText(message.text))await pasteItems([],message.text);await flushed()}else if(message.command==='undo'||message.command==='redo'){message.command==='undo'?undo():redo();await flushed()}else if(message.command==='flush')await flushed();else if(message.command==='page'){switchPage(message.page);pageMessage()}else if(message.command==='addPage'){$('#page-add').click();await flushed()}else if(message.command==='renamePage'){const page=notebook.pages.find(p=>p.id===message.page);if(page){page.title=message.title;renderPageList();persist();await flushed()}}else if(message.command==='deletePage'){if(notebook.pages.length===1)throw Error('至少保留一个页面');finishInteraction();rememberPage();const index=notebook.pages.findIndex(p=>p.id===message.page);if(index>=0){notebook.pages.splice(index,1);pageSessions.delete(message.page);if(notebook.activePage===message.page)switchPage(notebook.pages[Math.min(index,notebook.pages.length-1)].id);else{renderPageList();persist()}await flushed()}}else if(message.command==='diagnostic'&&boot.test)result=await runCodiumDiagnostic(message.action);else throw Error('不支持的画布操作');codium.postMessage({type:'response',id:message.id,result})}catch(error){codium.postMessage({type:'response',id:message.id,error:error.message})}}
});
async function runCodiumDiagnostic(action){
  if(action==='selection-scale'){
    await window.inkspaceCairoIdle();const oldDoc=doc,oldHistory=history,oldFuture=future,oldTool=tool;
    const image=document.createElement('canvas');image.width=image.height=1;
    doc={...doc,strokes:[{brush:'xournal',color:'#000000',width:3,points:[{x:100,y:100,p:.2},{x:140,y:120,p:.8}]}],shapes:[{kind:'rect',x:150,y:100,x2:180,y2:140,width:2,color:'#000000'}],notes:[{id:'selection-scale-text',x:200,y:100,width:160,markdown:'A long text keeps the same wrapping when its block is scaled.'},{id:'selection-scale-image',kind:'image',x:380,y:100,width:160,markdown:'',src:image.toDataURL('image/png'),aspect:1}]};history=[];future=[];tool='select';selected={strokes:[0],shapes:[0],notes:[0,1]};render();await window.inkspaceCairoIdle();
    try{const b=selectionBounds(),rect=viewport.getBoundingClientRect(),handle=$('#selection').querySelector('.selection-scale');if(!handle)throw Error('Missing scale handle');const pointer=(type,factor,target)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:41,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,clientX:rect.left+view.x+(b.x+b.w*factor)*view.scale,clientY:rect.top+view.y+(b.y+b.h*factor)*view.scale}));pointer('pointerdown',1,handle);pointer('pointermove',2,viewport);pointer('pointerup',2,viewport);await window.inkspaceCairoIdle();if(Math.abs(doc.strokes[0].width-6)>1e-6||Math.abs(doc.notes[0].scale-2)>1e-6||doc.notes[0].width!==160)throw Error('Mixed scale drag failed');if(Math.abs(doc.notes[1].scale-2)>1e-6||doc.notes[1].aspect!==1)throw Error('Image scale failed');if(doc.strokes[0].points[1].p!==.8)throw Error('Scale changed pressure');undo();if(doc.strokes[0].width!==3||doc.notes[0].scale!==undefined)throw Error('Scale undo failed');redo();if(Math.abs(doc.notes[0].scale-2)>1e-6)throw Error('Scale redo failed');return{mouseHandle:true,mixedBlocks:true,imageScaled:true,textLayoutPreserved:true,undoRedo:true};}
    finally{doc=oldDoc;history=oldHistory;future=oldFuture;tool=oldTool;clearSelection();render();await window.inkspaceCairoIdle();await flushed()}
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
    try{const before=renderStats.fullScenePaints;view.x=-25000;view.y=-25000;render();const preview=document.createElement('canvas');preview.width=canvas.width;preview.height=canvas.height;const c=preview.getContext('2d');worldTransform(c);for(const stroke of strokes){c.fillStyle=stroke.color;c.fill(new Path2D(cachedStroke(stroke).d))}const expected=c.getImageData(0,0,canvas.width,canvas.height).data,actual=ctx.getImageData(0,0,canvas.width,canvas.height).data;if(expected.some((v,i)=>v!==actual[i]))throw Error('Newly exposed strokes were missing before raster completed');await window.inkspaceCairoIdle();const paints=renderStats.fullScenePaints-before;if(paints>2)throw Error('Visible strokes were replaced incrementally');return{uncachedStrokes:20,immediateCompletePreview:true,scenePaints:paints};}
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
  if(action==='diagram-drag'){
    await window.inkspaceCairoIdle();const saved={doc,history,future,tool,view:{...view}},api=window.inkspaceDiagram,g=api.graph;
    try{
      doc={...doc,diagram:undefined};history=[];future=[];view={x:150,y:100,scale:.8};render();await window.inkspaceCairoIdle();
      const a=api.add('rect',{x:90,y:100}),b=api.add('ellipse',{x:400,y:150});g.setSelectionCells([a,b]);const edge=api.connect();g.setSelectionCell(a);const initial=a.geometry.clone(),fullPaints=renderStats.fullScenePaints,originalRedraw=g.cellRenderer.redraw;let redraws=0;
      g.cellRenderer.redraw=function(...args){redraws++;return originalRedraw.apply(this,args)};
      async function drag(x,y,altKey=false,samples=1){
        const state=g.view.getState(a),target=state.shape.node,rect=viewport.getBoundingClientRect(),start={x:rect.left+state.x+state.width/2,y:rect.top+state.y+state.height/2},dx=(x-a.geometry.x)*view.scale,dy=(y-a.geometry.y)*view.scale;
        const pointer=(type,factor)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:125,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,altKey,clientX:start.x+dx*factor,clientY:start.y+dy*factor}));
        pointer('pointermove',0);pointer('pointerdown',0);const count=redraws;
        for(let i=1;i<=samples;i++)pointer('pointermove',i/samples);await new Promise(resolve=>requestAnimationFrame(resolve));
        if(redraws!==count||renderStats.fullScenePaints!==fullPaints)throw Error('Drag rebuilt cells or full ink scene');
        if(!target.style.translate||!$('#diagram-layer [data-inkspace-drag]'))throw Error('Compositor drag preview missing');
        if(g.connectionHandler.marker.markedState)throw Error('Connection highlight stayed behind');
        pointer('pointerup',1);if(target.style.translate||$('#diagram-layer [data-inkspace-drag]'))throw Error('Drag preview not cleaned');
      }
      try{
        await drag(3,4,false,400);if(Math.abs(a.geometry.x)>1e-8||Math.abs(a.geometry.y)>1e-8)throw Error('Top-left page snapping failed');
        const [w,h]=a4Dimensions();await drag(w-a.geometry.width-3,h-a.geometry.height-2);if(Math.abs(a.geometry.x+a.geometry.width-w)>1e-8||Math.abs(a.geometry.y+a.geometry.height-h)>1e-8)throw Error('Fractional A4 bottom-right snapping failed');
        const last=g.view.getState(edge).absolutePoints[0];if(!Number.isFinite(last.x))throw Error('Connector lost on drag commit');
        await drag(3,4,true);if(Math.abs(a.geometry.x-3)>1e-8||Math.abs(a.geometry.y-4)>1e-8)throw Error('Alt did not bypass snapping');
        undo();redo();return{samples:400,cellRedrawsDuringDrag:0,inkScenePaintsDuringDrag:0,highlightClean:true,pageCornersExact:true,altBypass:true,undoRedo:true};
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
