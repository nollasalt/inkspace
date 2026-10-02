// Keep native Cairo coverage; transfer RGBA as binary without blocking Webview.
let cairoRedrawFrame=null,cairoScenePreview=false;
function cairoVisibleReady(){const key=inkTileSignature();return doc.strokes.every(s=>s===active?.s||active?.movingStrokes?.has(s)||s.brush!=='xournal'||!visible(cachedStroke(s).bounds)||(()=>{const c=cachedStroke(s);return c.cairoKey===key||c.cairoFull&&c.cairoCanvas&&c.cairoView.scale===view.scale*surface.dpr})())}
function paintCairoPreview(context,s,cache){if(!cache.cairoPreviewPath)cache.cairoPreviewPath=new Path2D(cache.d);context.save();context.fillStyle=s.color;context.fill(cache.cairoPreviewPath);context.restore()}

let cairoHeldStroke=null;
let cairoHeldKey=null;
const renderBeforeReleaseOptimization=render;
render=function(){
  cairoScenePreview=!cairoVisibleReady();
  renderBeforeReleaseOptimization();
  if(cairoHeldStroke&&active?.type!=='pen'&&(!doc.strokes.includes(cairoHeldStroke)||cairoHeldKey!==inkTileSignature())){clearLayer(inkLayers[1]);cairoHeldStroke=null}
};
const cairoFinishedStrokes=new WeakSet();
function commitFinishedInk(s){
  const b=clippedInkRect(screenBounds(s.points,s.width));
  if(b.w&&b.h){
    // Repaint everything in the actual cleared rectangle, including neighbours
    // outside this stroke's smaller geometric bounds (e.g. closely spaced dots).
    const scale=surface.dpr*view.scale,region={x:(b.x/surface.dpr-view.x-surface.padding)/view.scale,y:(b.y/surface.dpr-view.y-surface.padding)/view.scale,w:b.w/scale,h:b.h/scale};
    bufferContext.save();bufferContext.setTransform(1,0,0,1,0,0);bufferContext.clearRect(b.x,b.y,b.w,b.h);bufferContext.beginPath();bufferContext.rect(b.x,b.y,b.w,b.h);bufferContext.clip();worldTransform(bufferContext);paintScene(bufferContext,[region]);bufferContext.restore();
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.beginPath();ctx.rect(b.x,b.y,b.w,b.h);ctx.clip();ctx.globalCompositeOperation='copy';ctx.drawImage(sceneBuffer,0,0);ctx.restore();
  }
  if(cairoHeldStroke===s&&active?.type!=='pen'){clearLayer(inkLayers[1]);cairoHeldStroke=null}
}
const cairoPending=new Set();
const cairoRasterQueue=[];let cairoRasterRunning=0;
function drainCairoRaster(){while(cairoRasterRunning<4&&cairoRasterQueue.length){const job=cairoRasterQueue.shift();if(!job.valid()){job.resolve(null);continue}cairoRasterRunning++;job.run().then(job.resolve,job.reject).finally(()=>{cairoRasterRunning--;drainCairoRaster()})}}
function queuedCairoBitmap(s,b,valid){const task=new Promise((resolve,reject)=>{cairoRasterQueue.push({run:()=>asyncCairoBitmap(s,b),valid,resolve,reject});drainCairoRaster()});cairoPending.add(task);task.finally(()=>cairoPending.delete(task)).catch(()=>{});return task}

const originalCachedStroke=cachedStroke;
cachedStroke=function(s){
  if(s.brush!=='xournal'||!hasNativeInk())return originalCachedStroke(s);
  let cache=strokeCache.get(s);
  if(!cache){
    cache={bounds:itemBounds('strokes',s)};
    // Native raster needs bounds only. Build a JS SVG contour only on export.
    Object.defineProperty(cache,'d',{configurable:true,get(){const d=InkContent.strokePath(s);Object.defineProperty(cache,'d',{value:d});return d}});
    strokeCache.set(s,cache);
  }
  return cache;
};
function requestCairoRedraw(){if(!cairoVisibleReady())return;if(cairoRedrawFrame===null)cairoRedrawFrame=requestAnimationFrame(()=>{cairoRedrawFrame=null;render();if(cairoHeldStroke&&active?.type!=='pen'){const cache=strokeCache.get(cairoHeldStroke);if(!doc.strokes.includes(cairoHeldStroke)||cache?.cairoKey===inkTileSignature()){clearLayer(inkLayers[1]);cairoHeldStroke=null}}})}
function asyncCairoBitmap(s,b){
  const task=desktop.inkRasterAsync({points:nativePoints(s),width:s.width,hasPressure:s.hasPressure!==false,color:parseInt(s.color.slice(1),16),pixelWidth:b.w,pixelHeight:b.h,scale:view.scale*surface.dpr,tx:(view.x+surface.padding)*surface.dpr-b.x,ty:(view.y+surface.padding)*surface.dpr-b.y}).then(data=>new ImageData(new Uint8ClampedArray(data.buffer,data.byteOffset,data.byteLength),b.w,b.h));
  cairoPending.add(task);task.finally(()=>cairoPending.delete(task)).catch(()=>{});return task;
}
paintCairoStroke=function(context,s){
  const cache=cachedStroke(s),key=inkTileSignature();
  if(cache.cairoFull&&cache.cairoCanvas&&cache.cairoView.scale===view.scale*surface.dpr)cache.cairoKey=key;
  if(cache.cairoKey!==key&&cache.cairoRequestKey!==key){
    const bounds=screenBounds(s.points,s.width),full=bounds.w*bounds.h<=1024*1024&&bounds.w<=2048&&bounds.h<=2048;
    const b=full?{x:Math.floor(bounds.x),y:Math.floor(bounds.y),w:Math.ceil(bounds.x+bounds.w)-Math.floor(bounds.x),h:Math.ceil(bounds.y+bounds.h)-Math.floor(bounds.y)}:clippedInkRect(bounds);cache.cairoRequestKey=key;
    const rasterView={scale:view.scale*surface.dpr,x:(view.x+surface.padding)*surface.dpr,y:(view.y+surface.padding)*surface.dpr};
    if(b.w&&b.h)queuedCairoBitmap(s,b,()=>cache.cairoRequestKey===key&&inkTileSignature()===key&&doc.strokes.includes(s)).then(bitmap=>{
      if(cache.cairoRequestKey!==key)return;
      if(!bitmap){cache.cairoRequestKey=null;return}
      const image=document.createElement('canvas');image.width=b.w;image.height=b.h;image.getContext('2d').putImageData(bitmap,0,0);
      cache.cairoFull=full;cache.cairoCanvas=image;cache.cairoView=rasterView;cache.cairoBounds=b;cache.cairoKey=key;cache.cairoRequestKey=null;
      if(inkTileSignature()===key&&doc.strokes.includes(s)){if(cairoFinishedStrokes.has(s)){cairoFinishedStrokes.delete(s);commitFinishedInk(s)}else requestCairoRedraw()}
    }).catch(error=>{if(cache.cairoRequestKey===key)cache.cairoRequestKey=null;toast('原生绘制失败：'+error.message)});
    else{cache.cairoKey=key;cache.cairoCanvas=null;cache.cairoRequestKey=null}
  }
  if(cairoScenePreview||cache.cairoKey!==key){paintCairoPreview(context,s,cache);return}
  if(cache.cairoCanvas){context.save();const old=cache.cairoView,ratio=old?view.scale*surface.dpr/old.scale:1;context.setTransform(ratio,0,0,ratio,old?(view.x+surface.padding)*surface.dpr-old.x*ratio:0,old?(view.y+surface.padding)*surface.dpr-old.y*ratio:0);context.drawImage(cache.cairoCanvas,cache.cairoBounds.x,cache.cairoBounds.y);context.restore()}
};
flushCairoInk=function(){
  cancelCairoInk();if(active?.type!=='pen'||active.s.brush!=='xournal')return;
  const contact=active,s=contact.s,key=inkTileSignature();
  if(contact.cairoBusy)return;
  if(contact.cairoKey!==key){contact.cairoKey=key;contact.cairoCursor=0;clearLayer(inkLayers[1]);clearLayer(inkLayers[2])}
  const count=s.points.length;if(contact.cairoCursor===count)return;
  const b=clippedInkRect(screenBounds(s.points.slice(Math.max(0,contact.cairoCursor-3)),s.width));
  if(!b.w||!b.h){contact.cairoCursor=count;return}
  contact.cairoBusy=true;
  asyncCairoBitmap(s,b).then(bitmap=>{
    if(active!==contact||inkTileSignature()!==key)return;
    inkLayers[1].ctx.putImageData(bitmap,b.x,b.y);contact.cairoCursor=count;renderStats.livePaints++;
  }).catch(error=>toast('原生绘制失败：'+error.message)).finally(()=>{contact.cairoBusy=false;if(active===contact&&(contact.cairoCursor!==s.points.length||inkTileSignature()!==key))scheduleCairoInk()});
};
window.inkspaceCairoIdle=async()=>{for(let i=0;i<100;i++){await Promise.allSettled([...cairoPending]);await new Promise(resolve=>requestAnimationFrame(resolve));if(!cairoPending.size&&cairoRedrawFrame===null)return}throw Error('Native rendering did not settle')};
const finishCairoInteraction=finishInk;
finishInk=function(){
  const stroke=active.s;
  if(stroke.brush!=='xournal'){finishCairoInteraction();return}
  cancelCairoInk();active=null;cairoHeldStroke=stroke;cairoHeldKey=inkTileSignature();cairoFinishedStrokes.add(stroke);
  $('#undo').disabled=!history.length;$('#redo').disabled=!future.length;
  // Leave the live preview visible; no scene copy or DOM rebuild on pointerup.
  requestAnimationFrame(()=>{if(!doc.strokes.includes(stroke))return;paintCairoStroke(bufferContext,stroke);if(strokeCache.get(stroke)?.cairoKey===inkTileSignature()){cairoFinishedStrokes.delete(stroke);commitFinishedInk(stroke)}});
};
