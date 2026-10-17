// Explicit network test, separate from offline/unit tests. Uses synthetic ink.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { recognizeCodex } = require('./providers.cjs');
const data = path.resolve(__dirname, '../../artifacts/recognition-demo');
async function main() {
  const image = path.join(data, 'formula-fixture.png');
  if (!fs.existsSync(image)) throw Error('请先运行 npm run test:recognition 生成合成公式样本');
  const job = fs.mkdtempSync(path.join(data, 'smoke-'));
  const response = await recognizeCodex(image, job, null);
  assert.match(response.result.markdown.replace(/\s/g, ''), /1\+1=2/);
  assert(response.result.nodes.some(node => node.kind === 'math'));
  assert.equal(response.result.edges.length, 0);
  const report = { ...response, input: 'synthetic 1+1=2 stroke fixture', physicalPenTested: false };
  fs.writeFileSync(path.join(data, 'codex-smoke.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ provider: response.provider, model: response.model, reasoningEffort: response.reasoningEffort,
    usage: response.usage, elapsedMs: Math.round(response.elapsedMs), markdown: response.result.markdown,
    nodes: response.result.nodes.length, edges: response.result.edges.length, uncertainties: response.result.uncertainties, physicalPenTested: false }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
