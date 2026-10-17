(async()=>{
  const assert=(condition,message)=>{if(!condition)throw Error(message)},pause=ms=>new Promise(r=>setTimeout(r,ms));
  const original=doc,originalView={...view};
  assert(documentTabs.length===0&&document.body.classList.contains('empty-workspace'),'startup has no phantom notebook');
  await $('#new').onclick();
  const nativeStatus=desktop.inkStatus();assert(nativeStatus.cairo==='1.18.4'&&nativeStatus.hooks>0,'native Cairo loaded and Windows HWND input hooked');
  const nativeCoverage=[];
  // Exercise the real preload/renderer boundary with native-format packets.
  // This is a synthetic packet test, not a claim of physical pen verification.
  doc={format:'inkspace',version:1,strokes:[],notes:[],shapes:[]};view={x:0,y:0,scale:.36};tool='pen';render();
  const rect=viewport.getBoundingClientRect(),density=devicePixelRatio;
  const packet=(type,x,y,p=0.7)=>({type,samples:[{x:(rect.left+x)*density,y:(rect.top+y)*density,p,id:913,frame:1,precise:1,eraser:0}]});
  consumeNativePackets([packet('pointerdown',150.0192,140.0384)]);
  for(let i=1;i<=40;i++)consumeNativePackets([packet('pointermove',150.0192+i*.0192,140.0384+i*.0131)]);
  consumeNativePackets([packet('pointerup',151,141,0)]);
  assert(doc.strokes.length===1&&doc.strokes[0].brush==='xournal','native packets create one Xournal stroke');
  const nativePacketStroke=doc.strokes[0];
  assert(nativePacketStroke.inputSource==='windows-himetric'&&nativePacketStroke.points.length===41,'native samples retained without browser duplicates');
  assert(Math.abs(nativePacketStroke.points[1].x-nativePacketStroke.points[0].x-.0192/.36)<1e-9,'subpixel coordinates survive native bridge and zoom');
  undo();assert(!doc.strokes.length,'native ink undo');redo();assert(doc.strokes.length===1,'native ink redo');
  const beforeFallback=doc.strokes.length;
  for(const [type,x,p] of [['pointerdown',200.1,.6],['pointermove',210.2,.7],['pointerup',210.2,0]])viewport.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:914,pointerType:'pen',button:0,buttons:type==='pointerup'?0:1,clientX:rect.left+x,clientY:rect.top+180.3,pressure:p}));
  await pause(40);
  assert(doc.strokes.length===beforeFallback+1&&doc.strokes.at(-1).inputSource==='browser','missing native input has an explicit functional fallback');
  for(const scale of [.04,.36,1,4]){
    doc={format:'inkspace',version:1,strokes:[],notes:[],shapes:[]};view={x:.3,y:.7,scale};render();
    const s={brush:'xournal',hasPressure:true,color:'#263f43',width:2,inputScale:scale,points:[]};doc.strokes.push(s);active={type:'pen',s};beginInk();
    const started=performance.now();
    for(let i=0;i<300;i++){s.points.push({x:(30+i*.5)/scale,y:(100+Math.sin(i/23)*25)/scale,p:.2+.7*(i%60)/60});paintLive();if(i%4===3)flushCairoInk()}
    flushCairoInk();const elapsed=performance.now()-started,live=inkLayers[1].ctx.getImageData(0,0,canvas.width,canvas.height).data;
    finishInk();const final=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let max=0,sum=0,count=0;for(let i=3;i<live.length;i+=4){const error=Math.abs(live[i]-final[i]);max=Math.max(max,error);sum+=error;if(live[i]||final[i])count++}
    nativeCoverage.push({scale,maxAlphaError:max,meanInkAlphaError:sum/Math.max(1,count),samples:300,elapsedMs:elapsed});
    // Cairo uses a 1/256-device-pixel path grid; changing the local clip origin
    // permits a few coverage levels of rounding, not missing geometry.
    assert(max<=4&&sum/Math.max(1,count)<.5,'native live/commit coverage: '+JSON.stringify(nativeCoverage.at(-1)));
    assert(valid(JSON.parse(JSON.stringify(doc))),'native stroke persists');
  }
  doc={format:'inkspace',version:1,strokes:[],notes:[{id:'smoke-note',x:30,y:80,width:560,markdown:'# Markdown\n\n$E=mc^2$\n\n```python\ndef f(x):\n    return x * x\n```'}],shapes:[],background:{type:'ruled',color:'#f6f7f5',spacing:'auto',fontSize:16}};view={x:40,y:40,scale:1};render();await document.fonts.ready;
  assert(document.querySelector('.katex'),'formula renders');assert(document.querySelector('.ink-code-content [style*="--shiki-light"]'),'code highlights');
  assert(surface.dpr===devicePixelRatio,'ink drawn at physical display density');
  for(const scale of [.001,.1,.17,.75,1.25,2,8,32]){zoom(scale,400,300);const el=document.querySelector('.note');assert(Math.abs(view.scale-scale)<1e-12,'no fixed zoom bounds');assert(Math.abs(el.getBoundingClientRect().width-560*scale)<1,'note visual width at '+scale);assert(Math.abs(itemBounds('notes',doc.notes[0]).w-560)<1,'note world width')}
  zoom(1,400,300);const before=renderStats.fullScenePaints;const start=performance.now();for(let i=0;i<150;i++)interactiveZoom(.6+i/300,400,300);assert(renderStats.fullScenePaints===before,'zoom events coalesced');await pause(200);assert(renderStats.fullScenePaints===before+1,'one final zoom render');const zoomTime=performance.now()-start;
  const fixture=await PdfApi.PDFDocument.create();const first=fixture.addPage([612,792]);first.drawText('Selectable PDF original text',{x:60,y:720,size:18});const second=fixture.addPage([612,792]);second.drawText('Rotated page retains its text',{x:60,y:720,size:18});second.setRotation(PdfApi.degrees(90));const bytes=await fixture.save();
  const asset={id:'smoke-pdf',name:'fixture.pdf',data:pdfBase64(bytes),pages:[{x:0,y:0,width:612,height:792},{x:0,y:820,width:792,height:612}]};doc.pdfs=[asset];view={x:40,y:40,scale:1};tool='pdftext';render();
  const entry=await openPdf(asset);await renderPdfPage(asset,0,entry);for(let i=0;i<50&&!entry.pages.get(0)?.scale;i++)await pause(100);
  assert(entry.pages.get(0).scale===1,'PDF page renders');const text=entry.pages.get(0).text;assert(text.textContent.includes('Selectable'),'PDF text layer');const span=[...text.querySelectorAll('span')].find(s=>s.textContent.includes('Selectable'));assert(span,'PDF selectable text span');const range=document.createRange();range.selectNodeContents(span);window.getSelection().removeAllRanges();window.getSelection().addRange(range);assert(window.getSelection().toString().includes('Selectable'),'native text selection');$('#pdf-highlight').click();assert(doc.shapes.some(s=>s.kind==='highlight'),'PDF selection creates highlight');
  doc.strokes.push({brush:'xournal',inputScale:1,width:2,color:'#263f43',points:[{x:60,y:180,p:.3},{x:110,y:190,p:.8},{x:180,y:178,p:.4}]});render();
  const exported=await exportAnnotatedPdf();assert(exported instanceof Uint8Array,'PDF export bytes');const parsed=await PdfApi.getDocument({data:exported.slice(),isEvalSupported:false}).promise;assert(parsed.numPages===2,'two exported pages');const content=(await (await parsed.getPage(1)).getTextContent()).items.map(t=>t.str).join(' '),rotated=(await (await parsed.getPage(2)).getTextContent()).items.map(t=>t.str).join(' ');assert(content.includes('Selectable PDF original text'),'export retains original selectable text');assert(rotated.includes('Rotated page retains its text'),'rotated page retains text');assert((await parsed.getPage(2)).getViewport({scale:1}).width===792,'rotated page normalized');
  const noteImage=await rasterNote(doc.notes[0]);assert(noteImage.data.startsWith('data:image/png'),'rich Markdown exports as PNG');
  const edgeCases=await PdfApi.PDFDocument.create();edgeCases.addPage([612,792]);const cropped=edgeCases.addPage([612,792]);cropped.drawText('Cropped selectable text',{x:140,y:500,size:16});cropped.setCropBox(100,120,400,500);const edgeBytes=await edgeCases.save();
  doc.pdfs=[{id:'edge-pdf',name:'blank-crop.pdf',data:pdfBase64(edgeBytes),pages:[{x:0,y:0,width:612,height:792},{x:0,y:820,width:400,height:500}]}];const edgeExport=await exportAnnotatedPdf();const edgeTask=PdfApi.getDocument({data:edgeExport,isEvalSupported:false}),edgePdf=await edgeTask.promise;assert(edgePdf.numPages===2,'blank page exported');const cropPage=await edgePdf.getPage(2);assert(cropPage.getViewport({scale:1}).width===400,'crop width retained');assert((await cropPage.getTextContent()).items.map(i=>i.str).join(' ').includes('Cropped selectable text'),'crop text retained');await edgeTask.destroy();doc.pdfs=[asset];
  const saved=JSON.parse(JSON.stringify(doc));assert(valid(saved)&&saved.notes[0].width===560&&saved.pdfs[0].data===asset.data,'open JSON stores source PDF and Markdown');
  await Promise.all(Array.from({length:5},(_,index)=>desktop.backup(JSON.stringify({...saved,recoverySequence:index}))));
  const recovered=JSON.parse(await desktop.recover());assert(recovered.recoverySequence===4&&valid(recovered)&&recovered.pdfs[0].data===asset.data,'atomic recovery preserves newest document');
  await parsed.loadingTask.destroy();const result={passed:true,devicePixelRatio,nativePacketBridge:true,nativeFallback:true,nativeStatus,nativeCoverage,formula:true,highlight:true,pdfText:true,rotatedPdf:true,richNote:true,zoomInputs:150,zoomScenePaints:1,zoomDurationMs:Math.round(zoomTime),raw:'onpointerrawupdate' in window,bridge:!!window.desktop,canvas:canvas.width,document:saved};
  doc=original;view=originalView;tool='pen';render();return result;
})()
