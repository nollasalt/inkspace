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
let graph=null,loaded=null,loading=false,diagramContact=false;const labelCache=new WeakMap();
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
function sync(){
  if(loading)return;
  checkpoint();doc.diagram=xml();loaded=doc.diagram;persist();renderBackground();
  $('#undo').disabled=!history.length;$('#redo').disabled=!future.length;
}
function init(){
  if(graph)return;
  graph=new mxGraph(node);graph.setConnectable(true);graph.setAllowDanglingEdges(true);graph.setCellsDisconnectable(true);graph.setHtmlLabels(true);graph.setTooltips(true);graph.setCellsCloneable(true);graph.setGridEnabled(true);graph.gridSize=10;graph.setMultigraph(true);graph.setAutoSizeCells(false);graph.setResizeContainer(false);graph.autoScroll=false;
  graph.getLabel=cell=>{
    const source=label(cell),cached=labelCache.get(cell);if(cached?.source===source)return cached.html;
    const content=document.createElement('div');content.innerHTML=InkContent.markdown(source);content.querySelectorAll('.katex-mathml').forEach(element=>element.remove());
    const html=`<div class="diagram-label" aria-label="${InkContent.escape(source)}">${content.innerHTML}</div>`;labelCache.set(cell,{source,html});return html;
  };
  graph.getEditingValue=label;
  graph.getTooltipForCell=()=> '鼠标拖动移动 · 边角缩放 · 双击输入文字和 $公式$ · 拖动连接点添加箭头';
  const vertex=graph.getStylesheet().getDefaultVertexStyle();Object.assign(vertex,{fillColor:'#ffffff',strokeColor:'#263f43',strokeWidth:2,fontColor:'#263f43',fontSize:16,whiteSpace:'wrap',html:1,overflow:'hidden',spacing:8});
  Object.assign(graph.getStylesheet().getDefaultEdgeStyle(),{strokeColor:'#263f43',strokeWidth:2,endArrow:'block',edgeStyle:'orthogonalEdgeStyle',rounded:1,html:1,fontSize:16,labelBackgroundColor:'#ffffff'});
  const constraints=[[.5,0],[1,.5],[.5,1],[0,.5],[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>new mxConnectionConstraint(new mxPoint(x,y),true));
  graph.getAllConnectionConstraints=terminal=>terminal?.cell?.vertex?constraints:null;
  graph.connectionHandler.createTarget=true;graph.connectionHandler.isConnectableCell=cell=>!cell||cell.vertex;
  const fire=graph.fireMouseEvent;graph.fireMouseEvent=function(name,event,...args){
    const e=event.getEvent();if(e.pointerType&&e.pointerType!=='mouse'||e.nativeInk||e.sourceCapabilities?.firesTouchEvents)return;
    if(space||tool==='pan')return;
    if(name===mxEvent.MOUSE_DOWN){if(tool!=='diagram')activateTool('diagram');diagramContact=true;}
    const result=fire.call(this,name,event,...args);if(name===mxEvent.MOUSE_UP)diagramContact=false;return result;
  };
  const doubleClick=graph.dblClick;graph.dblClick=function(event,cell){if(event.sourceCapabilities?.firesTouchEvents||typeof lastCanvasPointer!=='undefined'&&lastCanvasPointer==='pen')return;return doubleClick.call(this,event,cell)};
  graph.getModel().addListener(mxEvent.CHANGE,sync);
  graph.getSelectionModel().addListener(mxEvent.CHANGE,()=>{if(!loading&&graph.getSelectionCount())clearSelection();overlaySelection()});
}
function render(){
  init();const source=doc.diagram||'';
  if(source!==loaded){loading=true;try{graph.stopEditing(true);graph.getModel().setRoot((source?read(source):new mxGraphModel()).getRoot());loaded=source;}finally{loading=false}}
  if(graph.view.scale!==view.scale||graph.view.translate.x!==view.x/view.scale||graph.view.translate.y!==view.y/view.scale)graph.view.scaleAndTranslate(view.scale,view.x/view.scale,view.y/view.scale);
}
function ownsPointer(event){
  if(!graph||event.pointerType&&event.pointerType!=='mouse')return false;
  if(space||tool==='pan')return false;
  return diagramContact||!!event.target.closest?.('#diagram-layer');
}
function center(){return world(viewport.clientWidth/2,viewport.clientHeight/2)}
function add(kind){
  render();graph.stopEditing(false);const p=center(),w=160,h=90;let cell;
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
window.inkspaceDiagram={render,add,connect,ownsPointer,bounds,coverage,copy,paste,remove,svg,editing:()=>!!graph?.isEditing(),clear:()=>{graph?.stopEditing(false);graph?.clearSelection()},get graph(){return graph}};
$('#diagram-add').onclick=()=>add($('#diagram-kind').value);$('#diagram-connect').onclick=connect;$('#diagram-delete').onclick=remove;
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
});
render();
