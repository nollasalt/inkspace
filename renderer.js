// Static scene and locally rasterized ink tiles. Canvas contexts explicitly use
// the CPU coverage rasterizer: Chromium's GPU/CPU paths otherwise disagree on
// thin strokes. Pan/zoom previews still use compositor layer transforms.
const inkLayers=[],strokeCache=new WeakMap(),noteCache=new Map();
const renderStats={scenePaints:0,fullScenePaints:0,stripPaints:0,livePaints:0,outlineBuilds:0,noteBuilds:0,maxTailSamples:0,panFrames:0,moveFrames:0};
let zoomBase=null,zoomFrame=null,zoomTimer=null;
function cancelZoomPreview(){clearTimeout(zoomTimer);if(zoomFrame!==null)(window.cancelAnimationFrame||clearTimeout)(zoomFrame);zoomFrame=null;zoomBase=null}
function settleZoom(){if(!zoomBase)return;render()}
function previewZoom(){
  if(typeof refreshPenCursor==='function')refreshPenCursor();
  $('#scene').style.willChange='transform';
  if(!zoomBase)zoomBase={...paintedView,scale:renderedScale};
  if(zoomFrame===null)zoomFrame=(window.requestAnimationFrame||((f)=>setTimeout(f,16)))(()=>{zoomFrame=null;if(!zoomBase)return;const ratio=view.scale/zoomBase.scale;if(ratio>1.5||ratio<2/3){render();return}$('#scene').style.transform=`translate(${view.x-zoomBase.x*ratio}px,${view.y-zoomBase.y*ratio}px) scale(${ratio})`;$('#reset').textContent=zoomLabel(view.scale)});
  clearTimeout(zoomTimer);zoomTimer=setTimeout(settleZoom,120);
}
function interactiveZoom(s,x,y){const p=world(x,y);view.scale=usableZoom(s);view.x=x-p.x*view.scale;view.y=y-p.y*view.scale;previewZoom()}
let renderedScale=1;
let surface={width:0,height:0,dpr:1,padding:192},saveTimer=0,interactionFrame=null,paintedView={x:0,y:0},sceneBuffer=null,bufferContext=null;
function initLayers(){
  if(inkLayers.length)return;
  for(const id of ['#ink','#ink-stream','#ink-live']){
    const c=$(id);inkLayers.push({canvas:c,ctx:c===canvas?ctx:c.getContext('2d',{willReadFrequently:true})});
  }
}
function worldTransform(context){const d=surface.dpr;context.setTransform(d*view.scale,0,0,d*view.scale,d*(view.x+surface.padding),d*(view.y+surface.padding))}
function clearLayer(layer){layer.ctx.setTransform(1,0,0,1,0,0);layer.ctx.clearRect(0,0,layer.canvas.width,layer.canvas.height);worldTransform(layer.ctx)}
function prepareSurfaces(){
  initLayers();const r=viewport.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
  surface={width:r.width,height:r.height,dpr,padding:192};
  for(const l of inkLayers){const cw=r.width+surface.padding*2,ch=r.height+surface.padding*2,w=Math.round(cw*dpr),h=Math.round(ch*dpr);if(l.canvas.width!==w||l.canvas.height!==h){l.canvas.width=w;l.canvas.height=h}l.canvas.style.left=l.canvas.style.top=-surface.padding+'px';l.canvas.style.width=cw+'px';l.canvas.style.height=ch+'px';worldTransform(l.ctx)}
  if(!sceneBuffer){sceneBuffer=document.createElement('canvas');sceneBuffer.id='scene-buffer';bufferContext=sceneBuffer.getContext('2d',{willReadFrequently:true})}
  if(sceneBuffer.width!==canvas.width)sceneBuffer.width=canvas.width;if(sceneBuffer.height!==canvas.height)sceneBuffer.height=canvas.height;
  const paper=$('#paper');paper.style.left=paper.style.top=-surface.padding+'px';paper.style.width=(r.width+surface.padding*2)+'px';paper.style.height=(r.height+surface.padding*2)+'px';
}
function cachedStroke(s){
  let c=strokeCache.get(s);if(!c){const d=InkContent.strokePath(s);c={d,path:new Path2D(d),bounds:itemBounds('strokes',s)};strokeCache.set(s,c);renderStats.outlineBuilds++}return c;
}
function visible(b){const pad=surface.padding,r={x:(-view.x-pad)/view.scale,y:(-view.y-pad)/view.scale,w:(surface.width+pad*2)/view.scale,h:(surface.height+pad*2)/view.scale};return b.x+b.w>=r.x&&b.y+b.h>=r.y&&b.x<=r.x+r.w&&b.y<=r.y+r.h}
function backgroundSettings(){const bg=doc.background||{type:'ruled',color:'#ffffff',spacing:'auto',fontSize:16};return {...bg,layout:bg.layout==='a4-landscape'?'a4-landscape':'a4-portrait'}}
function a4Dimensions(){return backgroundSettings().layout==='a4-landscape'?[297*96/25.4,210*96/25.4]:[210*96/25.4,297*96/25.4]}
function textSize(){return backgroundSettings().fontSize||16}
function backgroundSpacing(){const bg=backgroundSettings();return bg.spacing==='auto'?textSize()*1.75:bg.spacing}
// Paper occupancy is derived from content; completed stroke coverage is cached,
// and live strokes only add their new segments. No ink raster is rebuilt here.
const a4StrokeCache=new WeakMap();let a4Frame=null;
function scheduleA4Pages(){
  if(!backgroundSettings().layout?.startsWith('a4-')||a4Frame!==null)return;
  a4Frame=(window.requestAnimationFrame||((f)=>setTimeout(f,16)))(()=>{a4Frame=null;renderA4Pages()});
}
function renderA4Pages(){
  const paper=$('#paper'),layout=backgroundSettings().layout;
  let layer=paper.querySelector('#a4-pages');
  if(!layout?.startsWith('a4-')){layer?.remove();return}
  if(!layer){layer=document.createElement('div');layer.id='a4-pages';layer.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden';paper.append(layer)}
  const [w,h]=a4Dimensions();
  layer.dataset.pageWidth=w;layer.dataset.pageHeight=h;
  const cells=new Set(),add=(x,y,target=cells)=>target.add(`${x},${y}`);
  // Include every grid crossing, even a brief crossing near a page corner.
  function segment(a,b,r,target=cells){
    const cuts=[0,1];
    for(const [axis,size] of [['x',w],['y',h]])if(a[axis]!==b[axis])for(const offset of [-r,r]){
      const lo=Math.min(a[axis],b[axis])+offset,hi=Math.max(a[axis],b[axis])+offset;
      for(let grid=Math.floor(lo/size)+1;grid*size<hi;grid++)cuts.push((grid*size-offset-a[axis])/(b[axis]-a[axis]));
    }
    cuts.sort((a,b)=>a-b);
    for(let i=0;i<cuts.length;i++){
      const t=i?(cuts[i-1]+cuts[i])/2:cuts[i],x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
      for(let cx=Math.floor((x-r)/w);cx<=Math.floor((x+r)/w);cx++)for(let cy=Math.floor((y-r)/h);cy<=Math.floor((y+r)/h);cy++)add(cx,cy,target);
    }
  }
  function box(b){for(let x=Math.floor(b.x/w);x<=Math.floor((b.x+Math.max(0,b.w-1e-7))/w);x++)for(let y=Math.floor(b.y/h);y<=Math.floor((b.y+Math.max(0,b.h-1e-7))/h);y++)add(x,y)}
  for(const s of doc.strokes){
    const points=s.points;if(!points.length)continue;
    let c=a4StrokeCache.get(s);const first=points[0],prior=c&&points[c.length-1];
    if(!c||c.layout!==layout||c.width!==s.width||c.points!==points||c.length>points.length||c.firstX!==first.x||c.firstY!==first.y||prior?.x!==c.lastX||prior?.y!==c.lastY){c={layout,width:s.width,points,length:0,firstX:first.x,firstY:first.y,cells:new Set()};a4StrokeCache.set(s,c)}
    for(let i=c.length;i<points.length;i++)segment(points[Math.max(0,i-1)],points[i],s.width/2,c.cells);
    c.length=points.length;c.lastX=points.at(-1).x;c.lastY=points.at(-1).y;
    for(const key of c.cells)cells.add(key);
  }
  for(const s of doc.shapes){
    const b=itemBounds('shapes',s),r=s.width/2;
    if(s.kind==='highlight')box(b);
    else if(s.kind==='rect'){const p=[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h}];for(let i=0;i<4;i++)segment(p[i],p[(i+1)%4],r)}
    else if(s.kind==='ellipse'){const count=Math.max(32,Math.ceil(Math.PI*(b.w/w+b.h/h)*8));let prev={x:b.x+b.w,y:b.y+b.h/2};for(let i=1;i<=count;i++){const t=i/count*Math.PI*2,q={x:b.x+b.w/2+Math.cos(t)*b.w/2,y:b.y+b.h/2+Math.sin(t)*b.h/2};segment(prev,q,r);prev=q}}
    else{segment({x:s.x,y:s.y},{x:s.x2,y:s.y2},r);if(s.kind==='arrow'){const [a,z]=arrowPoints(s);segment(a,{x:s.x2,y:s.y2},r);segment(z,{x:s.x2,y:s.y2},r)}}
  }
  const diagramCoverage=doc.diagram?window.inkspaceDiagram?.coverage():null;for(const b of diagramCoverage?.boxes||[])box(b);for(const l of diagramCoverage?.lines||[])for(let i=1;i<l.points.length;i++)segment(l.points[i-1],l.points[i],l.width/2);
  for(const n of doc.notes)if(n.kind==='image'?n.src:n.markdown?.trim())box(itemBounds('notes',n));
  for(const asset of doc.pdfs||[])for(const p of asset.pages)box({x:p.x,y:p.y,w:p.width,h:p.height});
  // An empty note starts with one sheet; additional sheets require content.
  if(!cells.size)add(0,0);layer.hidden=false;
  const paths=[];
  for(const key of cells){const [x,y]=key.split(',').map(Number),b={x:x*w,y:y*h,w,h};if(visible(b))paths.push(`<rect data-cell="${key}" x="${b.x}" y="${b.y}" width="${w}" height="${h}"/>`)}
  const bg={...backgroundSettings(),color:'#ffffff'},dark=bg.color.match(/[a-f0-9]{2}/gi).reduce((sum,c)=>sum+parseInt(c,16),0)<384;
  const line=dark?'rgba(255,255,255,.18)':'rgba(38,63,67,.16)';
  let spacing=backgroundSpacing();while(spacing*view.scale<6)spacing*=10;
  const pixel=1/view.scale;
  const pattern=bg.type==='dots'?`<circle cx="${spacing/2}" cy="${spacing/2}" r="${pixel}" fill="${line}" stroke="none"/>`:bg.type==='ruled'||bg.type==='grid'?`<path d="M 0 0 H ${spacing}${bg.type==='grid'?` M 0 0 V ${spacing}`:''}" fill="none" stroke="${line}" stroke-width="${pixel}"/>`:'';
  const defs=pattern?`<defs><pattern id="a4-pattern" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse"><path d="M 0 0 H ${spacing} V ${spacing} H 0 Z" fill="${bg.color}" stroke="none"/>${pattern}</pattern></defs>`:'';
  const markup=`<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">${defs}<g transform="translate(${view.x+surface.padding} ${view.y+surface.padding}) scale(${view.scale})" fill="${pattern?'url(#a4-pattern)':bg.color}" stroke="${Math.min(w,h)*view.scale>=8?'rgba(100,110,120,.25)':'none'}" stroke-width="1" stroke-dasharray="4 5">${paths.map(p=>p.replace('/>',' vector-effect="non-scaling-stroke"/>')).join('')}</g></svg>`;
  if(layer.innerHTML!==markup)layer.innerHTML=markup;
}
function renderBackground(){
  const bg=backgroundSettings(),rgb=bg.color.match(/[a-f0-9]{2}/gi).map(c=>parseInt(c,16)),dark=rgb.reduce((a,b)=>a+b,0)<384,line=dark?'rgba(255,255,255,.18)':'rgba(38,63,67,.16)';
  let size=backgroundSpacing()*view.scale;while(size>0&&size<6)size*=10;
  const paper=$('#paper');
  viewport.style.backgroundColor=bg.color;viewport.style.backgroundImage='none';paper.style.backgroundColor=bg.color;
  paper.style.backgroundImage=bg.type==='grid'?`linear-gradient(${line} 1px,transparent 1px),linear-gradient(90deg,${line} 1px,transparent 1px)`:bg.type==='ruled'?`linear-gradient(${line} 1px,transparent 1px)`:bg.type==='dots'?`radial-gradient(${line} 1px,transparent 1px)`:'none';
  paper.style.backgroundSize=`${size}px ${size}px`;paper.style.backgroundPosition=`${view.x+surface.padding}px ${view.y+surface.padding}px`;
  const layout=bg.layout||'infinite';$('#page-layout').value=layout;
  if(layout.startsWith('a4-')){viewport.style.backgroundColor=paper.style.backgroundColor='#e8eaed';paper.style.backgroundImage='none'}
  renderA4Pages();
  $('#background-kind').value=bg.type;$('#background-color').value=bg.color;$('#background-spacing').value=String(bg.spacing);
  $('#text-size').value=String(textSize());$('#background-spacing').title=bg.spacing==='auto'?`按 ${textSize()}px 字号设置 ${backgroundSpacing()}px 行距`:'自定义世界坐标间距';
}
function backgroundSvg(b){
  const bg=backgroundSettings(),s=backgroundSpacing(),line='#92a59b';
  let pattern=bg.type==='dots'?`<circle cx="${s/2}" cy="${s/2}" r="0.8" fill="${line}"/>`:bg.type==='ruled'?`<path d="M 0 0 H ${s}" stroke="${line}" stroke-width=".6"/>`:bg.type==='grid'?`<path d="M 0 ${s} V 0 H ${s}" fill="none" stroke="${line}" stroke-width=".6"/>`:'';
  return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${bg.color}"/>`+(pattern?`<defs><pattern id="paper" width="${s}" height="${s}" patternUnits="userSpaceOnUse">${pattern}</pattern></defs><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="url(#paper)"/>`:'');
}
function paintStroke(context,s,points){
  if(s.brush==='xournal'&&hasNativeInk()&&!points){paintCairoStroke(context,s);return}
  context.fillStyle=s.color;
  if(s.brush!=='raw-contour'){context.fill(points?new Path2D(InkContent.strokePath(s,points)):cachedStroke(s).path);return}
  const cache=points?{}:cachedStroke(s),key=inkTileSignature();
  if(cache.tileKey!==key){
    cache.tileKey=key;cache.tiles=new Map();const state=InkContent.createStrokeState(s);
    for(const q of points||s.points){const previous=state.points.at(-1)||q,d=InkContent.appendStrokePoint(state,q);if(d)addInkTileSegment(cache.tiles,d,previous,q,s.width)}
  }
  for(const tile of cache.tiles.values())paintInkTile(context,tile,false);
}
function placeNote(n,el,dx=0,dy=0){
  const dpr=window.devicePixelRatio||1,s=view.scale*(n.scale||1);
  el.style.transform='';el.style.left=(Math.round((view.x+n.x*view.scale+dx)*dpr)/dpr)+'px';el.style.top=(Math.round((view.y+n.y*view.scale+dy)*dpr)/dpr)+'px';
  // Layout lives in world units. Zoom must never change line breaking, font
  // metrics, fixed CSS padding, or browser minimum-font-size decisions.
  el.style.width=(n.width||320)+'px';el.style.fontSize=textSize()+'px';el.style.setProperty('--note-scale','1');el.style.transform=`scale(${s})`;el.style.transformOrigin='0 0';
}
function renderNotes(){
  window.inkspaceInlineText?.sync();
  const ids=new Set(doc.notes.map(n=>n.id));
  for(const [id,c] of noteCache)if(!ids.has(id)){c.el.remove();noteCache.delete(id)}
  for(const [index,n] of doc.notes.entries()){
    let c=noteCache.get(n.id);
    if(!c){const el=document.createElement('article');el.className='note';el.dataset.id=n.id;el.innerHTML='<div class="note-bar">⋮⋮ 移动文本框</div><div class="note-body"></div><div class="note-hit" aria-hidden="true"></div><div class="note-resize" title="拖动调整宽度"></div>';el.addEventListener('dblclick',event=>{if(event.pointerType==='pen'||event.sourceCapabilities?.firesTouchEvents)return;const current=doc.notes.find(item=>item.id===n.id);if(current&&current.kind!=='image')edit(current)});c={el,body:el.querySelector('.note-body'),markdown:null};noteCache.set(n.id,c);notes.append(el)}
    if(window.inkspaceInlineText?.renderNote(n)){placeNote(n,c.el);window.inkspaceInlineText.layoutNote(n,c);continue}
    if(c.markdown!==n.markdown||c.src!==n.src){c.body.replaceChildren();if(n.kind==='image'){const image=document.createElement('img');image.src=n.src;image.alt='粘贴的图片';image.draggable=false;image.style.aspectRatio=String(n.aspect);c.body.append(image)}else c.body.innerHTML=markdown(n.markdown);c.markdown=n.markdown;c.src=n.src;c.el.classList.toggle('image-note',n.kind==='image');const bar=c.el.querySelector('.note-bar');if(bar)bar.textContent=n.kind==='image'?'⋮⋮ 移动图片':'⋮⋮ 移动文本框';renderStats.noteBuilds++}
    placeNote(n,c.el);
    window.inkspaceInlineText?.layoutNote(n,c);
    c.el.classList.toggle('selected',selected.notes.includes(index));
  }
}
function paintScene(context,regions=null){
  const intersects=b=>!regions||regions.some(r=>b.x+b.w>=r.x&&b.y+b.h>=r.y&&b.x<=r.x+r.w&&b.y<=r.y+r.h);
  context.lineCap='round';context.lineJoin='round';
  for(const s of doc.strokes){if(s===active?.s||active?.movingStrokes?.has(s))continue;const c=cachedStroke(s);if(visible(c.bounds)&&intersects(c.bounds))paintStroke(context,s)}
  for(const s of doc.shapes){if(active?.movingShapes?.has(s)||active?.shape===s)continue;const b=itemBounds('shapes',s),bounds={x:b.x-s.width,y:b.y-s.width,w:b.w+s.width*2,h:b.h+s.width*2};if(visible(bounds)&&intersects(bounds))drawShape(s,context)}
}
function commitScene(){
  ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='copy';ctx.drawImage(sceneBuffer,0,0);ctx.globalCompositeOperation='source-over';worldTransform(ctx);
  $('#scene').style.transform='';$('#scene').style.willChange=active?.type==='pan'?'transform':'auto';paintedView={x:view.x,y:view.y};renderedScale=view.scale;renderNotes();window.inkspaceDiagram?.render();if(typeof renderPdfs==='function')renderPdfs();renderBackground();overlaySelection();
}
function render(){
  cancelZoomPreview();
  prepareSurfaces();bufferContext.setTransform(1,0,0,1,0,0);bufferContext.clearRect(0,0,sceneBuffer.width,sceneBuffer.height);worldTransform(bufferContext);paintScene(bufferContext);
  renderStats.scenePaints++;renderStats.fullScenePaints++;commitScene();
  $('#reset').textContent=zoomLabel(view.scale);$('#in').disabled=false;$('#out').disabled=false;
  $('#undo').disabled=!history.length;$('#redo').disabled=!future.length;
  if(active?.type==='pen')paintLive();
}
function beginInk(){
  clearTimeout(saveTimer);active.rect=viewport.getBoundingClientRect();active.inkState=InkContent.createStrokeState(active.s);active.inkCursor=0;active.liveDirty=null;
  clearLayer(inkLayers[1]);if(!window.inkspacePreserveCompletedInk)clearLayer(inkLayers[2]);paintLive();overlaySelection();
}
function screenBounds(points,width){
  let x=Infinity,y=Infinity,x2=-Infinity,y2=-Infinity;
  for(const p of points){x=Math.min(x,p.x);y=Math.min(y,p.y);x2=Math.max(x2,p.x);y2=Math.max(y2,p.y)}
  const margin=width*2*view.scale+4;
  return {x:(view.x+surface.padding+x*view.scale-margin)*surface.dpr,y:(view.y+surface.padding+y*view.scale-margin)*surface.dpr,w:((x2-x)*view.scale+margin*2)*surface.dpr,h:((y2-y)*view.scale+margin*2)*surface.dpr};
}
function paintLive(){
  if(active?.type!=='pen')return;
  scheduleA4Pages();
  if(active.s.brush==='xournal'&&hasNativeInk()){scheduleCairoInk();return}
  if(active.s.brush==='raw-contour'){paintRawInk();return}
  const s=active.s,settled=inkLayers[1],tail=inkLayers[2];
  settled.ctx.fillStyle=tail.ctx.fillStyle=s.color;
  while(active.inkCursor<s.points.length){const d=InkContent.appendStrokePoint(active.inkState,s.points[active.inkCursor++]);if(d)settled.ctx.fill(new Path2D(d))}
  const points=InkContent.strokeTailPoints(active.inkState);
  if(active.liveDirty){const b=active.liveDirty;tail.ctx.setTransform(1,0,0,1,0,0);tail.ctx.clearRect(b.x,b.y,b.w,b.h);worldTransform(tail.ctx)}
  tail.ctx.fill(new Path2D(InkContent.strokeTailPath(active.inkState)));active.liveDirty=screenBounds(points,s.width);
  renderStats.livePaints++;renderStats.maxTailSamples=Math.max(renderStats.maxTailSamples,points.length);
}
// Rasterize the union once per dirty device-pixel tile. Repeated source-over
// fills of individual segments darken their shared antialiased edges.
function paintRawInk(){
  const s=active.s,layer=inkLayers[1],c=layer.ctx;
  const signature=inkTileSignature();
  if(active.tileSignature!==signature){
    active.tileSignature=signature;active.inkTiles=new Map();active.inkState=InkContent.createStrokeState(s);active.inkCursor=0;clearLayer(layer);clearLayer(inkLayers[2]);
  }
  const dirty=new Set();
  while(active.inkCursor<s.points.length){
    const q=s.points[active.inkCursor++],previous=active.inkState.points.at(-1)||q;
    const d=InkContent.appendStrokePoint(active.inkState,q);if(!d)continue;
    addInkTileSegment(active.inkTiles,d,previous,q,s.width,dirty);
  }
  c.fillStyle=s.color;
  for(const tile of dirty)paintInkTile(c,tile,true);
  renderStats.livePaints++;
}
function inkTileSignature(){return[view.x,view.y,view.scale,surface.dpr,canvas.width,canvas.height].join(',')}
function addInkTileSegment(tiles,d,previous,q,width,dirty){
  const size=128,path=new Path2D(d),b=screenBounds([previous,q],width);
  // Keep the grid attached to the drawing when panning. Otherwise moving a
  // stroke between tiles changes its rasterization even at an integer offset.
  const ox=Math.round((view.x+surface.padding)*surface.dpr),oy=Math.round((view.y+surface.padding)*surface.dpr);
  const x0=Math.max(Math.floor(-ox/size),Math.floor((b.x-ox)/size)),y0=Math.max(Math.floor(-oy/size),Math.floor((b.y-oy)/size));
  const x1=Math.min(Math.ceil((canvas.width-ox)/size)-1,Math.floor((b.x+b.w-ox)/size)),y1=Math.min(Math.ceil((canvas.height-oy)/size)-1,Math.floor((b.y+b.h-oy)/size));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const key=x+','+y;let tile=tiles.get(key);
    if(!tile){tile={x:x*size+ox,y:y*size+oy,path:new Path2D()};tiles.set(key,tile)}
    tile.path.addPath(path);dirty?.add(tile);
  }
}
function paintInkTile(c,tile,clear){
  c.save();c.setTransform(1,0,0,1,0,0);c.beginPath();c.rect(tile.x,tile.y,128,128);c.clip();
  if(clear)c.clearRect(tile.x,tile.y,128,128);
  worldTransform(c);c.fill(tile.path);c.restore();
}
function sampleInk(e,release=false){
  const events=e.getCoalescedEvents?.()||[],samples=events.length?events:[e];
  for(const sample of samples){
    const time=sample.timeStamp;
    if(Number.isFinite(time)&&time>0&&time<active.sampleTime)continue;
    const previous=active.s.points.at(-1),p=world(sample.clientX-active.rect.left,sample.clientY-active.rect.top);
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
    let pressure=sample.pointerType==='pen'?sample.pressure:1;
    if(!Number.isFinite(pressure))pressure=previous.p;
    if(release&&pressure===0)pressure=previous.p;
    pressure=Math.max(0,Math.min(1,pressure));
    // A release often has rounded coordinates even when movement samples have
    // subpixel precision. Zero-pressure pen-up is not a new contact point.
    if(release&&sample.pointerType==='pen'&&sample.pressure===0)continue;
    if(!release&&sample.pointerType==='pen'&&sample.pressure===0&&sample.buttons===0)continue;
    if(Number.isFinite(time)&&time>0)active.sampleTime=time;
    if(p.x===previous.x&&p.y===previous.y&&pressure===previous.p)continue;
    active.s.points.push({...p,p:pressure});
  }
}
function finishInk(){
  cancelCairoInk();
  const s=active.s;active=null;
  // Recompose the affected region once, preserving translucent highlights.
  const b=cachedStroke(s).bounds,d=surface.dpr,margin=4;
  const x=Math.floor((view.x+surface.padding+b.x*view.scale)*d)-margin,y=Math.floor((view.y+surface.padding+b.y*view.scale)*d)-margin,w=Math.ceil(b.w*view.scale*d)+margin*2,h=Math.ceil(b.h*view.scale*d)+margin*2;
  bufferContext.setTransform(1,0,0,1,0,0);bufferContext.globalCompositeOperation='copy';bufferContext.drawImage(canvas,0,0);bufferContext.globalCompositeOperation='source-over';bufferContext.clearRect(x,y,w,h);bufferContext.save();bufferContext.beginPath();bufferContext.rect(x,y,w,h);bufferContext.clip();worldTransform(bufferContext);paintScene(bufferContext,[{x:b.x-margin/d/view.scale,y:b.y-margin/d/view.scale,w:b.w+margin*2/d/view.scale,h:b.h+margin*2/d/view.scale}]);bufferContext.restore();commitScene();
  clearLayer(inkLayers[1]);clearLayer(inkLayers[2]);
  $('#undo').disabled=!history.length;$('#redo').disabled=!future.length;
}
function scheduleInteractionFrame(){if(interactionFrame!==null)return;interactionFrame=(window.requestAnimationFrame||((fn)=>setTimeout(fn,16)))(()=>{interactionFrame=null;presentInteraction()})}
function cancelInteractionFrame(){if(interactionFrame===null)return;(window.cancelAnimationFrame||clearTimeout)(interactionFrame);interactionFrame=null}
function presentInteraction(){
  if(active?.type==='erase'){
    flushErasing();
  }else if(active?.type==='pan'){
    $('#scene').style.willChange='transform';
    const dx=view.x-paintedView.x,dy=view.y-paintedView.y;
    if(Math.max(Math.abs(dx),Math.abs(dy))>surface.padding*.7)rebasePan();
    else{const d=surface.dpr;$('#scene').style.transform=`translate(${Math.round(dx*d)/d}px,${Math.round(dy*d)/d}px)`}
    renderStats.panFrames++;
  }else if(active?.type==='select'){
    overlaySelection();
  }else if(active?.type==='resize-selection'){
    const {bounds:b,factor}=active,origin={x:view.x+b.x*view.scale,y:view.y+b.y*view.scale};
    inkLayers[1].canvas.style.transformOrigin=`${origin.x+surface.padding}px ${origin.y+surface.padding}px`;
    inkLayers[1].canvas.style.transform=`scale(${factor})`;
    for(const i of selected.notes){const n=doc.notes[i],el=noteCache.get(n.id).el;placeNote(n,el,(n.x-b.x)*view.scale*(factor-1),(n.y-b.y)*view.scale*(factor-1));el.style.transform=`scale(${view.scale*(n.scale||1)*factor})`}
    const selection=$('#selection');selection.style.transformOrigin='4px 4px';selection.style.transform=`scale(${factor})`;
  }else if(active?.type==='move-selection'){
    const dx=active.offset.x*view.scale,dy=active.offset.y*view.scale;
    inkLayers[1].canvas.style.transform=`translate3d(${dx}px,${dy}px,0)`;
    for(const i of selected.notes){const n=doc.notes[i];placeNote(n,noteCache.get(n.id).el,dx,dy)}
    $('#selection').style.transform=`translate3d(${dx}px,${dy}px,0)`;renderStats.moveFrames++;
  }else if(active?.type==='note'){
    const n=active.n;placeNote(n,noteCache.get(n.id).el,active.offset.x*view.scale,active.offset.y*view.scale);renderStats.moveFrames++;
  }
}
function rebasePan(){
  const d=surface.dpr,dx=Math.round((view.x-paintedView.x)*d),dy=Math.round((view.y-paintedView.y)*d),w=canvas.width,h=canvas.height;
  view.x=paintedView.x+dx/d;view.y=paintedView.y+dy/d;
  if(!dx&&!dy){$('#scene').style.transform='';return}
  if(Math.abs(dx)>=w||Math.abs(dy)>=h){render();return}
  const strips=[];if(dx>0)strips.push({x:0,y:0,w:dx,h});else if(dx<0)strips.push({x:w+dx,y:0,w:-dx,h});
  if(dy>0)strips.push({x:0,y:0,w,h:dy});else if(dy<0)strips.push({x:0,y:h+dy,w,h:-dy});
  bufferContext.setTransform(1,0,0,1,0,0);bufferContext.globalCompositeOperation='copy';bufferContext.drawImage(canvas,dx,dy);bufferContext.globalCompositeOperation='source-over';bufferContext.save();bufferContext.beginPath();
  for(const r of strips)bufferContext.rect(r.x,r.y,r.w,r.h);bufferContext.clip();worldTransform(bufferContext);
  paintScene(bufferContext,strips.map(r=>({x:(r.x/d-surface.padding-view.x)/view.scale,y:(r.y/d-surface.padding-view.y)/view.scale,w:r.w/d/view.scale,h:r.h/d/view.scale})));bufferContext.restore();
  renderStats.scenePaints++;renderStats.stripPaints++;commitScene();
}
function settlePan(){cancelInteractionFrame();rebasePan();active=null;$('#scene').style.willChange='auto'}
function paintShapeLive(){scheduleA4Pages();clearLayer(inkLayers[1]);drawShape(active.shape,inkLayers[1].ctx)}
function beginGroupMove(){
  active.offset={x:0,y:0};active.movingStrokes=new Set(selected.strokes.map(i=>doc.strokes[i]));active.movingShapes=new Set(selected.shapes.map(i=>doc.shapes[i]));
  render();clearLayer(inkLayers[1]);
  for(const s of active.movingStrokes)paintStroke(inkLayers[1].ctx,s);
  for(const s of active.movingShapes)drawShape(s,inkLayers[1].ctx);
}
function finishGroupScale(){
  const {factor,bounds,items}=active;scaleSelection(factor,bounds,items);active=null;
  inkLayers[1].canvas.style.transform='';inkLayers[1].canvas.style.transformOrigin='';
  $('#selection').style.transform='';$('#selection').style.transformOrigin='';clearLayer(inkLayers[1]);render();
}
function finishGroupMove(){const offset=active.offset;detachSelection();moveSelection(offset.x,offset.y);active=null;inkLayers[1].canvas.style.transform='';$('#selection').style.transform='';clearLayer(inkLayers[1]);render()}
function finishInteraction(){if(active?.type==='shape')clearLayer(inkLayers[1]);settleZoom();cancelInteractionFrame();if(active?.type==='pen')finishInk();else if(active?.type==='erase'){finishErasing();active=null}else if(active?.type==='move-selection')finishGroupMove();else if(active?.type==='resize-selection')finishGroupScale();else if(active?.type==='pan')settlePan();else{const wasNote=active?.type==='note';if(wasNote){active.n.x+=active.offset.x;active.n.y+=active.offset.y}active=null;if(wasNote)renderNotes()}pointers.clear();gesture=null;selectionRect=null}
function snapshot(){return {...doc,strokes:doc.strokes.slice(),notes:doc.notes.map(n=>({...n})),shapes:doc.shapes.map(s=>({...s}))}}
function detachSelection(){for(const i of selected.strokes){const s=doc.strokes[i];doc.strokes[i]={...s,points:s.points.map(p=>({...p}))}}}
function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(flushPersist,700)}
function flushPersist(){if(active){persist();return}try{localStorage.setItem('inkspace.document',JSON.stringify(doc))}catch{toast('自动保存失败，请下载 JSON 保存。')}}

// History updates preserve the existing scene and native stroke caches.
function renderHistoryChange(previous,inkOnly=false){
  if(!sceneBuffer||zoomBase||renderedScale!==view.scale||paintedView.x!==view.x||paintedView.y!==view.y||JSON.stringify(previous.background)!==JSON.stringify(doc.background)||previous.pdfs!==doc.pdfs){render();return}
  const old=new Set(previous.strokes),current=new Set(doc.strokes),changed=previous.strokes.filter(s=>!current.has(s)).concat(doc.strokes.filter(s=>!old.has(s)));
  const regions=changed.map(s=>cachedStroke(s).bounds);
  const count=Math.max(previous.shapes.length,doc.shapes.length);
  for(let i=0;i<count;i++)if(JSON.stringify(previous.shapes[i])!==JSON.stringify(doc.shapes[i]))for(const shape of [previous.shapes[i],doc.shapes[i]])if(shape){const b=itemBounds('shapes',shape);regions.push({x:b.x-shape.width,y:b.y-shape.width,w:b.w+2*shape.width,h:b.h+2*shape.width})}
  const b=union(regions);
  // Legacy direct paths change antialiasing when clipped; keep their full paint.
  if(b&&previous.strokes.concat(doc.strokes).some(s=>s.brush!=='raw-contour'&&!(s.brush==='xournal'&&hasNativeInk())&&(()=>{const r=cachedStroke(s).bounds;return r.x+r.w>=b.x-132/view.scale&&r.y+r.h>=b.y-132/view.scale&&r.x<=b.x+b.w+132/view.scale&&r.y<=b.y+b.h+132/view.scale})())){render();return}
  if(b){
    const d=surface.dpr,margin=4,ox=Math.round((view.x+surface.padding)*d),oy=Math.round((view.y+surface.padding)*d);
    // Match raw ink tile boundaries so clipping cannot change their coverage.
    const x=Math.max(0,Math.floor(((view.x+surface.padding+b.x*view.scale)*d-margin-ox)/128)*128+ox),y=Math.max(0,Math.floor(((view.y+surface.padding+b.y*view.scale)*d-margin-oy)/128)*128+oy),right=Math.min(canvas.width,Math.ceil(((view.x+surface.padding+(b.x+b.w)*view.scale)*d+margin-ox)/128)*128+ox),bottom=Math.min(canvas.height,Math.ceil(((view.y+surface.padding+(b.y+b.h)*view.scale)*d+margin-oy)/128)*128+oy),w=right-x,h=bottom-y;
    if(w>0&&h>0){
      bufferContext.setTransform(1,0,0,1,0,0);bufferContext.clearRect(x,y,w,h);bufferContext.save();bufferContext.beginPath();bufferContext.rect(x,y,w,h);bufferContext.clip();worldTransform(bufferContext);paintScene(bufferContext,[{x:(x/d-view.x-surface.padding)/view.scale,y:(y/d-view.y-surface.padding)/view.scale,w:w/d/view.scale,h:h/d/view.scale}]);bufferContext.restore();
      ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.globalCompositeOperation='copy';ctx.drawImage(sceneBuffer,0,0);ctx.restore();worldTransform(ctx);
      renderStats.historyRegionPaints=(renderStats.historyRegionPaints||0)+1;
    }
  }
  clearLayer(inkLayers[1]);clearLayer(inkLayers[2]);if(!inkOnly){renderNotes();window.inkspaceDiagram?.render();renderBackground();overlaySelection()}
  $('#undo').disabled=!history.length;$('#redo').disabled=!future.length;
}

// One spatial index per eraser contact; completed stroke objects are immutable.
// Hit testing sweeps between samples, so a fast/coalesced move cannot skip ink.
function eraseInk(p){
  if(active?.type!=='erase'||!Number.isFinite(p.x)||!Number.isFinite(p.y))return;
  const contact=active;
  if(!contact.eraseIndex){
    if(typeof settleRetainedInk==='function')settleRetainedInk();
    contact.eraseIndex=new Map();contact.eraseLarge=new Set();contact.eraseRemoved=new Set();contact.eraseDirty=new Set();contact.eraseCell=128/view.scale;
    for(const stroke of doc.strokes){const b=cachedStroke(stroke).bounds,c=contact.eraseCell,x=Math.floor(b.x/c),y=Math.floor(b.y/c),right=Math.floor((b.x+b.w)/c),bottom=Math.floor((b.y+b.h)/c);
      if((right-x+1)*(bottom-y+1)>256){contact.eraseLarge.add(stroke);continue}
      for(let i=x;i<=right;i++)for(let j=y;j<=bottom;j++){const key=i+','+j;let cell=contact.eraseIndex.get(key);if(!cell)contact.eraseIndex.set(key,cell=[]);cell.push(stroke)}
    }
  }
  const a=contact.eraseLast||p,r=12/view.scale,c=contact.eraseCell,left=Math.min(a.x,p.x)-r,top=Math.min(a.y,p.y)-r,right=Math.max(a.x,p.x)+r,bottom=Math.max(a.y,p.y)+r;
  const candidates=new Set(contact.eraseLarge),x=Math.floor(left/c),y=Math.floor(top/c),x2=Math.floor(right/c),y2=Math.floor(bottom/c);
  if((x2-x+1)*(y2-y+1)>4096)for(const stroke of doc.strokes)candidates.add(stroke);
  else for(let i=x;i<=x2;i++)for(let j=y;j<=y2;j++)for(const stroke of contact.eraseIndex.get(i+','+j)||[])candidates.add(stroke);
  renderStats.eraseSamples=(renderStats.eraseSamples||0)+1;
  const cross=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
  const hits=(u,v,radius)=>{
    if(Math.max(u.x,v.x)+radius<Math.min(a.x,p.x)||Math.min(u.x,v.x)-radius>Math.max(a.x,p.x)||Math.max(u.y,v.y)+radius<Math.min(a.y,p.y)||Math.min(u.y,v.y)-radius>Math.max(a.y,p.y))return false;
    renderStats.eraseSegmentChecks=(renderStats.eraseSegmentChecks||0)+1;
    if(Math.min(distance(u,v,a),distance(u,v,p),distance(a,p,u),distance(a,p,v))<=radius)return true;
    // Strict crossing; collinear/disjoint segments use endpoint distances above.
    return cross(u,v,a)*cross(u,v,p)<0&&cross(a,p,u)*cross(a,p,v)<0;
  };
  for(const stroke of candidates){if(contact.eraseRemoved.has(stroke))continue;renderStats.eraseCandidates=(renderStats.eraseCandidates||0)+1;
    const b=cachedStroke(stroke).bounds;if(b.x>right||b.y>bottom||b.x+b.w<left||b.y+b.h<top)continue;
    const radius=r+stroke.width/2,points=stroke.points;
    if(points.length===1?hits(points[0],points[0],radius):points.some((point,i)=>i&&hits(points[i-1],point,radius))){contact.eraseRemoved.add(stroke);contact.eraseDirty.add(stroke)}
  }
  contact.eraseLast=p;
}
function flushErasing(){
  if(active?.type!=='erase'||!active.eraseDirty?.size)return;
  const previous={...doc,strokes:doc.strokes};doc.strokes=doc.strokes.filter(stroke=>!active.eraseDirty.has(stroke));active.eraseDirty.clear();
  renderHistoryChange(previous,true);renderStats.eraseFrames=(renderStats.eraseFrames||0)+1;
}
function finishErasing(){cancelInteractionFrame();flushErasing();renderBackground();overlaySelection()}
