// Keep mxGraph's gesture/undo machinery, but move existing DOM during a drag.
export function installDiagramDrag(graph,{dimensions,view,stats}){
  const handler=graph.graphHandler,basePreview=handler.updateLivePreview,baseReset=handler.resetLivePreview,baseSnap=graph.snapDelta;
  let preview=null,frame=null,pending=null,compositor=false;
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
    handler.allCells?.visit((key,state)=>{preview.moving.add(state.cell);remember(state.shape?.node);remember(state.text?.node);remember(state.control?.node)});
    const edges=new Set();for(const cell of preview.moving)if(cell.vertex)for(const edge of graph.getEdges(cell))if(!preview.moving.has(edge))edges.add(edge);
    for(const edge of edges){const state=graph.view.getState(edge);if(!state?.absolutePoints)continue;
      for(const node of [state.shape?.node,state.text?.node])if(node){preview.hidden.push({node,visibility:node.style.visibility});node.style.visibility='hidden'}
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('fill','none');path.setAttribute('stroke',state.style.strokeColor||'#263f43');path.setAttribute('stroke-width',(Number(state.style.strokeWidth)||2)*graph.view.scale);path.setAttribute('pointer-events','none');preview.layer.append(path);
      const tip=path.cloneNode(false);tip.setAttribute('fill',state.style.strokeColor||'#263f43');preview.layer.append(tip);
      preview.edges.push({state,path,tip,points:state.absolutePoints.filter(Boolean).map(p=>({x:p.x,y:p.y})),source:preview.moving.has(edge.source),target:preview.moving.has(edge.target)});
    }
    preview.layer.setAttribute('pointer-events','none');preview.layer.dataset.inkspaceDrag='true';graph.view.getOverlayPane().append(preview.layer);
    graph.connectionHandler.reset();
  }
  function paint(){
    frame=null;if(!preview||!pending)return;const {dx,dy}=pending;
    for(const item of preview.nodes)item.node.style.translate=`${dx}px ${dy}px`;
    for(const edge of preview.edges){
      const p=edge.points.map(point=>({...point})),last=p.length-1;
      if(edge.source){p[0].x+=dx;p[0].y+=dy;if(last>1){if(edge.points[1].x===edge.points[0].x)p[1].x+=dx;else p[1].y+=dy}}
      if(edge.target){p[last].x+=dx;p[last].y+=dy;if(last>1){if(edge.points[last-1].x===edge.points[last].x)p[last-1].x+=dx;else p[last-1].y+=dy}}
      edge.path.setAttribute('d',p.map((point,i)=>`${i?'L':'M'}${point.x} ${point.y}`).join(' '));
      if(last>0&&edge.state.style.endArrow&&edge.state.style.endArrow!=='none'){
        const a=p[last-1],b=p[last],angle=Math.atan2(b.y-a.y,b.x-a.x),length=8*graph.view.scale,wing=4*graph.view.scale,x=b.x-length*Math.cos(angle),y=b.y-length*Math.sin(angle);
        edge.tip.setAttribute('d',`M${b.x} ${b.y}L${x-wing*Math.sin(angle)} ${y+wing*Math.cos(angle)}L${x+wing*Math.sin(angle)} ${y-wing*Math.cos(angle)}Z`);
      }
    }
    stats().diagramDragFrames=(stats().diagramDragFrames||0)+1;
  }
  handler.updateLivePreview=function(dx,dy){
    if(this.cloning){compositor=false;return basePreview.call(this,dx,dy)}
    if(!preview)begin();pending={dx,dy};if(frame===null)frame=requestAnimationFrame(paint);
  };
  handler.resetLivePreview=function(){
    if(!preview){if(!compositor)return baseReset.call(this);return}
    if(frame!==null)cancelAnimationFrame(frame);frame=null;pending=null;
    for(const item of preview.nodes){item.node.style.translate=item.translate;item.node.style.willChange=item.willChange}
    for(const item of preview.hidden)item.node.style.visibility=item.visibility;
    preview.layer.remove();preview=null;graph.connectionHandler.reset();
  };
}
