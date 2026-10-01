(async()=>{
  const assert=(value,message)=>{if(!value)throw Error(message)},pause=ms=>new Promise(r=>setTimeout(r,ms));
  finishInteraction();clearSelection();const previousDoc=doc,previousView={...view},previousTool=tool,previousHistory=history,previousFuture=future,previousWidth=$('#width').value,previousColor=$('#color').value;
  const note={id:'ink-on-note',x:40,y:40,width:560,markdown:'# 在文本框上书写\n\n触控笔可以直接标记文字；鼠标双击仍可编辑。\n\n这里保留足够的空白用于检验上层笔迹。'};
  doc={format:'inkspace',version:1,strokes:[],notes:[note],shapes:[],background:{type:'blank',color:'#f6f7f5',spacing:'auto',fontSize:16}};view={x:40,y:40,scale:1};tool='pen';history=[];future=[];$('#width').value='8';$('#color').value='#cc3344';render();await document.fonts.ready;
  const root=notes.querySelector('[data-id="ink-on-note"]'),initial={x:note.x,y:note.y,width:note.width};let id=2000;
  const packet=(type,x,y,pressure=.8)=>({type,samples:[{id,x:x*devicePixelRatio,y:y*devicePixelRatio,p:pressure,precise:1,eraser:0}]});
  for(const selector of ['.note-body','.note-bar','.note-resize']){
    const target=root.querySelector(selector),rect=target.getBoundingClientRect(),x=rect.left+Math.min(rect.width/2,40),y=rect.top+rect.height/2,count=doc.strokes.length;
    consumeNativePackets([packet('pointerdown',x,y)]);assert(active?.type==='pen','pen starts ink on '+selector);consumeNativePackets([packet('pointermove',x+35,y+8)]);consumeNativePackets([packet('pointerup',x+35,y+8,0)]);id++;
    assert(doc.strokes.length===count+1,'stroke stored on '+selector);assert(note.x===initial.x&&note.y===initial.y&&note.width===initial.width,'pen must not move or resize note');assert(!$('#editor').open,'pen must not edit text');
  }
  undo();assert(doc.strokes.length===2,'ink over text undo');redo();assert(doc.strokes.length===3,'ink over text redo');
  root.querySelector('.note-body').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,button:0}));assert(!$('#editor').open,'pen double tap must not edit');
  // A real mouse down/up selects no ink; double click still edits the same note.
  const body=root.querySelector('.note-body'),br=body.getBoundingClientRect();for(const type of ['pointerdown','pointerup'])body.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'mouse',pointerId:5000,buttons:type==='pointerup'?0:1,clientX:br.left+30,clientY:br.top+20}));
  body.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,button:0}));assert($('#editor').open&&editing.id===note.id,'mouse double click edits text under ink');$('#editor').close();
  const header=root.querySelector('.note-bar'),hr=header.getBoundingClientRect(),oldX=doc.notes[0].x;
  header.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse',pointerId:5001,button:0,buttons:1,clientX:hr.left+30,clientY:hr.top+10}));assert(active?.type==='note','mouse header moves note');
  viewport.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',pointerId:5001,buttons:1,clientX:hr.left+50,clientY:hr.top+10}));viewport.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'mouse',pointerId:5001,clientX:hr.left+50,clientY:hr.top+10}));assert(doc.notes[0].x===oldX+20,'mouse move committed');undo();assert(doc.notes[0].x===oldX,'mouse note move undo');
  // Verify fixed brush preview for all selected widths and tiny/heavy pressures.
  for(const width of [1,2,4,8])for(const scale of [.36,1,2])for(const pressure of [0,.01,.2,.9,1]){
    $('#width').value=String(width);view.scale=scale;updatePenCursor(new PointerEvent('pointermove',{pointerType:'pen',buttons:1,pressure,clientX:br.left+30,clientY:br.top+20}));assert(Math.abs(parseFloat(penCursor.style.width)-width*scale)<1e-9,'cursor is selected brush size independent of pressure');
  }
  assert(+getComputedStyle(canvas).zIndex>+getComputedStyle(notes).zIndex,'ink composited above text and images');
  // Put a red line on the opaque body for compositor pixel verification.
  view.scale=1;$('#width').value='8';render();const bodyRect=root.querySelector('.note-body').getBoundingClientRect();const x=bodyRect.left+60,y=bodyRect.bottom-20;
  consumeNativePackets([packet('pointerdown',x,y,1)]);consumeNativePackets([packet('pointermove',x+120,y,1)]);consumeNativePackets([packet('pointerup',x+120,y,0)]);penPosition=null;penCursor.hidden=true;
  const probe={x:Math.round(x+60),y:Math.round(y)};
  // Exported ink must remain above opaque text, just like the canvas.
  const oldDownload=download;let svg='';download=(data,type)=>{if(type==='image/svg+xml')svg=data};$('#svg').click();download=oldDownload;assert(svg.lastIndexOf('<path d=')>svg.lastIndexOf('<text '),'SVG ink after text');
  const fixture=await PdfApi.PDFDocument.create();fixture.addPage([612,792]);doc.pdfs=[{id:'note-export',name:'note.pdf',data:pdfBase64(await fixture.save()),pages:[{x:0,y:0,width:612,height:792}]}];const exportNote=doc.notes[0],exportX=exportNote.x+50,exportY=exportNote.y+60;
  const extra={brush:'xournal',hasPressure:false,color:'#cc3344',width:8,points:[{x:exportX,y:exportY,p:1},{x:exportX+120,y:exportY,p:1}]};doc.strokes.push(extra);const bytes=await exportAnnotatedPdf(),task=PdfApi.getDocument({data:bytes,isEvalSupported:false}),parsed=await task.promise,page=await parsed.getPage(1),pdfCanvas=document.createElement('canvas');pdfCanvas.width=612;pdfCanvas.height=792;await page.render({canvasContext:pdfCanvas.getContext('2d'),viewport:page.getViewport({scale:1})}).promise;
  const pixel=pdfCanvas.getContext('2d').getImageData(Math.round(exportX+60),Math.round(exportY),1,1).data;assert(pixel[0]>150&&pixel[0]>pixel[1]*2,'exported PDF ink visible above text');await task.destroy();doc.pdfs=[];doc.strokes.pop();render();
  // Preserve a reviewable image of writing over the text. Main restores the
  // workspace after taking the actual Chromium compositor screenshot.
  window.noteInkProbe=probe;
  window.restoreNoteInkTest=()=>{doc=previousDoc;view=previousView;tool=previousTool;history=previousHistory;future=previousFuture;$('#width').value=previousWidth;$('#color').value=previousColor;clearSelection();render()};
  return{passed:true,penOnBody:true,penOnHeader:true,penOnResize:true,mouseEdit:true,cursorWidths:true,svgInkAboveText:true,pdfInkAboveText:true,probe};
})()
.catch(error=>{throw Error(error.stack)})
