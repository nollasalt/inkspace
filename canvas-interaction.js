// DOM/renderer adapter for the pure interaction machine. All canvas gestures
// enter here; media adapters expose effects, never competing event listeners.
(() => {
  const controls = new Map([
    ['.note-connect-arrow','connection'], ['.note-resize','width'],
    ['.note-height-resize','height'], ['.note-view-toggle','view-toggle'],
    ['.note-scale','text-scale'], ['.selection-scale','selection'], ['.note-bar','selection']
    ,['.media-grip','selection']
  ]);
  const connector = () => window.inkspaceDiagram?.noteConnectors();
  let transaction = null;
  let lastControlGesture = false;
  const controlAt = event => {
    for (const [selector, owner] of controls) {
      const el = event.target.closest?.(selector);
      if (!el || el.hidden) continue;
      const r = el.getBoundingClientRect();
      // A pseudo-element bridging a hover gap is not a clickable connection port.
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) continue;
      if (getComputedStyle(el).pointerEvents === 'none') continue;
      if(owner==='connection'){
        const p=local(event),pos=world(p.x,p.y),source=el.closest('.note')?.dataset.id;
        // A neighbouring block's content wins over another block's outside port.
        if(doc.notes.some(note=>note.id!==source&&InkInteraction.contains(itemBounds('notes',note),pos)))continue;
      }
      return {owner, el};
    }
    return null;
  };
  const noteAtControl = event => doc.notes.find(n => n.id === (event.target.closest?.('[data-block-id]')?.dataset.blockId || event.target.closest?.('.note')?.dataset.id));
  function capture(event, position, defer=false) {
    pointers.set(event.pointerId, position);
    if (!defer && !event.nativeInk) { try { viewport.setPointerCapture(event.pointerId); } catch {} }
  }
  function beginMove(event, hit) {
    const p=local(event),pos=world(p.x,p.y);
    const chosen = hit && (hit.kind === 'diagram' ? blockSelection.has('diagram', hit.id) :
      selected[hit.kind]?.includes(hit.index));
    const group = hit?.id && (doc.groups || []).some(g => InkBlockModel.groupMembers(doc,g).some(r => r.kind === hit.kind && r.id === hit.id));
    if (hit && (!chosen || group)) {
      if(window.inkspaceBlocks)window.inkspaceBlocks.selectHit(hit);
      else {clearSelection();if(hit)selected[hit.kind]=[hit.index];overlaySelection()}
    }
    if (!hit && !InkInteraction.contains(selectionBounds(), pos)) {
      clearSelection(); window.inkspaceDiagram?.setSelected([]);
      selectionRect = {x:pos.x,y:pos.y,w:0,h:0};
      window.inkspaceInteraction.machine.transition(event.pointerId,'marquee');
      active = {type:'select',id:event.pointerId,start:pos}; overlaySelection(); return;
    }
    active = {type:'move-selection',id:event.pointerId,last:pos,pendingMove:true,
      offset:{x:0,y:0},rect:viewport.getBoundingClientRect()};
    beginGroupMove();
  }
  function startDrawing(event, owner, pos) {
    clearSelection(); window.inkspaceDiagram?.setSelected([]);
    if(owner==='shape'&&window.inkspaceWorkbench?.completeShape){active={type:'graph-create',id:event.pointerId,start:pos,end:pos};window.inkspaceWorkbench.previewShape(pos,pos);return;}
    checkpoint();
    if (owner === 'shape') {
      const shape = {kind:$('#shape-kind').value,x:pos.x,y:pos.y,x2:pos.x,y2:pos.y,color:$('#color').value,width:Number($('#width').value)};
      doc.shapes.push(shape); active = {type:'shape',id:event.pointerId,shape}; render(); paintShapeLive();
    } else if (owner === 'erase' || event.pointerType === 'pen' && (event.button === 5 || event.buttons & 32)) {
      active = {type:'erase',id:event.pointerId,rect:viewport.getBoundingClientRect()}; erase(pos); scheduleInteractionFrame();
    } else {
      const stroke = {id:crypto.randomUUID(),color:$('#color').value,width:Number($('#width').value),step:.05/view.scale,
        brush:hasNativeInk()?'xournal':'raw-contour',hasPressure:event.pointerType==='pen',
        inputSource:event.nativeInk?(event.nativePrecision?'windows-himetric':'windows-pixel'):'browser',inputScale:view.scale,
        points:[{...pos,p:event.pointerType==='pen'&&Number.isFinite(event.pressure)?Math.max(0,Math.min(1,event.pressure)):1}]};
      doc.strokes.push(stroke); active = {type:'pen',id:event.pointerId,s:stroke}; beginInk();
    }
  }
  function cancelContact(reason, owner) {
    if (owner === 'diagram') { window.inkspaceDiagram?.cancelGesture(); return; }
    if (['blur','pointercancel','capture-lost'].includes(reason) && ['ink','erase'].includes(owner)) { finishInteraction(); persist(); transaction = null; return; }
    const before = transaction;
    cancelInteractionFrame(); window.inkspaceBlocks?.clearPreview(); window.inkspaceBlocks?.clearSelectionFrame();
    window.inkspaceWorkbench?.clearShapePreview();
    for (const cache of noteCache.values()) cache.el.classList.remove('scaling-text','resizing-window');
    // Preview-only gestures have not touched the document. Changed gestures
    // restore their first existing checkpoint, rather than adding a new undo.
    if (before?.snapshot) { doc = before.snapshot; history = before.historyEntries; future = before.future; }
    active = null; pointers.clear(); gesture = null; selectionRect = null;
    if(owner==='shape'&&window.inkspaceWorkbench?.completeShape)activateTool('select',false);
    for (const layer of inkLayers.slice(1)) { layer.canvas.style.transform=''; layer.canvas.style.transformOrigin=''; clearLayer(layer); }
    $('#scene').style.transform=''; $('#selection').style.transform='';
    transaction = null; render(); persist();
  }
  const host = {
    facts(event) {
      if(event.type==='pointerdown')window.inkspaceInlineText?.hoverPointer(event);
      const canControl=objectControls(event)||event.pointerType==='pen'&&!canvasUi(event)&&!space&&['select','diagram','text'].includes(tool);
      const control = canControl ? controlAt(event)?.owner : undefined;
      const state = connector()?.pending;
      if (state && state.page !== notebook.activePage) connector().cancel();
      return {pointerId:event.pointerId,device:event.pointerType||'mouse',button:event.button,tool:pointerTool(event),
        space,ui:canvasUi(event),duplicate:duplicateBrowserPen(event)||event.pointerType==='touch'&&(event.width>40||event.height>40),
        control,connection:!!window.inkspaceInteraction?.machine.connection,diagram:!!window.inkspaceDiagram?.ownsPointer(event)};
    },
    prepare(event, owner) {
      const control=owner==='editor'?null:controlAt(event);
      lastControlGesture=!!control;
      window.inkspaceInlineText?.preparePointer(event, control?.el);
      if (owner !== 'editor') settleZoom();
      window.inkspaceInlineText?.observePointer(event);
      window.inkspaceInlineText?.hoverPointer(event);
      if (owner !== 'connection') window.inkspaceBlocks?.hideHover();
      if (owner !== 'connection' && owner !== 'selection' && owner !== 'diagram') connector()?.cancel();
    },
    begin(event, owner) {
      if (owner === 'diagram') { transaction=null; return true; }
      if (owner === 'connection') {
        const control=controlAt(event),block=window.inkspaceBlocks?.eventTarget(event),p=local(event),pos=world(p.x,p.y);
        if (connector()?.pending) connector().complete(block,control?.el.dataset.side||null,pos);
        else if (control && block) connector()?.start(block,control.el.dataset.side);
        return false;
      }
      if (event.button === 2) {
        window.inkspaceInlineText?.finish(); finishInteraction();
        const hit=window.inkspaceBlocks?.pick(event);
        if (!hit || !(hit.kind==='diagram'?blockSelection.has('diagram',hit.id):selected[hit.kind]?.includes(hit.index))) window.inkspaceBlocks?.selectHit(hit);
        clearPenCursor(); return false;
      }
      if (owner === 'view-toggle') {
        // The button's click (including keyboard activation) executes the command.
        return false;
      }
      transaction??={historyEntries:history.slice(),future:future.slice(),snapshot:null};
      const rect=viewport.getBoundingClientRect(),p={x:event.clientX-rect.left,y:event.clientY-rect.top},pos=world(p.x,p.y);
      capture(event,p,owner==='selection'&&!controlAt(event));
      if (owner === 'pan') {
        if (pointers.size === 2) {
          active=null; const [a,b]=[...pointers.values()];
          gesture={distance:Math.hypot(a.x-b.x,a.y-b.y),scale:view.scale,anchor:world((a.x+b.x)/2,(a.y+b.y)/2)};
          render();
        } else active={type:'pan',id:event.pointerId,last:p,rect};
        return true;
      }
      const note=noteAtControl(event),control=controlAt(event);
      if (['width','height','text-scale'].includes(owner) && !note) { pointers.delete(event.pointerId); return false; }
      if (owner === 'width') {
        checkpoint(); active={type:'resize-note',id:event.pointerId,n:note,start:pos,width:note.width||320};
      } else if (owner === 'height') {
        if (note.viewMode !== 'window') { pointers.delete(event.pointerId); return false; }
        clearSelection(); const height=Number(note.viewHeight)||240;
        active={type:'resize-window',id:event.pointerId,n:note,baseHeight:height,height,startY:event.clientY,scale:view.scale*(note.scale||1)};
        noteCache.get(note.id).el.classList.add('resizing-window');
      } else if (owner === 'text-scale') {
        const hit={kind:'notes',index:doc.notes.indexOf(note),id:note.id},group=hit?.id&&(doc.groups||[]).some(g=>InkBlockModel.groupMembers(doc,g).some(r=>r.kind===hit.kind&&r.id===hit.id));
        if (group) { window.inkspaceBlocks.selectHit(hit); checkpoint(); active={type:'resize-selection',id:event.pointerId,bounds:selectionBounds(),items:selectionScaleSnapshot(),factor:1,rect}; beginGroupMove(); }
        else { checkpoint(); clearSelection(); active={type:'resize-text',id:event.pointerId,n:note,base:{x:note.x,y:note.y,scale:note.scale||1},bounds:window.inkspaceInlineText?.bounds(note)||itemBounds('notes',note),factor:1,start:pos,rect}; noteCache.get(note.id).el.classList.add('scaling-text'); overlaySelection(); }
      } else if (['ink','erase','shape'].includes(owner)) startDrawing(event,owner,pos);
      else if (control?.el.matches('.selection-scale') && selectionBounds()) {
        window.inkspaceInteraction.machine.transition(event.pointerId,'resizing');
        checkpoint(); active={type:'resize-selection',id:event.pointerId,bounds:selectionBounds(),items:selectionScaleSnapshot(),factor:1,rect}; beginGroupMove();
      } else if (tool === 'text' && !note && !window.inkspaceBlocks?.pick(event)) {
        pointers.delete(event.pointerId); edit({id:crypto.randomUUID(),...pos,width:560,markdown:''}); return false;
      } else if(control?.el.matches('.media-grip')){const entry=window.inkspaceBlocks.selectionEntries()[0];beginMove(event,entry&&{kind:entry.kind,index:entry.index,id:entry.value.id});}
      else beginMove(event,control?.el.matches('.note-bar')&&note?{kind:'notes',index:doc.notes.indexOf(note),id:note.id}:window.inkspaceBlocks?.pick(event)||hitCanvasItem(pos));
      return true;
    },
    move(event, owner) {
      if (owner === 'diagram') return;
      if (active?.type === 'resize-window') {
        active.height=Math.max(80,Math.min(1200,active.baseHeight+(event.clientY-active.startY)/active.scale)); scheduleInteractionFrame(); return;
      }
      moveCanvasContact(event);
    },
    end(event, owner) {
      if (owner !== 'diagram') endCanvasContact(event);
      transaction=null;
      if(event.pointerType==='mouse'&&owner==='selection')window.inkspaceBlocks?.hover(event);
    },
    cancel:cancelContact,
    hover(event) {
      window.inkspaceInlineText?.hoverPointer(event); window.inkspaceBlocks?.hover(event);
      if (connector()?.pending && event.pointerType==='mouse') connector().hover(event);
    },
    key(event) {
      if(event.target.closest?.('.note-height-resize')&&['ArrowUp','ArrowDown'].includes(event.key))return false;
      if (event.key === 'Escape' && connector()?.pending) { connector().cancel(); return true; }
      if (router.shortcut(event)) return true;
      if (window.inkspaceBlocks?.keyDown(event)) return true;
      if (canvasUi(event)||event.isComposing||window.inkspaceDiagram?.editing()) return false;
      if (window.inkspaceDiagram?.keyDown(event)) return true;
      canvasKeyDown(event); return event.defaultPrevented;
    },
    wheel(event) {
      if (window.inkspaceInlineText?.scrollWheel(event)) return;
      if (!router.machine.gesture || router.machine.gesture.owner==='pan') canvasWheel(event);
    },
    doubleClick(event) {
      if (!objectControls(event)||event.button!==0||event.detail>0&&lastCanvasPointer!=='mouse'||event.sourceCapabilities?.firesTouchEvents||event.detail>0&&lastControlGesture||controlAt(event)||document.querySelector('dialog[open]')) return;
      const hit=window.inkspaceBlocks?.pick(event);
      if (hit?.kind==='notes') {
        const note=blockValue(hit.kind,hit.index);
        connector()?.cancel();if(note.kind==='image')window.inkspaceCommands?.execute('view');else edit(note,{x:event.clientX,y:event.clientY});
      } else if (hit?.kind==='diagram') { window.inkspaceDiagram?.editAt(hit.id); }
      else if ((!hit||['strokes','shapes'].includes(hit.kind)) && !canvasUi(event)) { finishInteraction(); const p=local(event); edit({id:crypto.randomUUID(),...world(p.x,p.y),width:560,markdown:''}); }
      else if(hit?.kind==='pdfPages')window.inkspaceCommands?.execute('view');else return;
      event.preventDefault(); event.stopImmediatePropagation();
    }
  };
  const router=new InkInteraction.InputRouter(host);
  window.inkspaceInteraction=router;
  router.captureCheckpoint = snapshot => { if (transaction && !transaction.snapshot) transaction.snapshot=snapshot; };
  router.finishExternal=()=>{
    if(router.machine.gesture?.owner==='diagram')window.inkspaceDiagram?.cancelGesture();
    router.endDiagram();transaction=null;
  };
  router.controlAt=controlAt;
  router.activateTextView=(id,event)=>{
    if(!objectControls(event)||event.pointerType&&event.pointerType!=='mouse'||event.sourceCapabilities?.firesTouchEvents)return;
    const note=doc.notes.find(n=>n.id===id);
    if(note)window.inkspaceInlineText?.setView(note.viewMode==='window'?'full':'window',note);
  };
  router.bind(viewport);
  window.addEventListener('keyup',event=>{if(event.code==='Space'){space=false;syncInputMode()}});
  window.addEventListener('blur',()=>{connector()?.cancel();space=false;syncInputMode();window.inkspaceBlocks?.hideHover();persist()});
})();

function moveCanvasContact(e) {
  if (duplicateBrowserPen(e)) return;
  if (!pointers.has(e.pointerId)) return;
  if (active?.type === "pen" && active.id === e.pointerId) {
    sampleInk(e);
    paintLive();
    return;
  }
  const p = active?.rect ? { x: e.clientX - active.rect.left, y: e.clientY - active.rect.top } : local(e);
  pointers.set(e.pointerId, p);
  if (gesture && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    view.scale = usableZoom(gesture.scale * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, gesture.distance));
    view.x = (a.x + b.x) / 2 - gesture.anchor.x * view.scale;
    view.y = (a.y + b.y) / 2 - gesture.anchor.y * view.scale;
    previewZoom();
    return;
  }
  if (!active || active.id !== e.pointerId) return;
  const pos = world(p.x, p.y);
  if (active.type === 'graph-create') {active.end=pos;window.inkspaceWorkbench.previewShape(active.start,pos);return;
  } else if (active.type === "resize-text") {
    const b = active.bounds, factor = 1 + ((pos.x - active.start.x) * b.w + (pos.y - active.start.y) * b.h) / Math.max(1e-12, b.w * b.w + b.h * b.h);
    active.factor = Math.max(0.05 / active.base.scale, Math.min(20 / active.base.scale, factor));
    scheduleInteractionFrame();
    return;
  } else if (active.type === "resize-selection") {
    const b = active.bounds;
    active.factor = selectionScaleFactor(((pos.x - b.x) * b.w + (pos.y - b.y) * b.h) / Math.max(1e-12, b.w * b.w + b.h * b.h), active.items);
    scheduleInteractionFrame();
    return;
  } else if (active.type === "resize-note") {
    active.n.width = Math.max(160, Math.min(4e3, active.width + (pos.x - active.start.x) / (active.n.scale || 1)));
    renderNotes(active.n);
    overlaySelection();
    return;
  } else if (active.type === "select") {
    selectionRect = normalized(active.start, pos);
    scheduleInteractionFrame();
    return;
  } else if (active.type === "move-selection") {
    if (active.pendingMove) {
      if (Math.hypot(pos.x - active.last.x, pos.y - active.last.y) * view.scale < 3) return;
      checkpoint();
      active.pendingMove = false;
      if(!e.nativeInk){try{viewport.setPointerCapture(e.pointerId)}catch{}}
      window.inkspaceInteraction.machine.transition(e.pointerId,'dragging');
    }
    active.offset.x += pos.x - active.last.x;
    active.offset.y += pos.y - active.last.y;
    active.last = pos;
    scheduleInteractionFrame();
    return;
  } else if (active.type === "shape") {
    active.shape.x2 = pos.x;
    active.shape.y2 = pos.y;
    paintShapeLive();
    return;
  } else if (active.type === "pan") {
    view.x += p.x - active.last.x;
    view.y += p.y - active.last.y;
    active.last = p;
    scheduleInteractionFrame();
    return;

  } else if (active.type === "erase") {
    for (const sample of e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e]) erase(world(sample.clientX - active.rect.left, sample.clientY - active.rect.top));
    scheduleInteractionFrame();
    return;
  } else for (const sample of e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e]) {
    const q = local(sample);
    active.s.points.push({ ...world(q.x, q.y), p: sample.pointerType === "pen" ? sample.pressure || 0.5 : 1 });
  }
  render();
}
function endCanvasContact(e) {
  if (duplicateBrowserPen(e)) return;
  window.inkspaceBlocks?.clearSelectionFrame();
  settleZoom();
  cancelInteractionFrame();
  if(active?.type==='graph-create'&&active.id===e.pointerId){const creation=active;active=null;pointers.delete(e.pointerId);window.inkspaceWorkbench.clearShapePreview();window.inkspaceWorkbench.completeShape(creation.start,creation.end);return;}
  if (active?.type === "pan" && active.id === e.pointerId) {
    settlePan();
    persist();
  }
  if (active?.type === "move-selection" && active.id === e.pointerId) {
    finishGroupMove();
    persist();
  }
  if (active?.type === "resize-window" && active.id === e.pointerId) {
    window.inkspaceInlineText?.finishHeight();
  }
  if (active?.type === "resize-text" && active.id === e.pointerId) {
    finishTextScale();
    persist();
  }
  if (active?.type === "resize-selection" && active.id === e.pointerId) {
    finishGroupScale();
    persist();
  }
  if (active?.type === "erase" && active.id === e.pointerId) {
    if (e.type !== "pointercancel") erase(world(e.clientX - active.rect.left, e.clientY - active.rect.top));
    finishErasing();
    active = null;
    persist();
  }
  if (active?.type === "pen" && active.id === e.pointerId) {
    if (e.type !== "pointercancel") sampleInk(e, true);
    finishInk();
    persist();
  }
  pointers.delete(e.pointerId);
  if (pointers.size < 2) gesture = null;
  if (active?.id === e.pointerId) {
    if (active.type === "shape") clearLayer(inkLayers[1]);
    if (active.type === "select") {
      selectBox(selectionRect);
      selectionRect = null;
    }
    active = null;
    persist();
    render();
  }
  if (!pointers.size) persist();
}
