const { app, BrowserWindow, ipcMain, nativeImage, ClipboardItem } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { output } = require('./build.cjs');
const { resolveProfile } = require('./codex-models.cjs');
const root = path.resolve(__dirname, '../..'), data = path.join(root, 'artifacts/recognition-demo');
app.setPath('userData', path.join(data, 'test-profile'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  ipcMain.handle('recognition:status', () => ({ codex: true, recognizers: ['Microsoft 中文(简体)手写识别器'] }));
  const response = { provider: 'codex', elapsedMs: 1234, engineMs: null, alternatives: [], result: {
    markdown: '中文测试\n\n$$x^2 + y^2 = 1$$', nodes: [{ id: 'a', kind: 'text', content: '中文测试', bounds: [.1, .1, .3, .2] },
    { id: 'b', kind: 'math', content: 'x^2+y^2=1', bounds: [.1, .4, .6, .2] }], edges: [{ from: 'a', to: 'b', relation: 'arrow', label: '解释' }], uncertainties: ['检查上标'] } };
  ipcMain.handle('recognition:run', (_event, request) => ({ ...JSON.parse(JSON.stringify(response)), ...resolveProfile(request.profile),
    usage: { input_tokens: 123, output_tokens: 45 } }));
  const w = new BrowserWindow({ width: 1400, height: 960, show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, offscreen: true } });
  const errors = []; w.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  const run = source => w.webContents.executeJavaScript(source);
  await w.loadFile(path.join(output, 'index.html')); await sleep(200);
  await run("document.querySelector('[data-profile=fast]').click()");
  assert.match(await run("document.getElementById('model-hint').textContent"), /gpt-6-luna.*low/);
  await run(`(() => {
    const target=document.getElementById('overlay'), r=target.getBoundingClientRect();
    const capture=target.setPointerCapture; target.setPointerCapture=()=>{};
    try { for(const [type,x,y,buttons] of [['pointerdown',80,80,1],['pointermove',90,90,1],['pointerup',100,100,0]]) target.dispatchEvent(new PointerEvent(type,{pointerId:44,pointerType:'pen',button:0,buttons,pressure:.5,clientX:r.left+x,clientY:r.top+y,bubbles:true})); }
    finally { target.setPointerCapture=capture; }
  })()`);
  assert.equal((await run('window.inkspaceRecognitionTest.state()')).ink.length, 1, 'Pen tap/move must create one stroke');
  await run("document.getElementById('select').click()");
  const rect = await run("(()=>{const r=document.getElementById('overlay').getBoundingClientRect();return{x:r.left,y:r.top}})()");
  const inject = require('../../tests/mouse-input.cjs')(w.webContents);
  inject({ type: 'mouseDown', button: 'left', x: Math.round(rect.x + 40), y: Math.round(rect.y + 40) });
  inject({ type: 'mouseMove', x: Math.round(rect.x + 180), y: Math.round(rect.y + 180) });
  inject({ type: 'mouseUp', button: 'left', x: Math.round(rect.x + 180), y: Math.round(rect.y + 180) });
  await sleep(80);
  const selected = await run('window.inkspaceRecognitionTest.state()'); assert(selected.selection.width > 0); assert.equal(selected.ink.length, 1, 'Selection must not write ink');
  const clippedExport = await run('window.inkspaceRecognitionTest.exportRegion()'); assert.equal(clippedExport.strokes.length, 1);
  const fixture = JSON.parse(fs.readFileSync(path.join(data, 'test-fixture.json'), 'utf8'));
  await run(`window.inkspaceRecognitionTest.setFixture(${JSON.stringify(fixture)})`);
  const sample = await run('window.inkspaceRecognitionTest.exportRegion()');
  const image = nativeImage.createFromDataURL(sample.png); assert(!image.isEmpty());
  const imageClipboard = require('./clipboard.cjs');
  let clipboardItems;
  const fakeClipboard = { write: async items => { clipboardItems = items; }, read: async () => clipboardItems };
  await imageClipboard.copyImage(fakeClipboard, ClipboardItem, image.toPNG());
  assert.equal(await imageClipboard.pasteImage(fakeClipboard, nativeImage), image.toDataURL(), 'Electron 44 image clipboard contract');
  assert.equal(await imageClipboard.pasteImage({ read: async () => [] }, nativeImage), null);
  fs.writeFileSync(path.join(data, 'formula-fixture.png'), image.toPNG());
  assert.equal(sample.strokes.length, fixture.length);
  await run("window.inkspaceRecognitionTest.recognize('codex')");
  assert.match(await run("document.getElementById('metrics').textContent"), /gpt-6-luna.*low.*123.*45/);
  await run("document.querySelector('[data-profile=precise]').click()");
  await run("window.inkspaceRecognitionTest.recognize('codex')");
  assert.match(await run("document.getElementById('metrics').textContent"), /gpt-6\.1-sol/);
  await run("document.querySelector('[data-profile=fast]').click()");
  assert.equal(await run("document.querySelectorAll('#preview .katex').length"), 1);
  assert.equal(await run("document.querySelectorAll('#node-list .node-card').length"), 2);
  assert.equal(await run("document.querySelectorAll('#regions rect').length"), 2);
  assert.equal(await run("document.getElementById('save').disabled"), false);
  await run("document.getElementById('transcript').value='edited'; document.getElementById('transcript').dispatchEvent(new Event('input'))");
  assert.equal(await run("document.getElementById('preview').textContent.trim()"), 'edited');
  await run("document.getElementById('reference').value='中文测试'; document.getElementById('reference').dispatchEvent(new Event('input'))");
  assert.match(await run("document.getElementById('score').textContent"), /CER/);
  await run("document.getElementById('undo').click()");
  assert.equal(await run("document.getElementById('save').disabled"), true, 'Edited source must invalidate save');
  await run(`window.inkspaceRecognitionTest.importImage(${JSON.stringify(sample.png)})`);
  assert.equal(await run("document.getElementById('windows').disabled"), true, 'Raster images must not silently use the stroke-only recognizer');
  await run(`window.inkspaceRecognitionTest.setFixture(${JSON.stringify(fixture)})`);
  await run("window.inkspaceRecognitionTest.recognize('codex')");
  await sleep(150);
  fs.writeFileSync(path.join(data, 'demo-preview.png'), (await w.webContents.capturePage()).toPNG());
  assert.deepEqual(errors, []); w.destroy(); console.log('Recognition UI: formula preview, selection export, node bounds, correction, scoring and stale-input guard passed.'); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
