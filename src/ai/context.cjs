// Bound model context by spatial relevance, never by total notebook ink count.
const intersects = (a, b) => a && b && a.x + a.width >= b.x && a.y + a.height >= b.y && a.x <= b.x + b.width && a.y <= b.y + b.height;
function union(values) {
  if (!values.length) return null;
  const x = Math.min(...values.map(b => b.x)), y = Math.min(...values.map(b => b.y));
  return { x, y, width: Math.max(...values.map(b => b.x + b.width)) - x, height: Math.max(...values.map(b => b.y + b.height)) - y };
}
function contextFor(entities, scope, area, selectedIds) {
  const selected = new Set(selectedIds), byId = new Map(entities.map(e => [e.id, e]));
  const selectionArea = scope === 'selection' ? union(entities.filter(e => selected.has(e.id) && e.geometry).map(e => e.geometry)) : null;
  const focus = selectionArea || area, padding = Math.max(40, Math.min(focus.width, focus.height) * .15);
  const nearby = { x: focus.x - padding, y: focus.y - padding, width: focus.width + padding * 2, height: focus.height + padding * 2 };
  const included = new Set(entities.filter(e => selected.has(e.id) || intersects(e.geometry, nearby)).map(e => e.id));
  // Include incident edges and both terminals; no dangling context references.
  const edges = entities.filter(e => e.kind === 'connection');
  const anchorIds = new Set(included);
  for (const e of edges) if (included.has(e.id) || e.connection && [e.connection.source, e.connection.target].some(id => anchorIds.has(id))) {
    included.add(e.id);
    if (e.connection) for (const id of [e.connection.source, e.connection.target]) if (byId.has(id)) included.add(id);
  }
  let result = entities.filter(e => included.has(e.id)), ink = result.filter(e => e.kind === 'ink');
  let aggregatedInk = 0;
  if (ink.length > 150) {
    const chosen = ink.filter(e => selected.has(e.id));
    const keep = new Set(chosen.length <= 150 ? chosen.map(e => e.id) : []);
    const merged = ink.filter(e => !keep.has(e.id)); aggregatedInk = merged.length;
    result = result.filter(e => e.kind !== 'ink' || keep.has(e.id));
    result.push({ id: 'context:ink', kind: 'ink', geometry: union(merged.map(e => e.geometry)), editable: false, locked: true,
      content: `[${merged.length} 条笔迹，聚合为只读上下文。元数据不含正文；原稿保留，可在旁边创建识别结果。]` });
  }
  return { entities: result, aggregatedInk };
}
module.exports = { contextFor };
