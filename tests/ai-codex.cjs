// Explicit opt-in live smoke test; sends only synthetic fixture content.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { edit } = require('../vscode/ai-host.cjs');
async function main() {
  const scene = { version: 1, page: 'test', scope: 'view', area: { x: 0, y: 0, width: 1000, height: 800 }, insertion: { x: 500, y: 100 }, entities: [
    { id: 'notes:synthetic', kind: 'text', content: '投机解码：小模型提出候选，大模型并行验证。', format: 'md', editable: true, locked: false, geometry: { x: 40, y: 40, width: 300, height: 100 } },
  ] };
  const result = await edit({ scene, profile: 'fast', prompt: '只修改已有文本块，补充一句说明：接受的 token 必须保持目标模型的采样分布。保持原句，不移动、不添加其他块。' }, { instructionsFile: path.resolve(__dirname, '../ai/instructions.txt') });
  assert.equal(result.model, 'gpt-6-luna'); assert.equal(result.result.changes.length, 1);
  assert.equal(result.result.changes[0].id, 'notes:synthetic'); assert.equal(result.result.changes[0].action, 'update');
  assert(result.result.changes[0].content.includes('投机解码'));
  const answer = await edit({ scene, profile: 'fast', prompt: '为什么要并行验证？请用一句话回答，不修改画布。', conversation: [{ role: 'user', text: '这里讨论投机解码。' }] }, { instructionsFile: path.resolve(__dirname, '../ai/instructions.txt') });
  assert.equal(answer.result.changes.length, 0); assert(answer.result.review.length > 10);
  fs.mkdirSync(path.resolve(__dirname, '../artifacts/ai-notes'), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname, '../artifacts/ai-notes/live.json'), JSON.stringify({ edit: result, answer }, null, 2));
  console.log(JSON.stringify({ passed: true, model: result.model, reasoningEffort: result.reasoningEffort, editSeconds: result.elapsedMs / 1000, answerSeconds: answer.elapsedMs / 1000, changes: result.result.changes.length, usage: result.usage }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
