// Recognition results are proposals. No provider may modify the notebook.
const MAX_ITEMS = 200;
function validateResult(value) {
  if (!value || typeof value.markdown !== 'string' || !Array.isArray(value.nodes) ||
      !Array.isArray(value.edges) || !Array.isArray(value.uncertainties)) throw Error('识别结果格式无效');
  if (value.nodes.length > MAX_ITEMS || value.edges.length > MAX_ITEMS || value.markdown.length > 100000) throw Error('识别结果过大');
  const ids = new Set();
  for (const n of value.nodes) {
    if (!n || typeof n.id !== 'string' || !n.id || ids.has(n.id) || !['text', 'math'].includes(n.kind) ||
        typeof n.content !== 'string' || !Array.isArray(n.bounds) || n.bounds.length !== 4 ||
        !n.bounds.every(Number.isFinite) || n.bounds.some(v => v < 0 || v > 1) ||
        n.bounds[2] <= 0 || n.bounds[3] <= 0 || n.bounds[0] + n.bounds[2] > 1.001 || n.bounds[1] + n.bounds[3] > 1.001) throw Error('节点或位置数据无效');
    ids.add(n.id);
  }
  for (const e of value.edges) {
    if (!e || !ids.has(e.from) || !ids.has(e.to) || typeof e.label !== 'string' ||
        !['branch', 'arrow', 'association', 'unknown'].includes(e.relation)) throw Error('连线引用了无效节点');
  }
  if (!value.uncertainties.every(v => typeof v === 'string')) throw Error('不确定项格式无效');
  return value;
}
// Unicode code points, including punctuation and whitespace. The UI states this
// is a literal transcription metric, not mathematical equivalence or accuracy.
function characterErrorRate(expected, actual) {
  const a = Array.from(expected.normalize('NFC')), b = Array.from(actual.normalize('NFC'));
  if (!a.length) return null;
  if (a.length > 5000 || b.length > 5000) throw Error('对照文本过长');
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return { edits: row[b.length], referenceCharacters: a.length, rate: row[b.length] / a.length };
}
function acceptedDocument(result) {
  validateResult(result);
  return JSON.parse(JSON.stringify({ format: 'inkspace-recognition-proposal', version: 1,
    markdown: result.markdown, nodes: result.nodes, edges: result.edges, uncertainties: result.uncertainties }));
}
function clipStrokes(strokes, rect) {
  const inside = p => p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
  const output = [];
  for (const stroke of strokes) {
    if (stroke.points.length === 1) { if (inside(stroke.points[0])) output.push({ ...stroke, points: [{ ...stroke.points[0] }] }); continue; }
    let fragment = [];
    const finish = () => { if (fragment.length) output.push({ ...stroke, points: fragment }); fragment = []; };
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1], b = stroke.points[i], dx = b.x - a.x, dy = b.y - a.y;
      let start = 0, end = 1, visible = true;
      for (const [p, q] of [[-dx, a.x - rect.x], [dx, rect.x + rect.width - a.x], [-dy, a.y - rect.y], [dy, rect.y + rect.height - a.y]]) {
        if (p === 0) { if (q < 0) visible = false; continue; }
        const ratio = q / p;
        if (p < 0) start = Math.max(start, ratio); else end = Math.min(end, ratio);
      }
      if (!visible || start > end) { finish(); continue; }
      const point = t => ({ ...a, x: a.x + dx * t, y: a.y + dy * t, p: (a.p ?? 1) + ((b.p ?? 1) - (a.p ?? 1)) * t });
      const first = point(start), last = point(end), previous = fragment.at(-1);
      if (previous && Math.hypot(previous.x - first.x, previous.y - first.y) > 1e-6) finish();
      if (!fragment.length) fragment.push(first);
      fragment.push(last);
      if (end < 1) finish();
    }
    finish();
  }
  return output;
}
module.exports = { validateResult, characterErrorRate, acceptedDocument, clipStrokes };
