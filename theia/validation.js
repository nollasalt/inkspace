window.inkspaceValidation = {
  async load(raw, uri) {
    if (!await allowReplace()) return false;
    const data = JSON.parse(raw);
    if (!valid(data)) throw Error('无效的 Inkspace 笔记');
    adoptDocument(data);
    notebook.title = decodeURIComponent(uri.split('/').at(-1)).replace(/\.inkspace\.json$/i, '');
    savedDocument = contentSignature();
    await nativeHost.useDocument(uri);
    renderPageList();
    parent.inkspaceTheiaValidation.notifyDirty();
    return true;
  },
  async new() {
    if (!await allowReplace()) return false;
    adoptDocument(newCanvas());
    await desktop.newDocument();
    savedDocument = contentSignature();
    parent.inkspaceTheiaValidation.notifyDirty();
    return true;
  },
  async save() {
    const result = await saveNotebook();
    parent.inkspaceTheiaValidation.notifyDirty();
    return result;
  },
  dirty: () => contentSignature() !== savedDocument,
  stats: () => ({ strokes: doc.strokes.length, points: doc.strokes.reduce((count, stroke) => count + stroke.points.length, 0), native: desktop.inkStatus(), render: renderStats, scale: view.scale }),
  packets: consumeNativePackets
};
$('#open-folder').onclick = () => parent.inkspaceTheiaValidation.commands.executeCommand('workspace:open');
window.addEventListener('keydown', event => {
  if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'n') {
    event.preventDefault();
    parent.inkspaceTheiaValidation.commands.executeCommand('terminal:new').catch(error => toast(error.message));
  }
});
parent.addEventListener('beforeunload', event => {
  if (inkspaceValidation.dirty()) { event.preventDefault(); event.returnValue = ''; }
});
