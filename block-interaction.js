// Own mouse gestures and transient controls; do not serialize UI state.
(() => {
  const graph = () => window.inkspaceDiagram;
  const keys = ['strokes', 'notes', 'shapes', 'pdfs'];
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
    const match = /^(strokes|shapes|pdfs):(.+)$/.exec(id || '');
    if (!match) return null;
    const item = (doc[match[1]] || []).find(n => n.id === match[2]);
    return item ? {
      id, connectionKind: match[1], connectionItem: item,
      connectionBounds: () => itemBounds(match[1], item)
    } : null;
  }

  function targetAt(hit) {
    if (!hit || hit.kind === 'notes') return null;
    const item = doc[hit.kind]?.[hit.index];
    return item ? {
      id: item.id ? hit.kind + ':' + item.id : null,
      connectionKind: hit.kind, connectionItem: item,
      connectionBounds: () => itemBounds(hit.kind, item)
    } : null;
  }

  function ensureConnectionTarget(target) {
    if (!target?.connectionKind || target.diagramCell) return target;
    target.connectionItem.id ??= crypto.randomUUID();
    target.id = target.connectionKind + ':' + target.connectionItem.id;
    frame.dataset.id = target.id;
    return target;
  }

  function eventTarget(event) {
    const el = event.target.closest?.('.note,.media-block');
    if (el) return el.classList.contains('media-block') ? hovered : connectionTarget(el.dataset.id);
    const p = local(event);
    return cellTarget(graph()?.graph?.getCellAt(p.x, p.y)) || targetAt(hitCanvasItem(world(p.x, p.y)));
  }

  function hideHover() {frame.hidden = true; hovered = null;}

  viewport.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || viewport.classList.contains('pen-input') ||
        active || !objectControls(event) || space || tool === 'pan') {
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
  });
  viewport.addEventListener('pointerleave', hideHover);
  window.addEventListener('blur', hideHover);

  function keepsSelection(event) {
    if (!graph()?.selectionSnapshot().length) return false;
    const b = selectionBounds(), p = local(event), pos = world(p.x, p.y);
    return b && pos.x >= b.x && pos.y >= b.y && pos.x <= b.x + b.w && pos.y <= b.y + b.h;
  }

  function pick(event) {
    const p = local(event), pos = world(p.x, p.y), note = event.target.closest?.('.note');
    if (!note) {
      const cell = graph()?.graph?.getCellAt(p.x, p.y);
      if (cell) return {kind: 'diagram', index: cell.id, id: cell.id};
    }
    const hit = hitCanvasItem(pos, note);
    return hit ? {kind: hit.kind, index: hit.index, id: doc[hit.kind][hit.index].id} : null;
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

  function beginSelectionDrag(event, scale = false) {
    settleZoom();
    hideHover();
    const p = local(event), pos = world(p.x, p.y);
    event.preventDefault();
    event.stopImmediatePropagation();
    pointers.set(event.pointerId, p);
    try {viewport.setPointerCapture(event.pointerId);} catch {}
    if (scale) {
      checkpoint();
      active = {type: 'resize-selection', id: event.pointerId, bounds: selectionBounds(),
        items: selectionScaleSnapshot(), factor: 1, rect: viewport.getBoundingClientRect()};
    } else {
      active = {type: 'move-selection', id: event.pointerId, last: pos, pendingMove: true,
        offset: {x: 0, y: 0}, rect: viewport.getBoundingClientRect()};
    }
    beginGroupMove();
  }

  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || canvasUi(event)) return;
    if (event.button === 2) {
      clearPenCursor();
      event.preventDefault();
      event.stopImmediatePropagation();
      window.inkspaceInlineText?.finish();
      finishInteraction();
      const hit = pick(event), chosen = hit && (hit.kind === 'diagram' ?
        graph()?.selectionSnapshot().some(i => i.index === hit.id) : selected[hit.kind]?.includes(hit.index));
      if (!chosen) selectHit(hit);
      return;
    }
    // Dedicated controls own their gestures before group or selection dragging.
    if (event.button !== 0 || !objectControls(event) || tool === 'pan' || space ||
        event.target.closest('.note-connect-arrow,.note-view-toggle,.note-height-resize,.selection-scale,.note-resize')) return;
    const hit = pick(event);
    const group = hit?.id && (doc.groups || []).some(g => g.members.some(r => r.kind === hit.kind && r.id === hit.id));
    const mixed = keys.some(k => selected[k]?.length) && graph()?.selectionSnapshot().length && keepsSelection(event);
    if (group) {selectHit(hit); beginSelectionDrag(event, !!event.target.closest('.note-scale')); return;}
    if (mixed && !event.target.closest('.note-resize,.note-scale,.selection-scale')) beginSelectionDrag(event);
  }, {capture: true});

  function previewSelectionFrame(dx = 0, dy = 0, factor = 1) {
    const el = $('#selection');
    el.style.transformOrigin = '4px 4px';
    el.style.transform = `translate(${dx}px,${dy}px) scale(${factor})`;
  }
  function clearSelectionFrame() {
    const el = $('#selection');
    el.style.transform = '';
    el.style.transformOrigin = '';
  }

  Object.assign(window.inkspaceBlocks, {
    hideHover, previewSelectionFrame, clearSelectionFrame, connectionTarget,
    ensureConnectionTarget, eventTarget, keepsSelection, pick, selectHit
  });
})();
