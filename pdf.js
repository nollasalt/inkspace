/* Original PDF bytes and world-coordinate pages stay in the open JSON document. */
PdfApi.GlobalWorkerOptions.workerSrc=new URL('vendor/pdf.worker.mjs',location.href).href;
const pdfSessions=new Map(),pdfRoot=document.querySelector('#pdf-pages');let pdfGeneration=0;
function pdfBytes(data){return Uint8Array.from(atob(data),c=>c.charCodeAt(0))}
function pdfBase64(bytes){let result='';for(let i=0;i<bytes.length;i+=32768)result+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(result)}
async function openPdf(asset){
  let entry=pdfSessions.get(asset.id);if(entry?.data===asset.data)return entry;
  if(entry){for(const cache of entry.pages.values())cache.el.remove();entry.task.then(task=>task.destroy()).catch(()=>{})}
  entry={data:asset.data,pages:new Map(),promise:PdfApi.getDocument({data:pdfBytes(asset.data),cMapUrl:new URL('vendor/pdf-cmaps/',location.href).href,cMapPacked:true,standardFontDataUrl:new URL('vendor/pdf-standard_fonts/',location.href).href,wasmUrl:new URL('vendor/pdf-wasm/',location.href).href,isEvalSupported:false}).promise};
  entry.task=entry.promise.then(pdf=>pdf.loadingTask);pdfSessions.set(asset.id,entry);return entry;
}
async function renderPdfPage(asset,index,entry){
  const spec=asset.pages[index];let cache=entry.pages.get(index);
  if(!cache){const el=document.createElement('section');el.className='pdf-page';el.dataset.pdf=asset.id;el.innerHTML='<canvas></canvas><div class="textLayer"></div>';cache={el,canvas:el.querySelector('canvas'),text:el.querySelector('.textLayer'),scale:0,job:null,token:0};entry.pages.set(index,cache);pdfRoot.append(el)}
  cache.el.style.left=(view.x+spec.x*view.scale)+'px';cache.el.style.top=(view.y+spec.y*view.scale)+'px';cache.el.style.width=(spec.width*view.scale)+'px';cache.el.style.height=(spec.height*view.scale)+'px';
  if(!visible({x:spec.x,y:spec.y,w:spec.width,h:spec.height})){
    if(entry.pages.size>8&&cache.scale){cache.token++;cache.pending=null;cache.scale=0;cache.canvas.width=cache.canvas.height=0;cache.layer?.cancel();cache.text.replaceChildren()}
    return;
  }
  const scale=view.scale;if(cache.scale===scale||cache.pending===scale)return;cache.pending=scale;const token=++cache.token;
  try{
    const pdf=await entry.promise,page=await pdf.getPage(index+1);if(token!==cache.token)return;
    const viewport=page.getViewport({scale}),density=Math.max(1.5,devicePixelRatio),max=4096/Math.max(viewport.width,viewport.height),rasterDensity=Math.min(density,max);
    const buffer=document.createElement('canvas');buffer.width=Math.max(1,Math.round(viewport.width*rasterDensity));buffer.height=Math.max(1,Math.round(viewport.height*rasterDensity));
    await page.render({canvasContext:buffer.getContext('2d'),viewport,transform:[rasterDensity,0,0,rasterDensity,0,0]}).promise;
    if(token!==cache.token)return;
    cache.canvas.width=buffer.width;cache.canvas.height=buffer.height;cache.canvas.getContext('2d').drawImage(buffer,0,0);
    cache.text.replaceChildren();cache.text.style.setProperty('--total-scale-factor',String(scale));cache.text.style.setProperty('--scale-factor',String(scale));cache.text.style.setProperty('--scale-round-x','1px');cache.text.style.setProperty('--scale-round-y','1px');
    cache.layer?.cancel();cache.layer=new PdfApi.TextLayer({textContentSource:await page.getTextContent(),container:cache.text,viewport});await cache.layer.render();cache.scale=scale;
  }catch(e){if(token===cache.token)toast('PDF 页面加载失败：'+e.message)}finally{if(token===cache.token)cache.pending=null}
}
function renderPdfs(){
  const assets=doc.pdfs||[],ids=new Set(assets.map(a=>a.id));pdfRoot.classList.toggle('select-text',tool==='pdftext');
  for(const [id,entry] of pdfSessions)if(!ids.has(id)){for(const c of entry.pages.values())c.el.remove();entry.task.then(task=>task.destroy()).catch(()=>{});pdfSessions.delete(id)}
  for(const asset of assets){openPdf(asset).then(entry=>{if(!(doc.pdfs||[]).some(a=>a.id===asset.id&&a.data===asset.data))return;for(let i=0;i<asset.pages.length;i++)renderPdfPage(asset,i,entry)})}
}
$('#pdf-import').onclick=()=>$('#pdf-file').click();
$('#pdf-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try{if(file.size>60*1024*1024)throw Error('PDF 超过 60 MB');toast('正在导入 PDF…');const data=pdfBase64(new Uint8Array(await file.arrayBuffer())),id=crypto.randomUUID(),asset={id,name:file.name,data,pages:[]},entry=await openPdf(asset),pdf=await entry.promise;const origin=world(60,60);let y=origin.y;
    for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),v=p.getViewport({scale:1});asset.pages.push({x:origin.x,y,width:v.width,height:v.height});y+=v.height+28}
    finishInteraction();checkpoint();doc.pdfs=[...(doc.pdfs||[]),asset];render();persist();toast(`已导入 ${pdf.numPages} 页；“PDF 文字”可选取复制，画笔可直接批注`);
  }catch(error){toast('PDF 导入失败：'+error.message)}
};
$('#pdf-highlight').onclick=()=>{
  const selection=window.getSelection();if(!selection?.rangeCount||selection.isCollapsed){toast('先切换“PDF 文字”，选取需要高亮的文字');return}
  const range=selection.getRangeAt(0),start=range.startContainer.parentElement?.closest('.textLayer'),end=range.endContainer.parentElement?.closest('.textLayer');if(!start||!end){toast('请选取 PDF 页面内的文字');return}
  const rect=viewport.getBoundingClientRect(),boxes=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0);if(!boxes.length)return;checkpoint();
  for(const box of boxes){const a=world(box.left-rect.left,box.top-rect.top),b=world(box.right-rect.left,box.bottom-rect.top);doc.shapes.push({kind:'highlight',x:a.x,y:a.y,x2:b.x,y2:b.y,color:'#ffe066',width:1})}selection.removeAllRanges();render();persist();
};
async function exportAnnotatedPdf(){
  try{finishInteraction();const assets=doc.pdfs||[];if(!assets.length){toast('先导入需要批注的 PDF');return}toast('正在导出 PDF…');
    const result=await PdfApi.PDFDocument.create();for(const asset of assets){const source=await PdfApi.PDFDocument.load(pdfBytes(asset.data)),pages=source.getPages();for(let i=0;i<pages.length;i++){const original=pages[i];if(!original.node.Contents())original.drawRectangle({x:0,y:0,width:0,height:0,opacity:0});const spec=asset.pages[i],page=result.addPage([spec.width,spec.height]),crop=original.getCropBox(),embedded=await result.embedPage(original,{left:crop.x,bottom:crop.y,right:crop.x+crop.width,top:crop.y+crop.height}),angle=((original.getRotation().angle%360)+360)%360;page.drawPage(embedded,{x:angle===180||angle===270?spec.width:0,y:angle===90||angle===180?spec.height:0,rotate:PdfApi.degrees(-angle),width:crop.width,height:crop.height});const color=hex=>PdfApi.rgb(...hex.match(/[a-f0-9]{2}/gi).map(c=>parseInt(c,16)/255));
      // Normalize rotated source pages so world/page coordinates agree.
      const touches=b=>b.x+b.w>=spec.x&&b.y+b.h>=spec.y&&b.x<=spec.x+spec.width&&b.y<=spec.y+spec.height;
      for(const note of doc.notes)if(touches(itemBounds('notes',note))){const raster=await rasterNote(note),image=await result.embedPng(raster.data);page.drawImage(image,{x:note.x-spec.x,y:page.getHeight()-(note.y-spec.y)-raster.height,width:raster.width,height:raster.height})}
      for(const stroke of doc.strokes)if(touches(itemBounds('strokes',stroke))){const local={...stroke,points:stroke.points.map(p=>({...p,x:p.x-spec.x,y:p.y-spec.y}))};page.drawSvgPath(InkContent.strokePath(local),{x:0,y:page.getHeight(),color:color(stroke.color)})}
      for(const s of doc.shapes)if(touches(itemBounds('shapes',s))){const b=itemBounds('shapes',s),x=b.x-spec.x,y=page.getHeight()-(b.y-spec.y)-b.h;if(s.kind==='highlight')page.drawRectangle({x,y,width:b.w,height:b.h,color:color(s.color),opacity:.35});else if(s.kind==='rect')page.drawRectangle({x,y,width:b.w,height:b.h,borderColor:color(s.color),borderWidth:s.width});else if(s.kind==='ellipse')page.drawEllipse({x:x+b.w/2,y:y+b.h/2,xScale:b.w/2,yScale:b.h/2,borderColor:color(s.color),borderWidth:s.width});else{const line=(a,b)=>page.drawLine({start:{x:a.x-spec.x,y:page.getHeight()-(a.y-spec.y)},end:{x:b.x-spec.x,y:page.getHeight()-(b.y-spec.y)},color:color(s.color),thickness:s.width});line({x:s.x,y:s.y},{x:s.x2,y:s.y2});if(s.kind==='arrow')for(const p of arrowPoints(s))line(p,{x:s.x2,y:s.y2})}}
    }}const bytes=await result.save();return bytes;
  }catch(e){toast('PDF 导出失败：'+e.message);throw e}
}
$('#pdf-export').onclick=async()=>{try{const bytes=await exportAnnotatedPdf();if(!bytes)return;download(bytes,'application/pdf','批注.pdf');toast('已导出 PDF：保留原文文字与矢量笔迹');
  }catch{}
};
async function rasterNote(n){const el=document.createElement('article');el.className='note';el.style.cssText=`position:fixed;left:-10000px;top:0;width:${n.width||320}px;font-size:${textSize()}px;--note-scale:1;transform:none`;el.innerHTML='<div class="note-body">'+(n.kind==='image'?`<img src="${n.src}" style="width:100%;aspect-ratio:${n.aspect}">`:markdown(n.markdown))+'</div>';if(n.kind==='image')el.classList.add('image-note');document.body.append(el);try{await document.fonts.ready;const width=n.width||320,height=el.offsetHeight,data=await PdfApi.toPng(el,{width,height,pixelRatio:2,cacheBust:false,preferredFontFormat:'woff2'});return{data,width,height}}finally{el.remove()}}
renderPdfs();
