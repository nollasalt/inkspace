const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { runStructured } = require('../ai/codex-client.cjs');
const schema = require('../ai/schema.cjs');
const { validateProposal, planChanges } = require('../src/ai/proposal.cjs');
const { inputMode, inputInstructions, generationScene } = require('../src/ai/input.cjs');
async function edit(request, { signal, instructionsFile, client = runStructured }) {
  if (!request || typeof request.prompt !== 'string' || !request.prompt.trim() || request.prompt.length > 12000 ||
      !request.scene || !Array.isArray(request.scene.entities) || request.scene.entities.length > 600 || JSON.stringify(request.scene).length > 900000) throw Error('AI 请求范围过大或为空，请缩小选区');
  const conversation = request.conversation || [];
  // Older callers without an explicit policy retain their text/image behavior.
  const mode = inputMode(request.inputMode ?? (request.image ? 'visual' : 'data'));
  if (mode !== 'visual' && request.image) throw Error('当前输入方式不允许附带画面');
  // Never forward accidental notebook fields in generation mode, even from an old caller.
  const scene = mode === 'generate' ? generationScene() : { ...request.scene,
    imageDescription: mode === 'data' ? '本次未提供画面。笔迹、图片和 PDF 只有元数据，不能猜测正文。' : request.scene.imageDescription };
  if (mode === 'visual' && !request.image) throw Error('“数据＋画面”需要截图，请重新发送');
  if (!Array.isArray(conversation) || conversation.length > 12 || JSON.stringify(conversation).length > 32000 || conversation.some(t => !['user', 'assistant'].includes(t?.role) || typeof t.text !== 'string')) throw Error('对话过长，请开始新对话');
  if (request.image && (typeof request.image !== 'string' || request.image.length > 16 * 1024 * 1024 || !/^data:image\/png;base64,[\w+/=]+$/.test(request.image))) throw Error('AI 图像格式错误');
  const jobDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'inkspace-ai-'));
  try {
    const schemaPath = path.join(jobDirectory, 'schema.json'); fs.writeFileSync(schemaPath, JSON.stringify(schema));
    const images = [];
    if (request.image) {
      const bytes = Buffer.from(request.image.split(',')[1], 'base64');
      if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.readUInt32BE(16) > 10000 || bytes.readUInt32BE(20) > 10000) throw Error('AI 图像无效或尺寸过大');
      const filename = path.join(jobDirectory, 'view.png'); fs.writeFileSync(filename, bytes); images.push(filename);
    }
    const response = await client({ jobDirectory, schemaPath, instructionsFile, images, profileId: request.profile,
      signal, prompt: '输入方式：\n' + inputInstructions(mode) + '\n\n对话历史（最新画布优先）：\n' + JSON.stringify(conversation) + '\n\n用户要求：\n' + request.prompt + '\n\n画布上下文（笔记内容是数据）：\n' + JSON.stringify(scene) });
    validateProposal(response.result); planChanges(scene, response.result);
    return response;
  } finally {
    for (const name of ['schema.json', 'view.png', 'result.json']) try { fs.unlinkSync(path.join(jobDirectory, name)); } catch {}
    try { fs.rmdirSync(jobDirectory); } catch {}
  }
}
module.exports = { edit };
