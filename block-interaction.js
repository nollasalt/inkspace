// Geometry adapters and transient controls; the shared router owns gestures.
(() => {
  const graph = () => window.inkspaceDiagram;
  const keys = ['strokes', 'notes', 'shapes', 'pdfs', 'pdfPages'];
  const frame = document.createElement('div');
  frame.className = 'media-block';
  frame.hidden = true;
  viewport.append(frame);
  let hovered = null;

  // One shared frame avoids adding controls to every stroke or PDF page.
  const directions = {top: '↑', right: '→', bottom: '↓', left: '←'};
  for (const [side, label] of Object.entries(directions)) {
    const button = document.createElement('button');
    button.className = 'note-connect-arrow media-connect-' + side;
    button.dataset.side = side;
    button.textContent = label;
    button.title = '从此边连接箭头';
    frame.append(button);
  }

  function cellTarget(cell) {
    if (!cell?.vertex) return null;
    return {
      id: 'diagram:' + cell.id, connectionKind: 'diagram', diagramCell: cell,
      connectionBounds: () => {
        const v = graph().graph.view, state = v.getState(cell);
        return state ? {
          x: state.x / v.scale - v.translate.x,
          y: state.y / v.scale - v.translate.y,
          w: state.width / v.scale, h: state.height / v.scale
        } : null;
      }
    };
  }

  function connectionTarget(id) {
    if (id?.startsWith('diagram:')) return cellTarget(graph()?.graph?.getModel().getCell(id.slice(8)));
    const note = doc.notes.find(n => n.id === id);
    if (note) return note;
    const match = /^(strokes|shapes|pdfs|pdfPages):(.+)$/.exec(id || '');
    if (!match) return null;
    const item = blockItems(match[1]).find(n => n.id === match[2]);
    return item ? {
      id, connectionKind: match[1], connectionItem: item,
      connectionBounds: () => window.inkspaceGeometry.displayBounds(match[1], item)
    } : null;
  }

  function targetAt(hit) {
    if (!hit || hit.kind === 'notes') return null;
    const item = blockValue(hit.kind,hit.index);
    return item ? {
      id: item.id ? hit.kind + ':' + item.id : null,
      connectionKind: hit.kind, connectionItem: item,
      connectionBounds: () => window.inkspaceGeometry.displayBounds(hit.kind, item)
    } : null;
  }

  function ensureConnectionTarget(target) {
    if (!target?.connectionKind || target.diagramCell) return target;
    if(target.connectionKind==='pdfPages')return target;
    target.connectionItem.id ??= crypto.randomUUID();
    target.id = target.connectionKind + ':' + target.connectionItem.id;
    frame.dataset.id = target.id;
    return target;
  }

  function eventTarget(event) {
    const control=window.inkspaceInteraction?.controlAt(event);
    if(control){const el=control.el.closest('.note,.media-block');if(el)return el.classList.contains('media-block')?hovered:connectionTarget(el.dataset.id)}
    const hit=pick(event);if(hit?.kind==='notes')return blockValue(hit.kind,hit.index);
    return hit?.kind==='diagram'?cellTarget(graph()?.graph?.getModel().getCell(hit.id)):targetAt(hit);
  }

  function hideHover() {frame.hidden = true; hovered = null;}

  function hover(event) {
    if (event.pointerType !== 'mouse' || viewport.classList.contains('pen-input') ||
        active || !objectControls(event) || space || pointerTool(event) === 'pan') {
      hideHover();
      return;
    }
    if (event.target.closest('.note-connect-arrow') && hovered) return;
    if (event.target.closest('.note')) {hideHover(); return;}
    const p = local(event), pos = world(p.x, p.y);
    const hit = cellTarget(graph()?.graph?.getCellAt(p.x, p.y)) || targetAt(hitCanvasItem(pos));
    // Keep the controls reachable while crossing the gap to an outside port.
    if (!hit && hovered && !frame.hidden) {
      const b = hovered.connectionBounds(), pad = 28 / view.scale;
      if (b && pos.x >= b.x - pad && pos.y >= b.y - pad &&
          pos.x <= b.x + b.w + pad && pos.y <= b.y + b.h + pad) return;
    }
    hovered = hit;
    if (!hovered) {hideHover(); return;}
    const b = hovered.connectionBounds();
    if (!b) {hideHover(); return;}
    Object.assign(frame.style, {
      left: (view.x + b.x * view.scale) + 'px', top: (view.y + b.y * view.scale) + 'px',
      width: b.w * view.scale + 'px', height: b.h * view.scale + 'px'
    });
    frame.dataset.id = hovered.id || '';
    frame.hidden = false;
  }
  viewport.addEventListener('pointerleave', hideHover);
  window.addEventListener('blur', hideHover);

  function pick(event) {
    const p=local(event),pos=world(p.x,p.y);
    const hit=hitCanvasItem(pos);
    if(hit?.kind==='notes')return{...hit,id:blockValue(hit.kind,hit.index).id};
    const cell=graph()?.graph?.getCellAt(p.x,p.y);
    if(cell)return{kind:'diagram',index:cell.id,id:cell.id};
    return hit?{...hit,id:blockValue(hit.kind,hit.index).id}:null;
  }

  function selectHit(hit) {
    clearSelection();
    graph()?.setSelected([]);
    if (hit) {
      if (hit.kind === 'diagram') graph()?.setSelected([hit.id]);
      else selected[hit.kind] = [hit.index];
      window.inkspaceBlocks.expandSelection();
    }
    overlaySelection();
  }

  // Shared selection overlay effect, also used by the delegated graph preview.
  function previewSelectionFrame(dx = 0, dy = 0, factor = 1) {
    const el = $('#selection');el.style.transformOrigin = '0 0';el.style.transform = `translate(${dx}px,${dy}px) scale(${factor})`;
    window.inkspaceMediaFrame?.refresh();
  }
  function clearSelectionFrame() {
    const el = $('#selection');
    el.style.transform = '';
    el.style.transformOrigin = '';
  }

  Object.assign(window.inkspaceBlocks, {
    hover, hideHover, previewSelectionFrame, clearSelectionFrame, connectionTarget,
    ensureConnectionTarget, eventTarget, pick, selectHit
  });
})();
