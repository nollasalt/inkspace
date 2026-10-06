// All block types use the same four ports and the same world-coordinate route.
import geometry from './block-geometry.cjs';

export function installNoteConnectors(graph, mx, {derived, release}) {
  const {mxPoint} = mx;
  const labels = {top:'↑', right:'→', bottom:'↓', left:'←'};
  let pending = null, preview = null;
  const field = (edge,key) => graph.getCellStyle(edge)[key];
  const resolve = id => window.inkspaceBlocks?.connectionTarget(id) || doc.notes.find(n=>n.id===id);
  const eventTarget = event => window.inkspaceBlocks?.eventTarget(event) || doc.notes.find(n=>n.id===event.target.closest('.note')?.dataset.id);

  function box(block) {
    if (block.connectionBounds) return block.connectionBounds();
    const cache=noteCache.get(block.id);
    if (!cache) return null;
    const el=cache.el, r=el.getBoundingClientRect(), vp=viewport.getBoundingClientRect();
    const scale=r.width/el.offsetWidth, value=key=>parseFloat(el.style.getPropertyValue('--text-'+key));
    // Use the renderer's actual transform, including an in-flight zoom preview.
    const sceneScale=zoomBase ? view.scale/zoomBase.scale : 1;
    const rendered=sceneScale*(renderedScale||view.scale);
    return {x:(r.left-vp.left-view.x+(value('left')+1)*scale)/rendered,
      y:(r.top-vp.top-view.y+(value('top')+1)*scale)/rendered,
      w:value('width')*scale/rendered, h:value('height')*scale/rendered};
  }
  function point(block, side) {
    const p=geometry.port(box(block),side);
    return p && new mxPoint(p.x,p.y);
  }
  function nearest(block,p) {return geometry.nearestSide(box(block),p)}
  function attached(edge,source) {
    const key=source?'inkNoteSource':'inkNoteTarget', id=field(edge,key);
    return id ? resolve(decodeURIComponent(id)) : null;
  }
  function managed(edge) {
    return !!(field(edge,'inkspaceRoute') || field(edge,'inkNoteSource') || field(edge,'inkNoteTarget') || edge.source?.vertex&&edge.target?.vertex);
  }
  function vertexBox(state) {
    const v=graph.view;
    return {x:state.x/v.scale-v.translate.x,y:state.y/v.scale-v.translate.y,w:state.width/v.scale,h:state.height/v.scale};
  }
  function endpoint(edge,g,source,towards,states) {
    const block=attached(edge,source), key=source?'exit':'entry';
    if (block) return geometry.port(box(block),field(edge,source?'inkNoteSourceSide':'inkNoteTargetSide'));
    const terminal=source?edge.source:edge.target;
    const state=states?.[source?'source':'target'] || terminal&&graph.view.getState(terminal);
    if (state) {
      const bounds=vertexBox(state), x=Number(field(edge,key+'X')), y=Number(field(edge,key+'Y'));
      const side=Number.isFinite(x)&&Number.isFinite(y) ? (x===0?'left':x===1?'right':y===0?'top':'bottom') : geometry.nearestSide(bounds,towards);
      return geometry.port(bounds,side);
    }
    const p=g.getTerminalPoint(source);
    return p && {...p,side:Math.abs(p.x-towards.x)>Math.abs(p.y-towards.y)?(towards.x>p.x?'right':'left'):(towards.y>p.y?'bottom':'top')};
  }
  function obstacles(states,edge){
    const result=doc.notes.map(n=>box(n)).filter(Boolean).concat(InkBlockModel.pages(doc).map(p=>({x:p.x,y:p.y,w:p.width,h:p.height})),doc.shapes.filter(s=>['rect','ellipse'].includes(s.kind)).map(s=>itemBounds('shapes',s)));
    for(const cell of graph.getChildVertices(graph.getDefaultParent())){const state=states?.moving?.get(cell)||cell===edge?.source&&states?.source||cell===edge?.target&&states?.target||graph.view.getState(cell);if(state)result.push(vertexBox(state))}
    return result;
  }
  function route(edge,g,states) {
    if (!managed(edge)) return g;
    const targetBlock=attached(edge,false), sourceBlock=attached(edge,true);
    const targetState=states?.target || edge.target&&graph.view.getState(edge.target);
    const hint=targetBlock?point(targetBlock,field(edge,'inkNoteTargetSide')):targetState?geometry.port(vertexBox(targetState),'left'):g.targetPoint||{x:0,y:0};
    const a=endpoint(edge,g,true,hint,states);
    const b=a&&endpoint(edge,g,false,a,states);
    if (!a||!b) return g;
    const points=geometry.routePorts(a,b,24,states?.obstacles||obstacles(states,edge));
    if(sourceBlock)g.setTerminalPoint(new mxPoint(a.x,a.y),true);
    if(targetBlock)g.setTerminalPoint(new mxPoint(b.x,b.y),false);
    g.points=points.slice(1,-1).map(p=>new mxPoint(p.x,p.y));
    return g;
  }
  // The compositor uses cloned terminal states, never temporarily mutates the model.
  graph.blockObstacles=states=>obstacles(states);
  graph.routeBlockEdge=(edge,g,states)=>route(edge,g,states);

  function cancel() {
    pending=null;preview?.remove();preview=null;viewport.classList.remove('note-connecting');
  }
  function paint(p) {
    const block=resolve(pending?.id), a=block&&geometry.port(box(block),pending.side);
    if(!a){cancel();return}
    const towards=eventTarget(pending.hoverEvent||{target:viewport,clientX:0,clientY:0});
    const b=towards&&towards.id!==block.id?geometry.port(box(towards),nearest(towards,p)):{...p,side:geometry.sides[a.side].nx?(p.x>a.x?'left':'right'):(p.y>a.y?'top':'bottom')};
    const points=geometry.routePorts(a,b,24,obstacles());
    preview.setAttribute('d',points.map((point,i)=>(i?'L ':'M ')+(point.x*graph.view.scale+view.x)+' '+(point.y*graph.view.scale+view.y)).join(' '));
  }
  function start(block,side) {
    block=window.inkspaceBlocks?.ensureConnectionTarget(block)||block;
    window.inkspaceInlineText?.finish();finishInteraction();graph.clearSelection();cancel();
    pending={id:block.id,side,page:notebook.activePage};viewport.classList.add('note-connecting');
    preview=document.createElementNS('http://www.w3.org/2000/svg','path');
    for(const [key,value]of Object.entries({fill:'none',stroke:'#007acc','stroke-width':'2','stroke-dasharray':'5 4','pointer-events':'none'}))preview.setAttribute(key,value);
    graph.view.getOverlayPane().append(preview);
    const p=point(block,side), normal=geometry.sides[side];
    if(p)paint({x:p.x+normal.nx*50,y:p.y+normal.ny*50});
  }
  function complete(target,side,p) {
    target=window.inkspaceBlocks?.ensureConnectionTarget(target)||target;
    const source=resolve(pending?.id);
    if(!source||pending.page!==notebook.activePage||source.id===target?.id){cancel();return}
    const sourceSide=pending.side, a=point(source,sourceSide), b=target?point(target,side):p;
    let style='inkspaceRoute=1;edgeStyle=none;noEdgeStyle=1;rounded=0;';
    for(const [block,port,isSource]of [[source,sourceSide,true],[target,side,false]]) {
      if(!block)continue;
      if(block.diagramCell){const d=geometry.sides[port];style+=(isSource?'exit':'entry')+'X='+d.x+';'+(isSource?'exit':'entry')+'Y='+d.y+';'}
      else style+=(isSource?'inkNoteSource':'inkNoteTarget')+'='+encodeURIComponent(block.id)+';'+(isSource?'inkNoteSourceSide':'inkNoteTargetSide')+'='+port+';';
    }
    let edge;graph.getModel().beginUpdate();
    try {
      edge=graph.insertEdge(graph.getDefaultParent(),null,'',source.diagramCell||null,target?.diagramCell||null,style);
      const g=edge.geometry.clone();if(!source.diagramCell)g.setTerminalPoint(new mxPoint(a.x,a.y),true);if(!target?.diagramCell)g.setTerminalPoint(new mxPoint(b.x,b.y),false);
      graph.getModel().setGeometry(edge,route(edge,g));
    } finally {graph.getModel().endUpdate()}
    cancel();graph.setSelectionCell(edge);
  }
  function sync(previewOnly=false) {
    if(!window.inkspaceInlineText)return;
    for(const block of doc.notes) {
      const cache=noteCache.get(block.id);if(!cache||cache.connectorButtons)continue;
      cache.connectorButtons=Object.entries(labels).map(([side,label])=>{
        const button=document.createElement('button');button.type='button';button.className='note-connect-arrow note-connect-'+side;button.dataset.side=side;button.textContent=label;button.title='点击此边连接箭头，再点击目标 · Esc 取消';button.setAttribute('aria-label',button.title);
        button.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation()});cache.el.append(button);return button;
      });
    }
    if(pending&&(pending.page!==notebook.activePage||!resolve(pending.id)))cancel();
    const changed=[];derived(()=>{
      const model=graph.getModel();model.beginUpdate();
      try {
        for(const edge of model.getChildCells(graph.getDefaultParent(),false,true)) {
          if(!managed(edge))continue;
          const missing=['inkNoteSource','inkNoteTarget'].some(key=>field(edge,key)&&!resolve(decodeURIComponent(field(edge,key))));
          if(edge.visible===missing)model.setVisible(edge,!missing);
          if(missing)continue;
          const style=edge.style||'';
          if(!style.includes('noEdgeStyle=1'))model.setStyle(edge,style.replace(/edgeStyle=[^;]*;?/g,'')+';edgeStyle=none;noEdgeStyle=1;');
          const routed=route(edge,edge.geometry.clone());
          if(JSON.stringify([routed.points,routed.sourcePoint,routed.targetPoint])!==JSON.stringify([edge.geometry.points,edge.geometry.sourcePoint,edge.geometry.targetPoint])) {model.setGeometry(edge,routed);changed.push(edge);}
        }
      } finally {model.endUpdate()}
    },previewOnly);
    if(changed.length){for(const edge of changed)graph.view.invalidate(edge,false,false);graph.view.validate()}
  }
  viewport.addEventListener('pointerdown',event=>{
    if(!objectControls(event)||event.pointerType!=='mouse'||event.button!==0||tool==='pan')return;
    const button=event.target.closest('.note-connect-arrow');if(!button&&!pending)return;
    event.preventDefault();event.stopImmediatePropagation();const block=eventTarget(event),p=local(event),pos=world(p.x,p.y);
    if(button&&!pending){if(block)start(block,button.dataset.side);return}
    complete(block,block?(button?.dataset.side||nearest(block,pos)):null,pos);
  },{capture:true});
  viewport.addEventListener('pointermove',event=>{
    if(!pending||event.pointerType!=='mouse')return;
    event.preventDefault();pending.hoverEvent=event;const p=local(event);paint(world(p.x,p.y));
  },{capture:true});
  viewport.addEventListener('click',event=>{if(event.target.closest('.note-connect-arrow')){event.preventDefault();event.stopImmediatePropagation()}},{capture:true});
  window.addEventListener('keydown',event=>{if(pending&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();cancel()}},{capture:true});
  window.addEventListener('blur',cancel);
  return {sync,cancel,start,point,complete,route,box,get pending(){return pending}};
}
