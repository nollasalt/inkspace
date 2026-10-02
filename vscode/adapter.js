// Writing is allowed only through the high-precision native host bridge.
const codium=(window.inkspaceCalibrationApi||acquireVsCodeApi()),boot=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob($('#inkspace-boot').content),c=>c.charCodeAt(0))));
let hostVersion=0,hostLoaded=false,applyingHost=false,editFlight=null,editSequence=0,lastHostText='',lastContent='',conflict=false,forceSaveView=false,flushWaiters=[],draftTimer=null;
// Load the bundled module through the webview resource service, then keep its
// worker on a same-origin blob URL. Cross-origin module imports can stall here.
window.inkspacePdfWorkerReady=fetch(PdfApi.GlobalWorkerOptions.workerSrc).then(async response=>{if(!response.ok)throw Error('PDF worker resource '+response.status);const url=URL.createObjectURL(new Blob([await response.text()],{type:'text/javascript'})),worker=new Worker(url,{type:'module'});PdfApi.GlobalWorkerOptions.workerPort=worker;window.addEventListener('beforeunload',()=>{worker.terminate();URL.revokeObjectURL(url)},{once:true});return worker});
window.inkspacePdfWorkerReady.catch(error=>toast('PDF 初始化失败：'+error.message));
function pageMessage(){codium.postMessage({type:'pages',pages:notebook.pages.map(p=>({id:p.id,title:p.title})),activePage:notebook.activePage})}
function rememberDraft(){codium.setState({text:documentJSON(true),version:hostVersion,dirty:contentSignature()!==lastContent})}
function sendEdit(){if(!hostLoaded||applyingHost||active||draftTimer!==null&&!forceSaveView)return;if(conflict)return;const signature=contentSignature();if(signature===lastContent&&!editFlight&&(!forceSaveView||documentJSON(true)===lastHostText))return;rememberDraft();if(editFlight)return;editFlight={id:++editSequence,text:documentJSON(true),signature};codium.postMessage({type:'edit',id:editFlight.id,text:editFlight.text,version:hostVersion,autoSave:true})}
function flushed(){return new Promise((resolve,reject)=>{if(conflict){reject(Error('文件冲突，请另存草稿或重新打开'));return}finishInteraction();clearTimeout(draftTimer);draftTimer=null;forceSaveView=true;sendEdit();if(!editFlight){forceSaveView=false;resolve();return}flushWaiters.push({resolve,reject})})}
persist=function(){clearTimeout(saveTimer);if(!hostLoaded||applyingHost)return;clearTimeout(draftTimer);draftTimer=setTimeout(()=>{draftTimer=null;if(active){persist();return}pageMessage();forceSaveView=true;sendEdit()},700)};
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
  if(editFlight||contentSignature()!==lastContent&&hostLoaded){conflict=true;rememberDraft();toast('文件在画布外改变，已保留草稿；请另存或重新打开');return}
  try{const data=JSON.parse(message.text);if(!valid(data))throw Error('笔记内容无效');const state=codium.getState();applyingHost=true;adoptDocument(data);hostVersion=message.version;lastHostText=message.text;lastContent=contentSignature();savedDocument=lastContent;hostLoaded=true;applyingHost=false;
    if(state?.dirty&&state.text!==message.text){const draft=JSON.parse(state.text);if(valid(draft)){adoptDocument(draft);toast('已恢复尚未写入文件的画布草稿');persist()}}
    pageMessage();resize();
  }catch(error){applyingHost=false;toast('打开失败：'+error.message);statusText.textContent='笔记无法打开：'+error.message}
}
window.addEventListener('message',async event=>{const message=event.data;
  if(message.type==='document'){receiveDocument(message);return}
  if(message.type==='ack'&&editFlight?.id===message.id){const sent=editFlight;editFlight=null;hostVersion=message.version;if(message.error){conflict=true;rememberDraft();for(const waiter of flushWaiters.splice(0))waiter.reject(Error(message.error));toast(message.error);return}lastHostText=sent.text;lastContent=sent.signature;sendEdit();if(!editFlight&&!active&&draftTimer===null){forceSaveView=false;codium.setState({text:documentJSON(true),version:hostVersion,dirty:false});for(const waiter of flushWaiters.splice(0))waiter.resolve()}return}
  if(message.type==='request'){try{let result=true;if(message.command==='flush')await flushed();else if(message.command==='page'){switchPage(message.page);pageMessage()}else if(message.command==='addPage'){$('#page-add').click();await flushed()}else if(message.command==='renamePage'){const page=notebook.pages.find(p=>p.id===message.page);if(page){page.title=message.title;renderPageList();persist();await flushed()}}else if(message.command==='deletePage'){if(notebook.pages.length===1)throw Error('至少保留一个页面');finishInteraction();rememberPage();const index=notebook.pages.findIndex(p=>p.id===message.page);if(index>=0){notebook.pages.splice(index,1);pageSessions.delete(message.page);if(notebook.activePage===message.page)switchPage(notebook.pages[Math.min(index,notebook.pages.length-1)].id);else{renderPageList();persist()}await flushed()}}else if(message.command==='diagnostic'&&boot.test)result=await runCodiumDiagnostic(message.action);else throw Error('不支持的画布操作');codium.postMessage({type:'response',id:message.id,result})}catch(error){codium.postMessage({type:'response',id:message.id,error:error.message})}}
});
async function runCodiumDiagnostic(action){
  if(action==='selection-scale'){
    await window.inkspaceCairoIdle();const oldDoc=doc,oldHistory=history,oldFuture=future,oldTool=tool;
    const image=document.createElement('canvas');image.width=image.height=1;
    doc={...doc,strokes:[{brush:'xournal',color:'#000000',width:3,points:[{x:100,y:100,p:.2},{x:140,y:120,p:.8}]}],shapes:[{kind:'rect',x:150,y:100,x2:180,y2:140,width:2,color:'#000000'}],notes:[{id:'selection-scale-text',x:200,y:100,width:160,markdown:'A long text keeps the same wrapping when its block is scaled.'},{id:'selection-scale-image',kind:'image',x:380,y:100,width:160,markdown:'',src:image.toDataURL('image/png'),aspect:1}]};history=[];future=[];tool='select';selected={strokes:[0],shapes:[0],notes:[0,1]};render();await window.inkspaceCairoIdle();
    try{const b=selectionBounds(),rect=viewport.getBoundingClientRect(),handle=$('#selection').querySelector('.selection-scale');if(!handle)throw Error('Missing scale handle');const pointer=(type,factor,target)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:41,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,clientX:rect.left+view.x+(b.x+b.w*factor)*view.scale,clientY:rect.top+view.y+(b.y+b.h*factor)*view.scale}));pointer('pointerdown',1,handle);pointer('pointermove',2,viewport);pointer('pointerup',2,viewport);await window.inkspaceCairoIdle();if(Math.abs(doc.strokes[0].width-6)>1e-6||Math.abs(doc.notes[0].scale-2)>1e-6||doc.notes[0].width!==160)throw Error('Mixed scale drag failed');if(Math.abs(doc.notes[1].scale-2)>1e-6||doc.notes[1].aspect!==1)throw Error('Image scale failed');if(doc.strokes[0].points[1].p!==.8)throw Error('Scale changed pressure');undo();if(doc.strokes[0].width!==3||doc.notes[0].scale!==undefined)throw Error('Scale undo failed');redo();if(Math.abs(doc.notes[0].scale-2)>1e-6)throw Error('Scale redo failed');return{mouseHandle:true,mixedBlocks:true,imageScaled:true,textLayoutPreserved:true,undoRedo:true};}
    finally{doc=oldDoc;history=oldHistory;future=oldFuture;tool=oldTool;clearSelection();render();await window.inkspaceCairoIdle();await flushed()}
  }
  if(action==='view-loading'){
    await window.inkspaceCairoIdle();const oldDoc=doc,oldView={...view},raster=desktop.inkRasterAsync;
    const strokes=Array.from({length:20},(_,i)=>({brush:'xournal',color:'#18232a',width:3,hasPressure:true,points:[{x:25000+100+(i%5)*60,y:25000+100+Math.floor(i/5)*40,p:.8},{x:25000+130+(i%5)*60,y:25000+110+Math.floor(i/5)*40,p:.8}]}));
    doc={...doc,strokes,notes:[],shapes:[]};view.x=0;view.y=0;view.scale=1;render();desktop.inkRasterAsync=async p=>{const data=await raster(p);await new Promise(r=>setTimeout(r,50));return data};
    try{const before=renderStats.fullScenePaints;view.x=-25000;view.y=-25000;render();const preview=document.createElement('canvas');preview.width=canvas.width;preview.height=canvas.height;const c=preview.getContext('2d');worldTransform(c);for(const stroke of strokes){c.fillStyle=stroke.color;c.fill(new Path2D(cachedStroke(stroke).d))}const expected=c.getImageData(0,0,canvas.width,canvas.height).data,actual=ctx.getImageData(0,0,canvas.width,canvas.height).data;if(expected.some((v,i)=>v!==actual[i]))throw Error('Newly exposed strokes were missing before raster completed');await window.inkspaceCairoIdle();const paints=renderStats.fullScenePaints-before;if(paints>2)throw Error('Visible strokes were replaced incrementally');return{uncachedStrokes:20,immediateCompletePreview:true,scenePaints:paints};}
    finally{desktop.inkRasterAsync=raster;doc=oldDoc;Object.assign(view,oldView);render();await window.inkspaceCairoIdle()}
  }
  if(action==='a4-layout'){const layout=$('#page-layout');layout.value='a4-portrait';layout.dispatchEvent(new Event('change'));await flushed();const portrait=$('#a4-pages').dataset.pageWidth;layout.value='a4-landscape';layout.dispatchEvent(new Event('change'));await flushed();const landscape=$('#a4-pages').dataset.pageWidth;if(portrait===landscape||!$('#a4-pages g').getAttribute('stroke-dasharray'))throw Error('A4 layout dimensions failed');return{layout:doc.background.layout,portrait,landscape}}
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
