const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), html = path.join(root, 'vscode/media/ai-test.html');
const pause = ms => new Promise(r => setTimeout(r, ms));
app.setPath('userData', path.join(root, 'artifacts/ai-profile'));
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1440, height: 1000, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const errors = []; w.webContents.on('console-message', e => { if (e.level === 'error') { errors.push(e.message); console.error(e.message); } });
  const run = async s => { try { return await w.webContents.executeJavaScript(s); } catch (error) { console.error(s.slice(0, 700)); throw error; } };
  const change = extra => ({ action: 'update', kind: 'text', id: 'notes:a', content: null, format: null, geometry: null, style: null, connection: null, ...extra });
  const response = changes => ({ model: 'fixture', reasoningEffort: 'low', elapsedMs: 100, result: { summary: 'Fixture proposal', review: '解释 **结构** 与 $x^2$。', questions: [], changes } });
  async function proposal(value) { await run(`window.base=inkspaceAI.adapter.capture('view');inkspaceAI.showProposal(${JSON.stringify(value)},window.base);void 0;`); }
  try {
    const assets = require('node:url').pathToFileURL(path.join(root, 'vscode/media/index.html')).href;
    fs.writeFileSync(html, fs.readFileSync(path.join(root, 'vscode/media/index.html'), 'utf8').replace('<body>', `<body><meta id="inkspace-assets" content="${assets}"><meta id="inkspace-boot" content="${Buffer.from(JSON.stringify({ client: 'ai-test' })).toString('base64')}">`));
    await w.loadFile(html);
    for (const file of ['codium.css', 'ai.css']) await w.webContents.insertCSS(fs.readFileSync(path.join(root, 'vscode', file), 'utf8'));
    await run(`window.acquireVsCodeApi=()=>({getState:()=>window.testState||{},setState:s=>window.testState=s,postMessage:m=>{(window.messages||=[]).push(m)}});window.inkspaceNative={status:()=>({connected:false,error:'fixture'})};void 0;`);
    for (const file of ['inline-text.js', 'navigation-data.js', 'navigation.js', 'adapter.js']) await run(fs.readFileSync(path.join(root, 'vscode', file), 'utf8'));
    await run(fs.readFileSync(path.join(root, 'vendor/ai.js'), 'utf8'));
    await run(`inkspaceAI.open();adoptDocument({...newCanvas(),notes:[{id:'a',x:50,y:60,width:420,markdown:'Original $x^2$'},{id:'b',x:50,y:280,width:240,markdown:'Target'}],strokes:[{id:'ink',brush:'xournal',width:3,color:'#000000',points:[{x:80,y:200,p:.5,t:0},{x:180,y:220,p:.8,t:10}]}]});view={x:20,y:20,scale:1};render();history=[];future=[];void 0;`);
    await run('document.fonts.ready'); await pause(100);
    const original = await run('JSON.stringify(doc)'), width = await run('doc.notes[0].width');
    await proposal(response([change({ content: 'Revised **Markdown** $y^2$' })]));
    assert(await run('!document.querySelector("#ai-proposal").hidden'));
    await run('document.querySelector("#ai-apply").click()');
    assert.equal(await run('doc.notes[0].width'), width, 'content edit must not reflow width');
    assert.equal(await run('history.length'), 1); assert.equal(await run('doc.notes[0].markdown'), 'Revised **Markdown** $y^2$');
    await run('undo()'); assert.equal(await run('JSON.stringify(doc)'), original); await run('redo()');
    // Add native cards/ports, then update one card. Graph changes share the same transaction.
    await proposal(response([
      change({ action: 'add', kind: 'shape', id: 'new-card', content: 'KSampler', geometry: { x: 500, y: 60, width: 220, height: 120 } }),
      change({ action: 'add', kind: 'connection', id: 'new-edge', connection: { source: 'notes:a', target: 'new-card', sourceSide: 'right', targetSide: 'left', arrow: 'forward', dashed: true } }),
    ]));
    await run('document.querySelector("#ai-apply").click()');
    assert.equal(await run('history.length'), 2);
    const graph = await run(`(()=>{const g=inkspaceDiagram.graph,c=g.getChildCells(g.getDefaultParent(),true,true);return c.map(c=>({id:c.id,edge:!!c.edge,value:c.value,style:c.style}))})()`);
    assert.equal(graph.length, 2); assert(graph.find(c => c.edge).style.includes('inkNoteSource=a;')); assert(graph.find(c => c.edge).style.includes('dashed=1;'));
    fs.mkdirSync(path.join(root, 'artifacts/ai-notes'), { recursive: true });
    await proposal(response([change({ content: 'Updated explanation with $x^2$' })]));
    await pause(60);
    fs.writeFileSync(path.join(root, 'artifacts/ai-notes/ui.png'), (await w.webContents.capturePage()).toPNG());
    await run('undo()'); assert.equal(await run('inkspaceDiagram.graph.getChildCells(inkspaceDiagram.graph.getDefaultParent(),true,true).length'), 0);
    await run('redo()'); assert.equal(await run('inkspaceDiagram.graph.getChildCells(inkspaceDiagram.graph.getDefaultParent(),true,true).length'), 2);
    // A pen edit with unchanged point count and bounds must invalidate the proposal.
    await proposal(response([change({ content: 'Must not apply' })]));
    const beforeHistory = await run('history.length');
    await run('doc.strokes[0]={...doc.strokes[0],points:doc.strokes[0].points.map(p=>({...p,p:.9}))};document.querySelector("#ai-apply").click();');
    assert.equal(await run('history.length'), beforeHistory); assert(await run('document.querySelector("#ai-status").textContent.includes("笔记已变化")'));
    assert.notEqual(await run('doc.notes[0].markdown'), 'Must not apply');
    // Real DOM/canvas capture includes formula fonts and current visible ink.
    const png = await run(`inkspaceAI.snapshot(inkspaceAI.adapter.capture('view'))`);
    const image = nativeImage.createFromDataURL(png), size = image.getSize(); assert(size.width > 500 && size.height > 500);
    const pixels = image.toBitmap(); let dark = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 120 && pixels[i + 1] < 120 && pixels[i + 2] < 120) dark++;
    assert(dark > 100, 'capture cannot be blank');
    fs.mkdirSync(path.join(root, 'artifacts/ai-notes'), { recursive: true }); fs.writeFileSync(path.join(root, 'artifacts/ai-notes/capture.png'), image.toPNG());
    await run('clearSelection();selected.notes=[1];overlaySelection();window.cropScene=inkspaceAI.adapter.capture("selection");void 0;');
    const crop = nativeImage.createFromDataURL(await run('inkspaceAI.snapshot(window.cropScene)')); assert(crop.getSize().width < size.width);
    // Exercise request/response bridge and multi-turn questions without a cloud call.
    await run(`window.inkspaceAIHost.request=async request=>{window.aiSent=request;return ${JSON.stringify(response([]))}};document.querySelector('#ai-prompt').value='生成一个例子';document.querySelector('#ai-send').click();`);
    for (let i = 0; i < 100 && await run('document.querySelector("#ai-send").disabled'); i++) await pause(50);
    assert.equal(await run('window.aiSent.inputMode'), 'generate'); assert.deepEqual(await run('window.aiSent.scene.entities'), []);
    assert.equal(await run('Object.hasOwn(window.aiSent,"image")'), false, 'initial assistant request has no notebook attachment');
    await run(`document.querySelector('[data-ai-attach="view"]').click()`);
    await run(`window.inkspaceAIHost.request=async request=>{window.aiSent=request;return ${JSON.stringify(response([]))}};document.querySelector('#ai-prompt').value='解释这部分';document.querySelector('#ai-send').click();`);
    for (let i = 0; i < 100 && await run('document.querySelector("#ai-send").disabled'); i++) await pause(50);
    assert.equal(await run('window.aiSent.prompt'), '解释这部分'); assert(await run('document.querySelector("#ai-review .katex")!==null'));
    assert.equal(await run('window.aiSent.inputMode'), 'data');
    assert.equal(await run('Object.hasOwn(window.aiSent,"image")'), false, 'default reads native data without a screenshot');
    assert((await run('window.aiSent.scene.entities')).some(e => e.content.includes('Revised')));
    await run(`document.querySelector('#ai-prompt').value='举个例子';document.querySelector('#ai-send').click();`);
    for (let i = 0; i < 100 && await run('document.querySelector("#ai-send").disabled'); i++) await pause(50);
    assert((await run('window.aiSent.conversation')).some(t => t.text.includes('解释这部分')));
    assert.equal(await run('history.length'), beforeHistory, 'questions never modify the canvas');
    // UI focus and clipboard must not leak into canvas commands.
    assert.equal(await run(`(()=>{const panel=document.querySelector('#inkspace-ai-panel');panel.focus();const key=new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true});panel.dispatchEvent(key);return key.defaultPrevented})()`), false);
    assert.equal(await run('history.length'), beforeHistory);
    const notesBefore = await run('doc.notes.length');
    await run(`(()=>{const panel=document.querySelector('#inkspace-ai-panel'),data=new DataTransfer();data.setData('text/plain','Do not paste into canvas');panel.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}))})()`);
    assert.equal(await run('doc.notes.length'), notesBefore);
    await run(`document.querySelector('#ai-insert').click()`);
    assert.equal(await run('doc.notes.length'), notesBefore + 1); assert.equal(await run('history.length'), beforeHistory + 1);
    await run('undo()'); assert.equal(await run('doc.notes.length'), notesBefore);
    // Reading old notes without stable ink IDs is side-effect free. Assign only on an actual edit.
    await run(`doc.strokes=doc.strokes.map(({id,...stroke})=>stroke);render();window.beforeLegacy=JSON.stringify(doc);window.legacyBase=inkspaceAI.adapter.capture('view');void 0;`);
    assert.equal(await run('JSON.stringify(doc)'), await run('window.beforeLegacy'));
    const legacy = await run('window.legacyBase.entities.find(e=>e.kind==="ink")');
    await run(`inkspaceAI.adapter.apply(window.legacyBase,${JSON.stringify(response([change({ kind: 'ink', id: legacy.id, geometry: { ...legacy.geometry, x: legacy.geometry.x + 10 } })]).result)});void 0;`);
    assert(await run('!!doc.strokes[0].id')); await run('undo()'); assert.equal(await run('JSON.stringify(doc)'), await run('window.beforeLegacy'));
    await proposal(response([change({ content: 'After view navigation' })]));
    await run('view={...view,x:view.x+20,y:view.y-15,scale:.8};render();document.querySelector("#ai-apply").click();');
    assert.equal(await run('doc.notes[0].markdown'), 'After view navigation', await run('document.querySelector("#ai-status").textContent'));
    // Removing the attachment starts a new generation conversation, without notebook-derived history.
    const generated = response([
      change({ action: 'add', id: 'new-generated', content: 'Generated content', geometry: { x: 0, y: 0, width: 240, height: 120 } }),
      change({ action: 'add', kind: 'shape', id: 'new-generated-shape', content: 'Result', geometry: { x: 320, y: 0, width: 200, height: 120 } }),
      change({ action: 'add', kind: 'connection', id: 'new-generated-edge', content: '', connection: { source: 'new-generated', target: 'new-generated-shape', sourceSide: 'right', targetSide: 'left', arrow: 'forward', dashed: false } }),
    ]);
    await run(`clearSelection();document.querySelector('#ai-remove-attachment').click();window.inkspaceAIHost.request=async request=>{window.aiSent=request;return ${JSON.stringify(generated)}};document.querySelector('#ai-prompt').value='生成流程图';document.querySelector('#ai-send').click();`);
    for (let i = 0; i < 100 && await run('document.querySelector("#ai-send").disabled'); i++) await pause(50);
    assert.equal(await run('window.aiSent.inputMode'), 'generate');
    assert.equal(await run('window.aiSent.scene.scope'), 'generation');
    assert.deepEqual(await run('window.aiSent.scene.entities'), []);
    assert.deepEqual(await run('window.aiSent.conversation'), [], 'changing source must not carry notebook-derived conversation');
    assert.equal(await run('Object.hasOwn(window.aiSent,"image")'), false);
    assert(await run('document.querySelector("#ai-attachment").hidden'));
    // Newly written originals need not invalidate a generation that can only add content.
    await run('doc.notes[0].markdown="Written while generating";render();window.beforeGenerated=JSON.stringify(doc);window.generatedHistory=history.length;document.querySelector("#ai-apply").click();');
    assert.equal(await run('doc.notes[0].markdown'), 'Written while generating');
    assert(await run('doc.notes.some(n=>n.markdown==="Generated content")'));
    assert.equal(await run('history.length'), (await run('window.generatedHistory')) + 1);
    const placed = await run('doc.notes.find(n=>n.markdown==="Generated content")');
    assert(placed.x !== 0 || placed.y !== 0, 'generated layout is placed locally rather than at template coordinates');
    await run('undo()'); assert.equal(await run('JSON.stringify(doc)'), await run('window.beforeGenerated')); await run('redo()');
    // Only the explicit visual option attaches a PNG; switching again starts another clean thread.
    await run(`document.querySelector('[data-ai-attach="view"]').click();document.querySelector('#ai-include-image').click();window.inkspaceAIHost.request=async request=>{window.aiSent=request;return ${JSON.stringify(response([]))}};document.querySelector('#ai-prompt').value='读取手写';document.querySelector('#ai-send').click();`);
    for (let i = 0; i < 100 && await run('document.querySelector("#ai-send").disabled'); i++) await pause(50);
    assert.equal(await run('window.aiSent.inputMode'), 'visual'); assert((await run('window.aiSent.image')).startsWith('data:image/png;base64,'));
    assert.deepEqual(await run('window.aiSent.conversation'), []);
    await run(`document.querySelector('#ai-remove-attachment').click()`);
    // Notebook attachments capture stable selection IDs rather than whatever is selected at send time.
    await run(`clearSelection();selected.notes=[0];overlaySelection();document.querySelector('[data-ai-attach="selection"]').click();clearSelection();selected.notes=[1];overlaySelection();document.querySelector('#ai-prompt').value='解释附件';document.querySelector('#ai-send').click();`);
    for (let i = 0; i < 100 && await run('document.querySelector("#ai-send").disabled'); i++) await pause(50);
    assert.deepEqual(await run('window.aiSent.scene.selectedIds'), ['notes:a']);
    assert(await run('document.querySelector("#ai-attachment-label").textContent.includes("1 个块")'));
    await run(`document.querySelector('#ai-new').click()`); assert(await run('document.querySelector("#ai-attachment").hidden'));
    const code = 'def useful(rate):\n    # Preserve original code\n    return rate * 32\n';
    await run(`adoptDocument({...newCanvas(),notes:[{id:'code',x:30,y:40,width:560,markdown:${JSON.stringify('```python\n' + code + '```')}},{id:'html-code',x:30,y:420,width:560,format:'html',markdown:${JSON.stringify('<pre><code class="language-go">package main\nfunc main() {}</code></pre>')}}]});view={x:15,y:10,scale:1};activateTool('select',false,true,'mouse');render();window.inkspaceAIHost.request=async request=>{if(request.type==='ai-copy'){window.codeCopied=request.text;return true;}window.aiSent=request;return ${JSON.stringify(response([]))}};void 0;`);
    assert(await run('!!noteCache.get("code").body.querySelector("code [style]")'));
    assert(await run('!!noteCache.get("html-code").body.querySelector(".html-content").shadowRoot.querySelector("code [style]")'));
    const colors = await run(`(()=>{const code=noteCache.get('code').body.querySelector('code');return{body:getComputedStyle(code).color,keyword:getComputedStyle(code.querySelector('[style]')).color}})()`);
    assert.notEqual(colors.body, colors.keyword, 'syntax spans must be visibly colored');
    const copyPoint = await run(`(()=>{const b=noteCache.get('code').body.querySelector('.ink-code-copy'),r=b.getBoundingClientRect(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);return{x,y,target:document.elementFromPoint(x,y).className}})()`);
    assert(copyPoint.target.includes('ink-code-copy'), copyPoint.target);
    const codeHistory = await run('history.length');
    w.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:copyPoint.x,y:copyPoint.y});
    w.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:copyPoint.x,y:copyPoint.y}); await pause(30);
    assert.equal(await run('window.codeCopied'), code, 'copy excludes language label and toolbar');
    assert.equal(await run('history.length'), codeHistory, 'copy never moves or edits a block');
    const panStart = await run('({...view})');
    w.webContents.sendInputEvent({type:'mouseDown',button:'middle',x:copyPoint.x,y:copyPoint.y});
    w.webContents.sendInputEvent({type:'mouseMove',x:copyPoint.x+25,y:copyPoint.y+10});
    w.webContents.sendInputEvent({type:'mouseUp',button:'middle',x:copyPoint.x+25,y:copyPoint.y+10}); await pause(30);
    assert.equal(await run('view.x'), panStart.x + 25, 'middle mouse pans over the code toolbar');
    await run(`window.codeCopied=null;activateTool('pen',false,true,'pen');(()=>{const b=noteCache.get('code').body.querySelector('.ink-code-copy');for(const [type,dx] of [['pointerdown',0],['pointermove',15],['pointerup',20]]){const e=new PointerEvent(type,{bubbles:true,composed:true,pointerType:'pen',pointerId:771,button:0,buttons:type==='pointerup'?0:1,pressure:.7,clientX:${copyPoint.x}+dx,clientY:${copyPoint.y}});Object.defineProperties(e,{nativeInk:{value:true},nativePrecision:{value:true}});b.dispatchEvent(e)}})();void 0;`);
    assert.equal(await run('window.codeCopied'), null); assert.equal(await run('doc.strokes.length'), 1, 'pen writes through the copy toolbar');
    await run(`activateTool('select',false,true,'mouse');document.querySelector('[data-ai-attach="view"]').click();document.querySelector('#ai-prompt').value='检查代码';document.querySelector('#ai-send').click();`);
    for (let i = 0; i < 100 && await run('document.querySelector("#ai-send").disabled'); i++) await pause(50);
    await run(`document.querySelector('#ai-review').innerHTML=InkContent.markdown(${JSON.stringify('```python\n' + code + '```')});void 0;`);
    assert(await run('!!document.querySelector("#ai-review code [style]")'));
    assert.equal(await run('document.querySelector("#ai-settings").open'), false, 'model settings stay folded');
    assert.equal(await run('document.querySelectorAll(".ai-suggestions,.ai-input-options,#ai-scope-options").length'), 0);
    assert.equal(await run('getComputedStyle(document.querySelector("#ai-insert")).backgroundColor'), 'rgb(40, 104, 199)', 'legacy green button rules cannot override the assistant design');
    await run('document.body.classList.add("vscode-dark")');
    const darkPalette = await run(`(()=>{const code=document.querySelector('#ai-review code');return{keyword:getComputedStyle(code.querySelector('[style]')).color,background:getComputedStyle(code.closest('pre')).backgroundColor}})()`);
    assert.equal(darkPalette.background, 'rgb(41, 45, 53)'); assert.equal(darkPalette.keyword, 'rgb(86, 156, 214)');
    assert.equal(await run('getComputedStyle(noteCache.get("code").body.querySelector("pre")).backgroundColor'), 'rgb(245, 247, 250)', 'paper code retains its light palette');
    await run('document.body.classList.remove("vscode-dark")');
    await run(`document.querySelector('#ai-review').innerHTML=InkContent.markdown(${JSON.stringify('```\nx = 1\nprint("hello")\n```')});void 0;`);
    const unspecifiedColors = await run(`(()=>{const code=document.querySelector('#ai-review code'),spans=[...code.querySelectorAll('[style]')];return{source:code.textContent,label:code.closest('pre').querySelector('.ink-code-toolbar>span').textContent,colors:[...new Set(spans.map(span=>getComputedStyle(span).color))]}})()`);
    assert.equal(unspecifiedColors.source, 'x = 1\nprint("hello")\n'); assert(unspecifiedColors.colors.length >= 3, JSON.stringify(unspecifiedColors));
    assert(unspecifiedColors.label.includes('通用') || unspecifiedColors.label.includes('自动'));
    await pause(60); fs.writeFileSync(path.join(root, 'artifacts/ai-notes/input-modes.png'), (await w.webContents.capturePage()).toPNG());
    assert.equal(errors.filter(e => !e.includes('CSP')).length, 0, errors.join('\n'));
    console.log(JSON.stringify({ passed: true, nativeProposal: true, oneUndo: true, nativeConnections: true, staleInkRejected: true, contentWidthPreserved: true, snapshot: size, selectionCrop: crop.getSize(), multiTurn: true, dataWithoutScreenshot: true, generationWithoutNotebook: true, explicitVisualInput: true, stableAttachments: true, markdownAndHtmlCode: true, exactCodeCopy: true, penThroughCode: true, middlePanThroughCode: true, darkPalette: true }));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { w.destroy(); fs.rmSync(html, { force: true }); app.exit(process.exitCode || 0); }
});
