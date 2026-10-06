/* Original PDF bytes and world-coordinate pages stay in the open JSON document. */
PdfApi.GlobalWorkerOptions.workerSrc=new URL('vendor/pdf.worker.mjs',location.href).href;
const pdfSessions=new Map(),pdfRoot=document.querySelector('#pdf-pages');let pdfGeneration=0;
function pdfBytes(data){return Uint8Array.from(atob(data),c=>c.charCodeAt(0))}
function pdfBase64(bytes){let result='';for(let i=0;i<bytes.length;i+=32768)result+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(result)}
function disposePdfEntry(entry){
  entry.disposed=true;
  for(const cache of entry.pages.values()){cache.token++;cache.job?.cancel();cache.layer?.cancel();cache.el.remove()}
  entry.loadingTask.destroy().catch(()=>{});
}
async function openPdf(asset){
  let entry=pdfSessions.get(asset.id);if(entry?.data===asset.data)return entry;
  if(entry)disposePdfEntry(entry);
  const loadingTask=PdfApi.getDocument({data:pdfBytes(asset.data),cMapUrl:new URL('vendor/pdf-cmaps/',location.href).href,cMapPacked:true,standardFontDataUrl:new URL('vendor/pdf-standard_fonts/',location.href).href,wasmUrl:new URL('vendor/pdf-wasm/',location.href).href,isEvalSupported:false});
  entry={data:asset.data,pages:new Map(),loadingTask,promise:loadingTask.promise,disposed:false};
  entry.task=Promise.resolve(loadingTask);pdfSessions.set(asset.id,entry);return entry;
}
async function renderPdfPage(asset,index,entry){
  const spec=asset.pages[index];let cache=entry.pages.get(index);
  if(!cache){const el=document.createElement('section');el.className='pdf-page';el.dataset.pdf=asset.id;el.innerHTML='<canvas></canvas><div class="textLayer"></div>';cache={el,canvas:el.querySelector('canvas'),text:el.querySelector('.textLayer'),scale:0,job:null,token:0};entry.pages.set(index,cache);pdfRoot.append(el)}
  cache.el.style.left=(view.x+spec.x*view.scale)+'px';cache.el.style.top=(view.y+spec.y*view.scale)+'px';cache.el.style.width=(spec.width*view.scale)+'px';cache.el.style.height=(spec.height*view.scale)+'px';
  if(!visible({x:spec.x,y:spec.y,w:spec.width,h:spec.height})){
    if(entry.pages.size>8&&cache.scale){cache.token++;cache.pending=null;cache.scale=0;cache.rasterKey=null;cache.canvas.width=cache.canvas.height=0;cache.layer?.cancel();cache.text.replaceChildren()}
    return;
  }
  const scale=view.scale,key=scale+':'+spec.width+':'+spec.height;if(cache.rasterKey===key||cache.pending===key)return;cache.pending=key;const token=++cache.token;
  try{
    const pdf=await entry.promise,page=await pdf.getPage(index+1);if(token!==cache.token)return;
    const pdfScale=scale*spec.width/page.getViewport({scale:1}).width,viewport=page.getViewport({scale:pdfScale}),density=Math.max(1.5,devicePixelRatio),max=4096/Math.max(viewport.width,viewport.height),rasterDensity=Math.min(density,max);
    const buffer=document.createElement('canvas');buffer.width=Math.max(1,Math.round(viewport.width*rasterDensity));buffer.height=Math.max(1,Math.round(viewport.height*rasterDensity));
    cache.job=page.render({canvasContext:buffer.getContext('2d'),viewport,transform:[rasterDensity,0,0,rasterDensity,0,0]});await cache.job.promise;
    if(token!==cache.token)return;
    cache.canvas.width=buffer.width;cache.canvas.height=buffer.height;cache.canvas.getContext('2d').drawImage(buffer,0,0);
    cache.text.replaceChildren();cache.text.style.setProperty('--total-scale-factor',String(pdfScale));cache.text.style.setProperty('--scale-factor',String(pdfScale));cache.text.style.setProperty('--scale-round-x','1px');cache.text.style.setProperty('--scale-round-y','1px');
    cache.layer?.cancel();cache.layer=new PdfApi.TextLayer({textContentSource:await page.getTextContent(),container:cache.text,viewport});await cache.layer.render();cache.scale=scale;cache.rasterKey=key;
  }catch(e){if(!entry.disposed&&pdfSessions.get(asset.id)===entry&&token===cache.token)toast('PDF 页面加载失败：'+e.message)}finally{if(token===cache.token){cache.pending=null;cache.job=null}}
}
function renderPdfs(){
  renderPdfList();const assets=document.body.classList.contains('empty-workspace')?[]:doc.pdfs||[],ids=new Set(assets.map(a=>a.id));pdfRoot.classList.toggle('select-text',tool==='pdftext');
  for(const [id,entry] of pdfSessions)if(!ids.has(id)){disposePdfEntry(entry);pdfSessions.delete(id)}
  for(const asset of assets){openPdf(asset).then(entry=>{if(entry.disposed||pdfSessions.get(asset.id)!==entry||!(doc.pdfs||[]).some(a=>a.id===asset.id&&a.data===asset.data))return;for(let i=0;i<asset.pages.length;i++)renderPdfPage(asset,i,entry)}).catch(error=>{if((doc.pdfs||[]).includes(asset)&&!document.body.classList.contains('empty-workspace'))toast('PDF 加载失败：'+error.message)})}
}
$('#pdf-import').onclick=()=>$('#pdf-file').click();
$('#pdf-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try{if(file.size>60*1024*1024)throw Error('PDF 超过 60 MB');toast('正在导入 PDF…');const data=pdfBase64(new Uint8Array(await file.arrayBuffer())),id=crypto.randomUUID(),asset={id,name:file.name,data,pages:[]},entry=await openPdf(asset),pdf=await entry.promise;const origin=world(viewport.clientWidth/2,viewport.clientHeight/2),sizes=[];
    for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),v=p.getViewport({scale:1});sizes.push({width:v.width,height:v.height})}
    asset.pages=pdfPagePlacement(sizes,origin);finishInteraction();checkpoint();doc.pdfs=[...(doc.pdfs||[]),asset];render();persist();toast(`已导入 ${pdf.numPages} 页；“PDF 文字”可选取复制，画笔可直接批注`);
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
    const result=await PdfApi.PDFDocument.create();for(const asset of assets){const source=await PdfApi.PDFDocument.load(pdfBytes(asset.data)),pages=source.getPages();for(let i=0;i<pages.length;i++){const original=pages[i];if(!original.node.Contents())original.drawRectangle({x:0,y:0,width:0,height:0,opacity:0});const spec=asset.pages[i],page=result.addPage([spec.width,spec.height]),crop=original.getCropBox(),embedded=await result.embedPage(original,{left:crop.x,bottom:crop.y,right:crop.x+crop.width,top:crop.y+crop.height}),angle=((original.getRotation().angle%360)+360)%360;page.drawPage(embedded,{x:angle===180||angle===270?spec.width:0,y:angle===90||angle===180?spec.height:0,rotate:PdfApi.degrees(-angle),width:crop.width*spec.width/(angle===90||angle===270?crop.height:crop.width),height:crop.height*spec.width/(angle===90||angle===270?crop.height:crop.width)});const color=hex=>PdfApi.rgb(...hex.match(/[a-f0-9]{2}/gi).map(c=>parseInt(c,16)/255));
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
async function rasterNote(n){const el=document.createElement('article');el.className='note';el.style.cssText=`position:fixed;left:-10000px;top:0;width:${n.width||320}px;font-size:${textSize()}px;--note-scale:1;transform:none`;el.innerHTML='<div class="note-body">'+(n.kind==='image'?`<img src="${n.src}" style="width:100%;aspect-ratio:${n.aspect}">`:markdown(n.markdown))+'</div>';if(n.kind==='image')el.classList.add('image-note');document.body.append(el);try{await document.fonts.ready;const width=n.width||320,height=el.offsetHeight,data=await PdfApi.toPng(el,{width,height,pixelRatio:2,cacheBust:false,preferredFontFormat:'woff2'});return{data,width:width*(n.scale||1),height:height*(n.scale||1)}}finally{el.remove()}}
renderPdfs();

// Fit each source page into a gapless A4 tile containing the viewport centre.
function pdfPagePlacement(sizes,anchor){
  const [w,h]=a4Dimensions(),x=Math.floor(anchor.x/w)*w,y=Math.floor(anchor.y/h)*h;
  return sizes.map((page,index)=>{const scale=Math.min(w/page.width,h/page.height),width=page.width*scale,height=page.height*scale;return{x:x+(w-width)/2,y:y+index*h+(h-height)/2,width,height}});
}

function removePdf(id){
  if(!(doc.pdfs||[]).some(asset=>asset.id===id))return false;
  finishInteraction();checkpoint();doc.pdfs=doc.pdfs.filter(asset=>asset.id!==id);render();persist();return true;
}
function renderPdfList(){
  const assets=doc.pdfs||[],root=$('#pdf-assets');$('#pdf-library').hidden=!assets.length;
  const signature=assets.map(asset=>asset.id+':'+asset.name+':'+asset.pages.length).join('|');if(root.dataset.signature===signature)return;root.dataset.signature=signature;root.replaceChildren();
  for(const asset of assets){const row=document.createElement('div');row.className='pdf-asset';const label=document.createElement('span');label.textContent=asset.name;label.title=asset.name+' · '+asset.pages.length+' 页';const remove=document.createElement('button');remove.textContent='×';remove.title='删除 PDF，保留笔迹批注（Ctrl+Z 恢复）';remove.setAttribute('aria-label','删除 PDF '+asset.name);remove.onclick=()=>removePdf(asset.id);row.append(label,remove);root.append(row)}
}
$('#pdf-manage').onclick=()=>{renderPdfList();if(!doc.pdfs?.length){toast('当前页没有 PDF');return}$('#pdf-library').scrollIntoView({block:'nearest'});$('#pdf-assets button')?.focus()};
