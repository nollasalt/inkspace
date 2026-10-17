const assert = require('node:assert/strict');
const { validateProposal, planChanges, sceneRevision } = require('../src/ai/proposal.cjs');
const { structuredArgs, run } = require('../ai/codex-client.cjs');
const { edit } = require('../vscode/ai-host.cjs');
const fs = require('node:fs');
const { generationScene, inputMode, placeGeneration } = require('../src/ai/input.cjs');
const geometry = { x: 0, y: 0, width: 240, height: 120 };
const node = (id, extra = {}) => ({ id, kind: 'text', editable: true, locked: false, geometry, content: 'Original', format: 'md', ...extra });
const scene = { page: 'p1', entities: [node('notes:a'), node('notes:b', { locked: true, editable: false }), node('notes:c', { editable: false })] };
const change = extra => ({ action: 'update', kind: 'text', id: 'notes:a', content: 'Updated', format: null, geometry: null, style: null, connection: null, ...extra });
const proposal = changes => ({ summary: 'Summary', review: '**Answer**', questions: [], changes });
const before = JSON.stringify(scene);
const { contextFor } = require('../src/ai/context.cjs');
const dense = Array.from({ length: 2000 }, (_, i) => ({ id: 'strokes:' + i, kind: 'ink', geometry: { x: i < 1000 ? 0 : 10000, y: 0, width: 100, height: 100 }, editable: true }));
const compressed = contextFor([...dense, ...scene.entities], 'view', { x: 0, y: 0, width: 600, height: 400 }, []);
assert.equal(compressed.aggregatedInk, 1000); assert.equal(compressed.entities.filter(e => e.kind === 'ink').length, 1); assert(!compressed.entities.at(-1).editable);
const partial = contextFor(dense, 'selection', { x: 0, y: 0, width: 600, height: 400 }, ['strokes:0']);
assert(partial.entities.some(e => e.id === 'strokes:0')); assert(!partial.entities.some(e => e.id === 'strokes:1999'));
const planned = planChanges(scene, proposal([change()]));
assert.equal(planned.entities[0].content, 'Updated');
assert.equal(JSON.stringify(scene), before, 'planning must be pure');
assert.equal(planChanges(scene, proposal([])).changed.length, 0);
assert.equal(planChanges(scene, proposal([change({ content: null })])).changed.length, 0);
for (const id of ['notes:b', 'notes:c', 'missing']) assert.throws(() => planChanges(scene, proposal([change({ id })])), /超出范围/);
assert.throws(() => planChanges(scene, proposal([change(), change()])), /重复/);
assert.throws(() => planChanges(scene, proposal([change({ action: 'add' })])), /缺少位置/);
assert.throws(() => validateProposal(proposal([change({ geometry: { ...geometry, width: Infinity } })])), /尺寸/);
assert.throws(() => validateProposal(proposal([change({ action: 'delete' })])), /删除/);
assert.throws(() => validateProposal(proposal([change({ style: { shape: 'rect', fill: '#ffffff', stroke: '#000000', strokeWidth: 1 } })])), /样式/);
assert.throws(() => validateProposal(proposal([change({ kind: 'shape', format: 'md' })])), /格式/);
const connection = { source: 'notes:a', target: 'new-shape', sourceSide: 'right', targetSide: 'left', arrow: 'forward', dashed: true };
const created = proposal([
  change({ action: 'add', kind: 'shape', id: 'new-shape', geometry }),
  change({ action: 'add', kind: 'connection', id: 'new-link', content: 'Link', connection }),
]);
assert.equal(planChanges(scene, created).entities.at(-1).connection.target, 'new-shape');
assert.throws(() => planChanges(scene, proposal([created.changes[1]])), /端点/);
const withConnection = { ...scene, entities: planChanges(scene, created).entities };
assert.throws(() => planChanges(withConnection, proposal([change({ action: 'delete', content: null })])), /连接引用/);
assert.equal(planChanges(withConnection, proposal([change({ action: 'delete', content: null }), change({ action: 'delete', kind: 'connection', id: 'new-link', content: null })])).changed.length, 2);
assert.notEqual(sceneRevision(scene), sceneRevision({ ...scene, groups: [{ id: 'g', members: [] }] }));
const args = structuredArgs({ profileId: 'fast', jobDirectory: 'temp', schemaPath: 'schema', instructionsFile: 'instructions', images: ['view.png'] });
assert.equal(args[args.indexOf('--model') + 1], 'gpt-6-luna');
assert(args.includes('--ignore-user-config') && args.includes('--ephemeral'));
assert(args.includes('web_search="disabled"') && args.includes('read-only'));
assert.equal(inputMode(), 'data'); assert.throws(() => inputMode('auto'), /输入方式/);
const fresh = generationScene();
const generated = proposal([
  change({ action: 'add', id: 'new-a', geometry, content: 'Generated' }),
  change({ action: 'add', id: 'new-b', geometry: { ...geometry, x: 300 }, content: 'Second' }),
  change({ action: 'add', kind: 'connection', id: 'new-line', content: '', connection: { ...connection, source: 'new-a', target: 'new-b' } }),
]);
const positioned = placeGeneration(generated, { x: 100, y: 100, width: 800, height: 600 }, [{ x: 100, y: 100, width: 800, height: 600 }]);
assert.equal(positioned.changes[1].geometry.x - positioned.changes[0].geometry.x, 300, 'placement preserves relative layout');
assert(positioned.changes[0].geometry.y >= 732, 'placement avoids originals');
assert.deepEqual(positioned.changes[2].connection, generated.changes[2].connection);
assert.equal(planChanges(fresh, generated).changed.length, 3);
assert.throws(() => planChanges(fresh, proposal([change()])), /超出范围/);
async function main() {
  // Exercise PDF page adaptation against the actual legacy page model.
  const model = require('../block-model.js');
  const bundle = require('esbuild').buildSync({ entryPoints: [require.resolve('../src/ai/canvas-adapter.js')], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
  const compiled = { exports: {} }; new Function('module', 'exports', 'require', bundle)(compiled, compiled.exports, require);
  // The generation capture cannot read source content, selection, viewport or source signatures.
  const unreadable = () => { throw Error('Notebook was read during generation'); };
  let generationPage = 'private-page';
  const noReadAdapter = compiled.exports.createCanvasAdapter({ page: () => generationPage, document: unreadable, signature: unreadable,
    references: unreadable, area: unreadable, items: unreadable, diagram: unreadable, finish() {} });
  const empty = noReadAdapter.capture('generation'); assert.deepEqual(empty, fresh); assert(noReadAdapter.unchanged(empty));
  generationPage = 'other-page'; assert(!noReadAdapter.unchanged(empty));
  assert.throws(() => noReadAdapter.apply(empty, generated), /目标画布已切换/);
  generationPage = 'private-page'; assert(noReadAdapter.unchanged(empty));
  empty.entities = scene.entities;
  assert.throws(() => noReadAdapter.apply(empty, proposal([change()])), /超出范围/, 'generation cannot gain update permission through a modified scene');
  let data = { notes: [], strokes: [], shapes: [], pdfs: [{ id: 'pdf', data: 'original bytes', pages: [{ x: 0, y: 0, width: 100, height: 200 }] }] };
  const graph = { getDefaultParent: () => null, getChildCells: () => [], getModel: () => ({}) };
  const pdfAdapter = compiled.exports.createCanvasAdapter({ document: () => data, page: () => 'p', references: () => [], groupMembers: g => g.members,
    signature: () => JSON.stringify(data), area: () => ({ x: 0, y: 0, width: 800, height: 600 }), items: kind => model.list(data, kind),
    bounds: (_kind, p) => ({ x: p.x, y: p.y, w: p.width, h: p.height }), locked: () => false, diagram: () => ({ graph, mutate: fn => fn() }),
    finish() {}, commit(_label, fn) { fn(); }, clearSelection() {}, select() {}, removePdfPages: ids => model.removePages(data, ids), updatePdfPage: (id, patch) => model.updatePage(data, id, page => ({ ...page, ...patch })) });
  const pdfScene = pdfAdapter.capture('view'); assert.equal(pdfScene.entities[0].id, 'pdfPages:pdf-page-1');
  pdfAdapter.apply(pdfScene, proposal([change({ kind: 'pdf', id: 'pdfPages:pdf-page-1', content: null, geometry: { x: 30, y: 50, width: 200, height: 400 } })]));
  assert.equal(data.pdfs[0].data, 'original bytes'); assert.equal(data.pdfs[0].pages[0].width, 200); assert.equal(data.pdfs[0].pages[0].pageIndex, 0);
  const { attach } = require('../vscode/ai-controller.cjs');
  let receive, complete, signal, clipboard; const replies = [];
  const editorController = attach({ onDidReceiveMessage(fn) { receive = fn; return { dispose() {} }; }, postMessage(message) { replies.push(message); } },
    { writeClipboard: async text => { clipboard = text; }, edit: async (_request, options) => { signal = options.signal; return new Promise(resolve => { complete = resolve; }); } });
  const pending = receive({ type: 'ai-request', id: 'first' });
  await receive({ type: 'ai-copy', id: 'copy', text: 'Answer' }); assert.equal(clipboard, 'Answer', 'copy remains available while inference waits');
  await receive({ type: 'ai-request', id: 'second' }); assert(replies.at(-1).error.includes('上一个'));
  await receive({ type: 'ai-cancel', id: 'first' }); assert(signal.aborted); complete({ stale: true }); await pending;
  assert(!replies.some(r => r.id === 'first' && r.result), 'canceled result must not be delivered');
  const closing = receive({ type: 'ai-request', id: 'closing' }); editorController.dispose(); assert(signal.aborted); complete({ stale: true }); await closing;
  assert(!replies.some(r => r.id === 'closing'), 'closed editor must not receive a late result');
  const controller = new AbortController();
  const task = run(process.execPath, ['-e', 'setTimeout(()=>{},30000)'], { signal: controller.signal });
  controller.abort(); await assert.rejects(task, /取消/);
  let directory;
  const client = async options => { directory = options.jobDirectory; assert(fs.existsSync(directory)); assert(options.prompt.includes('最新画布')); return { result: proposal([change()]), model: 'fixture' }; };
  const result = await edit({ scene, prompt: 'Edit', conversation: [{ role: 'user', text: 'previous' }] }, { instructionsFile: 'unused', client });
  assert.equal(result.result.changes.length, 1); assert(!fs.existsSync(directory), 'temporary context must be deleted');
  // Explicit policies are enforced by the host, not just the UI.
  const secretScene = { ...scene, privateField: 'DO_NOT_SEND_NOTEBOOK', entities: [node('notes:secret', { content: 'DO_NOT_SEND_NOTEBOOK' })] };
  await edit({ inputMode: 'generate', scene: secretScene, prompt: 'Create a diagram' }, { client: async options => {
    assert.equal(options.images.length, 0); assert(!options.prompt.includes('DO_NOT_SEND_NOTEBOOK'));
    assert(options.prompt.includes('仅生成')); return { result: generated };
  } });
  await edit({ inputMode: 'data', scene, prompt: 'Read the text' }, { client: async options => {
    assert.equal(options.images.length, 0); assert(options.prompt.includes('Original')); assert(options.prompt.includes('没有附带截图'));
    return { result: proposal([]) };
  } });
  await assert.rejects(edit({ inputMode: 'generate', scene, prompt: 'Edit existing' }, { client: async () => ({ result: proposal([change()]) }) }), /超出范围/);
  await assert.rejects(edit({ inputMode: 'data', scene, prompt: 'Read', image: 'data:image/png;base64,ZmFrZQ==' }, { client }), /不允许附带/);
  await assert.rejects(edit({ inputMode: 'visual', scene, prompt: 'Read' }, { client }), /需要截图/);
  await assert.rejects(edit({ inputMode: 'unknown', scene, prompt: 'Read' }, { client }), /输入方式/);
  await assert.rejects(edit({ scene, prompt: 'Edit', image: 'data:image/png;base64,ZmFrZQ==' }, { client }), /图像无效/);
  await assert.rejects(edit({ scene, prompt: 'Edit', conversation: [{ role: 'system', text: 'bad' }] }, { client }), /对话/);
  console.log('AI contract: scope, locks, native IDs, atomic planning, connection references, model pinning, cancellation and context cleanup passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
