// Input policy shared by the webview and host. Generation never includes notebook data.
const modes = ['generate', 'data', 'visual'];
function inputMode(value = 'data') {
  if (!modes.includes(value)) throw Error('未知的 AI 输入方式');
  return value;
}
function generationScene() {
  return { version: 1, page: 'generation', scope: 'generation',
    area: { x: 0, y: 0, width: 1200, height: 900 }, insertion: { x: 0, y: 0 },
    selectedIds: [], groups: [], entities: [],
    imageDescription: '空白布局模板，不是实际笔记；本次未读取笔记或画面。' };
}
function inputInstructions(mode) {
  return {
    generate: '仅生成：只根据用户要求和本模式的对话回答或创作。场景是空白布局模板，不是实际笔记；没有读取当前笔记或画面。不要声称看过原稿。修改提案只允许新增 text/shape/connection，不能修改已有笔记；应用时由程序放到当前画布的空白位置。',
    data: '笔记数据：已提供文字源码、位置、图形与连接关系，没有附带截图。笔迹、图片和 PDF 只有位置等元数据，不能猜测其正文；需要看清这些介质时请提醒用户选择“数据＋画面”。原生文字、公式和图形直接根据结构数据理解。',
    visual: '数据＋画面：同时提供笔记结构数据和可见区域图像。结构中的正文与真实连接优先；图像用于理解笔迹、图片、PDF 等视觉内容。截图以外的视觉内容不可猜测。',
  }[inputMode(mode)];
}
function union(boxes) {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y };
}
// Local placement only, after inference: preserve the generated layout and avoid covering originals.
function placeGeneration(proposal, area, occupied) {
  const bounds = union(proposal.changes.map(c => c.geometry).filter(Boolean));
  if (!bounds) return proposal;
  const x = area.x + (area.width - bounds.width) / 2;
  let y = area.y + Math.max(24, (area.height - bounds.height) / 2);
  const candidates = occupied.filter(b => b.x < x + bounds.width + 24 && b.x + b.width + 24 > x).sort((a, b) => a.y - b.y);
  for (const b of candidates) if (b.y < y + bounds.height + 24 && b.y + b.height + 24 > y) y = b.y + b.height + 32;
  return { ...proposal, changes: proposal.changes.map(c => c.geometry ? { ...c, geometry: { ...c.geometry, x: c.geometry.x + x - bounds.x, y: c.geometry.y + y - bounds.y } } : c) };
}
module.exports = { modes, inputMode, generationScene, inputInstructions, placeGeneration };
