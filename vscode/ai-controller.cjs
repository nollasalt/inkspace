// Per-editor RPC lifecycle. No notebook mutation or save queue dependency.
function attach(webview, { instructionsFile, writeClipboard, edit = (...args) => require('./ai-runtime.cjs').edit(...args) }) {
  const jobs = new Map(); let closed = false;
  const reply = (id, value) => { if (!closed) webview.postMessage({ type: 'ai-result', id, ...value }); };
  const listener = webview.onDidReceiveMessage(async message => {
    if (!['ai-request', 'ai-cancel', 'ai-copy'].includes(message.type) || typeof message.id !== 'string' || message.id.length > 100) return;
    if (message.type === 'ai-cancel') { jobs.get(message.id)?.abort(); return; }
    if (message.type === 'ai-copy') {
      try {
        if (typeof message.text !== 'string' || message.text.length > 100000) throw Error('回答内容过大');
        await writeClipboard(message.text); reply(message.id, { result: true });
      } catch (error) { reply(message.id, { error: error.message }); }
      return;
    }
    if ([...jobs.values()].some(job => !job.signal.aborted) || jobs.has(message.id)) { reply(message.id, { error: '上一个 AI 请求尚未结束，请稍后再试' }); return; }
    const controller = new AbortController(); jobs.set(message.id, controller);
    try {
      const result = await edit(message, { signal: controller.signal, instructionsFile });
      if (!controller.signal.aborted) reply(message.id, { result });
    } catch (error) { reply(message.id, { error: error.message }); }
    finally { jobs.delete(message.id); }
  });
  return { dispose() { closed = true; listener.dispose(); for (const controller of jobs.values()) controller.abort(); jobs.clear(); } };
}
module.exports = { attach };
