const { app, BrowserWindow } = require("electron"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, ".."),
  html = path.join(root, "vscode/media/arrangement-test.html"),
  pause = (ms) => new Promise((r) => setTimeout(r, ms));
app.setPath("userData", path.join(root, "artifacts/arrangement-profile"));
app.whenReady().then(async () => {
  const w = new BrowserWindow({
      width: 1280,
      height: 900,
      show: true,
      webPreferences: { backgroundThrottling: false },
    }),
    errors = [];
  w.webContents.on("console-message", (event) => {
    if (event.level === "error") {
      errors.push(event.message);
      console.error(event.message);
    }
  });
  const run = async (source) => {
      try {
        return await w.webContents.executeJavaScript(source);
      } catch (e) {
        console.error(source.slice(0, 500));
        throw e;
      }
    },
    inject = require("./mouse-input.cjs")(w.webContents);
  const point = (expr) =>
    run(
      `(()=>{const b=${expr},r=viewport.getBoundingClientRect();return{x:Math.round(r.left+view.x+(b.x+b.w/2)*view.scale),y:Math.round(r.top+view.y+(b.y+b.h/2)*view.scale)}})()`,
    );
  const element = (selector) =>
    run(
      `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`,
    );
  async function click(p) {
    inject({ type: "mouseMove", ...p });
    inject({ type: "mouseDown", button: "left", clickCount: 1, ...p });
    inject({ type: "mouseUp", button: "left", clickCount: 1, ...p });
    await pause(35);
  }
  async function start(p, dx, dy, modifiers = []) {
    inject({ type: "mouseMove", ...p });
    inject({ type: "mouseDown", button: "left", clickCount: 1, ...p });
    inject({ type: "mouseMove", x: p.x + dx, y: p.y + dy, modifiers });
    await pause(45);
  }
  async function end(p, dx, dy) {
    inject({
      type: "mouseUp",
      button: "left",
      clickCount: 1,
      x: p.x + dx,
      y: p.y + dy,
    });
    await pause(40);
  }
  const key = (keyCode) => {
    inject({ type: "keyDown", keyCode });
    inject({ type: "keyUp", keyCode });
  };
  const reset = async () =>
    run(
      `window.inkspaceInlineText.cancel();finishInteraction();clearPenCursor();adoptDocument({...newCanvas(),notes:[{id:'a',x:60,y:80,width:240,markdown:'First text'},{id:'b',x:400,y:230,width:240,markdown:'Second text'}]});view={x:30,y:30,scale:1};activateTool('select',false,true,'mouse');clearSelection();render();history=[];future=[];void 0;`,
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
            Buffer.from(
              JSON.stringify({ client: "arrangement-test" }),
            ).toString("base64") +
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
    // Width is preview-only, one history entry on release, none on cancellation.
    await click(await point('itemBounds("notes",doc.notes[0])'));
    let p = await element(".media-width");
    await start(p, 70, 0);
    assert.equal(await run("doc.notes[0].width"), 240);
    assert.equal(await run("history.length"), 0);
    assert(await run('!document.querySelector(".arrangement-size").hidden'));
    await end(p, 70, 0);
    assert.equal(await run("doc.notes[0].width"), 310);
    assert.equal(await run("history.length"), 1);
    await run("undo();clearSelection();selected.notes=[0];overlaySelection();");
    p = await element(".media-width");
    await start(p, 60, 0);
    key("Escape");
    await end(p, 60, 0);
    assert.equal(await run("doc.notes[0].width"), 240);
    assert.equal(await run("history.length"), 0);
    // Lock works for dragging, keyboard nudging and deletion; unlocked selection remains editable.
    await run('window.inkspaceCommands.execute("lock");void 0;');
    const before = await run("doc.notes[0].x");
    p = await point('itemBounds("notes",doc.notes[0])');
    await start(p, 50, 20);
    await end(p, 50, 20);
    key("Right");
    key("Delete");
    assert.equal(await run("doc.notes.length"), 2);
    assert.equal(await run("doc.notes[0].x"), before);
    await run('window.inkspaceCommands.execute("lock");void 0;');
    // Align mixed selected items atomically and rollback an injected command failure.
    await reset();
    await run(
      'selected.notes=[0,1];overlaySelection();window.inkspaceArrangement.align("top");void 0;',
    );
    assert.equal(
      await run(
        'itemBounds("notes",doc.notes[0]).y===itemBounds("notes",doc.notes[1]).y',
      ),
      true,
    );
    assert.equal(await run("history.length"), 1);
    await run("undo();void 0;");
    assert.equal(await run("doc.notes[1].y"), 230);
    assert(
      await run(
        `(()=>{const text=JSON.stringify(doc),h=history.length;try{window.inkspaceTransactions.run('failure',()=>{doc.notes[0].x+=500;throw Error('fixture')})}catch{}return JSON.stringify(doc)===text&&history.length===h})()`,
      ),
    );
    // Common z-order is reflected by both live native nodes and hit testing.
    await reset();
    await run("window.oldStroke={color:'#000000',width:3,points:[{x:0,y:0,p:.5}]};doc.strokes=[oldStroke];selected.strokes=[0];void 0;");
    assert(await run('doc.strokes[0]!==oldStroke&&!oldStroke.id&&!!doc.strokes[0].id'),'Legacy identity mutated the saved baseline');
    await reset();
    await run(
      `window.cell=window.inkspaceDiagram.add('rect',{x:180,y:110});clearSelection();render();void 0;`,
    );
    const overlap = await point('itemBounds("notes",doc.notes[0])');
    assert.equal(
      await run(
        `window.inkspaceBlocks.pick({clientX:${overlap.x},clientY:${overlap.y},target:viewport}).kind`,
      ),
      "notes",
    );
    await run(
      `window.inkspaceBlocks.selectReferences([{kind:'diagram',id:cell.id}]);window.inkspaceArrangement.order('front');void 0;`,
    );
    assert.equal(
      await run(
        `window.inkspaceBlocks.pick({clientX:${overlap.x},clientY:${overlap.y},target:viewport}).kind`,
      ),
      "diagram",
    );
    assert(
      await run(
        `Number(document.querySelector('.diagram-cell-layer').style.zIndex)>Number(noteCache.get('a').el.style.zIndex)`,
      ),
    );
    p = await point("window.inkspaceDiagram.coverage([cell]).boxes[0]");
    await start(p, 40, 25);
    await end(p, 40, 25);
    assert(await run("cell.geometry.x>100"));
    assert(await run('!!document.querySelector(".diagram-cell-layer>svg>*")'));
    // Locks and links survive selection copy/paste; stable region navigation has a back path.
    await reset();
    await run(
      `selected.notes=[0];overlaySelection();window.inkspaceTransactions.run('metadata',()=>{doc.bookmarks=[{id:'region',name:'Area',rect:{x:20,y:30,w:600,h:400}}];window.inkspaceArrangement.setState([{kind:'notes',id:'a'}],{locked:true,link:{page:notebook.activePage,bookmark:'region'}})});window.clipboardFixture=selectionClipboardText();pasteAnchor={x:700,y:400};pasteSelectionText(clipboardFixture);void 0;`,
    );
    assert.equal(await run("doc.notes.length"), 3);
    assert(await run("window.inkspaceArrangement.selectionLocked()"));
    assert(
      await run(
        "!!window.inkspaceArrangement.state(window.inkspaceBlocks.references()[0]).link",
      ),
    );
    const oldView = await run("JSON.stringify(view)");
    assert(
      await run(
        'window.inkspacePlaces.navigate({page:notebook.activePage,bookmark:"region"})',
      ),
    );
    assert(await run("window.inkspaceNavigation.state().back>0"));
    await run('window.inkspaceNavigation.travel("back");void 0;');
    assert.equal(await run("JSON.stringify(view)"), oldView);
    assert.equal(
      await run(
        'window.inkspacePlaces.navigate({page:notebook.activePage,bookmark:"deleted"})',
      ),
      false,
    );
    // Switching canvases commits exactly once; loss of focus cancels a preview.
    await reset();
    p = await point('itemBounds("notes",doc.notes[0])');
    await start(p, 65, 21);
    await run('window.dispatchEvent(new Event("blur"));void 0;');
    await end(p, 65, 21);
    assert.equal(await run("doc.notes[0].x"), 60);
    assert.equal(await run("history.length"), 0);
    p = await point('itemBounds("notes",doc.notes[0])');
    await start(p, 60, 20);
    await run(
      `window.sourcePage=notebook.activePage;notebook.pages.push({id:'other',title:'Other',document:newCanvas(),view:{x:0,y:0,scale:1}});switchPage('other');switchPage(sourcePage);void 0;`,
    );
    await end(p, 60, 20);
    assert.equal(await run("history.length"), 1);
    assert.equal(await run("doc.notes[0].x"), 120);
    await run("undo();void 0;");
    assert.equal(await run("doc.notes[0].x"), 60);
    assert(await run("valid(documentData())"));
    assert.equal(
      await run(
        'valid({...newCanvas(),bookmarks:[{id:"bad",name:"bad",rect:{x:0,y:0,w:-1,h:2}}]})',
      ),
      false,
    );
    await reset();
    await run('selected.notes=[0,1];overlaySelection();window.inkspacePlaces.editBookmark();void 0;');
    await run('document.querySelector(".workbench-dialog input").value="Reading area";document.querySelector(".workbench-dialog form").requestSubmit();void 0;');
    assert.equal(await run('doc.bookmarks[0].name'),'Reading area');
    await run('window.inkspacePlaces.linkTo();void 0;');
    await click(await element('.workbench-dialog .place-list button:last-child'));
    assert(await run('!!window.inkspaceArrangement.state({kind:"notes",id:"a"}).link.bookmark'));
    await run('window.inkspaceArrangement.openLayers();void 0;');
    key('Delete');
    assert.equal(await run('doc.notes.length'),2,'Modal keyboard leaked to canvas');
    await pause(80);
    fs.writeFileSync(path.join(root,'artifacts/arrangement-layers.png'),(await w.webContents.capturePage()).toPNG());
    await run('document.querySelector("dialog[open]").close();void 0;');
    fs.writeFileSync(
      path.join(root, "artifacts/arrangement-layout.png"),
      (await w.webContents.capturePage()).toPNG(),
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        passed: true,
        previewOnlyWidth: true,
        atomicUndo: true,
        lockedMoveDeleteAndNudge: true,
        alignment: true,
        commandRollback: true,
        crossMediaLayers: true,
        nativeGraphDrag: true,
        clipboardMetadata: true,
        bookmarksAndBack: true,
        focusCancellation: true,
        canvasSwitchCommit: true,
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
