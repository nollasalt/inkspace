function validPdfs(assets){
  if(assets===undefined)return true;
  if(!Array.isArray(assets))return false;
  const assetIds=new Set(),pageIds=new Set();
  return assets.every(asset=>{
    if(!asset||typeof asset.id!=='string'||!/^[a-zA-Z0-9-]+$/.test(asset.id)||assetIds.has(asset.id)||
      typeof asset.name!=='string'||typeof asset.data!=='string'||!/^[A-Za-z0-9+/=]+$/.test(asset.data)||
      !Array.isArray(asset.pages)||!asset.pages.length)return false;
    assetIds.add(asset.id);
    return asset.pages.every((page,index)=>{
      if(!page)return false;
      const id=page.id??(asset.id+'-page-'+(index+1));
      if(typeof id!=='string'||!/^[\w-]+$/.test(id)||pageIds.has(id))return false;
      pageIds.add(id);
      return [page.x,page.y,page.width,page.height].every(Number.isFinite)&&page.width>0&&page.height>0&&
        (page.pageIndex===undefined||Number.isInteger(page.pageIndex)&&page.pageIndex>=0);
    });
  });
}
/* Inkspace v1: world coordinates, pressure samples and Markdown source are canonical. */
const $=s=>document.querySelector(s), viewport=$('#viewport'),canvas=$('#ink'),ctx=canvas.getContext('2d',{willReadFrequently:true}),notes=$('#notes');
function usableZoom(s){return Number.isFinite(s)&&s>0&&Number.isFinite(1/s)?s:view.scale}
function zoomLabel(s){const p=s*100;return (p>=.01&&p<1e7?p.toLocaleString('zh-CN',{maximumFractionDigits:p<1?3:1}):p.toExponential(2))+'%'}
let doc={format:'inkspace',version:1,strokes:[],notes:[],shapes:[],background:{layout:'infinite',type:'ruled',color:'#ffffff',spacing:'auto',fontSize:16}},view={x:100,y:80,scale:1},tool='select',space=false,active=null,editing=null;
const inputTools=new InkInteraction.InputTools();
window.inkspaceInputTools=inputTools;
const blockSelection=new InkInteraction.Selection();
let selectionId=0;
function blockIdentity(item){if(item.id)return item.id;const id=crypto.randomUUID()+'-'+(++selectionId),index=doc.strokes.indexOf(item);if(index>=0){const replacement={...item,id};doc.strokes[index]=replacement;const cached=strokeCache.get(item);if(cached)strokeCache.set(replacement,cached)}else item.id=id;return id}
const selectionProjection=InkInteraction.selectionProjection(blockSelection,{
  kinds:['strokes','notes','shapes','pdfs','pdfPages'],items:kind=>blockItems(kind),
  id:blockIdentity
});
let selected=selectionProjection,selectionRect=null;
function syncSelectionProjection(){if(selected!==selectionProjection){const prior=selected;blockSelection.clear();selected=selectionProjection;Object.assign(selected,prior)}}
window.inkspaceSelection=blockSelection;
let history=[],future=[],pointers=new Map(),gesture=null;
const world=(x,y)=>({x:(x-view.x)/view.scale,y:(y-view.y)/view.scale});
const local=e=>{let r=viewport.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
function checkpoint(){const before=snapshot();window.inkspaceInteraction?.captureCheckpoint(before);history.push(before);if(history.length>80)history.shift();future=[];}

function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',3000)}
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function inline(s){return InkContent.inline(s)}
function markdown(s){return InkContent.markdown(s)}
function normalized(a,b){return{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)}}
function blockItems(kind){return window.InkBlockModel?InkBlockModel.list(doc,kind):doc[kind]||[]}
function blockValue(kind,index){return window.InkBlockModel?InkBlockModel.get(doc,kind,index):doc[kind]?.[index]}
function blockIndex(kind,item,index){return kind==='pdfPages'?item.id:index}
function rawItemBounds(kind,item){if(!item)return null;if(kind==='notes'){const textBounds=window.inkspaceInlineText?.bounds(item);if(textBounds)return textBounds;return{x:item.x,y:item.y,w:(item.width||320)*(item.scale||1),h:(notes.querySelector(`[data-id="${item.id}"]`)?.offsetHeight||200)*(item.scale||1)}};if(kind==='pdfPages')return{x:item.x,y:item.y,w:item.width,h:item.height};if(kind==='pdfs')return union(item.pages.map(p=>({x:p.x,y:p.y,w:p.width,h:p.height})));if(kind==='shapes')return normalized({x:item.x,y:item.y},{x:item.x2,y:item.y2});let x=Infinity,y=Infinity,x2=-Infinity,y2=-Infinity;for(const p of item.points){x=Math.min(x,p.x);y=Math.min(y,p.y);x2=Math.max(x2,p.x);y2=Math.max(y2,p.y)}return{x:x-item.width/2,y:y-item.width/2,w:x2-x+item.width,h:y2-y+item.width}}
function itemBounds(kind,item){return kind==='notes'?window.inkspaceGeometry.bounds(item):rawItemBounds(kind,item)}
window.inkspaceGeometry={bounds(note){if(!note)return null;const frozen=window.inkspaceInlineText?.frameBounds(note);if(frozen)return{...frozen};const el=noteCache.get(note.id)?.el;return el&&InkInteraction.noteFrame(note,el,view.scale)||rawItemBounds('notes',note)}};
window.inkspaceGeometry.displayBounds=function(kind,item){
  const base=itemBounds(kind,item);if(!base||!active)return base;
  const selectedItem=selected[kind]?.includes(kind==='pdfPages'?item.id:blockItems(kind).indexOf(item));
  const moving=active.type==='move-selection'&&selectedItem;
  if(moving)return{...base,x:base.x+active.offset.x,y:base.y+active.offset.y};
  const scaling=active.type==='resize-selection'&&selectedItem||active.type==='resize-text'&&active.n===item;
  if(!scaling)return base;
  const origin=active.bounds,factor=active.factor;
  if(kind==='notes'){const virtual=InkInteraction.resizeNote(item,factor,origin);return InkInteraction.noteFrame(virtual,noteCache.get(item.id).el,view.scale)||base}
  return{x:origin.x+(base.x-origin.x)*factor,y:origin.y+(base.y-origin.y)*factor,w:base.w*factor,h:base.h*factor};
};
function union(items){if(!items.length)return null;let x=Infinity,y=Infinity,x2=-Infinity,y2=-Infinity;for(const r of items){x=Math.min(x,r.x);y=Math.min(y,r.y);x2=Math.max(x2,r.x+r.w);y2=Math.max(y2,r.y+r.h)}return{x,y,w:x2-x,h:y2-y}}
function selectionBounds(){syncSelectionProjection();return union(Object.keys(selected).flatMap(k=>selected[k].map(i=>itemBounds(k,blockValue(k,i))).filter(Boolean)).concat(window.inkspaceDiagram?.bounds(true)||[]))}
function clearSelection(){for(const c of noteCache.values())c.el.classList.remove('selected');syncSelectionProjection();blockSelection.clear();window.inkspaceDiagram?.setSelected([]);selectionRect=null}
function selectBox(r){window.inkspaceDiagram?.selectBox(r);for(const k of Object.keys(selected)){selected[k]=[];(k==='pdfs'?[]:blockItems(k)).forEach((item,i)=>{const b=itemBounds(k,item);if(b&&InkInteraction.enclosed(r,b))selected[k].push(blockIndex(k,item,i))})}window.inkspaceBlocks?.expandSelection();if(window.inkspaceArrangement){const refs=window.inkspaceBlocks.references().filter(r=>!window.inkspaceArrangement.locked(r));window.inkspaceBlocks.selectReferences(refs)}}
function moveSelection(dx,dy){for(const k of Object.keys(selected))for(const i of selected[k]){const o=blockValue(k,i);if(k==='pdfPages'){InkBlockModel.updatePage(doc,i,p=>({...p,x:p.x+dx,y:p.y+dy}))}else if(k==='pdfs'){doc.pdfs=doc.pdfs.map((asset,index)=>index===i?{...asset,pages:asset.pages.map(p=>({...p,x:p.x+dx,y:p.y+dy}))}:asset)}else if(k==='strokes'){strokeCache.delete(o);o.points.forEach(p=>{p.x+=dx;p.y+=dy})}else{o.x+=dx;o.y+=dy;if(k==='shapes'){o.x2+=dx;o.y2+=dy}}}window.inkspaceDiagram?.transformSelected(dx,dy)}
function arrowPoints(s){const a=Math.atan2(s.y2-s.y,s.x2-s.x),len=Math.max(14,s.width*4);return[{x:s.x2-len*Math.cos(a-.45),y:s.y2-len*Math.sin(a-.45)},{x:s.x2-len*Math.cos(a+.45),y:s.y2-len*Math.sin(a+.45)}]}
function drawShape(s,context=ctx){context.strokeStyle=s.color;context.lineWidth=s.width;context.beginPath();const b=normalized({x:s.x,y:s.y},{x:s.x2,y:s.y2});if(s.kind==='highlight'){context.save();context.globalAlpha=.35;context.fillStyle=s.color;context.fillRect(b.x,b.y,b.w,b.h);context.restore();return}else if(s.kind==='rect')context.rect(b.x,b.y,b.w,b.h);else if(s.kind==='ellipse')context.ellipse(b.x+b.w/2,b.y+b.h/2,b.w/2,b.h/2,0,0,Math.PI*2);else{context.moveTo(s.x,s.y);context.lineTo(s.x2,s.y2);if(s.kind==='arrow'){const[a,z]=arrowPoints(s);context.moveTo(a.x,a.y);context.lineTo(s.x2,s.y2);context.lineTo(z.x,z.y)}}context.stroke()}
function selectionScaleSnapshot(){return Object.keys(selected).flatMap(kind=>selected[kind].map(index=>({kind,index,value:JSON.parse(JSON.stringify(blockValue(kind,index)))}))).concat(window.inkspaceDiagram?.selectionSnapshot()||[])}
function selectionScaleFactor(factor,items){let min=.05,max=20;for(const {kind,value}of items){if(kind==='pdfs'||kind==='pdfPages'||kind==='diagram')continue;if(kind!=='notes')max=Math.min(max,100/value.width);else if(value.kind==='image'){min=Math.max(min,.05/(value.scale||1));max=Math.min(max,20/(value.scale||1))}else{min=Math.max(min,160/(value.width||320));max=Math.min(max,4000/(value.width||320));if(value.viewMode==='window'){min=Math.max(min,80/(value.viewHeight||240));max=Math.min(max,1200/(value.viewHeight||240))}}}return Math.max(min,Math.min(max,factor));}
function scaleSelection(factor,origin,items){factor=selectionScaleFactor(factor,items);for(const {kind,index,value}of items){if(kind==='diagram')continue;const item=kind==='strokes'?(doc.strokes[index]={...value}):blockValue(kind,index),map=p=>({...p,x:origin.x+(p.x-origin.x)*factor,y:origin.y+(p.y-origin.y)*factor});if(kind==='pdfPages'){InkBlockModel.updatePage(doc,index,p=>({...p,x:origin.x+(value.x-origin.x)*factor,y:origin.y+(value.y-origin.y)*factor,width:value.width*factor,height:value.height*factor}))}else if(kind==='pdfs'){doc.pdfs=doc.pdfs.map((asset,i)=>i===index?{...value,pages:value.pages.map(p=>({...p,...map(p),width:p.width*factor,height:p.height*factor}))}:asset)}else if(kind==='strokes'){item.points=value.points.map(map);item.width=value.width*factor;strokeCache.delete(item)}else{Object.assign(item,map(value));if(kind==='shapes'){item.x2=origin.x+(value.x2-origin.x)*factor;item.y2=origin.y+(value.y2-origin.y)*factor;item.width=value.width*factor}else Object.assign(item,InkInteraction.resizeNote(value,factor,origin))}}window.inkspaceDiagram?.transformSelected(0,0,factor,origin,items.filter(i=>i.kind==='diagram'));return factor}
function overlaySelection(){syncSelectionProjection();for(const [id,cache]of noteCache)cache.el.classList.toggle('selected',blockSelection.has('notes',id));const r=selectionRect||selectionBounds(),el=$('#selection');el.style.display=r?'block':'none';if(!el.querySelector('.selection-scale'))el.innerHTML='<button class="selection-scale" type="button" title="拖动等比例缩放选中内容" aria-label="缩放选中内容"></button>';el.querySelector('.selection-scale')?.style&&(el.querySelector('.selection-scale').style.display=selectionRect||(window.inkspaceInlineText&&selected.notes.length===1&&!selected.strokes.length&&!selected.shapes.length&&!selected.pdfs?.length&&!selected.pdfPages?.length&&!window.inkspaceDiagram?.selectionSnapshot().length)?'none':'block');if(r){el.style.left=(view.x+r.x*view.scale)+'px';el.style.top=(view.y+r.y*view.scale)+'px';el.style.width=(r.w*view.scale)+'px';el.style.height=(r.h*view.scale)+'px'}selected.notes.forEach(i=>notes.querySelector(`[data-id="${doc.notes[i].id}"]`)?.classList.add('selected'))}

function edit(n){clearSelection();editing=n;$('#source').value=n.markdown;$('#note-width').value=n.width||560;$('#delete-note').hidden=!doc.notes.includes(n);$('#editor').showModal();$('#source').focus()}
$('#commit').onclick=()=>{checkpoint();editing.markdown=$('#source').value;editing.width=Math.max(160,Math.min(4000,Number($('#note-width').value)||560));if(!doc.notes.includes(editing))doc.notes.push(editing);persist();render()};
$('#delete-note').onclick=()=>{checkpoint();doc.notes=doc.notes.filter(n=>n.id!==editing.id);$('#editor').close();persist();render()};
function zoom(s,x=viewport.clientWidth/2,y=viewport.clientHeight/2){const p=world(x,y);view.scale=usableZoom(s);view.x=x-p.x*view.scale;view.y=y-p.y*view.scale;render()}
function distance(a,b,p){let dx=b.x-a.x,dy=b.y-a.y,t=dx||dy?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy))):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)}
function erase(p){eraseInk(p)}
// Each device remembers its own tool. Switching devices never changes document history.
function arrangeMouse(){activateTool('select',false,true,'mouse')}

const canvasUiSelector='.zoom,#notebook-find,.media-action-strip,input,textarea,select,[contenteditable="true"],.mxCellEditor';
function canvasUi(e){if(e.target.closest?.('.media-grip'))return false;if(e.pointerType==='pen'&&e.target.closest?.('.media-action-strip,.media-frame-handles'))return false;if((e.button===1||e.button===2||space)&&(!e.pointerType||e.pointerType==='mouse')&&e.target.closest?.('.inline-note-editor,.mxCellEditor'))return false;if(pointerTool(e)==='pdftext'&&e.type!=='wheel'&&e.target.closest?.('.textLayer'))return true;if(e.pointerType==='pen'&&e.target.closest?.('.inline-note-editor'))return false;return !!e.target.closest?.(canvasUiSelector)}
function pointerTool(e){return inputTools.get(e.pointerType||'mouse')}
function useInputDevice(device){
  if(active||!['mouse','pen'].includes(device))return;
  const previous=inputTools.device;inputTools.use(device);tool=inputTools.get();
  if(previous!==device){syncInputMode();refreshToolOptions();window.inkspaceMediaFrame?.refresh();window.dispatchEvent(new CustomEvent('inkspace-input-tools-change'))}
}
function objectControls(e){return !space&&!canvasUi(e)&&(!e.pointerType||e.pointerType==='mouse')&&['select','pan','text','diagram'].includes(pointerTool(e))}
function penOverContent(e){return !space&&['pen','erase','shape'].includes(pointerTool(e))&&(e.pointerType==='pen'||e.pointerType==='mouse')&&!canvasUi(e)}
function syncInputMode(){const objects=objectControls({pointerType:'mouse',target:viewport});viewport.classList.toggle('object-controls',objects);if(!objects)for(const cache of noteCache.values())cache.el.classList.remove('mouse-hover');viewport.classList.toggle('pan-input',pointerTool({pointerType:'mouse'})==='pan');viewport.classList.toggle('mouse-drawing',['pen','erase','shape'].includes(pointerTool({pointerType:'mouse'})));viewport.classList.toggle('object-input',['select','text','diagram'].includes(pointerTool({pointerType:'mouse'})));viewport.classList.toggle('shape-input',pointerTool({pointerType:'mouse'})==='shape');}
function hitCanvasItem(pos,note){
  if(note){const index=doc.notes.findIndex(n=>n.id===note.dataset.id);if(index>=0&&InkInteraction.contains(itemBounds('notes',doc.notes[index]),pos))return{kind:'notes',index}}
  for(let index=doc.notes.length-1;index>=0;index--)if(InkInteraction.contains(itemBounds('notes',doc.notes[index]),pos))return{kind:'notes',index};
  const tolerance=6/view.scale;
  for(let index=doc.shapes.length-1;index>=0;index--){const s=doc.shapes[index],b=itemBounds('shapes',s),t=tolerance+s.width/2;let hit=false;if(s.kind==='line'||s.kind==='arrow')hit=distance({x:s.x,y:s.y},{x:s.x2,y:s.y2},pos)<=t;else if(s.kind==='ellipse'){const rx=b.w/2,ry=b.h/2;if(rx&&ry)hit=Math.abs(Math.hypot((pos.x-b.x-rx)/rx,(pos.y-b.y-ry)/ry)-1)<=t/Math.min(rx,ry)}else hit=pos.x>=b.x-t&&pos.x<=b.x+b.w+t&&pos.y>=b.y-t&&pos.y<=b.y+b.h+t&&(s.kind==='highlight'||Math.min(Math.abs(pos.x-b.x),Math.abs(pos.x-b.x-b.w),Math.abs(pos.y-b.y),Math.abs(pos.y-b.y-b.h))<=t);if(hit)return{kind:'shapes',index}}
  for(let index=doc.strokes.length-1;index>=0;index--){const s=doc.strokes[index],b=itemBounds('strokes',s);if(pos.x<b.x-tolerance||pos.x>b.x+b.w+tolerance||pos.y<b.y-tolerance||pos.y>b.y+b.h+tolerance)continue;for(let i=0;i<s.points.length;i++)if(distance(s.points[Math.max(0,i-1)],s.points[i],pos)<=tolerance+s.width/2)return{kind:'strokes',index}}
  const pages=blockItems('pdfPages');for(let i=pages.length-1;i>=0;i--){const page=pages[i];if(pos.x>=page.x&&pos.x<=page.x+page.width&&pos.y>=page.y&&pos.y<=page.y+page.height)return{kind:'pdfPages',index:page.id}};
  return null;
}
// Canvas pointer ownership is implemented in canvas-interaction.js.
viewport.addEventListener('selectstart',e=>{if(!space&&!canvasUi(e)&&(['pen','erase','shape'].includes(pointerTool({pointerType:'mouse'}))||viewport.classList.contains('object-input')))e.preventDefault()},{capture:true});
viewport.addEventListener('contextmenu',e=>{if(canvasUi(e))return;e.preventDefault();window.inkspaceBlocks?.contextMenu(e)});
function canvasWheel(e){if(canvasUi(e))return;e.preventDefault();if(active?.type==='pen'||active?.type==='erase'||window.inkspaceDiagram?.interacting())return;if(!e.ctrlKey&&!e.metaKey&&!e.altKey){const unit=e.deltaMode===1?16:e.deltaMode===2?viewport.clientHeight:1;view.x-=(e.shiftKey?e.deltaY:e.deltaX)*unit;view.y-=(e.shiftKey?0:e.deltaY)*unit;previewZoom();return}const p=local(e);interactiveZoom(view.scale*Math.exp(-e.deltaY*.001),p.x,p.y)}
function undo(){finishInteraction();if(history.length){future.push(snapshot());const previous=doc;doc=history.pop();clearSelection();persist();renderHistoryChange(previous)}}function redo(){finishInteraction();if(future.length){history.push(snapshot());const previous=doc;doc=future.pop();clearSelection();persist();renderHistoryChange(previous)}}
function activateTool(next,toggle=false,redraw=true,device=inputTools.device){
  finishInteraction();inputTools.use(device);next=inputTools.set(next,toggle);
  if(next===tool){syncInputMode();refreshToolOptions();window.dispatchEvent(new CustomEvent('inkspace-input-tools-change'));return;}
  window.inkspaceInlineText?.finish();window.inkspaceDiagram?.clear();window.inkspaceDiagram?.noteConnectors()?.cancel();tool=next;syncInputMode();clearSelection();if(redraw)render();else{refreshToolOptions();overlaySelection()}
  document.querySelectorAll('[data-tool]').forEach(button=>button.classList.toggle('active',button.dataset.tool===tool));viewport.style.cursor='default';
  window.dispatchEvent(new CustomEvent('inkspace-input-tools-change'));
}
$('#undo').onclick=undo;$('#redo').onclick=redo;document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>activateTool(b.dataset.tool,true));
function canvasKeyDown(e){if(window.inkspaceDiagram?.editing()||$('#editor').open||e.target.matches('input,textarea,select')||e.target.closest('.monaco-editor,[contenteditable="true"],#terminal-panel')||active)return;if(e.code==='Space'){window.inkspaceDiagram?.noteConnectors()?.cancel();space=true;syncInputMode();e.preventDefault()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo()}if((e.key==='Delete'||e.key==='Backspace')&&Object.values(selected).some(a=>a.length)){e.preventDefault();checkpoint();for(const k of Object.keys(selected))if(k==='pdfPages')InkBlockModel.removePages(doc,selected[k]);else doc[k]=(doc[k]||[]).filter((_,i)=>!selected[k].includes(i));clearSelection();persist();render()}if(e.key==='Escape'){clearSelection();render()}const key={p:'pen',e:'erase',h:'pan',t:'text',v:'select',s:'shape',d:'diagram'}[e.key.toLowerCase()];if(key&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();if(!e.repeat)activateTool(key,true)}}
$('#in').onclick=()=>zoom(view.scale*1.2);$('#out').onclick=()=>zoom(view.scale/1.2);$('#reset').onclick=()=>zoom(1);
function bounds(){const r=union([...(window.inkspaceDiagram?.bounds()?[window.inkspaceDiagram.bounds()]:[]),...['strokes','notes','shapes'].flatMap(k=>doc[k].map(item=>itemBounds(k,item))).concat((doc.pdfs||[]).flatMap(a=>a.pages.map(p=>({x:p.x,y:p.y,w:p.width,h:p.height}))))]);return r?{x:r.x-40,y:r.y-40,w:r.w+80,h:r.h+80}:{x:0,y:0,w:600,h:400}}
$('#home').onclick=()=>{const b=bounds();view.scale=usableZoom(Math.min(1,viewport.clientWidth/b.w,viewport.clientHeight/b.h));view.x=(viewport.clientWidth-b.w*view.scale)/2-b.x*view.scale;view.y=(viewport.clientHeight-b.h*view.scale)/2-b.y*view.scale;render()};
function download(data,type,name){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('#save').onclick=()=>{download(JSON.stringify(doc,null,2),'application/json','笔记.inkspace.json');toast('已下载可编辑的 JSON 笔记')};
$('#svg').onclick=()=>{const b=bounds();let body=backgroundSvg(b),inkBody='';for(const s of doc.strokes)inkBody+=`<path d="${cachedStroke(s).d}" fill="${s.color}"/>`;for(const s of doc.shapes){const r=normalized({x:s.x,y:s.y},{x:s.x2,y:s.y2}),attrs=`fill="none" stroke="${s.color}" stroke-width="${s.width}"`;if(s.kind==='highlight')inkBody+=`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${s.color}" opacity=".35"/>`;else if(s.kind==='rect')inkBody+=`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" ${attrs}/>`;else if(s.kind==='ellipse')inkBody+=`<ellipse cx="${r.x+r.w/2}" cy="${r.y+r.h/2}" rx="${r.w/2}" ry="${r.h/2}" ${attrs}/>`;else{inkBody+=`<path d="M ${s.x} ${s.y} L ${s.x2} ${s.y2}" ${attrs}/>`;if(s.kind==='arrow'){const[a,z]=arrowPoints(s);inkBody+=`<path d="M ${a.x} ${a.y} L ${s.x2} ${s.y2} L ${z.x} ${z.y}" ${attrs}/>`}}}for(const n of doc.notes){const prefix=body;if(n.kind==='image'){body+=`<image x="${n.x}" y="${n.y}" width="${n.width*(n.scale||1)}" height="${n.width/n.aspect*(n.scale||1)}" href="${n.src}"/>`;continue}const lineHeight=textSize()*1.75;let y=n.y+textSize()+12;body+=`<rect x="${n.x}" y="${n.y}" width="${n.width||320}" height="${Math.max(80,n.markdown.split('\n').length*lineHeight+30)}" rx="8" fill="#fffefb" stroke="#dce3de"/>`;for(const line of n.markdown.split('\n')){body+=`<text x="${n.x+16}" y="${y}" font-family="sans-serif" font-size="${textSize()}" fill="#263f43">${esc(line)}</text>`;y+=lineHeight}if(n.scale&&n.scale!==1)body=prefix+`<g transform="translate(${n.x} ${n.y}) scale(${n.scale}) translate(${-n.x} ${-n.y})">${body.slice(prefix.length)}</g>`}body+=(window.inkspaceDiagram?.svg()||'')+inkBody;download(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}"><metadata>${esc(JSON.stringify(doc))}</metadata>${body}</svg>`,'image/svg+xml','笔记.svg');toast('SVG 已导出：文本保留 Markdown 原文')};
function validGroups(groups){return groups===undefined||Array.isArray(groups)&&groups.length<=10000&&groups.every(g=>typeof g.id==='string'&&Array.isArray(g.members)&&g.members.length<=10000&&g.members.every(r=>['strokes','notes','shapes','pdfs','pdfPages','diagram'].includes(r.kind)&&typeof r.id==='string'&&/^[\w-]+$/.test(r.id)))}
function valid(d){if(d?.background?.color==='#f6f7f5')d.background.color='#ffffff';if(d&&!Object.hasOwn(d,'shapes'))d.shapes=[];if(d&&!Object.hasOwn(d,'background'))d.background={type:'dots',color:'#f6f7f5',spacing:'auto',fontSize:16};if(d?.background&&!Object.hasOwn(d.background,'fontSize'))d.background.fontSize=16;return validGroups(d?.groups)&&(d?.diagram===undefined||typeof d.diagram==='string'&&d.diagram.length<=10*1024*1024&&!/<!DOCTYPE|<!ENTITY/i.test(d.diagram)&&/^\s*<mxGraphModel[\s>]/.test(d.diagram))&&validPdfs(d?.pdfs)&&d?.background&&(d.background.layout===undefined||['infinite','a4-portrait','a4-landscape'].includes(d.background.layout))&&['blank','dots','ruled','grid'].includes(d.background.type)&&/^#[a-f0-9]{6}$/i.test(d.background.color)&&(d.background.spacing==='auto'||[16,24,32,48].includes(d.background.spacing))&&[12,14,16,18,20,24].includes(d.background.fontSize)&& Array.isArray(d?.shapes)&&d.shapes.every(s=>['rect','ellipse','line','arrow','highlight'].includes(s.kind)&&[s.x,s.y,s.x2,s.y2,s.width].every(Number.isFinite)&&s.width>0&&s.width<=100&&/^#[0-9a-f]{6}$/i.test(s.color))&& d?.format==='inkspace'&&d.version===1&&Array.isArray(d.strokes)&&Array.isArray(d.notes)&&d.strokes.every(s=>(s.brush===undefined||['detail','contour','raw-contour','xournal'].includes(s.brush))&&(s.hasPressure===undefined||typeof s.hasPressure==='boolean')&&(s.inputScale===undefined||(Number.isFinite(s.inputScale)&&s.inputScale>0&&Number.isFinite(1/s.inputScale)))&&(s.step===undefined||(Number.isFinite(s.step)&&s.step>0&&Number.isFinite(1/s.step)))&&/^#[0-9a-f]{6}$/i.test(s.color)&&Number.isFinite(s.width)&&s.width>0&&s.width<=100&&Array.isArray(s.points)&&s.points.length&&s.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.p)&&p.p>=0&&p.p<=1))&&d.notes.every(n=>typeof n.id==='string'&&/^[a-zA-Z0-9-]+$/.test(n.id)&&Number.isFinite(n.x)&&Number.isFinite(n.y)&&typeof n.markdown==='string'&&(n.format===undefined||['md','html'].includes(n.format))&&(n.kind===undefined||n.kind==='html'||n.kind==='image'&&typeof n.src==='string'&&/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(n.src)&&Number.isFinite(n.aspect)&&n.aspect>0)&&(n.fontSize===undefined||Number.isFinite(n.fontSize)&&n.fontSize>=8&&n.fontSize<=96)&&(n.scale===undefined||Number.isFinite(n.scale)&&n.scale>=.05&&n.scale<=20)&&(n.width===undefined||(Number.isFinite(n.width)&&n.width>=160&&n.width<=4000)))&&new Set(d.notes.map(n=>n.id)).size===d.notes.length}
$('#load').onclick=()=>$('#file').click();$('#file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>150*1024*1024)throw Error();const d=JSON.parse(await f.text());if(!valid(d))throw Error();checkpoint();doc=d;clearSelection();persist();render();$('#home').click();toast('已打开笔记，可撤销恢复之前的内容')}catch{toast('无法打开：需要有效的 Inkspace v1 JSON 文件')}e.target.value=''};
try{const d=JSON.parse(localStorage.getItem('inkspace.document'));if(valid(d))doc=d}catch{}
if(!doc.notes.length&&!doc.strokes.length&&!doc.shapes.length)doc.notes.push({id:'welcome',x:60,y:30,markdown:'# 思考，没有边界。\n\n在空白处写字、画图，或添加一个 Markdown 文本框。\n\n- **画笔**：支持触控笔压力\n- **文本**：点击画布添加笔记\n- **移动**：向任意方向展开\n\n> 把灵感留在同一张画布上。'});
window.addEventListener('pagehide',()=>{finishInteraction();flushPersist()});
function resize(){finishInteraction();persist();const workspace=$('#workspace');const height=window.innerHeight-(workspace||viewport).getBoundingClientRect().top;if(workspace)workspace.style.height=height+'px';viewport.style.height=($('#editor-area')?.clientHeight||height)+'px';render()}window.addEventListener('resize',resize);resize();

for(const id of ['#page-layout','#background-kind','#background-color','#background-spacing','#text-size'])$(id).onchange=()=>{finishInteraction();checkpoint();const type=$('#background-kind').value;let spacing=$('#background-spacing').value;if(id==='#background-kind'&&type==='ruled')spacing='auto';doc.background={layout:$('#page-layout').value||'a4-portrait',type,color:$('#background-color').value,spacing:spacing==='auto'?'auto':Number(spacing),fontSize:Number($('#text-size').value)||16};renderBackground();renderNotes();persist()};

$('#new').onclick=()=>{finishInteraction();checkpoint();doc={format:'inkspace',version:1,strokes:[],notes:[],shapes:[],pdfs:[],background:{...backgroundSettings()}};view={x:100,y:80,scale:1};clearSelection();render();persist();if(window.desktop)desktop.newDocument()};



syncInputMode();
