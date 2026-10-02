// mxGraph is draw.io's upstream diagram editing engine (Apache-2.0).
// Native ink remains in its own Cairo layer; this layer handles mouse diagrams.
import factory from 'mxgraph';
const resource=new URL('mxgraph/',document.currentScript.src).href;
const mx=factory({mxLoadResources:false,mxLoadStylesheets:false,mxBasePath:resource,mxImageBasePath:resource+'images'});
const {mxGraph,mxGraphModel,mxCodec,mxUtils,mxEvent,mxPoint,mxConnectionConstraint,mxConstants,mxCell,mxGeometry}=mx;
// The upstream XML codec resolves these standard constructors by global name.
Object.assign(window,{mxGraphModel,mxCell,mxGeometry,mxPoint});
mx.mxObjectCodec.allowEval=false;
Object.assign(mxConstants,{HANDLE_FILLCOLOR:'#ffffff',HANDLE_STROKECOLOR:'#007acc',VERTEX_SELECTION_COLOR:'#007acc',EDGE_SELECTION_COLOR:'#007acc'});
let graph=null,loaded=null,loading=false,diagramContact=false;const labelCache=new WeakMap(),edits=[];let replayCount=0;
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
  if(loading)return;
  const before=loaded;checkpoint();doc.diagram=xml();loaded=doc.diagram;
  const edit=event?.getProperty("edit");if(edit){edits.push({before,after:loaded,edit});if(edits.length>80)edits.shift()}persist();renderBackground();
  $('#undo').disabled=!history.length;$('#redo').disabled=!future.length;
}
function init(){
  if(graph)return;
  graph=new mxGraph(node);graph.setConnectable(true);graph.setAllowDanglingEdges(true);graph.setCellsDisconnectable(true);graph.setHtmlLabels(true);graph.setTooltips(true);graph.setCellsCloneable(true);graph.setGridEnabled(true);graph.gridSize=10;graph.setMultigraph(true);graph.setAllowLoops(true);graph.setAutoSizeCells(false);graph.setResizeContainer(false);graph.autoScroll=false;graph.keepEdgesInBackground=true;
  graph.getLabel=cell=>{
    const source=label(cell),cached=labelCache.get(cell);if(cached?.source===source)return cached.html;
    const content=document.createElement('div');content.innerHTML=InkContent.markdown(source);content.querySelectorAll('.katex-mathml').forEach(element=>element.remove());
    const html=`<div class="diagram-label" aria-label="${InkContent.escape(source)}">${content.innerHTML}</div>`;labelCache.set(cell,{source,html});return html;
  };
  graph.getEditingValue=label;graph.getCursorForCell=cell=>cell?.vertex?'move':'pointer';
  graph.getTooltipForCell=()=> '鼠标拖动移动 · 边角缩放 · 双击输入文字和 $公式$ · 拖动连接点添加箭头';
  const vertex=graph.getStylesheet().getDefaultVertexStyle();Object.assign(vertex,{fillColor:'#ffffff',strokeColor:'#263f43',strokeWidth:2,fontColor:'#263f43',fontSize:16,whiteSpace:'wrap',html:1,overflow:'hidden',spacing:8});
  Object.assign(graph.getStylesheet().getDefaultEdgeStyle(),{strokeColor:'#263f43',strokeWidth:2,endArrow:'block',edgeStyle:'orthogonalEdgeStyle',rounded:1,html:1,fontSize:16,labelBackgroundColor:'#ffffff'});
  const constraints=[[.5,0],[1,.5],[.5,1],[0,.5],[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>new mxConnectionConstraint(new mxPoint(x,y),true));
  graph.getAllConnectionConstraints=terminal=>terminal?.cell?.vertex?constraints:null;
  // Start a connector only from an explicit boundary connection point.
  graph.connectionHandler.isStartEvent=()=>!!(graph.connectionHandler.constraintHandler.currentFocus&&graph.connectionHandler.constraintHandler.currentConstraint);
  graph.connectionHandler.createTarget=false;graph.connectionHandler.select=false;
  graph.graphHandler.livePreview=true;graph.graphHandler.maxLivePreview=50;
  graph.connectionHandler.isConnectableCell=cell=>!cell||cell.vertex;
  const connectionMove=graph.connectionHandler.mouseMove;graph.connectionHandler.mouseMove=function(sender,event){connectionMove.call(this,sender,event);if(!this.first&&this.currentState)this.currentState.setCursor(this.constraintHandler.currentConstraint?'crosshair':'move')};
  const fire=graph.fireMouseEvent;graph.fireMouseEvent=function(name,event,...args){
    const e=event.getEvent();if(e.pointerType&&e.pointerType!=='mouse'||e.nativeInk||e.sourceCapabilities?.firesTouchEvents)return;
    if(space||tool==='pan')return;
    if(name===mxEvent.MOUSE_DOWN){if(tool!=='diagram')activateTool('diagram');diagramContact=true;}
    const result=fire.call(this,name,event,...args);if(name===mxEvent.MOUSE_UP)diagramContact=false;return result;
  };
  const doubleClick=graph.dblClick;graph.dblClick=function(event,cell){if(event.sourceCapabilities?.firesTouchEvents||typeof lastCanvasPointer!=='undefined'&&lastCanvasPointer==='pen')return;return doubleClick.call(this,event,cell)};
  graph.getModel().addListener(mxEvent.CHANGE,sync);
  graph.getSelectionModel().addListener(mxEvent.CHANGE,()=>{if(!loading&&graph.getSelectionCount())clearSelection();refreshProperties();overlaySelection()});
}
function render(){
  init();const source=doc.diagram||'';
  if(source!==loaded){loading=true;try{
    graph.stopEditing(true);graph.clearSelection();graph.connectionHandler.reset();
    const entry=edits.findLast(e=>e.after===loaded&&e.before===source||e.before===loaded&&e.after===source);
    if(entry){if(entry.after===loaded)entry.edit.undo();else entry.edit.redo();replayCount++}
    else{edits.length=0;graph.getModel().setRoot((source?read(source):new mxGraphModel()).getRoot())}
    loaded=source;
  }finally{loading=false}}
  if(graph.view.scale!==view.scale||graph.view.translate.x!==view.x/view.scale||graph.view.translate.y!==view.y/view.scale)graph.view.scaleAndTranslate(view.scale,view.x/view.scale,view.y/view.scale);
}
function ownsPointer(event){
  if(!graph||event.pointerType&&event.pointerType!=='mouse')return false;
  if(space||tool==='pan')return false;
  return diagramContact||!!event.target.closest?.('#diagram-layer');
}
function refreshProperties(){
  const cell=graph?.getSelectionCell(),style=cell?graph.getCellStyle(cell):null;for(const id of ['#diagram-stroke','#diagram-fill','#diagram-width','#diagram-delete','#diagram-front','#diagram-back'])$(id).disabled=!cell;
  if(style){if(/^#[a-f0-9]{6}$/i.test(style.strokeColor))$('#diagram-stroke').value=style.strokeColor;if(/^#[a-f0-9]{6}$/i.test(style.fillColor))$('#diagram-fill').value=style.fillColor;$('#diagram-width').value=String(style.strokeWidth||2)}
}
function center(){return world(viewport.clientWidth/2,viewport.clientHeight/2)}
function add(kind,position){
  render();graph.stopEditing(false);const p=position||center(),w=160,h=90;let cell;
  graph.getModel().beginUpdate();try{
    if(kind==='line'||kind==='arrow'){
      cell=graph.insertEdge(graph.getDefaultParent(),null,'',null,null,`endArrow=${kind==='arrow'?'block':'none'};`);
      const g=cell.geometry.clone();g.setTerminalPoint(new mxPoint(p.x-80,p.y),true);g.setTerminalPoint(new mxPoint(p.x+80,p.y),false);graph.getModel().setGeometry(cell,g);
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
function bounds(selected=false){if(!graph)return null;const cells=selected?graph.getSelectionCells():graph.getChildCells(graph.getDefaultParent(),true,true),c=coverage(cells);return union(c.boxes.concat(c.lines.flatMap(l=>l.points.map(p=>({x:p.x,y:p.y,w:0,h:0})))))}
function copy(){
  if(!graph?.getSelectionCount())return null;
  const cells=graph.cloneCells(graph.getSelectionCells(),true),model=new mxGraphModel();model.beginUpdate();try{for(const cell of cells)model.add(model.getChildAt(model.getRoot(),0),cell)}finally{model.endUpdate()}
  return{xml:mxUtils.getXml(new mxCodec().encode(model)),bounds:bounds(true)};
}
function paste(source,dx,dy){
  render();const model=read(source),parent=model.getChildAt(model.getRoot(),0),cells=[];
  for(let i=0;i<model.getChildCount(parent);i++)cells.push(model.getChildAt(parent,i));
  loading=true;try{const inserted=graph.importCells(cells,dx,dy,graph.getDefaultParent());graph.setSelectionCells(inserted);doc.diagram=xml();loaded=doc.diagram;}finally{loading=false}
}
function remove(){if(!graph?.getSelectionCount()||graph.isEditing())return false;graph.removeCells();return true}
function svg(){if(!graph||!doc.diagram)return '';const canvas=graph.view.getCanvas(),copy=canvas.cloneNode(true),original=canvas.querySelectorAll('foreignObject *'),cloned=copy.querySelectorAll('foreignObject *');original.forEach((element,index)=>{const style=getComputedStyle(element);cloned[index].setAttribute('style',Array.from(style,key=>key+':'+style.getPropertyValue(key)).join(';'))});return `<g transform="translate(${-view.x/view.scale} ${-view.y/view.scale}) scale(${1/view.scale})">${copy.outerHTML}</g>`}
window.inkspaceDiagram={render,add,connect,ownsPointer,bounds,coverage,copy,paste,remove,svg,editing:()=>!!graph?.isEditing(),clear:()=>{graph?.stopEditing(false);graph?.clearSelection()},get replayCount(){return replayCount},get graph(){return graph}};
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
window.addEventListener('keydown',event=>{
  if(graph?.isEditing()||event.target.closest?.('input,textarea,[contenteditable="true"]')||document.querySelector('dialog[open]'))return;
  if((event.key==='Delete'||event.key==='Backspace')&&graph?.getSelectionCount()){event.preventDefault();remove()}
  if(event.key==='Escape')graph?.clearSelection();
  if(!event.ctrlKey&&!event.metaKey&&!event.altKey&&graph?.getSelectionCount()&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const step=event.shiftKey?10:1;graph.moveCells(graph.getSelectionCells(),event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)}
});
render();
