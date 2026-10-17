const { app, BrowserWindow, ipcMain, clipboard, ClipboardItem, nativeImage, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const providers = require('./providers.cjs');
const { acceptedDocument } = require('./model.cjs');
const imageClipboard = require('./clipboard.cjs');
const { output } = require('./build.cjs');
const root = path.resolve(__dirname, '../..'), data = path.join(root, 'artifacts/recognition-demo');
app.setPath('userData', path.join(data, 'profile'));
let window, active;
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
function showWindow() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
app.on('second-instance', showWindow);
app.on('activate', showWindow);
function imageBuffer(value) {
  if (typeof value !== 'string' || value.length > 24 * 1024 * 1024 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value)) throw Error('选区图片无效');
  const bytes = Buffer.from(value.slice(value.indexOf(',') + 1), 'base64');
  const image = nativeImage.createFromBuffer(bytes), size = image.getSize();
  if (image.isEmpty() || size.width < 2 || size.height < 2 || size.width > 8192 || size.height > 8192 || size.width * size.height > 24000000) throw Error('图片尺寸无效或过大');
  return { image, bytes };
}
function strokes(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 2000) throw Error('请选择手写内容；Windows 基线暂不识别导入的图片');
  let total = 0;
  for (const s of value) {
    if (!Array.isArray(s.points) || !s.points.length) throw Error('存在空笔画');
    total += s.points.length;
    for (const p of s.points) if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 20000 || Math.abs(p.y) > 20000) throw Error('笔画坐标无效');
  }
  if (total > 200000) throw Error('选区采样点过多');
  return value;
}
function register() {
  ipcMain.handle('recognition:status', () => providers.status(path.join(output, 'WindowsText.exe')));
  ipcMain.handle('recognition:run', async (_event, request) => {
    if (active) throw Error('已有识别任务正在运行');
    if (!['codex', 'windows'].includes(request?.provider)) throw Error('识别提供方无效');
    const png = imageBuffer(request.png);
    const controller = new AbortController(); active = controller;
    let job;
    try {
      if (request.provider === 'windows') return await providers.recognizeWindows(path.join(output, 'WindowsText.exe'), strokes(request.strokes), String(request.recognizer), controller.signal);
      job = fs.mkdtempSync(path.join(data, 'job-'));
      const imagePath = path.join(job, 'selection.png'); fs.writeFileSync(imagePath, png.bytes);
      return await providers.recognizeCodex(imagePath, job, controller.signal, request.profile);
    } finally {
      if (active === controller) active = null;
      // Only remove exact files owned by this job; never recursively delete a computed directory.
      if (job) { for (const name of ['selection.png', 'result.json']) try { fs.unlinkSync(path.join(job, name)); } catch {} try { fs.rmdirSync(job); } catch {} }
    }
  });
  ipcMain.handle('recognition:cancel', () => { active?.abort(); });
  ipcMain.handle('recognition:copy-image', (_event, png) => imageClipboard.copyImage(clipboard, ClipboardItem, imageBuffer(png).bytes));
  ipcMain.handle('recognition:paste-image', () => imageClipboard.pasteImage(clipboard, nativeImage));
  ipcMain.handle('recognition:open-image', async () => {
    const selected = await dialog.showOpenDialog(window, { title: '导入手写样本', filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], properties: ['openFile'] });
    if (selected.canceled) return null;
    const filename = selected.filePaths[0];
    if (fs.statSync(filename).size > 16 * 1024 * 1024) throw Error('图片文件超过 16 MB');
    const image = nativeImage.createFromPath(filename);
    if (image.isEmpty()) throw Error('图片无法读取');
    const size = image.getSize(); if (size.width * size.height > 24000000) throw Error('请先缩小图片至 2400 万像素以内');
    return image.toDataURL();
  });
  ipcMain.handle('recognition:save', async (_event, request) => {
    const result = acceptedDocument(request.result);
    const selected = await dialog.showSaveDialog(window, { title: '保存已确认的识别结果（不含笔迹）', defaultPath: path.join(data, '识别结果.json'), filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (selected.canceled) return false;
    const evaluation = { provider: String(request.provider), elapsedMs: Number(request.elapsedMs),
      model: typeof request.model === 'string' ? request.model : null,
      reasoningEffort: typeof request.reasoningEffort === 'string' ? request.reasoningEffort : null,
      usage: request.usage && { input_tokens: Number(request.usage.input_tokens) || 0, cached_input_tokens: Number(request.usage.cached_input_tokens) || 0,
        output_tokens: Number(request.usage.output_tokens) || 0, reasoning_output_tokens: Number(request.usage.reasoning_output_tokens) || 0 },
      reference: String(request.reference || '').slice(0, 5000), originalTranscription: String(request.originalTranscription || '').slice(0, 100000),
      correctionActions: Math.max(0, Number(request.correctionActions) || 0) };
    fs.writeFileSync(selected.filePath, JSON.stringify({ ...result, evaluation }, null, 2), 'utf8'); return selected.filePath;
  });
}
if (hasInstanceLock) app.whenReady().then(async () => {
  fs.mkdirSync(data, { recursive: true }); register();
  window = new BrowserWindow({ title: 'InkSpace · 手写识别验证', width: 1400, height: 960, minWidth: 1000, minHeight: 720,
    backgroundColor: '#f5f6f8', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('closed', () => { active?.abort(); window = null; });
  await window.loadFile(path.join(output, 'index.html')); showWindow();
  console.log('Recognition Demo ready: ' + JSON.stringify({ title: window.getTitle(), visible: window.isVisible(), minimized: window.isMinimized(), bounds: window.getBounds() }));
}).catch(error => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { active?.abort(); providers.shutdown(); });
