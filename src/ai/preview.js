import { port, routePorts } from '../block-geometry.cjs';
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function sceneSvg(entities, host) {
  const blocks = entities.filter(e => e.geometry), bounds = blocks.map(e => e.geometry);
  if (!bounds.length) return '<p>没有可预览的图形修改。</p>';
  const x = Math.min(...bounds.map(b => b.x)) - 24, y = Math.min(...bounds.map(b => b.y)) - 24;
  const w = Math.max(...bounds.map(b => b.x + b.width)) - x + 24, h = Math.max(...bounds.map(b => b.y + b.height)) - y + 24;
  const byId = new Map(entities.map(e => [e.id, e])), obstacles = blocks.map(e => ({ x: e.geometry.x, y: e.geometry.y, w: e.geometry.width, h: e.geometry.height }));
  let lines = '', body = '';
  for (const e of entities.filter(e => e.kind === 'connection' && e.connection)) {
    const a = byId.get(e.connection.source)?.geometry, b = byId.get(e.connection.target)?.geometry;
    if (!a || !b) continue;
    const source = port({ x: a.x, y: a.y, w: a.width, h: a.height }, e.connection.sourceSide), target = port({ x: b.x, y: b.y, w: b.width, h: b.height }, e.connection.targetSide);
    const points = routePorts(source, target, 24, obstacles), middle = points[Math.floor(points.length / 2)], stroke = escape(e.style?.stroke || '#567fae');
    lines += `<path d="${points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${e.style?.strokeWidth || 2}" ${e.connection.dashed ? 'stroke-dasharray="8 5"' : ''} ${e.connection.arrow !== 'none' ? 'marker-end="url(#ai-arrow)"' : ''} ${e.connection.arrow === 'both' ? 'marker-start="url(#ai-arrow)"' : ''}/>`;
    if (e.content) lines += `<text x="${middle.x}" y="${middle.y - 6}" font-size="13" fill="#40536d">${escape(e.content)}</text>`;
  }
  for (const e of blocks) {
    const g = e.geometry, s = e.style || {}, attrs = `fill="${escape(s.fill || '#ffffff')}" stroke="${escape(s.stroke || '#ccd4df')}" stroke-width="${s.strokeWidth || 1.5}"`;
    if (['ink', 'drawing', 'image', 'pdf'].includes(e.kind)) { body += host.original(e); continue; }
    if (e.kind === 'shape') {
      if (s.shape === 'ellipse') body += `<ellipse cx="${g.x + g.width / 2}" cy="${g.y + g.height / 2}" rx="${g.width / 2}" ry="${g.height / 2}" ${attrs}/>`;
      else if (s.shape === 'diamond') body += `<path d="M${g.x + g.width / 2},${g.y}L${g.x + g.width},${g.y + g.height / 2}L${g.x + g.width / 2},${g.y + g.height}L${g.x},${g.y + g.height / 2}Z" ${attrs}/>`;
      else body += `<rect x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" rx="${s.shape === 'roundrect' ? 14 : 0}" ${attrs}/>`;
    }
    const content = e.format === 'html' ? host.html(e.content) : host.markdown(e.content);
    body += `<foreignObject x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}"><div xmlns="http://www.w3.org/1999/xhtml" class="ai-preview-content" style="${e.kind === 'shape' ? 'height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:12px;' : ''}"><div>${content}</div></div></foreignObject>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" role="img" aria-label="AI 修改后的画布结构预览"><defs><marker id="ai-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#567fae"/></marker></defs>${lines}${body}</svg>`;
}
