import { toCanvas } from 'html-to-image';
import { createCanvasAdapter } from './canvas-adapter.js';
import { planChanges } from './proposal.cjs';
import { sceneSvg } from './preview.js';
import { createPanel } from './panel.js';
const native = {
  document: () => doc, page: () => notebook.activePage, references: () => window.inkspaceBlocks.references(),
  signature: () => JSON.stringify(doc), groupMembers: g => InkBlockModel.groupMembers(doc, g),
  area: () => { const p = world(0, 0); return { x: p.x, y: p.y, width: viewport.clientWidth / view.scale, height: viewport.clientHeight / view.scale }; },
  items: kind => blockItems(kind), bounds: itemBounds,
  locked: ref => !!window.inkspaceArrangement?.state(ref)?.locked,
  diagram: () => window.inkspaceDiagram, finish: () => { window.inkspaceInlineText?.finish(); window.inkspaceDiagram?.graph?.stopEditing(false); finishInteraction(); },
  commit: (name, change) => window.inkspaceTransactions.run(name, change), clearSelection,
  removePdfPages: ids => { if (ids.length) InkBlockModel.removePages(doc, ids); }, select: refs => window.inkspaceBlocks.selectReferences(refs),
  updatePdfPage: (id, patch) => InkBlockModel.updatePage(doc, id, page => ({ ...page, ...patch })),
  reveal: () => {
    const b = selectionBounds(), a = native.area();
    if (b && (b.x + b.w < a.x || b.y + b.h < a.y || b.x > a.x + a.width || b.y > a.y + a.height)) {
      view.x = viewport.clientWidth / 2 - (b.x + b.w / 2) * view.scale;
      view.y = viewport.clientHeight / 2 - (b.y + b.h / 2) * view.scale; render(); persist();
    }
  },
};
const adapter = createCanvasAdapter(native);
const { panel, $ai, thread } = createPanel();
const button = document.createElement('button'); button.id = 'ai-toggle'; button.textContent = '✦ AI'; button.title = '理解、审查与编辑笔记';
document.querySelector('header').insertBefore(button, document.getElementById('diagram-sidebar-toggle'));
let attachment = null, profile = 'fast', activeRequest = null, proposal = null, base = null, timer, turns = [];
const inputMode = () => !attachment ? 'generate' : attachment.image ? 'visual' : 'data';
let restoreProperties = false;
function open() {
  if (panel.hidden) { restoreProperties = !document.body.classList.contains('diagram-sidebar-hidden'); if (restoreProperties) setDiagramSidebarCollapsed(true, false); }
  panel.hidden = false; button.setAttribute('aria-expanded', 'true'); $ai('ai-prompt').focus(); resize();
}
function close() {
  panel.hidden = true; button.setAttribute('aria-expanded', 'false');
  if (restoreProperties && document.body.classList.contains('diagram-sidebar-hidden')) setDiagramSidebarCollapsed(false, false);
  restoreProperties = false; resize(); viewport.focus();
}
button.setAttribute('aria-controls', panel.id); button.setAttribute('aria-expanded', 'false');
button.onclick = () => panel.hidden ? open() : close();
$ai('ai-close').onclick = close;
function status(text, error = false) { $ai('ai-status').textContent = text; $ai('ai-status').hidden = !text; $ai('ai-status').classList.toggle('error', error); }
function setBusy(busy) {
  $ai('ai-send').disabled = busy; $ai('ai-send').hidden = busy; $ai('ai-cancel').hidden = !busy; $ai('ai-apply').disabled = busy;
  $ai('ai-new').disabled = busy;
  $ai('ai-copy').disabled = busy; $ai('ai-insert').disabled = busy;
  for (const node of panel.querySelectorAll('[data-ai-attach],[data-ai-profile],#ai-remove-attachment')) node.disabled = busy;
  $ai('ai-include-image').disabled = busy || !attachment;
}
function resetConversation() {
  turns = []; proposal = null; base = null; $ai('ai-conversation').replaceChildren(); $ai('ai-review').replaceChildren(); $ai('ai-questions').replaceChildren();
  $ai('ai-current-question').hidden = true; $ai('ai-proposal').hidden = true; $ai('ai-answer-actions').hidden = true; $ai('ai-metrics').textContent = '尚未发送请求'; $ai('ai-questions').hidden = true;
}
function updateAttachment() {
  $ai('ai-attachment').hidden = !attachment;
  $ai('ai-attachment-label').textContent = attachment?.scope === 'selection' ? `选中内容 · ${attachment.ids.length} 个块` : '当前视野';
  $ai('ai-include-image').disabled = !attachment || !!activeRequest; $ai('ai-include-image').checked = !!attachment?.image;
  $ai('ai-input-help').textContent = !attachment ? '未附笔记或画面' : attachment.image ? '附带数据与画面' : '未附带画面';
  $ai('ai-input-help').title = !attachment ? '只发送你的要求和本轮对话，使用 Codex 账户额度' : '只在发送时读取附件；改变附件会开始新对话';
}
function setAttachment(value) {
  if (activeRequest || JSON.stringify(value) === JSON.stringify(attachment)) return;
  attachment = value; resetConversation(); updateAttachment(); status('');
}
for (const node of panel.querySelectorAll('[data-ai-attach]')) node.onclick = () => {
  const scope = node.dataset.aiAttach, ids = scope === 'selection' ? native.references().map(r => r.kind + ':' + r.id) : [];
  if (scope === 'selection' && !ids.length) { status('请先在画布中选中内容。', true); return; }
  setAttachment({ scope, ids, page: native.page(), image: false }); $ai('ai-attach-menu').open = false;
};
$ai('ai-remove-attachment').onclick = () => setAttachment(null);
$ai('ai-include-image').onchange = event => { if (attachment) setAttachment({ ...attachment, image: event.target.checked }); };
for (const node of panel.querySelectorAll('[data-ai-profile]')) node.onchange = () => { if (node.checked) profile = node.dataset.aiProfile; };
updateAttachment();
function original(e) {
  const value = adapter.source(e.id), g = e.geometry;
  if (!value) return '';
  if (e.kind === 'image') return `<image x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" href="${InkContent.escape(value.src)}"/>`;
  if (e.kind === 'ink') { const b = itemBounds('strokes', value), sx = g.width / b.w, sy = g.height / b.h; return `<path transform="translate(${g.x} ${g.y}) scale(${sx} ${sy}) translate(${-b.x} ${-b.y})" d="${cachedStroke(value).d}" fill="${InkContent.escape(value.color)}"/>`; }
  return `<rect x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" fill="#f3f5f7" stroke="#c7cfd9"/><text x="${g.x + 8}" y="${g.y + 20}" fill="#6c7787" font-size="13">${e.kind === 'pdf' ? 'PDF 原稿保留' : '手绘原稿保留'}</text>`;
}
function showProposal(result, scene) {
  const planned = planChanges(scene, result.result); proposal = result.result; base = scene;
  $ai('ai-summary').textContent = proposal.summary;
  $ai('ai-review').innerHTML = InkContent.markdown(proposal.review || '');
  $ai('ai-questions').replaceChildren(...proposal.questions.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  $ai('ai-questions').hidden = !proposal.questions.length;
  $ai('ai-changes').replaceChildren(...planned.changed.map(({ change, before, after }) => { const li = document.createElement('li'); li.textContent = `${{ add: '新增', update: '修改', delete: '删除' }[change.action]} · ${change.kind} · ${(after?.content || before?.content || change.id).slice(0, 70)}`; return li; }));
  const previewIds = new Set(planned.changed.flatMap(p => [p.before?.id, p.after?.id]).filter(Boolean));
  const entities = planned.entities.filter(e => e.editable || previewIds.has(e.id) || e.kind === 'connection');
  const needed = new Set(entities.filter(e => e.connection).flatMap(e => [e.connection.source, e.connection.target]));
  for (const e of planned.entities) if (needed.has(e.id) && !entities.includes(e)) entities.push(e);
  $ai('ai-preview').innerHTML = sceneSvg(entities, { markdown: InkContent.markdown, html: InkContent.html, original });
  $ai('ai-proposal').hidden = !planned.changed.length;
  $ai('ai-answer-actions').hidden = !!planned.changed.length || !proposal.review;
  $ai('ai-insert').hidden = !!planned.changed.length;
  $ai('ai-insert').disabled = false;
  (planned.changed.length ? $ai('ai-apply').parentElement : $ai('ai-answer-actions')).append($ai('ai-copy'));
  $ai('ai-apply').disabled = false;
  $ai('ai-apply').textContent = planned.changed.every(p => p.change.action === 'add') ? '插入画布' : '应用修改';
  $ai('ai-metrics').textContent = `${result.model} · ${result.reasoningEffort} · ${(result.elapsedMs / 1000).toFixed(2)} s${result.usage ? ` · 输入 ${result.usage.input_tokens} / 输出 ${result.usage.output_tokens} tokens` : ''}`;
  status('');
}
async function snapshot(scene) {
  const filter = node => !node.matches?.('#selection,.media-action-strip,.media-hover-controls,.hint,.zoom,#pen-cursor,.diagram-preview,.diagram-selection-layer');
  await document.fonts.ready;
  const canvas = await toCanvas(viewport, { pixelRatio: 1, cacheBust: false, backgroundColor: '#ffffff', filter });
  let output = canvas;
  if (scene.scope === 'selection') {
    const bounds = scene.entities.filter(e => scene.selectedIds.includes(e.id) && e.geometry).map(e => e.geometry);
    if (bounds.length) {
      const x = Math.max(scene.area.x, Math.min(...bounds.map(b => b.x)) - 12 / view.scale), y = Math.max(scene.area.y, Math.min(...bounds.map(b => b.y)) - 12 / view.scale);
      const right = Math.min(scene.area.x + scene.area.width, Math.max(...bounds.map(b => b.x + b.width)) + 12 / view.scale);
      const bottom = Math.min(scene.area.y + scene.area.height, Math.max(...bounds.map(b => b.y + b.height)) + 12 / view.scale);
      if (right <= x || bottom <= y) throw Error('选中内容不在视野中，请先移到该内容');
      const area = { x, y, width: right - x, height: bottom - y }, sx = canvas.width / scene.area.width, sy = canvas.height / scene.area.height;
      output = document.createElement('canvas'); output.width = Math.max(1, Math.ceil(area.width * sx)); output.height = Math.max(1, Math.ceil(area.height * sy));
      output.getContext('2d').drawImage(canvas, (x - scene.area.x) * sx, (y - scene.area.y) * sy, area.width * sx, area.height * sy, 0, 0, output.width, output.height);
      scene.imageArea = area;
    }
  }
  const png = output.toDataURL('image/png');
  if (png.length > 16 * 1024 * 1024) throw Error('当前视野截图过大，请缩小范围');
  scene.imageArea ||= { ...scene.area };
  scene.imageDescription = '图像仅覆盖 imageArea 世界坐标区域。看不清的笔迹、连线请标明疑问；范围外的笔迹/图片/PDF 不应猜测。';
  return png;
}
function archive() {
  if (!proposal) return;
  const node = document.createElement('article'); node.className = 'ai-turn';
  const prompt = document.createElement('p'); prompt.className = 'ai-user'; prompt.textContent = turns.at(-2)?.text || '';
  const answer = document.createElement('div'); answer.className = 'ai-markdown'; answer.innerHTML = InkContent.markdown(proposal.review || proposal.summary);
  node.append(prompt, answer); $ai('ai-conversation').append(node);
  while ($ai('ai-conversation').children.length > 4) $ai('ai-conversation').firstElementChild.remove();
  $ai('ai-review').replaceChildren(); $ai('ai-questions').replaceChildren(); $ai('ai-metrics').textContent = '';
  $ai('ai-current-question').hidden = true;
  $ai('ai-answer-actions').hidden = true;
  proposal = null; base = null;
}
function contextTurns() {
  const context = turns.slice(-10).map(t => ({ ...t }));
  while (context.length && JSON.stringify(context).length > 30000) context.splice(0, 2);
  return context;
}
async function send() {
  if (activeRequest) return;
  const prompt = $ai('ai-prompt').value.trim(); if (!prompt) { $ai('ai-prompt').focus(); return; }
  if (!window.inkspaceAIHost) { status('AI 需要在普通 VS Code 插件中运行。', true); return; }
  archive();
  $ai('ai-current-question').textContent = prompt; $ai('ai-current-question').hidden = false;
  const id = crypto.randomUUID(); activeRequest = id; setBusy(true); $ai('ai-proposal').hidden = true;
  const mode = inputMode();
  const started = performance.now(); status('正在思考…');
  const requestTimer = timer = setInterval(() => status(`正在思考 · ${((performance.now() - started) / 1000).toFixed(0)} s`), 500);
  try {
    if (attachment && attachment.page !== native.page()) throw Error('画布已切换，请重新添加笔记内容。');
    if (mode !== 'generate') native.finish();
    const scene = adapter.capture(attachment?.scope || 'generation', undefined, attachment?.scope === 'selection' ? attachment.ids : undefined);
    if (attachment?.scope === 'selection' && attachment.ids.some(id => !scene.entities.some(e => e.id === id))) throw Error('附件中的块已删除，请重新选择并添加。');
    let image;
    if (mode === 'visual') {
      const captureView = { ...view }; image = await snapshot(scene);
      if (!adapter.unchanged(scene) || JSON.stringify(captureView) !== JSON.stringify(view)) throw Error('截图期间笔记或视野已变化，请重新发送');
    }
    if (activeRequest !== id) return;
    const result = await window.inkspaceAIHost.request({ id, prompt, profile, inputMode: mode, scene, ...(image ? { image } : {}), conversation: contextTurns() });
    if (activeRequest !== id) return;
    showProposal(result, scene);
    turns.push({ role: 'user', text: prompt }, { role: 'assistant', text: result.result.review + '\n' + result.result.summary + (result.result.changes.length ? '\n[修改提案尚未应用]' : '') });
    turns = turns.slice(-12); if ($ai('ai-prompt').value.trim() === prompt) $ai('ai-prompt').value = '';
    thread.scrollTop = $ai('ai-current-question').offsetTop - thread.offsetTop;
  } catch (error) { if (activeRequest === id) status(error.message, true); }
  finally { clearInterval(requestTimer); if (activeRequest === id) { activeRequest = null; setBusy(false); } }
}
$ai('ai-send').onclick = send;
$ai('ai-prompt').onkeydown = event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); send(); } };
$ai('ai-cancel').onclick = () => { if (activeRequest) window.inkspaceAIHost?.cancel(activeRequest); activeRequest = null; clearInterval(timer); setBusy(false); status('已取消。笔记未修改。'); };
$ai('ai-discard').onclick = () => { if (turns.at(-1)) turns.at(-1).text += '\n[用户已放弃修改提案]'; $ai('ai-proposal').hidden = true; $ai('ai-answer-actions').append($ai('ai-copy')); $ai('ai-answer-actions').hidden = !proposal?.review; status('已放弃修改。'); };
$ai('ai-new').onclick = () => { resetConversation(); attachment = null; updateAttachment(); status(''); $ai('ai-prompt').focus(); };
$ai('ai-copy').onclick = async () => { try { await window.inkspaceAIHost.request({ id: crypto.randomUUID(), type: 'ai-copy', text: proposal.review }); status('已复制 Markdown 回答。'); } catch (error) { status(error.message, true); } };
$ai('ai-insert').onclick = () => {
  try {
    const scene = adapter.capture('generation'), width = Math.min(560, native.area().width * .8);
    adapter.apply(scene, { summary: 'AI 回答写入画布', review: '', questions: [], changes: [{ action: 'add', kind: 'text', id: 'new-answer', content: proposal.review, format: 'md', geometry: { x: 0, y: 0, width, height: 200 }, style: null, connection: null }] });
    $ai('ai-insert').disabled = true; status('回答已添加为可编辑文本，可按 Ctrl+Z 撤销。'); viewport.focus();
    if (turns.at(-1)) turns.at(-1).text += '\n[用户已将回答添加为画布文本]';
  } catch (error) { status(error.message, true); }
};
$ai('ai-apply').onclick = () => {
  try { if (!proposal || !base) return; adapter.apply(base, proposal); if (turns.at(-1)) turns.at(-1).text = turns.at(-1).text.replace('[修改提案尚未应用]', '[用户已应用提案；以最新画布为准]'); $ai('ai-proposal').hidden = true; $ai('ai-apply').disabled = true; $ai('ai-answer-actions').append($ai('ai-copy')); $ai('ai-answer-actions').hidden = !proposal.review; status('已应用，可按 Ctrl+Z 撤销。'); viewport.focus(); }
  catch (error) { $ai('ai-apply').disabled = true; status(error.message, true); }
};
window.inkspaceAI = { open, adapter, showProposal, snapshot };
window.inkspaceCommands?.register('ai', { label: 'AI…', run: open });
