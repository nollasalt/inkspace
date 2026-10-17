import { xournalStrokePath } from '../../src/xournal-contour.js';
import { markdown, formula } from '../../src/content.js';
import { validateResult, characterErrorRate, clipStrokes } from './model.cjs';
import { profiles, resolveProfile } from './codex-models.cjs';
const $ = id => document.getElementById(id), api = window.recognitionDemo;
const WIDTH = 1200, HEIGHT = 800, canvas = $('ink'), overlay = $('overlay'), ctx = canvas.getContext('2d'), over = overlay.getContext('2d');
let ink = [], current = null, tool = 'write', selection = null, selectionStart = null, pointer = null;
let sourceImage = null, sourcePlacement = null, revision = 0, busy = false, connection = null;
let response = null, responseRevision = -1, originalTranscription = '', correctionActions = 0, snapshot = null;
const runs = [];
let profileId = 'fast';
try { const saved = localStorage.getItem('codex-profile'); if (Object.hasOwn(profiles, saved)) profileId = saved; } catch {}
function showProfile() {
  const profile = resolveProfile(profileId);
  $('model-hint').textContent = `${profile.model} · ${profile.reasoningEffort}`;
  for (const button of document.querySelectorAll('[data-profile]')) { button.setAttribute('aria-pressed', button.dataset.profile === profileId); button.disabled = busy; }
}
function message(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function dirty() { revision++; if (response && revision !== responseRevision) { $('save').disabled = true; message('输入已变化。右侧保留上次结果，请重新识别当前选区。'); } }
function updateButtons() {
  showProfile();
  const hasContent = ink.length > 0 || !!sourceImage;
  $('codex').disabled = busy || !connection?.codex || !hasContent || !!current;
  $('windows').disabled = busy || !!sourceImage || !ink.length || !$('recognizer').value || !!current;
  $('cancel').hidden = !busy;
  for (const id of ['open', 'paste', 'clear', 'undo', 'clear-selection', 'copy']) $(id).disabled = busy || (['undo'].includes(id) && !ink.length);
  $('sample-count').textContent = `${ink.length} 笔 · ${ink.reduce((sum, s) => sum + s.points.length, 0)} 采样点`;
  $('empty').hidden = hasContent || !!current;
}
function drawStroke(stroke) { const d = xournalStrokePath(stroke); if (d) { ctx.fillStyle = '#22252c'; ctx.fill(new Path2D(d)); } }
function redraw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (sourceImage) { const p = sourcePlacement; ctx.drawImage(sourceImage, p.x, p.y, p.width, p.height); }
  for (const s of ink) drawStroke(s);
  if (current) drawStroke(current);
  drawSelection(); updateButtons();
}
function drawSelection() {
  over.clearRect(0, 0, WIDTH, HEIGHT);
  if (!selection) return;
  over.fillStyle = '#246bcb0c'; over.fillRect(selection.x, selection.y, selection.width, selection.height);
  over.strokeStyle = '#4b83ce'; over.lineWidth = 2; over.setLineDash([7, 5]);
  over.strokeRect(selection.x, selection.y, selection.width, selection.height); over.setLineDash([]);
}
function local(event) {
  const rect = overlay.getBoundingClientRect();
  return { x: Math.max(0, Math.min(WIDTH, (event.clientX - rect.left) * WIDTH / rect.width)),
    y: Math.max(0, Math.min(HEIGHT, (event.clientY - rect.top) * HEIGHT / rect.height)),
    p: event.pointerType === 'pen' ? Math.max(.12, event.pressure || .45) : 1, t: event.timeStamp };
}
function segment(a, b) {
  ctx.strokeStyle = '#22252c'; ctx.lineWidth = 3.6 * (a.p + b.p) / 2; ctx.lineCap = ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}
function samples(event) {
  const values = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
  const batch = values.length ? values : [event];
  for (const e of batch) {
    const p = local(e), previous = current.points.at(-1);
    if (previous && p.x === previous.x && p.y === previous.y && p.t === previous.t) continue;
    current.points.push(p); if (previous) segment(previous, p);
  }
}
overlay.addEventListener('pointerdown', event => {
  if (busy || pointer !== null || event.button !== 0 || !['pen', 'mouse'].includes(event.pointerType)) return;
  event.preventDefault(); pointer = event.pointerId; overlay.setPointerCapture(pointer);
  const p = local(event);
  if (tool === 'select') { selectionStart = p; selection = { x: p.x, y: p.y, width: 0, height: 0 }; drawSelection(); }
  else { current = { width: 3.6, points: [p], hasPressure: event.pointerType === 'pen' }; ctx.fillStyle = '#22252c'; ctx.beginPath(); ctx.arc(p.x, p.y, 1.8 * p.p, 0, Math.PI * 2); ctx.fill(); }
  updateButtons();
});
overlay.addEventListener('pointermove', event => {
  if (event.pointerId !== pointer) return;
  event.preventDefault();
  if (selectionStart) { const p = local(event); selection = { x: Math.min(p.x, selectionStart.x), y: Math.min(p.y, selectionStart.y), width: Math.abs(p.x - selectionStart.x), height: Math.abs(p.y - selectionStart.y) }; drawSelection(); }
  else if (current) samples(event);
});
function finish(event) {
  if (pointer === null || (event && event.pointerId !== pointer)) return;
  const id = pointer; pointer = null;
  if (current) { if (event?.type === 'pointerup') samples(event); ink.push(current); current = null; dirty(); }
  if (selectionStart) { selectionStart = null; if (selection.width < 5 || selection.height < 5) selection = null; dirty(); }
  if (overlay.hasPointerCapture(id)) overlay.releasePointerCapture(id);
  redraw();
}
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) overlay.addEventListener(name, finish);
overlay.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('blur', () => finish());
function selectTool(next) { finish(); tool = next; $('write').setAttribute('aria-pressed', next === 'write'); $('select').setAttribute('aria-pressed', next === 'select'); }
$('write').onclick = () => selectTool('write'); $('select').onclick = () => selectTool('select');
$('undo').onclick = () => { finish(); if (ink.length) { ink.pop(); dirty(); redraw(); } };
$('clear-selection').onclick = () => { selection = null; dirty(); drawSelection(); };
$('clear').onclick = () => { finish(); ink = []; sourceImage = null; selection = null; dirty(); redraw(); };
function region() {
  if (selection) return { ...selection };
  if (sourceImage) return { ...sourcePlacement };
  if (!ink.length) throw Error('请先书写或导入图片');
  let minX = WIDTH, minY = HEIGHT, maxX = 0, maxY = 0;
  for (const s of ink) for (const p of s.points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const x = Math.max(0, minX - 24), y = Math.max(0, minY - 24);
  return { x, y, width: Math.max(2, Math.min(WIDTH, maxX + 24) - x), height: Math.max(2, Math.min(HEIGHT, maxY + 24) - y) };
}
function exportRegion() {
  finish(); const rect = region(), image = document.createElement('canvas');
  const scale = Math.min(Math.max(2, sourceImage ? 1 / (sourcePlacement.width / sourceImage.naturalWidth) : 2), 2560 / Math.max(rect.width, rect.height));
  image.width = Math.max(2, Math.round(rect.width * scale)); image.height = Math.max(2, Math.round(rect.height * scale));
  const target = image.getContext('2d'); target.fillStyle = 'white'; target.fillRect(0, 0, image.width, image.height);
  target.translate(-rect.x * scale, -rect.y * scale); target.scale(scale, scale);
  if (sourceImage) { const p = sourcePlacement; target.drawImage(sourceImage, p.x, p.y, p.width, p.height); }
  for (const s of ink) { const d = xournalStrokePath(s); if (d) { target.fillStyle = '#22252c'; target.fill(new Path2D(d)); } }
  return { png: image.toDataURL('image/png'), strokes: clipStrokes(ink, rect), rect };
}
async function importImage(url) {
  if (!url) return;
  const img = new Image(); img.src = url; await img.decode();
  if (img.naturalWidth * img.naturalHeight > 24000000) throw Error('请使用较小的截图或图片');
  const scale = Math.min((WIDTH - 40) / img.naturalWidth, (HEIGHT - 40) / img.naturalHeight);
  sourcePlacement = { x: (WIDTH - img.naturalWidth * scale) / 2, y: (HEIGHT - img.naturalHeight * scale) / 2, width: img.naturalWidth * scale, height: img.naturalHeight * scale };
  sourceImage = img; ink = []; selection = null; dirty(); redraw();
}
async function safe(operation) { try { await operation(); } catch (error) { message(error.message, true); } }
$('open').onclick = () => safe(async () => importImage(await api.openImage()));
$('paste').onclick = () => safe(async () => { const png = await api.pasteImage(); if (!png) throw Error('剪贴板中没有图片'); await importImage(png); });
$('copy').onclick = () => safe(async () => { await api.copyImage(exportRegion().png); message('选区图片已复制，可以直接粘贴到当前 Codex 对话中测试。'); });
window.addEventListener('paste', event => { if (!busy && !['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName)) { event.preventDefault(); $('paste').click(); } });
window.addEventListener('keydown', event => {
  if (['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (event.key === 'Escape') { finish(); if (selection) { selection = null; dirty(); } drawSelection(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !busy) { event.preventDefault(); $('undo').click(); }
});
function renderScore() {
  const reference = $('reference').value;
  if (!response || !reference) { $('score').textContent = '填写后显示原始识别结果的字符编辑距离；不代表公式等价性或关系识别准确率。'; return; }
  try { const score = characterErrorRate(reference, originalTranscription); $('score').textContent = `原始转写：${score.edits} 次字符编辑 / ${score.referenceCharacters} 字符，CER ${(score.rate * 100).toFixed(1)}%。含空格与标点；公式排版源码不同也会计入。`; }
  catch (error) { $('score').textContent = error.message; }
}
function renderStructure() {
  const value = response.result; $('node-list').replaceChildren(); $('edge-list').replaceChildren(); $('regions').replaceChildren();
  for (const node of value.nodes) {
    const card = document.createElement('div'); card.className = 'node-card';
    const label = document.createElement('span'); label.textContent = `${node.id} · ${node.kind === 'math' ? '公式' : '文字'}`;
    const body = document.createElement('div'); body.className = 'markdown'; body.innerHTML = node.kind === 'math' ? formula(node.content, true) : markdown(node.content);
    card.append(label, body); $('node-list').append(card);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    for (const [key, position] of ['x', 'y', 'width', 'height'].map((k, i) => [k, node.bounds[i] * 1000])) rect.setAttribute(key, position);
    rect.setAttribute('fill', '#3679cd10'); rect.setAttribute('stroke', '#3679cd'); rect.setAttribute('stroke-width', '2'); $('regions').append(rect);
  }
  for (const edge of value.edges) {
    const row = document.createElement('div'); row.className = 'edge-row';
    row.textContent = `${edge.from} ${edge.relation === 'arrow' ? '→' : '—'} ${edge.to}${edge.label ? ' · ' + edge.label : ''}（${({ branch: '分支', arrow: '箭头', association: '关联', unknown: '待确认' })[edge.relation]}）`; $('edge-list').append(row);
  }
  if (!value.edges.length) $('edge-list').textContent = '未识别到连线。';
  $('structure-json').value = JSON.stringify(value, null, 2);
  const list = $('uncertainties').querySelector('ul'); list.replaceChildren();
  for (const text of value.uncertainties) { const item = document.createElement('li'); item.textContent = text; list.append(item); }
  $('uncertainties').hidden = !value.uncertainties.length;
}
function renderMetrics() {
  const provider = response.provider === 'codex' ? `Codex · ${response.model || '旧版未记录模型'} · ${response.reasoningEffort || '默认推理'}` : response.recognizer;
  const usage = response.usage ? ` · 输入 ${response.usage.input_tokens} / 输出 ${response.usage.output_tokens} tokens` : '';
  $('metrics').textContent = `${provider} · 总等待 ${(response.elapsedMs / 1000).toFixed(2)} s${response.engineMs !== null ? ' · 引擎 ' + Math.round(response.engineMs) + ' ms' : ''}${usage} · ${response.result.nodes.length} 节点 · ${response.result.edges.length} 连线 · ${correctionActions} 次纠错操作`;
}
function renderResponse() {
  $('transcript').value = response.result.markdown; $('preview').innerHTML = markdown(response.result.markdown);
  renderStructure(); renderScore(); $('snapshot').src = snapshot;
  renderMetrics();
  $('alternatives').replaceChildren();
  for (const alt of response.alternatives) {
    const button = document.createElement('button'); button.textContent = alt;
    button.onclick = () => { response.result.markdown = alt; if (response.result.nodes.length === 1) response.result.nodes[0].content = alt; correctionActions++; renderResponse(); };
    $('alternatives').append(button);
  }
  $('save').disabled = busy || revision !== responseRevision;
}
async function recognize(provider) {
  if (busy) return;
  const sample = exportRegion(), sampleRevision = revision, requestedProfile = profileId;
  busy = true; updateButtons(); $('save').disabled = true;
  const started = performance.now(), timer = setInterval(() => message(`正在${provider === 'codex' ? '调用 ' + resolveProfile(requestedProfile).model : '本地识别'}… ${((performance.now() - started) / 1000).toFixed(0)} s`), 500);
  message(provider === 'codex' ? '正在将选区图片交给 Codex，识别期间可以取消。' : '正在调用 Windows 手写识别器…');
  try {
    const result = await api.recognize({ provider, profile: requestedProfile, png: sample.png, strokes: sample.strokes, recognizer: $('recognizer').value });
    validateResult(result.result); response = result; snapshot = sample.png; responseRevision = sampleRevision;
    originalTranscription = result.result.markdown; correctionActions = 0;
    runs.push({ provider, model: result.model, reasoningEffort: result.reasoningEffort, elapsedMs: result.elapsedMs, markdown: originalTranscription, revision: sampleRevision });
    $('run-history').replaceChildren();
    for (const run of runs.slice(-8)) { const row = document.createElement('div'); row.textContent = `${run.model || run.provider}${run.reasoningEffort ? ' · ' + run.reasoningEffort : ''} · ${(run.elapsedMs / 1000).toFixed(2)} s · 样本版本 ${run.revision} · ${Array.from(run.markdown).length} 字符`; $('run-history').append(row); }
    renderResponse(); message('识别完成。请核对公式符号、箭头方向和不确定项，再保存确认结果。');
  } catch (error) { message(error.message.replace(/^Error invoking remote method '[^']+': Error: /, ''), true); }
  finally { clearInterval(timer); busy = false; updateButtons(); $('save').disabled = !response || revision !== responseRevision; }
}
$('codex').onclick = () => safe(() => recognize('codex')); $('windows').onclick = () => safe(() => recognize('windows'));
for (const button of document.querySelectorAll('[data-profile]')) button.onclick = () => {
  if (busy) return;
  profileId = button.dataset.profile;
  try { localStorage.setItem('codex-profile', profileId); } catch {}
  showProfile();
};
$('cancel').onclick = () => safe(() => api.cancel());
$('recognizer').onchange = updateButtons; $('reference').addEventListener('input', renderScore);
$('transcript').addEventListener('input', () => { if (!response) return; response.result.markdown = $('transcript').value; correctionActions++; $('preview').innerHTML = markdown(response.result.markdown); renderMetrics(); });
$('apply-structure').onclick = () => safe(async () => {
  if (!response) throw Error('请先识别内容');
  response.result = validateResult(JSON.parse($('structure-json').value)); correctionActions++; renderResponse(); message('结构修改已应用到候选结果。');
});
$('save').onclick = () => safe(async () => {
  if (!response || responseRevision !== revision) throw Error('请重新识别当前输入');
  const saved = await api.save({ ...response, reference: $('reference').value, originalTranscription, correctionActions });
  if (saved) message('确认结果已保存，不含原始笔迹：' + saved);
});
for (const button of document.querySelectorAll('[data-tab]')) button.onclick = () => {
  for (const other of document.querySelectorAll('[data-tab]')) { const active = other === button; other.setAttribute('aria-pressed', active); $(other.dataset.tab).hidden = !active; }
};
async function initialize() {
  redraw();
  try {
    connection = await api.status();
    $('connection').textContent = `${connection.codex ? 'Codex 已登录' : 'Codex 未就绪'} · Windows ${connection.recognizers.length} 个文字识别器`;
    for (const name of connection.recognizers) { const option = document.createElement('option'); option.value = option.textContent = name; $('recognizer').append(option); }
    const chinese = connection.recognizers.find(n => /中文|Chinese/i.test(n)); if (chinese) $('recognizer').value = chinese;
    if (!connection.codex) message('Codex 未就绪。可以先复制选区图片到当前对话，或使用 Windows 本地文字识别。' + connection.codexMessage, true);
    updateButtons();
  } catch (error) { message(error.message, true); }
}
initialize();
// Read-only test hooks; no production editor globals or notebook mutations.
window.inkspaceRecognitionTest = {
  exportRegion, importImage, recognize, state: () => ({ ink: JSON.parse(JSON.stringify(ink)), selection, revision, busy, response, connection }),
  setFixture(strokes) { finish(); ink = JSON.parse(JSON.stringify(strokes)); selection = null; sourceImage = null; dirty(); redraw(); },
};
