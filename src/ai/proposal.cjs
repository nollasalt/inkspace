// Host-independent AI edit contract. No DOM, file access, model calls or mutations.
const kinds = ['text', 'shape', 'connection', 'image', 'pdf', 'ink', 'drawing'];
const sides = ['left', 'right', 'top', 'bottom'];
const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e7;
function fail(message) { throw Error('AI 修改无效：' + message); }
function validateProposal(value) {
  if (!value || typeof value.summary !== 'string' || typeof value.review !== 'string' || !Array.isArray(value.questions) ||
      value.questions.some(q => typeof q !== 'string') || !Array.isArray(value.changes) || value.changes.length > 200) fail('结果格式错误');
  if (JSON.stringify(value).length > 500000) fail('结果过大');
  for (const c of value.changes) {
    if (!c || !['add', 'update', 'delete'].includes(c.action) || !kinds.includes(c.kind) || typeof c.id !== 'string' || !c.id.length || c.id.length > 200 || /[\u0000-\u001f]/.test(c.id)) fail('操作或 ID 错误');
    if (c.content != null && (typeof c.content !== 'string' || c.content.length > 100000)) fail('内容过大');
    if (c.format != null && !['md', 'html'].includes(c.format)) fail('文本类型错误');
    if (c.geometry != null && (!['x', 'y', 'width', 'height'].every(k => finite(c.geometry[k])) || c.geometry.width <= 0 || c.geometry.height <= 0)) fail('尺寸错误');
    if (c.style != null && (!['rect', 'roundrect', 'ellipse', 'diamond'].includes(c.style.shape) ||
      ![c.style.fill, c.style.stroke].every(s => typeof s === 'string' && /^(#[\da-fA-F]{6}|none)$/.test(s)) ||
      !finite(c.style.strokeWidth) || c.style.strokeWidth < 0 || c.style.strokeWidth > 30)) fail('样式错误');
    if (c.connection != null && (!['source', 'target'].every(k => typeof c.connection[k] === 'string') ||
      !sides.includes(c.connection.sourceSide) || !sides.includes(c.connection.targetSide) ||
      !['none', 'forward', 'both'].includes(c.connection.arrow) || typeof c.connection.dashed !== 'boolean')) fail('连接错误');
    if (c.action !== 'delete') {
      if (c.kind === 'connection' && c.action === 'add' && !c.connection) fail('缺少连接端点');
      if (c.action === 'add' && !['text', 'shape', 'connection'].includes(c.kind)) fail('该介质需要原始资产，无法凭空创建');
      if (c.action === 'add' && c.kind !== 'connection' && !c.geometry) fail('缺少位置和尺寸');
    } else if (['content', 'format', 'geometry', 'style', 'connection'].some(k => c[k] != null)) fail('删除操作不能包含其他修改');
    if (c.format != null && c.kind !== 'text') fail('格式只能用于文本');
    if (c.style != null && !['shape', 'connection'].includes(c.kind)) fail('样式只能用于图形或连接');
    if (c.geometry && c.kind === 'connection') fail('请通过连接端点调整连线');
  }
  return value;
}
function planChanges(scene, proposal) {
  validateProposal(proposal);
  const entities = new Map(scene.entities.map(e => [e.id, e]));
  const touched = new Set(), changed = [];
  for (const c of proposal.changes) {
    if (touched.has(c.id)) fail('同一对象出现重复操作');
    touched.add(c.id);
    const prior = entities.get(c.id);
    if (c.action === 'add') {
      if (prior || !c.id.startsWith('new-')) fail('新对象须使用未占用的 new- ID');
    } else if (!prior || prior.kind !== c.kind || !prior.editable || prior.locked) fail('目标不存在、超出范围或已锁定');
    if (c.action === 'delete') { entities.delete(c.id); changed.push({ before: prior, after: null, change: c }); continue; }
    if (c.kind !== 'text' && c.kind !== 'shape' && c.kind !== 'connection' && (c.content != null || c.style || c.connection || c.format)) fail('该介质只支持位置和尺寸修改');
    if (c.kind !== 'connection' && c.connection) fail('端点只能用于连接');
    const next = { ...prior, id: c.id, kind: c.kind, editable: true, locked: false };
    for (const field of ['content', 'format', 'geometry', 'style', 'connection']) if (c[field] != null) next[field] = structuredClone(c[field]);
    if (!next.content) next.content = '';
    if (c.kind === 'text' && !next.format) next.format = 'md';
    if (c.kind === 'shape' && !next.style) next.style = { shape: 'roundrect', fill: '#ffffff', stroke: '#6e93c9', strokeWidth: 2 };
    if (c.kind === 'image' && c.geometry && prior.geometry && Math.abs(c.geometry.width / c.geometry.height / (prior.geometry.width / prior.geometry.height) - 1) > .02) fail('图片需保持原始比例');
    if (prior && JSON.stringify(prior) === JSON.stringify(next)) continue;
    entities.set(c.id, next); changed.push({ before: prior || null, after: next, change: c });
  }
  for (const e of entities.values()) if (e.kind === 'connection' && e.connection) {
    for (const id of [e.connection.source, e.connection.target]) {
      const target = entities.get(id);
      if (!target || ['connection', 'ink', 'drawing'].includes(target.kind)) fail('连接引用缺失或不支持的端点；删除块时需同时处理它的连接');
    }
  }
  return { entities: [...entities.values()], changed };
}
// Equality is deliberately exact: applying an old proposal must never overwrite new edits.
function sceneRevision(scene) { return JSON.stringify({ page: scene.page, entities: scene.entities, groups: scene.groups }); }
module.exports = { kinds, sides, validateProposal, planChanges, sceneRevision };
