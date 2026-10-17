import { planChanges, sceneRevision } from './proposal.cjs';
import { contextFor } from './context.cjs';
import { generationScene, placeGeneration } from './input.cjs';
import { port, sides } from '../block-geometry.cjs';
const box = b => ({ x: b.x, y: b.y, width: Math.max(1, b.w), height: Math.max(1, b.h) });
const intersects = (a, b) => a && b && a.x + a.width >= b.x && a.y + a.height >= b.y && a.x <= b.x + b.width && a.y <= b.y + b.height;
const ref = id => { const i = id.indexOf(':'); return { kind: id.slice(0, i), id: id.slice(i + 1) }; };
function cellStyle(cell) { return Object.fromEntries(String(cell.style || '').split(';').filter(s => s.includes('=')).map(s => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; })); }
export function createCanvasAdapter(host) {
  // Full source equality stays local, including invisible ink points/assets.
  // Model context alone cannot detect edits that keep the same bounds/text length.
  const signatures = new WeakMap();
  const generationPages = new WeakMap();
  const legacyIds = new WeakMap();
  const identity = value => {
    if (value.id) return value.id;
    if (!legacyIds.has(value)) legacyIds.set(value, 'legacy-' + crypto.randomUUID());
    return legacyIds.get(value);
  };
  const source = id => { const r = ref(id); return host.items(r.kind).find(value => identity(value) === r.id); };
  const unchanged = scene => scene.scope === 'generation' ? generationPages.has(scene) && generationPages.get(scene) === host.page() :
    signatures.has(scene) && signatures.get(scene) === host.signature() && scene.page === host.page();
  function capture(scope, area, selectedIds) {
    if (scope === 'generation') {
      const scene = generationScene(); generationPages.set(scene, host.page()); return scene;
    }
    area ||= host.area(); selectedIds ||= host.references().map(r => r.kind + ':' + r.id);
    const document = host.document(), entities = [], selected = new Set(selectedIds), graph = host.diagram()?.graph;
    const add = (id, kind, geometry, extra = {}) => {
      const r = ref(id), locked = host.locked(r);
      entities.push({ id, kind, geometry, locked, editable: !locked && (scope === 'selection' ? selected.has(id) : intersects(geometry, area)), ...extra });
    };
    for (const kind of ['notes', 'strokes', 'shapes', 'pdfPages']) for (const value of host.items(kind)) {
      const id = kind + ':' + identity(value), geometry = box(host.bounds(kind, value));
      if (kind === 'notes') add(id, value.kind === 'image' ? 'image' : 'text', geometry,
        value.kind === 'image' ? { content: '[图片，仅位置与尺寸元数据]' } : { content: value.markdown || '', format: value.format || 'md' });
      else add(id, { strokes: 'ink', shapes: 'drawing', pdfPages: 'pdf' }[kind], geometry,
        { content: kind === 'strokes' ? `[笔迹，${value.points.length} 个采样点]` : kind === 'pdfPages' ? `[PDF 第 ${(value.pageIndex || 0) + 1} 页，仅位置与尺寸元数据]` : `[手绘 ${value.kind}]` });
    }
    const cells = graph?.getChildCells(graph.getDefaultParent(), true, true) || [];
    for (const cell of cells.filter(c => c.vertex)) {
      const s = cellStyle(cell), g = cell.geometry;
      add('diagram:' + cell.id, 'shape', { x: g.x, y: g.y, width: g.width, height: g.height }, { content: typeof cell.value === 'string' ? cell.value : '',
        style: { shape: ['ellipse', 'rhombus'].includes(s.shape) ? (s.shape === 'rhombus' ? 'diamond' : s.shape) : s.rounded === '1' ? 'roundrect' : 'rect',
          fill: s.fillColor || '#ffffff', stroke: s.strokeColor || '#263f43', strokeWidth: Number(s.strokeWidth) || 2 } });
    }
    const ids = new Set(entities.map(e => e.id));
    for (const cell of cells.filter(c => c.edge)) {
      const s = cellStyle(cell), decode = id => { try { return decodeURIComponent(id); } catch { return id; } };
      const attached = id => [...ids].find(key => ref(key).id === decode(id));
      const source = cell.source ? 'diagram:' + cell.source.id : attached(s.inkNoteSource), target = cell.target ? 'diagram:' + cell.target.id : attached(s.inkNoteTarget);
      const side = (prefix, fallback) => s[prefix + 'X'] === '0' ? 'left' : s[prefix + 'X'] === '1' ? 'right' : s[prefix + 'Y'] === '0' ? 'top' : s[prefix + 'Y'] === '1' ? 'bottom' : fallback;
      const connection = source && target ? { source, target, sourceSide: s.inkNoteSourceSide || side('exit', 'right'), targetSide: s.inkNoteTargetSide || side('entry', 'left'),
        dashed: s.dashed === '1', arrow: s.endArrow === 'none' ? 'none' : s.startArrow && s.startArrow !== 'none' ? 'both' : 'forward' } : null;
      add('diagram:' + cell.id, 'connection', null, { content: typeof cell.value === 'string' ? cell.value : '', connection,
        style: { shape: 'rect', fill: 'none', stroke: s.strokeColor || '#263f43', strokeWidth: Number(s.strokeWidth) || 2 } });
    }
    for (const e of entities.filter(e => e.kind === 'connection')) e.editable = !e.locked && !!e.connection && (scope === 'selection' ? selected.has(e.id) :
      [e.connection.source, e.connection.target].some(id => entities.find(n => n.id === id)?.editable));
    const context = contextFor(entities, scope, area, selectedIds);
    if (context.entities.length > 600 || JSON.stringify(context.entities).length > 850000) throw Error('当前范围内容较多，请选择较小区域或将视野移近目标内容');
    const scene = { version: 1, page: host.page(), scope, area, selectedIds, insertion: { x: area.x + area.width * .55, y: area.y + area.height * .15 },
      imageDescription: '本次尚未附图。笔迹、图片和 PDF 没有可读正文，不应猜测。',
      aggregatedInk: context.aggregatedInk,
      groups: (document.groups || []).map(g => ({ id: g.id, members: host.groupMembers(g) })).filter(g => g.members.some(r => context.entities.some(e => e.id === r.kind + ':' + r.id))), entities: context.entities };
    signatures.set(scene, host.signature());
    return scene;
  }
  function apply(base, proposal) {
    host.finish();
    const generating = base.scope === 'generation';
    if (!unchanged(base)) throw Error(generating ? '生成目标画布已切换，或提案已应用。请返回原画布或重新生成。' : '笔记已变化，未应用旧提案。请重新发送当前内容。');
    if (!generating && sceneRevision(capture(base.scope, base.area, base.selectedIds)) !== sceneRevision(base)) throw Error('笔记已变化，未应用旧提案。请重新发送当前内容。');
    const planningBase = generating ? generationScene() : base;
    let plan = planChanges(planningBase, proposal);
    if (generating && plan.changed.length) {
      // Existing content is inspected locally only when placing the accepted additions.
      const occupied = ['notes', 'strokes', 'shapes', 'pdfPages'].flatMap(kind => host.items(kind).map(value => box(host.bounds(kind, value))));
      const graph = host.diagram()?.graph;
      for (const cell of graph?.getChildCells(graph.getDefaultParent(), true, false) || []) if (cell.vertex) occupied.push({ ...cell.geometry });
      proposal = placeGeneration(proposal, host.area(), occupied);
      plan = planChanges(planningBase, proposal);
    }
    if (!plan.changed.length) return false;
    const ids = new Map(planningBase.entities.map(e => [e.id, ref(e.id)]));
    for (const c of proposal.changes.filter(c => c.action === 'add')) ids.set(c.id, { kind: c.kind === 'text' ? 'notes' : 'diagram', id: crypto.randomUUID() });
    host.commit('AI 编辑笔记', () => {
      const document = host.document(), diagram = host.diagram(), graph = diagram.graph, model = graph.getModel();
      const geometryMap = new Map(plan.entities.map(e => [e.id, e.geometry]));
      const removed = new Set(plan.changed.filter(c => !c.after).map(c => c.change.id));
      const edited = new Set(plan.changed.filter(c => c.before && c.after).map(c => c.change.id));
      for (const kind of ['notes', 'strokes', 'shapes']) document[kind] = document[kind]
        .filter(value => !removed.has(kind + ':' + identity(value)))
        .map(value => !value.id && edited.has(kind + ':' + identity(value)) ? { ...value, id: identity(value) } : value);
      host.removePdfPages([...removed].filter(id => ref(id).kind === 'pdfPages').map(id => ref(id).id));
      for (const field of ['blockState', 'blockOrder']) if (document[field]) document[field] = document[field].filter(r => !removed.has(r.kind + ':' + r.id));
      if (document.groups && removed.size) document.groups = document.groups.map(g => ({ ...g, members: host.groupMembers(g).filter(r => !removed.has(r.kind + ':' + r.id)) })).filter(g => g.members.length > 1);
      diagram.mutate(() => {
        const deleting = [...removed].map(id => ids.get(id)).filter(r => r.kind === 'diagram').map(r => model.getCell(r.id)).filter(Boolean);
        if (deleting.length) graph.removeCells(deleting, false);
        for (const { before, after: e, change: c } of plan.changed.filter(p => p.after && p.after.kind !== 'connection')) {
          const r = ids.get(c.id), g = e.geometry;
          if (e.kind === 'text' || e.kind === 'image') {
            const old = document.notes.find(n => n.id === r.id), scale = old?.scale || 1;
            const note = { ...old, id: r.id };
            if (!old || c.geometry) Object.assign(note, { x: g.x, y: g.y, width: g.width / scale });
            if (e.kind === 'text') { note.markdown = e.content; note.format = e.format || 'md'; if (note.viewMode === 'window' && c.geometry) note.viewHeight = g.height / scale; }
            if (e.kind === 'image' && c.geometry && Math.abs(g.width / g.height / old.aspect - 1) > .02) throw Error('图片需保持原始比例，请重新生成尺寸修改');
            if (old) document.notes = document.notes.map(n => n.id === r.id ? note : n); else document.notes.push(note);
          } else if (e.kind === 'shape') {
            const style = e.style, mxStyle = `shape=${style.shape === 'diamond' ? 'rhombus' : style.shape === 'roundrect' ? 'rectangle' : style.shape};rounded=${style.shape === 'roundrect' ? 1 : 0};whiteSpace=wrap;html=1;fillColor=${style.fill};strokeColor=${style.stroke};strokeWidth=${style.strokeWidth};`;
            let cell = model.getCell(r.id);
            if (!cell) cell = graph.insertVertex(graph.getDefaultParent(), r.id, e.content, g.x, g.y, g.width, g.height, mxStyle);
            else { model.setValue(cell, e.content); if (c.style) model.setStyle(cell, mxStyle); const shape = cell.geometry.clone(); Object.assign(shape, { x: g.x, y: g.y, width: g.width, height: g.height }); model.setGeometry(cell, shape); }
          } else if (c.geometry) {
            const a = before.geometry, sx = g.width / a.width, sy = g.height / a.height;
            if (e.kind === 'pdf') host.updatePdfPage(r.id, { x: g.x, y: g.y, width: g.width, height: g.height });
            else document[r.kind] = document[r.kind].map(value => {
              if (value.id !== r.id) return value;
              const map = p => ({ ...p, x: g.x + (p.x - a.x) * sx, y: g.y + (p.y - a.y) * sy });
              if (e.kind === 'ink') return { ...value, points: value.points.map(map), width: value.width * Math.sqrt(sx * sy) };
              const start = map(value), end = map({ x: value.x2, y: value.y2 }); return { ...value, x: start.x, y: start.y, x2: end.x, y2: end.y };
            });
          }
        }
        for (const { after: e, change: c } of plan.changed.filter(p => p.after?.kind === 'connection')) {
          const r = ids.get(c.id), conn = e.connection;
          const source = ids.get(conn.source), target = ids.get(conn.target), style = e.style || { stroke: '#567fae', strokeWidth: 2 };
          let mxStyle = `inkspaceRoute=1;edgeStyle=none;noEdgeStyle=1;rounded=0;strokeColor=${style.stroke};strokeWidth=${style.strokeWidth};dashed=${conn.dashed ? 1 : 0};endArrow=${conn.arrow === 'none' ? 'none' : 'block'};startArrow=${conn.arrow === 'both' ? 'block' : 'none'};`;
          for (const [endpoint, side, prefix] of [[source, conn.sourceSide, 'exit'], [target, conn.targetSide, 'entry']]) {
            if (endpoint.kind === 'diagram') mxStyle += `${prefix}X=${sides[side].x};${prefix}Y=${sides[side].y};`;
            else mxStyle += `inkNote${prefix === 'exit' ? 'Source' : 'Target'}=${encodeURIComponent(endpoint.id)};inkNote${prefix === 'exit' ? 'Source' : 'Target'}Side=${side};`;
          }
          const sourceCell = source.kind === 'diagram' ? model.getCell(source.id) : null, targetCell = target.kind === 'diagram' ? model.getCell(target.id) : null;
          let cell = model.getCell(r.id);
          if (!cell) cell = graph.insertEdge(graph.getDefaultParent(), r.id, e.content, sourceCell, targetCell, mxStyle);
          else { model.setValue(cell, e.content); model.setStyle(cell, mxStyle); model.setTerminal(cell, sourceCell, true); model.setTerminal(cell, targetCell, false); }
          const g = cell.geometry.clone();
          for (const [id, side, isSource, endpoint] of [[conn.source, conn.sourceSide, true, source], [conn.target, conn.targetSide, false, target]]) if (endpoint.kind !== 'diagram') {
            const b = geometryMap.get(id), p = port({ x: b.x, y: b.y, w: b.width, h: b.height }, side); g.setTerminalPoint(new window.mxPoint(p.x, p.y), isSource);
          }
          model.setGeometry(cell, g);
        }
      });
      host.clearSelection();
    });
    if (generating) generationPages.delete(base);
    host.select(plan.changed.filter(p => p.after).map(p => ids.get(p.change.id)));
    host.reveal?.();
    return true;
  }
  return { capture, apply, revision: sceneRevision, unchanged, source };
}
