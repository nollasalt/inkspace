const { app, BrowserWindow } = require("electron");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, ".."),
  html = path.join(root, "vscode/media/workbench-test.html");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app.setPath("userData", path.join(root, "artifacts/workbench-test-profile"));
app.whenReady().then(async () => {
  const w = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    webPreferences: { backgroundThrottling: false },
  });
  const errors = [];
  w.webContents.on("console-message", (e) => {
    if (e.level === "error") errors.push(e.message);
  });
  const run = (source) => w.webContents.executeJavaScript(source),
    inject = require("./mouse-input.cjs")(w.webContents);
  const point = (selector) =>
    run(
      `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`,
    );
  async function click(p, count = 1) {
    inject({ type: "mouseMove", ...p });
    inject({ type: "mouseDown", button: "left", clickCount: count, ...p });
    inject({ type: "mouseUp", button: "left", clickCount: count, ...p });
    await pause(40);
  }
  async function drag(p, dx, dy) {
    inject({ type: "mouseMove", ...p });
    inject({ type: "mouseDown", button: "left", clickCount: 1, ...p });
    await pause(10);
    for (let i = 1; i <= 4; i++) {
      inject({
        type: "mouseMove",
        x: Math.round(p.x + (dx * i) / 4),
        y: Math.round(p.y + (dy * i) / 4),
      });
      await pause(18);
    }
    inject({
      type: "mouseUp",
      button: "left",
      clickCount: 1,
      x: Math.round(p.x + dx),
      y: Math.round(p.y + dy),
    });
    await pause(40);
  }
  const key = (keyCode, modifiers = []) => {
    inject({ type: "keyDown", keyCode, modifiers });
    inject({ type: "keyUp", keyCode, modifiers });
  };
  const reset = async (source) =>
    run(
      `window.inkspaceInlineText.cancel();finishInteraction();clearPenCursor();adoptDocument({...newCanvas(),notes:[{id:'text',x:70,y:60,width:350,markdown:${JSON.stringify(source || "First paragraph.\n\nSecond paragraph with **bold target** text.\n\nFinal paragraph.")}}]});view={x:30,y:30,scale:1};activateTool('select',false);clearSelection();render();history=[];future=[];void 0;`,
    );
  try {
    const assets = require("node:url").pathToFileURL(
      path.join(root, "vscode/media/index.html"),
    ).href;
    fs.writeFileSync(
      html,
      fs
        .readFileSync(path.join(root, "vscode/media/index.html"), "utf8")
        .replace(
          "<body>",
          '<body><meta id="inkspace-assets" content="' +
            assets +
            '"><meta id="inkspace-boot" content="' +
            Buffer.from(JSON.stringify({ client: "workbench-test" })).toString(
              "base64",
            ) +
            '">',
        ),
    );
    await w.loadFile(html);
    await w.webContents.insertCSS(
      fs.readFileSync(path.join(root, "vscode/codium.css"), "utf8"),
    );
    await run(
      `window.acquireVsCodeApi=()=>({getState:()=>window.testState||{},setState:s=>window.testState=s,postMessage:()=>{}});window.inkspaceNative={status:()=>({connected:false,error:'test'})};void 0;`,
    );
    for (const file of [
      "inline-text.js",
      "navigation-data.js",
      "navigation.js",
      "adapter.js",
    ])
      await run(fs.readFileSync(path.join(root, "vscode", file), "utf8"));
    w.focus();
    await pause(100);
    await reset();
    assert.equal(
      await run(
        'document.querySelectorAll("header #sidebar-diagram-toggle").length',
      ),
      1,
    );
    assert.equal(
      await run('document.querySelector("header [data-tool=shape]")'),
      null,
    );
    assert.equal(
      await run('document.querySelector("header [data-tool=pdftext]")'),
      null,
    );
    await run(
      'setDiagramSidebarCollapsed(false);window.inkspaceWorkbench.openResource("diagram",false);',
    );
    const design = await run(`(()=>{
      const rect=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();
      const selected=getComputedStyle(document.querySelector('header [data-tool=select]'));
      return{header:rect('header'),stage:rect('#viewport'),panel:rect('#diagram-sidebar'),panelHeader:rect('.workbench-panel-header'),
        tile:rect('#diagram-palette button'),icon:rect('#diagram-palette .workbench-icon'),footer:rect('#input-status-bar'),
        views:rect('.workbench-view-controls'),canvases:rect('#show-pages'),selectedBackground:selected.backgroundColor,selectedText:selected.color,
        toolLabels:[...document.querySelectorAll('header .tools button')].map(el=>el.textContent),topUndo:getComputedStyle(document.querySelector('#undo').parentElement).display};
    })()`);
    assert.equal(design.header.height, 39);
    assert.equal(design.panel.width, 224);
    assert.equal(design.stage.right, design.panel.left);
    assert.equal(design.panelHeader.height, 39);
    assert.equal(design.tile.height, 65);
    assert.equal(design.icon.width, 15);
    assert.equal(design.footer.height, 29);
    assert(design.canvases.left < design.views.left);
    assert.equal(design.views.bottom <= design.footer.bottom, true);
    assert.equal(design.selectedBackground, "rgb(229, 238, 249)");
    assert.equal(design.selectedText, "rgb(41, 41, 41)");
    assert.deepEqual(design.toolLabels, ["编排", "画笔", "橡皮", "图形"]);
    assert.equal(design.topUndo, "none");
    await run("window.inkspaceWorkbench.exitResource();");
    await click(await point("#workbench-insert"));
    key("Escape");
    await pause(30);
    assert.equal(
      await run('document.querySelector("#workbench-insert-menu").hidden'),
      true,
    );
    // Explicit resources remember visibility, while ordinary selection does not reopen it.
    await run("setDiagramSidebarCollapsed(true);");
    await click(await point("#sidebar-diagram-toggle"));
    assert.equal(
      await run(
        'getComputedStyle(document.querySelector("#sidebar-diagram")).display!=="none"',
      ),
      true,
    );
    await drag(await point(".workbench-sidebar-resizer"), -40, 0);
    assert.equal(await run("testState.sidebarWidth"), 264);
    await run("view={x:-1200,y:430,scale:.7};render();");
    await click(await point("[data-diagram=diamond]"));
    const graphCenter = await run(
      "(()=>{const cell=window.inkspaceDiagram.graph.getSelectionCell(),g=cell.geometry,p=world(viewport.clientWidth/2,viewport.clientHeight/2);return{dx:g.x+g.width/2-p.x,dy:g.y+g.height/2-p.y,resource:window.inkspaceWorkbench.resource.kind}})()",
    );
    assert(
      Math.abs(graphCenter.dx) < 0.01 && Math.abs(graphCenter.dy) < 0.01,
      JSON.stringify(graphCenter),
    );
    assert.equal(graphCenter.resource, "diagram");
    await click(await point("[data-diagram=rect]"));
    assert.equal(
      await run(
        "window.inkspaceDiagram.graph.getChildVertices(window.inkspaceDiagram.graph.getDefaultParent()).length",
      ),
      2,
    );
    key("Escape");
    await pause(40);
    assert.equal(
      await run('document.body.classList.contains("diagram-sidebar-hidden")'),
      true,
    );
    // Template drawing is the same mxGraph model; one gesture is one undo item.
    await reset();
    await click(await point("#sidebar-diagram-toggle"));
    await click(await point(".workbench-choices button:nth-child(2)"));
    await click(await point("[data-diagram=ellipse]"));
    assert.equal(await run("tool"), "shape");
    const blank = await run(
      "(()=>{const r=viewport.getBoundingClientRect();return{x:Math.round(r.left+450),y:Math.round(r.top+350)}})()",
    );
    await drag(blank, 180, 110);
    const drawn = await run(
      "(()=>{const cell=window.inkspaceDiagram.graph.getSelectionCell();return{style:cell.style,w:cell.geometry.width,h:cell.geometry.height,legacy:doc.shapes.length,history:history.length,tool}})()",
    );
    assert(drawn.style.includes("ellipse"));
    assert.equal(drawn.w, 180);
    assert.equal(drawn.h, 110);
    assert.equal(drawn.legacy, 0);
    assert.equal(drawn.history, 1);
    assert.equal(drawn.tool, "select");
    await run("undo();");
    assert.equal(
      await run(
        "window.inkspaceDiagram.graph.getChildVertices(window.inkspaceDiagram.graph.getDefaultParent()).length",
      ),
      0,
    );
    // Cancelling drawing never leaves an object or empty history item.
    await run(
      'window.inkspaceWorkbench.openResource("diagram",false);window.inkspaceWorkbench.chooseShape("rect");',
    );
    inject({ type: "mouseDown", button: "left", clickCount: 1, ...blank });
    inject({ type: "mouseMove", x: blank.x + 60, y: blank.y + 40 });
    key("Escape");
    inject({ type: "mouseUp", button: "left", clickCount: 1, ...blank });
    await pause(40);
    assert.equal(
      await run(
        "window.inkspaceDiagram.graph.getChildVertices(window.inkspaceDiagram.graph.getDefaultParent()).length",
      ),
      0,
    );
    assert.equal(await run("history.length"), 0);
    // Shared width and scale controls retain physical size during both kinds of zoom.
    await reset();
    await run("clearSelection();selected.notes=[0];overlaySelection();");
    for (const zoom of [0.5, 1, 2])
      for (const scale of [0.5, 1, 2]) {
        await run(`view.scale=${zoom};doc.notes[0].scale=${scale};render();`);
        const sizes = await run(
          '(()=>{const r=document.querySelector(".media-width").getBoundingClientRect(),s=document.querySelector("#selection .selection-scale").getBoundingClientRect(),t=document.querySelector(".media-action-strip").getBoundingClientRect();return{width:r.width,height:r.height,scale:s.width,toolbar:t.height}})()',
        );
        assert.equal(sizes.width, 6);
        assert.equal(sizes.height, 22);
        assert(Math.abs(sizes.scale - 10) < 0.6, JSON.stringify(sizes));
        assert.equal(sizes.toolbar, 26);
      }
    await run("view.scale=1;doc.notes[0].scale=1;render();");
    const widthBefore = await run("doc.notes[0].width");
    await drag(await point(".media-width"), 80, 0);
    assert.equal(await run("doc.notes[0].width"), widthBefore + 80);
    const scaleBefore = await run("doc.notes[0].scale");
    await drag(await point("#selection .selection-scale"), 60, 30);
    assert((await run("doc.notes[0].scale")) > scaleBefore);
    assert.equal(await run("doc.notes[0].width"), widthBefore + 80);
    const positionBefore = await run("({x:doc.notes[0].x,y:doc.notes[0].y})");
    await drag(await point(".media-grip"), 40, 20);
    assert.equal(await run("doc.notes[0].x"), positionBefore.x + 40);
    assert.equal(await run("doc.notes[0].y"), positionBefore.y + 20);
    // Native double click enters a source-mapped fragment. Unedited paragraphs stay put.
    const original =
      "First paragraph.\r\n\r\nSecond paragraph with **bold target** text.\r\n\r\nFinal paragraph.";
    await reset(original);
    const target = await run(
      '(()=>{const el=noteCache.get("text").body.querySelector("strong"),r=el.getBoundingClientRect();return{x:Math.round(r.left+35),y:Math.round(r.top+r.height/2)}})()',
    );
    const before = await run(
      '(()=>{const r=noteCache.get("text").body.querySelector("p:last-child").getBoundingClientRect();return{top:r.top,frame:itemBounds("notes",doc.notes[0])}})()',
    );
    await click(target, 1);
    await click(target, 2);
    assert.equal(
      await run("window.inkspaceInlineText.editingState().fragment"),
      true,
    );
    assert.equal(
      await run(
        'noteCache.get("text").body.querySelector("p:last-child").getBoundingClientRect().top',
      ),
      before.top,
    );
    assert.deepEqual(
      await run('itemBounds("notes",doc.notes[0])'),
      before.frame,
    );
    await w.webContents.insertText("INSERT");
    assert.equal(await run("doc.notes[0].markdown"), original);
    assert.equal(await run("history.length"), 0);
    key("Z", ["control"]);
    await pause(40);
    assert(
      !(await run(
        'window.inkspaceInlineText.editingState().source.includes("INSERT")',
      )),
    );
    await w.webContents.insertText("TOOLBAR");
    await run('window.inkspaceCommands.execute("undo");');
    assert.equal(await run("window.inkspaceInlineText.isEditing()"), true);
    assert(
      !(await run(
        'window.inkspaceInlineText.editingState().source.includes("TOOLBAR")',
      )),
    );
    await run('window.inkspaceCommands.execute("redo");');
    assert(
      await run(
        'window.inkspaceInlineText.editingState().source.includes("TOOLBAR")',
      ),
    );
    key("Z", ["control"]);
    await pause(40);
    await w.webContents.insertText("KEEP");
    const edited = await run("window.inkspaceInlineText.editingState().source");
    key("Enter", ["control"]);
    await pause(60);
    assert.equal(await run("doc.notes[0].markdown"), edited);
    assert(edited.startsWith("First paragraph.\r\n\r\n"));
    assert(edited.endsWith("\r\nFinal paragraph."));
    assert.equal(await run("history.length"), 1);
    await run("undo();");
    assert.equal(await run("doc.notes[0].markdown"), original);
    // Escape cancels source changes; middle-button panning keeps the session alive.
    await run("edit(doc.notes[0]);");
    await w.webContents.insertText("CANCEL");
    key("Escape");
    await pause(40);
    assert.equal(await run("doc.notes[0].markdown"), original);
    await run("edit(doc.notes[0]);");
    const editorPoint = await point(".inline-note-editor");
    const viewBefore = await run("({...view})");
    inject({ type: "mouseDown", button: "middle", ...editorPoint });
    inject({ type: "mouseMove", x: editorPoint.x + 35, y: editorPoint.y + 25 });
    inject({
      type: "mouseUp",
      button: "middle",
      x: editorPoint.x + 35,
      y: editorPoint.y + 25,
    });
    await pause(60);
    assert.equal(await run("window.inkspaceInlineText.isEditing()"), true);
    assert.equal(await run("view.x"), viewBefore.x + 35);
    assert.equal(await run("view.y"), viewBefore.y + 25);
    await run(
      'window.inkspaceInlineText.cancel();setDiagramSidebarCollapsed(false);document.body.classList.add("vscode-dark");window.inkspaceWorkbench.openResource("diagram",false);',
    );
    assert.equal(
      await run(
        'getComputedStyle(document.querySelector("header [data-tool=select]")).color',
      ),
      "rgb(231, 231, 231)",
    );
    assert.equal(
      await run(
        'getComputedStyle(document.querySelector("#diagram-sidebar")).backgroundColor',
      ),
      "rgb(32, 32, 33)",
    );
    w.setContentSize(600, 900);
    await pause(160);
    const compact = await run(
      '(()=>{const v=viewport.getBoundingClientRect(),p=document.querySelector("#diagram-sidebar").getBoundingClientRect(),f=document.querySelector("#input-status-bar").getBoundingClientRect();return{stageBottom:v.bottom,panelTop:p.top,panelRight:p.right,width:innerWidth,footerBottom:f.bottom,height:innerHeight}})()',
    );
    assert.equal(compact.panelTop, compact.stageBottom);
    assert.equal(compact.panelRight, compact.width);
    assert(compact.footerBottom <= compact.height);
    w.setContentSize(1280, 900);
    await pause(100);
    await run('document.body.classList.remove("vscode-dark");');
    await run(
      'window.inkspaceInlineText.cancel();clearPenCursor();window.inkspaceWorkbench.openResource("diagram",false);',
    );
    await pause(250);
    fs.writeFileSync(
      path.join(root, "artifacts/workbench-implemented.png"),
      (await w.webContents.capturePage()).toPNG(),
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        passed: true,
        designLayout: true,
        designMetrics: true,
        readableSelectedColors: true,
        oneGraphEntry: true,
        centerAfterPanZoom: true,
        libraryStaysOpen: true,
        sidebarVisibilityRestored: true,
        sidebarWidthRemembered: true,
        unifiedGraphDrawing: true,
        atomicUndo: true,
        cancelWithoutObject: true,
        fixedControls: 9,
        textReflowWidth: true,
        stripGripMovesSelection: true,
        nativeDoubleClickFragment: true,
        surroundingLayoutFrozen: true,
        crlfPreserved: true,
        localUndo: true,
        commandLocalUndoRedo: true,
        cancelEditing: true,
        middlePanKeepsEditor: true,
      }),
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    w.destroy();
    fs.rmSync(html, { force: true });
    app.exit(process.exitCode || 0);
  }
});
