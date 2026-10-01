// Keep native Cairo coverage; transfer RGBA as binary without blocking Webview.
let cairoRedrawFrame=null;
let cairoHeldStroke=null;
const cairoPending=new Set();
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
function requestCairoRedraw(){if(cairoRedrawFrame===null)cairoRedrawFrame=requestAnimationFrame(()=>{cairoRedrawFrame=null;render();if(cairoHeldStroke&&active?.type!=='pen'){const cache=strokeCache.get(cairoHeldStroke);if(!doc.strokes.includes(cairoHeldStroke)||cache?.cairoKey===inkTileSignature()){clearLayer(inkLayers[1]);cairoHeldStroke=null}}})}
function asyncCairoBitmap(s,b){
  const task=desktop.inkRasterAsync({points:nativePoints(s),width:s.width,hasPressure:s.hasPressure!==false,color:parseInt(s.color.slice(1),16),pixelWidth:b.w,pixelHeight:b.h,scale:view.scale*surface.dpr,tx:(view.x+surface.padding)*surface.dpr-b.x,ty:(view.y+surface.padding)*surface.dpr-b.y}).then(data=>new ImageData(new Uint8ClampedArray(data.buffer,data.byteOffset,data.byteLength),b.w,b.h));
  cairoPending.add(task);task.finally(()=>cairoPending.delete(task)).catch(()=>{});return task;
}
paintCairoStroke=function(context,s){
  const cache=cachedStroke(s),key=inkTileSignature();
  if(cache.cairoKey!==key&&cache.cairoRequestKey!==key){
    const b=clippedInkRect(screenBounds(s.points,s.width));cache.cairoRequestKey=key;
    if(b.w&&b.h)asyncCairoBitmap(s,b).then(bitmap=>{
      if(cache.cairoRequestKey!==key)return;
      const image=document.createElement('canvas');image.width=b.w;image.height=b.h;image.getContext('2d').putImageData(bitmap,0,0);
      cache.cairoCanvas=image;cache.cairoBounds=b;cache.cairoKey=key;cache.cairoRequestKey=null;
      if(inkTileSignature()===key&&doc.strokes.includes(s))requestCairoRedraw();
    }).catch(error=>{cache.cairoRequestKey=null;toast('原生绘制失败：'+error.message)});
    else{cache.cairoKey=key;cache.cairoCanvas=null;cache.cairoRequestKey=null}
  }
  if(cache.cairoKey===key&&cache.cairoCanvas){context.save();context.setTransform(1,0,0,1,0,0);context.drawImage(cache.cairoCanvas,cache.cairoBounds.x,cache.cairoBounds.y);context.restore()}
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
  const preview=document.createElement('canvas');preview.width=inkLayers[1].canvas.width;preview.height=inkLayers[1].canvas.height;preview.getContext('2d').drawImage(inkLayers[1].canvas,0,0);
  finishCairoInteraction();
  if(strokeCache.get(stroke)?.cairoKey!==inkTileSignature()){const context=inkLayers[1].ctx;context.save();context.setTransform(1,0,0,1,0,0);context.drawImage(preview,0,0);context.restore();cairoHeldStroke=stroke}
};
