const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { build, output } = require('./build.cjs');
const providers = require('./providers.cjs');
const { validateResult, acceptedDocument, characterErrorRate, clipStrokes } = require('./model.cjs');
const root = path.resolve(__dirname, '../..');
const points = values => values.map(([x, y]) => ({ x, y, p: 1 }));
const fixture = [
  [[130, 220], [155, 200], [155, 320]],
  [[215, 260], [275, 260]], [[245, 230], [245, 290]],
  [[320, 220], [345, 200], [345, 320]],
  [[405, 245], [465, 245]], [[405, 275], [465, 275]],
  [[515, 220], [530, 205], [555, 200], [575, 210], [580, 230], [570, 250], [515, 315], [585, 315]],
].map(p => ({ width: 3.6, hasPressure: false, points: points(p) }));
async function main() {
  build();
  const fastArgs = providers.codexArgs('sample.png', 'sample-job');
  assert.equal(fastArgs[fastArgs.indexOf('--model') + 1], 'gpt-6-luna');
  assert(fastArgs.includes('model_reasoning_effort="low"'));
  assert(fastArgs.some(arg => arg.startsWith('model_instructions_file=')));
  const preciseArgs = providers.codexArgs('sample.png', 'sample-job', 'precise');
  assert.equal(preciseArgs[preciseArgs.indexOf('--model') + 1], 'gpt-6.1-sol');
  assert.throws(() => providers.codexArgs('sample.png', 'sample-job', 'unlisted'));
  const result = { markdown: '测试 $x^2$', nodes: [{ id: 'a', kind: 'text', content: '测试', bounds: [0, 0, .4, .3] },
    { id: 'b', kind: 'math', content: 'x^2', bounds: [.5, .4, .3, .3] }], edges: [{ from: 'a', to: 'b', label: '', relation: 'arrow' }], uncertainties: [] };
  assert.equal(validateResult(result), result);
  assert.throws(() => validateResult({ ...result, edges: [{ ...result.edges[0], to: 'missing' }] }));
  assert.throws(() => validateResult({ ...result, nodes: [result.nodes[0], result.nodes[0]] }));
  assert.throws(() => validateResult({ ...result, nodes: [{ ...result.nodes[0], bounds: [.9, .1, .3, .3] }] }));
  assert.deepEqual(characterErrorRate('中文😀', '中文😁'), { edits: 1, referenceCharacters: 3, rate: 1 / 3 });
  assert.equal(characterErrorRate('', 'text'), null);
  assert.equal(characterErrorRate('abc', 'abc').edits, 0);
  const saved = acceptedDocument({ ...result, strokes: fixture, image: 'private' });
  assert(!('strokes' in saved)); assert(!('image' in saved));
  saved.nodes[0].content = 'changed'; assert.equal(result.nodes[0].content, '测试');
  const clipped = clipStrokes([{ points: points([[-2, 5], [12, 5], [12, 12], [5, 5]]) }], { x: 0, y: 0, width: 10, height: 10 });
  assert.equal(clipped.length, 2); assert.equal(clipped[0].points[0].x, 0); assert.equal(clipped[0].points.at(-1).x, 10);
  assert(clipStrokes([{ points: points([[5, 5]]) }], { x: 0, y: 0, width: 10, height: 10 }).length === 1);
  const status = await providers.status(path.join(output, 'WindowsText.exe'));
  assert(status.recognizers.some(name => /中文|Chinese/.test(name)), 'Chinese recognizer should be present on this validation machine');
  const native = await providers.recognizeWindows(path.join(output, 'WindowsText.exe'), fixture, status.recognizers.find(n => /English.*US/.test(n)), null);
  assert(native.result.markdown.length > 0); assert(native.engineMs >= 0);
  const controller = new AbortController();
  const canceled = providers.run(process.execPath, ['-e', 'setTimeout(()=>{},30000)'], { signal: controller.signal });
  controller.abort(); await assert.rejects(canceled, /取消/);
  const data = path.join(root, 'artifacts/recognition-demo'); fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(path.join(data, 'test-fixture.json'), JSON.stringify(fixture));
  fs.writeFileSync(path.join(data, 'native-smoke.json'), JSON.stringify({ status, native }, null, 2));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const ui = spawnSync(require('electron'), [path.join(__dirname, 'test-electron.cjs')], { cwd: root, env, encoding: 'utf8', timeout: 60000, windowsHide: true });
  if (ui.stdout) process.stdout.write(ui.stdout); if (ui.stderr) process.stderr.write(ui.stderr);
  assert.equal(ui.status, 0, 'Recognition UI tests should pass');
  console.log('Recognition: schema, clipping, Unicode scoring, ink-free export, installed Windows recognition, cancellation and UI passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
