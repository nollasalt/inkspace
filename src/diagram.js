// mxGraph is draw.io's upstream diagram editing engine (Apache-2.0).
// Native ink remains in its own Cairo layer; this layer handles mouse diagrams.
import factory from 'mxgraph';
import {installDiagramDrag} from './diagram-drag.js';
import {installNoteConnectors} from './note-connectors.js';
const resource=new URL('mxgraph/',document.currentScript.src).href;
const mx=factory({mxLoadResources:false,mxLoadStylesheets:false,mxBasePath:resource,mxImageBasePath:resource+'images'});
const {mxGraph,mxGraphModel,mxCodec,mxUtils,mxEvent,mxPoint,mxConnectionConstraint,mxConstants,mxCell,mxGeometry,mxRectangle}=mx;
// The upstream XML codec resolves these standard constructors by global name.
Object.assign(window,{mxGraphModel,mxCell,mxGeometry,mxPoint});
mx.mxObjectCodec.allowEval=false;
Object.assign(mxConstants,{HANDLE_FILLCOLOR:'#ffffff',HANDLE_STROKECOLOR:'#007acc',VERTEX_SELECTION_COLOR:'#007acc',EDGE_SELECTION_COLOR:'#007acc'});
let noteConnectors=null;
let graph=null,loaded=null,loading=false,diagramContact=false;const derivedChanges=new WeakSet(),labelCache=new WeakMap(),edits=[];let replayCount=0;
const node=$('#diagram-layer');
function xml(){return mxUtils.getXml(new mxCodec().encode(graph.getModel()))}
function read(source){
  if(typeof source!=='string'||source.length>10*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('图形数据无效');
  const parsed=mxUtils.parseXml(source);if(parsed.documentElement.nodeName!=='mxGraphModel'||parsed.getElementsByTagName('parsererror').length)throw Error('图形 XML 无效');
  // Decode only the standard mxGraph model types, never embedded object codecs.
  for(const element of parsed.getElementsByTagName('*'))if(!['mxGraphModel','root','mxCell','mxGeometry','mxPoint','Array'].includes(element.nodeName))throw Error('不支持的图形 XML 节点');
  return new mxCodec(parsed).decode(parsed.documentElement,new mxGraphModel());
}
function label(cell){return typeof cell.value==='string'?cell.value:''}
function sync(sender,event){
  // Derived endpoints can finish inside mxGraph's outer model transaction.
  if(loading||event?.getProperty('edit')?.changes?.every(change=>derivedChanges.has(change)))return;
  noteConnectors?.sync();const before=loaded;checkpoint();doc.diagram=xml();loaded=doc.diagram;
  const edit=event?.getProperty("edit");if(edit){edits.push({before,after:loaded,edit});if(edits.length>80)edits.shift()}persist();renderBackground();
  $('#undo').disabled=!history.length;$('#redo').disabled=!future.length;overlaySelection();
}
function init(){
  if(graph)return;
  graph=new mxGraph(node);graph.setConnectable(false);graph.setAllowDanglingEdges(true);graph.setCellsDisconnectable(true);graph.setHtmlLabels(true);graph.setTooltips(true);graph.setCellsCloneable(true);graph.setGridEnabled(true);graph.gridSize=10;graph.setMultigraph(true);graph.setAllowLoops(true);graph.setAutoSizeCells(false);graph.setResizeContainer(false);graph.autoScroll=false;graph.keepEdgesInBackground=true;
  graph.getLabel=cell=>{
    const source=label(cell),cached=labelCache.get(cell);if(cached?.source===source)return cached.html;
    const content=document.createElement('div');content.innerHTML=InkContent.markdown(source);content.querySelectorAll('.katex-mathml').forEach(element=>element.remove());
    const html=`<div class="diagram-label" aria-label="${InkContent.escape(source)}">${content.innerHTML}</div>`;labelCache.set(cell,{source,html});return html;
  };
  graph.getEditingValue=label;graph.getCursorForCell=cell=>cell?.vertex?'move':'pointer';
  graph.isToggleEvent=event=>!!(event&&(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey));
  graph.graphHandler.guidesEnabled=true;
  graph.graphHandler.useGuidesForEvent=event=>!window.inkspaceArrangement&&!event.getEvent().altKey&&!graph.isConstrainedEvent(event.getEvent());
  graph.getTooltipForCell=()=> '鼠标拖动移动 · 边角缩放 · 双击输入文字和 $公式$ · 点击边缘箭头，再点击目标';
  const vertex=graph.getStylesheet().getDefaultVertexStyle();Object.assign(vertex,{fillColor:'#f4f8fc',strokeColor:'#788d9d',strokeWidth:1,fontColor:'#262626',fontSize:16,whiteSpace:'wrap',html:1,overflow:'hidden',spacing:8});
  Object.assign(graph.getStylesheet().getDefaultEdgeStyle(),{strokeColor:'#73869a',strokeWidth:1.5,endArrow:'open',edgeStyle:'orthogonalEdgeStyle',rounded:1,html:1,fontSize:16,labelBackgroundColor:'#ffffff'});
  const constraints=[[.5,0],[1,.5],[.5,1],[0,.5]].map(([x,y])=>new mxConnectionConstraint(new mxPoint(x,y),true));
  graph.getAllConnectionConstraints=terminal=>terminal?.cell?.vertex?constraints:null;
  // Connection gestures belong to the shared block controller.
  installDiagramDrag(graph,{dimensions:()=>a4Dimensions(),view:()=>view,stats:()=>renderStats});
  const createHandler=graph.createHandler;graph.createHandler=function(...args){
    const handler=createHandler.apply(this,args);if(!handler?.state.cell.vertex)return handler;
    if(document.body.classList.contains('media-workbench')){handler.setHandlesVisible(false);if(handler.selectionBorder?.node){handler.selectionBorder.node.style.visibility='hidden';handler.selectionBorder.node.style.pointerEvents='none'}}
    handler.livePreview=true;handler.roundLength=value=>value;const baseUnion=handler.union;
    handler.union=function(bounds,dx,dy,index,grid,scale,tr,constrained,centered){
      if(index<0||index>7||constrained||centered||Number(this.state.style.rotation)||graph.getModel().getParent(this.state.cell)!==graph.getDefaultParent())return baseUnion.apply(this,arguments);
      const [w,h]=a4Dimensions(),snap=(value,size)=>{if(!grid)return value;const edge=Math.round(value/size)*size;return Math.abs(value-edge)*graph.view.scale<=8?edge:graph.snap(value)};
      let left=bounds.x,right=left+bounds.width,top=bounds.y,bottom=top+bounds.height;
      if([0,3,5].includes(index))left=Math.min(right-1,snap(left+dx,w));if([2,4,7].includes(index))right=Math.max(left+1,snap(right+dx,w));
      if(index<3)top=Math.min(bottom-1,snap(top+dy,h));if(index>4)bottom=Math.max(top+1,snap(bottom+dy,h));
      return new mxRectangle(left,top,right-left,bottom-top);
    };return handler;
  };
  let moveFrame=null,pendingMove=null;
  const fire=graph.fireMouseEvent;
  const flushMove=()=>{if(moveFrame!==null)cancelAnimationFrame(moveFrame);moveFrame=null;const pending=pendingMove;pendingMove=null;if(pending){const start=performance.now();fire.call(graph,mxEvent.MOUSE_MOVE,pending.event,...pending.args);renderStats.diagramMoveFrames=(renderStats.diagramMoveFrames||0)+1;renderStats.diagramMoveLastMs=performance.now()-start;renderStats.diagramMoveMaxMs=Math.max(renderStats.diagramMoveMaxMs||0,renderStats.diagramMoveLastMs)}};
  const cancelMove=()=>{if(moveFrame!==null)cancelAnimationFrame(moveFrame);moveFrame=null;pendingMove=null};
  graph.fireMouseEvent=function(name,event,...args){
    if(!window.inkspaceInteraction?.nativeDiagramAllowed())return;const e=event.getEvent();if(e.pointerType&&e.pointerType!=='mouse'||e.nativeInk||e.sourceCapabilities?.firesTouchEvents)return;
    if(canvasUi(e)||!objectControls(e)||pointerTool(e)==='pan'){if(graph.isMouseDown)cancelMouseDrag();return}
    if(e.button===1||e.button===2||e.buttons&6)return;
    if(name===mxEvent.MOUSE_DOWN&&!event.getCell()&&!isResizeHandle(e)&&!graph.connectionHandler.constraintHandler.currentConstraint)return;
    // Process the latest input once per display frame, including hit tests and
    // connected-cell handlers. Commit must consume the final queued position.
    if(name===mxEvent.MOUSE_MOVE&&graph.isMouseDown){pendingMove={event,args};if(moveFrame===null)moveFrame=requestAnimationFrame(flushMove);e.preventDefault();return}
    if(name===mxEvent.MOUSE_UP)flushMove();
    if(name===mxEvent.MOUSE_DOWN){diagramContact=true;}
    if(name===mxEvent.MOUSE_DOWN&&isResizeHandle(e))graph.connectionHandler.reset();
    const result=fire.call(this,name,event,...args);if(name===mxEvent.MOUSE_UP){diagramContact=false;window.inkspaceInteraction?.endDiagram()}return result;
  };
  graph.cancelPendingDiagramMove=cancelMove;
  const cancelMouseDrag=()=>{cancelMove();diagramContact=false;graph.graphHandler.reset();graph.selectionCellsHandler.reset();graph.connectionHandler.reset();graph.isMouseDown=false};
  graph.cancelInkspaceGesture=cancelMouseDrag;
  const doubleClick=graph.dblClick;graph.dblClick=function(event,cell){if(!objectControls(event)||pointerTool(event)==='pan'||event.sourceCapabilities?.firesTouchEvents||typeof lastCanvasPointer!=='undefined'&&lastCanvasPointer==='pen')return;return doubleClick.call(this,event,cell)};
  noteConnectors=installNoteConnectors(graph,mx,{release:()=>{diagramContact=false},derived:(change,previewOnly)=>{if(loading||doc.diagram!==loaded&&!(loaded===''&&!doc.diagram))return;loading=true;const model=graph.getModel(),first=model.currentEdit.changes.length;model.beginUpdate();try{change();for(const item of model.currentEdit.changes.slice(first))derivedChanges.add(item)}finally{model.endUpdate();loading=false}}});
  graph.getModel().addListener(mxEvent.CHANGE,sync);
  graph.getSelectionModel().addListener(mxEvent.CHANGE,()=>{if(!loading){syncSelectionProjection();blockSelection.clear();blockSelection.setKind('diagram',graph.getSelectionCells().map(c=>c.id));window.inkspaceBlocks?.onGraphSelection()}refreshProperties();overlaySelection()});
}
function render(){
  init();const source=doc.diagram||'';
  if(source!==loaded){window.inkspaceBlocks?.hideHover();loading=true;try{
    graph.cancelPendingDiagramMove();graph.graphHandler.reset();diagramContact=false;graph.isMouseDown=false;graph.stopEditing(true);graph.clearSelection();graph.connectionHandler.reset();
    const entry=edits.findLast(e=>e.after===loaded&&e.before===source||e.before===loaded&&e.after===source);
    if(entry){if(entry.after===loaded)entry.edit.undo();else entry.edit.redo();replayCount++}
    else{edits.length=0;graph.getModel().setRoot((source?read(source):new mxGraphModel()).getRoot())}
    loaded=source;
  }finally{loading=false}}
  noteConnectors.sync();
  if(graph.view.scale!==view.scale||graph.view.translate.x!==view.x/view.scale||graph.view.translate.y!==view.y/view.scale)graph.view.scaleAndTranslate(view.scale,view.x/view.scale,view.y/view.scale);
}
function isResizeHandle(event){return !!graph?.getSelectionCells().some(cell=>graph.selectionCellsHandler.getHandler(cell)?.sizers?.some(sizer=>sizer?.node===event.target||sizer?.node?.contains(event.target)))}
function ownsPointer(event){
  if(!graph||event.pointerType&&event.pointerType!=='mouse')return false;
  if(!objectControls(event)||pointerTool(event)==='pan'||event.button===1||event.button===2||event.buttons&6)return false;
  if(diagramContact)return true;const p=local(event),hit=window.inkspaceBlocks?.pick(event),cell=hit?.kind==='diagram'?graph.getModel().getCell(hit.id):null;
  if(cell&&window.inkspaceArrangement?.locked({kind:'diagram',id:cell.id}))return false;
  return !!cell || isResizeHandle(event)||!!graph.connectionHandler.constraintHandler.currentConstraint;
}
function refreshProperties(){
  const cell=graph?.getSelectionCell(),style=cell?graph.getCellStyle(cell):null;for(const id of ['#diagram-stroke','#diagram-fill','#diagram-width','#diagram-delete','#diagram-front','#diagram-back'])$(id).disabled=!cell;
  if(style){if(/^#[a-f0-9]{6}$/i.test(style.strokeColor))$('#diagram-stroke').value=style.strokeColor;if(/^#[a-f0-9]{6}$/i.test(style.fillColor))$('#diagram-fill').value=style.fillColor;$('#diagram-width').value=String(style.strokeWidth||2)}
}
function center(){return world(viewport.clientWidth/2,viewport.clientHeight/2)}
function add(kind,position,size){
  arrangeMouse();render();graph.stopEditing(false);const p=position||center(),w=size?.w||160,h=size?.h||90;let cell;
  graph.getModel().beginUpdate();try{
    if(kind==='line'||kind==='arrow'){
      cell=graph.insertEdge(graph.getDefaultParent(),null,'',null,null,`endArrow=${kind==='arrow'?'block':'none'};`);
      const g=cell.geometry.clone();g.setTerminalPoint(new mxPoint(size?.start?.x??p.x-w/2,size?.start?.y??p.y),true);g.setTerminalPoint(new mxPoint(size?.end?.x??p.x+w/2,size?.end?.y??p.y),false);graph.getModel().setGeometry(cell,g);
    }else cell=graph.insertVertex(graph.getDefaultParent(),null,'',p.x-w/2,p.y-h/2,w,h,kind==='ellipse'?'shape=ellipse;':kind==='diamond'?'shape=rhombus;':kind==='roundrect'?'rounded=1;arcSize=20;':'');
  }finally{graph.getModel().endUpdate()}
  graph.setSelectionCell(cell);return cell;
}
function connect(){
  const cells=graph.getSelectionCells().filter(c=>c.vertex);if(cells.length!==2){toast('按住 Ctrl 依次选中两个图形，再点击连接箭头');return}
  return graph.insertEdge(graph.getDefaultParent(),null,'',cells[0],cells[1],'exitX=1;exitY=0.5;entryX=0;entryY=0.5;');
}
function coverage(cells=graph?.getChildCells(graph.getDefaultParent(),true,true)||[]){
  const boxes=[],lines=[];for(const cell of cells){const state=graph.view.getState(cell);if(!state)continue;
    if(cell.vertex)boxes.push({x:state.x/view.scale-view.x/view.scale,y:state.y/view.scale-view.y/view.scale,w:state.width/view.scale,h:state.height/view.scale});
    else if(state.absolutePoints)lines.push({points:state.absolutePoints.filter(Boolean).map(p=>({x:(p.x-view.x)/view.scale,y:(p.y-view.y)/view.scale})),width:Number(state.style.strokeWidth)||2});
  }return{boxes,lines};
}
function bounds(selected=false){if(!graph)return null;const cells=selected?blockSelection.refs().filter(r=>r.kind==='diagram').map(r=>graph.getModel().getCell(r.id)).filter(Boolean):graph.getChildCells(graph.getDefaultParent(),true,true),c=coverage(cells);return union(c.boxes.concat(c.lines.flatMap(l=>l.points.map(p=>({x:p.x,y:p.y,w:0,h:0})))))}
function copy(){
  if(!graph?.getSelectionCount())return null;
  const cells=graph.cloneCells(graph.getSelectionCells(),true),model=new mxGraphModel();model.beginUpdate();try{for(const cell of cells)model.add(model.getChildAt(model.getRoot(),0),cell)}finally{model.endUpdate()}
  return{xml:mxUtils.getXml(new mxCodec().encode(model)),bounds:bounds(true),ids:Object.fromEntries(graph.getSelectionCells().map((cell,i)=>[cell.id,cells[i].id]))};
}
function paste(source,dx,dy,noteIds={},blockIds={}){
  render();const model=read(source),parent=model.getChildAt(model.getRoot(),0),cells=[];
  for(let i=0;i<model.getChildCount(parent);i++)cells.push(model.getChildAt(parent,i));
  loading=true;try{for(const cell of cells)if(cell.style)cell.style=cell.style.replace(/(inkNote(?:Source|Target)=)([^;]+)/g,(all,key,id)=>(()=>{const decoded=decodeURIComponent(id),[kind,old]=decoded.split(':');const replacement=noteIds[decoded]||(blockIds[kind]?.[old]?kind+':'+blockIds[kind][old]:null);return replacement?key+encodeURIComponent(replacement):all})());const inserted=graph.importCells(cells,dx,dy,graph.getDefaultParent());graph.setSelectionCells(inserted);blockSelection.setKind('diagram',inserted.map(c=>c.id));doc.diagram=xml();loaded=doc.diagram;return Object.fromEntries(cells.map((cell,i)=>[cell.id,inserted[i].id]));}finally{loading=false}
}
function remove(){if(!graph?.getSelectionCount()||graph.isEditing())return false;graph.removeCells();return true}
function svg(){if(!graph||!doc.diagram)return '';const canvas=graph.view.getCanvas(),copy=canvas.cloneNode(true);for(const portal of document.querySelectorAll('.diagram-cell-layer>svg'))for(const child of portal.children)copy.append(child.cloneNode(true));const originals=[...canvas.querySelectorAll('foreignObject *'),...document.querySelectorAll('.diagram-cell-layer>svg foreignObject *')],cloned=copy.querySelectorAll('foreignObject *');originals.forEach((element,index)=>{const style=getComputedStyle(element);cloned[index]?.setAttribute('style',Array.from(style,key=>key+':'+style.getPropertyValue(key)).join(';'))});return `<g transform="translate(${-view.x/view.scale} ${-view.y/view.scale}) scale(${1/view.scale})">${copy.outerHTML}</g>`}

function selectionSnapshot(){return(graph?.getSelectionCells()||[]).map(cell=>({kind:'diagram',index:cell.id,value:JSON.parse(JSON.stringify(cell.geometry))}))}
function mutate(change){if(!graph)return;const prior=loading;loading=true;graph.getModel().beginUpdate();try{change()}finally{graph.getModel().endUpdate();doc.diagram=xml();loaded=doc.diagram;loading=prior}}
function transformSelected(dx,dy,factor=1,origin={x:0,y:0},items=selectionSnapshot()){
  if(!items.length)return;mutate(()=>{for(const {index,value}of items){const cell=graph.getModel().getCell(index);if(!cell)continue;const g=cell.geometry.clone(),map=p=>p&&new mxPoint(origin.x+(p.x-origin.x)*factor+dx,origin.y+(p.y-origin.y)*factor+dy);g.x=origin.x+(value.x-origin.x)*factor+dx;g.y=origin.y+(value.y-origin.y)*factor+dy;g.width=value.width*factor;g.height=value.height*factor;if(cell.edge){g.x=value.x;g.y=value.y;g.sourcePoint=map(value.sourcePoint);g.targetPoint=map(value.targetPoint);g.points=value.points?.map(map)||null}graph.getModel().setGeometry(cell,g)}});
}
function setSelected(ids){blockSelection.setKind('diagram',ids);const prior=loading;loading=true;try{graph.setSelectionCells(ids.map(id=>graph.getModel().getCell(id)).filter(Boolean))}finally{loading=prior}}
function previewSelection(dx,dy,factor=1,origin={x:0,y:0}){graph?.selectionCellsHandler.handlers.visit((_,handler)=>{handler.setHandlesVisible?.(false);if(handler.selectionBorder?.node)handler.selectionBorder.node.style.visibility='hidden';if(handler.selectionShape?.node)handler.selectionShape.node.style.visibility='hidden'});for(const cell of graph?.getSelectionCells()||[]){const state=graph.view.getState(cell);for(const node of [state?.shape?.node,state?.text?.node])if(node){node.style.transformOrigin='0 0';node.style.transform='translate('+ (dx+origin.x*(1-factor))+'px,'+(dy+origin.y*(1-factor))+'px) scale('+factor+')'}}}
function clearPreview(){graph?.selectionCellsHandler.handlers.visit((_,handler)=>{handler.setHandlesVisible?.(true);if(handler.selectionBorder?.node)handler.selectionBorder.node.style.visibility='';if(handler.selectionShape?.node)handler.selectionShape.node.style.visibility=''});for(const cell of graph?.getSelectionCells()||[]){const state=graph.view.getState(cell);for(const node of [state?.shape?.node,state?.text?.node])if(node)node.style.transform=''}}

window.inkspaceDiagram={mutate,cancelGesture:()=>graph?.cancelInkspaceGesture(),editAt:id=>{const cell=graph?.getModel().getCell(id);if(cell)graph.startEditingAtCell(cell)},selectionHasEdges:()=>!!graph?.getSelectionCells().some(c=>c.edge),selectionSnapshot,transformSelected,setSelected,previewSelection,clearPreview,deleteSelected:ids=>mutate(()=>graph.removeCells(ids?.map(id=>graph.getModel().getCell(id)).filter(Boolean))),render,add,connect,syncNotes:preview=>noteConnectors?.sync(preview),noteConnectors:()=>noteConnectors,ownsPointer,bounds,coverage,copy,paste,remove,svg,selectBox:r=>graph?.selectRegion(new mxRectangle(r.x*view.scale+view.x,r.y*view.scale+view.y,r.w*view.scale,r.h*view.scale)),editing:()=>!!graph?.isEditing(),interacting:()=>!!graph?.isMouseDown,clear:()=>{graph?.stopEditing(false);graph?.clearSelection()},get replayCount(){return replayCount},get graph(){return graph}};
document.querySelectorAll('[data-diagram]').forEach(button=>{button.onclick=()=>add(button.dataset.diagram);button.draggable=true;button.addEventListener('dragstart',event=>event.dataTransfer.setData('application/x-inkspace-shape',button.dataset.diagram))});
viewport.addEventListener('dragover',event=>{if([...event.dataTransfer.types].includes('application/x-inkspace-shape'))event.preventDefault()});viewport.addEventListener('drop',event=>{const kind=event.dataTransfer.getData('application/x-inkspace-shape');if(!['rect','roundrect','ellipse','diamond','arrow','line'].includes(kind))return;event.preventDefault();const p=local(event);add(kind,world(p.x,p.y))});$('#diagram-connect').onclick=connect;$('#diagram-delete').onclick=remove;$('#diagram-front').onclick=()=>graph?.orderCells(false);$('#diagram-back').onclick=()=>graph?.orderCells(true);
$('#diagram-stroke').onchange=()=>graph?.setCellStyles('strokeColor',$('#diagram-stroke').value);
$('#diagram-fill').onchange=()=>graph?.setCellStyles('fillColor',$('#diagram-fill').value);
$('#diagram-width').onchange=()=>graph?.setCellStyles('strokeWidth',$('#diagram-width').value);
async function importXML(source){
  if(typeof source!=='string'||source.length>10*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('文件过大或 XML 无效');
  const pageId=notebook.activePage,document=mxUtils.parseXml(source);
  if(document.documentElement.nodeName==='mxfile'){
    const diagram=document.getElementsByTagName('diagram')[0];if(!diagram)throw Error('没有图形页面');
    if(diagram.firstElementChild)source=mxUtils.getXml(diagram.firstElementChild);
    else{
      const packed=Uint8Array.from(atob(diagram.textContent.trim()),c=>c.charCodeAt(0)),reader=new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const chunks=[];let size=0;
      try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>10*1024*1024)throw Error('解压后的图形超过 10 MB');chunks.push(value)}}finally{await reader.cancel()}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}source=decodeURIComponent(new TextDecoder().decode(bytes));
    }
  }
  read(source);if(pageId!==notebook.activePage)throw Error('导入期间切换了页面，请重新导入');
  finishInteraction();const p=center();checkpoint();paste(source,p.x,p.y);render();persist();
}
window.inkspaceDiagram.importXML=importXML;
$('#diagram-import').onclick=()=>$('#diagram-file').click();$('#diagram-file').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;try{if(file.size>10*1024*1024)throw Error('文件超过 10 MB');await importXML(await file.text())}catch(error){toast('导入失败：'+error.message)}event.target.value='';
};
$('#diagram-export').onclick=()=>{render();download(`<mxfile><diagram name="Page-1">${xml()}</diagram></mxfile>`,'application/xml','图形.drawio')};
function keyDown(event){
  if(graph?.isEditing()||event.target.closest?.('input,textarea,[contenteditable="true"]')||document.querySelector('dialog[open]'))return;
  if((event.key==='Delete'||event.key==='Backspace')&&graph?.getSelectionCount()){event.preventDefault();remove()}
  if(event.key==='Escape')graph?.clearSelection();
  if(!event.ctrlKey&&!event.metaKey&&!event.altKey&&graph?.getSelectionCount()&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const step=event.shiftKey?10:1;graph.moveCells(graph.getSelectionCells(),event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)}
;return event.defaultPrevented}
window.inkspaceDiagram.keyDown=keyDown;
render();
