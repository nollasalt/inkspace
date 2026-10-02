// Keep mxGraph's gesture/undo machinery, but move existing DOM during a drag.
export function installDiagramDrag(graph,{dimensions,view,stats}){
  const handler=graph.graphHandler,basePreview=handler.updateLivePreview,baseReset=handler.resetLivePreview,baseSnap=graph.snapDelta;
  let preview=null,pending=null,compositor=false;
  graph.setDropEnabled(false);handler.highlightEnabled=false;
  handler.roundLength=length=>length;handler.livePreview=true;handler.maxLivePreview=1000;
  graph.snapDelta=function(delta,bounds,ignoreGrid,ignoreHorizontal,ignoreVertical){
    const raw={x:delta.x,y:delta.y},result=baseSnap.call(this,delta,bounds,ignoreGrid,ignoreHorizontal,ignoreVertical);
    if(ignoreGrid)return result;
    const v=view(),[w,h]=dimensions();
    for(const [axis,size,extent,ignored]of [['x',w,bounds.width,ignoreHorizontal],['y',h,bounds.height,ignoreVertical]]){
      if(ignored)continue;let correction=null;
      for(const edge of [bounds[axis],bounds[axis]+extent]){
        const moved=edge+raw[axis],world=(moved-v[axis])/v.scale,target=Math.round(world/size)*size*v.scale+v[axis],distance=target-moved;
        if(Math.abs(distance)<=8&&(correction===null||Math.abs(distance)<Math.abs(correction)))correction=distance;
      }
      if(correction!==null)result[axis]=raw[axis]+correction;
    }
    return result;
  };
  function remember(node){if(!node)return;preview.nodes.push({node,translate:node.style.translate,willChange:node.style.willChange});node.style.willChange='transform'}
  function begin(){
    compositor=true;preview={nodes:[],hidden:[],edges:[],moving:new Set(),layer:document.createElementNS('http://www.w3.org/2000/svg','g')};
    handler.allCells?.visit((key,state)=>{preview.moving.add(state.cell);remember(state.shape?.node);remember(state.text?.node);remember(state.control?.node);const selected=graph.selectionCellsHandler.getHandler(state.cell),border=selected?.selectionBorder?.node||selected?.shape?.node;if(border){preview.hidden.push({node:border,visibility:border.style.visibility});border.style.visibility='hidden'}});
    const edges=new Set();for(const cell of preview.moving)if(cell.vertex)for(const edge of graph.getEdges(cell))if(!preview.moving.has(edge))edges.add(edge);
    for(const edge of edges){const state=graph.view.getState(edge);if(!state?.absolutePoints)continue;
      const node=state.shape?.node;if(node){preview.hidden.push({node,visibility:node.style.visibility});node.style.visibility='hidden'}
      const routed=state.clone();routed.shape=graph.cellRenderer.createShape(routed);graph.cellRenderer.configureShape(routed);routed.shape.dialect=graph.dialect;routed.shape.pointerEvents=false;routed.shape.init(preview.layer);
      const text=state.text?.node;if(text)preview.hidden.push({node:text,visibility:text.style.visibility,translate:text.style.translate});
      preview.edges.push({state,routed,text});
    }
    preview.layer.setAttribute('pointer-events','none');preview.layer.dataset.inkspaceDrag='true';graph.view.getOverlayPane().append(preview.layer);
    graph.connectionHandler.reset();
  }
  function paint(){
    if(!preview||!pending)return;const {dx,dy}=pending;
    for(const item of preview.nodes)item.node.style.translate=`${dx}px ${dy}px`;
    for(const edge of preview.edges){
      const {state,routed,text}=edge;
      for(const [source,key]of [[true,'visibleSourceState'],[false,'visibleTargetState']]){
        const terminal=state.getVisibleTerminalState(source),copy=terminal?.clone();
        if(copy&&preview.moving.has(terminal.cell)){copy.x+=dx;copy.y+=dy;copy.origin.x+=dx/graph.view.scale;copy.origin.y+=dy/graph.view.scale}
        routed[key]=copy;
      }
      graph.view.updateEdgeState(routed,state.cell.geometry);
      routed.shape.points=routed.absolutePoints;routed.shape.scale=graph.view.scale;routed.shape.redraw();
      if(text)text.style.translate=`${routed.absoluteOffset.x-state.absoluteOffset.x}px ${routed.absoluteOffset.y-state.absoluteOffset.y}px`;
    }
    stats().diagramDragFrames=(stats().diagramDragFrames||0)+1;
  }
  handler.updateLivePreview=function(dx,dy){
    if(this.cloning){compositor=false;return basePreview.call(this,dx,dy)}
    if(!preview)begin();pending={dx,dy};paint();
  };
  handler.resetLivePreview=function(){
    if(!preview){if(!compositor)return baseReset.call(this);return}
    pending=null;
    for(const item of preview.nodes){item.node.style.translate=item.translate;item.node.style.willChange=item.willChange}
    for(const item of preview.hidden){item.node.style.visibility=item.visibility;if(item.translate!==undefined)item.node.style.translate=item.translate}
    preview.layer.remove();preview=null;graph.connectionHandler.reset();
  };
}
