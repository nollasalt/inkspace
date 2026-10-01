const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {measureFrame,toRoot}=require('../vscode-native/frame-geometry.cjs');
module.exports=async({win,root,native,workspace})=>{
 const pause=ms=>new Promise(r=>setTimeout(r,ms));const evaluate=code=>win.webContents.executeJavaScript(code);
 for(let i=0;i<300;i++){if(await evaluate('!!window.inkspaceTheiaValidation&&!!document.querySelector("#inkspace-canvas-frame")?.contentWindow.inkspaceValidation'))break;await pause(100);if(i===299)throw Error('Theia frontend/canvas startup timed out')}
 // The smoke profile disables trust prompts only for the generated disposable fixture.
 for(let i=0;i<80;i++){await evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Yes, I trust the authors');if(button)button.click()})()`);if(await evaluate(`document.querySelector('#theia-top-panel')?.getBoundingClientRect().height>0&&!document.querySelector('.dialogOverlay')`))break;await pause(100)}
 assert(await evaluate(`document.querySelector('#theia-top-panel').getBoundingClientRect().height>0`),'Theia menu visible');
 await pause(2000);
 const frame=win.webContents.mainFrame.frames.find(item=>item.url.includes('/inkspace/index.html'));assert(frame,'canvas frame');const ink=code=>frame.executeJavaScript(code);
 const status=await ink('desktop.inkStatus()');assert.equal(status.cairo,'1.18.4');assert(status.hooks>0,'native HWND hooks');
 await ink('savedDocument=contentSignature();adoptDocument(newCanvas());view={x:0,y:0,scale:1};render()');await pause(200);
 const layout=await measureFrame(frame),viewport=await ink('(()=>{const r=viewport.getBoundingClientRect();return{x:r.x,y:r.y}})()');
 const metrics=await ink('(()=>{window.probeIntervals=[];window.probeLast=performance.now();window.probeTimer=setInterval(()=>{const now=performance.now();probeIntervals.push(now-probeLast);probeLast=now},16);return renderStats})()');
 const before=await ink('doc.strokes.length');let id=70;
 for(let batch=0;batch<15;batch++){const packets=[];for(let dot=0;dot<10;dot++){const point=toRoot({x:viewport.x+200+(dot%3)*2+.125,y:viewport.y+180+(batch%3)*2+.375},layout);for(const type of ['pointerdown','pointerup'])packets.push({type,samples:[{...point,p:.6,id,eraser:false,precise:true}]});id++}win.webContents.send('theia-pen',packets);await pause(16)}
 await pause(250);const dots=await ink('doc.strokes.length');assert.equal(dots-before,150,'rapid dots preserved through host bridge');
 const timing=await ink('(()=>{clearInterval(probeTimer);return{maxInterval:Math.max(...probeIntervals),intervals:probeIntervals.length,stats:renderStats}})()');assert(timing.intervals>5,'renderer event loop serviced during batched handwriting');
 await ink('undo();redo()');assert.equal(await ink('doc.strokes.length'),dots,'undo/redo');
 const file=path.join(workspace,'验证画布.inkspace.json');await fs.writeFile(file,await ink('documentJSON(true)'),'utf8');await ink('savedDocument=contentSignature();');
 await evaluate('inkspaceTheiaValidation.openText('+JSON.stringify(pathToFileURL(path.join(workspace,'README.md')).href)+').then(()=>true)');await pause(200);const text=await evaluate('inkspaceTheiaValidation.editors.currentEditor.editor.getControl().getValue()');assert(text.includes('Theia'),'Theia editor opened actual workspace file');
 assert.equal(await evaluate('inkspaceTheiaValidation.editors.currentEditor.editor.getControl().getModel().getLanguageId()'),'markdown','Markdown language detection');
 const created=pathToFileURL(path.join(workspace,'created.txt')).href,renamed=pathToFileURL(path.join(workspace,'renamed.txt')).href;await fs.rm(path.join(workspace,'renamed.txt'),{force:true});
 await evaluate(`inkspaceTheiaValidation.files.createFile(inkspaceTheiaValidation.uri(${JSON.stringify(created)})).then(()=>true)`);await evaluate(`inkspaceTheiaValidation.files.move(inkspaceTheiaValidation.uri(${JSON.stringify(created)}),inkspaceTheiaValidation.uri(${JSON.stringify(renamed)})).then(()=>true)`);assert((await fs.stat(path.join(workspace,'renamed.txt'))).isFile(),'Theia create and rename');
 await evaluate(`(()=>{const widget=inkspaceTheiaValidation.editors.currentEditor;widget.editor.getControl().trigger('keyboard','type',{text:${JSON.stringify('<!-- Monaco edit verification -->\n')}});return widget.saveable.save().then(()=>true)})()`);
 assert((await fs.readFile(path.join(workspace,'README.md'),'utf8')).includes('Monaco edit verification'),'Monaco editing and save');
 const {createCanvas}=require('@napi-rs/canvas');const image=createCanvas(12,12);image.getContext('2d').fillRect(0,0,12,12);
 await fs.mkdir(path.join(workspace,'图片 空格'),{recursive:true});
 await fs.writeFile(path.join(workspace,'图片 空格','测试.png'),image.toBuffer('image/png'));
 await fs.writeFile(path.join(workspace,'图片 空格','测试.webp'),image.toBuffer('image/webp'));
 await fs.appendFile(path.join(workspace,'README.md'),'\n![PNG](<图片 空格/测试.png>)\n![WebP](<图片 空格/测试.webp>)\n');
 await evaluate('inkspaceTheiaValidation.preview('+JSON.stringify(pathToFileURL(path.join(workspace,'README.md')).href)+').then(()=>true)');
 const imagesLoaded=`(()=>{const images=[...document.querySelectorAll('.theia-preview-widget img')];return !!document.querySelector('.theia-preview-widget h1')&&images.length>=3&&images.every(img=>img.complete&&img.naturalWidth>0)})()`;
 for(let i=0;i<60;i++){if(await evaluate(imagesLoaded))break;await pause(100)}
 assert(await evaluate(imagesLoaded),'Markdown first-open SVG, PNG and WebP with Chinese and space paths');
 await evaluate(`inkspaceTheiaValidation.commands.executeCommand('terminal:new').then(()=>true)`);
 for(let i=0;i<100;i++){if(await evaluate(`inkspaceTheiaValidation.terminals.all.at(-1)?.terminalId>0`))break;await pause(100)}
 assert(await evaluate(`inkspaceTheiaValidation.terminals.all.at(-1)?.terminalId>0`),'real terminal process started');
 await evaluate(`inkspaceTheiaValidation.terminals.all.at(-1).sendText(${JSON.stringify('echo INKSPACE_THEIA_TERMINAL_OK\r')})`);
 let terminalOk=false;for(let i=0;i<100;i++){terminalOk=await evaluate(`inkspaceTheiaValidation.terminals.all.at(-1).buffer.getLines(0,200,true).some(line=>line.trim()==='INKSPACE_THEIA_TERMINAL_OK')`);if(terminalOk)break;await pause(100)}assert(terminalOk,'terminal executed command');
 await evaluate('inkspaceTheiaValidation.open().then(()=>true)');await pause(100);await ink('view={x:0,y:0,scale:.36};render()');await pause(100);const scaled=await measureFrame(frame);const point=toRoot({x:viewport.x+210.375,y:viewport.y+190.125},scaled);win.webContents.send('theia-pen',[{type:'pointerdown',samples:[{...point,p:.8,id:999,precise:true}]},{type:'pointerup',samples:[{...point,p:.8,id:999,precise:true}]}]);await pause(100);assert.equal(await ink('doc.strokes.length'),dots+1,'scaled handwriting');
 await ink('savedDocument=contentSignature()');await evaluate('inkspaceTheiaValidation.openFile('+JSON.stringify(pathToFileURL(file).href)+').then(()=>true)');await pause(300);assert.equal(await ink('doc.strokes.length'),150,'canvas custom opener reloads saved note');
 assert(await evaluate(`(()=>{const shell=inkspaceTheiaValidation.shell;const widget=[...shell.mainPanel.widgets()].find(item=>item.id==='inkspace-native-canvas');return shell.getTabBarFor(widget).currentTitle.owner.id==='inkspace-native-canvas'})()`),'canvas tab is selected');
 await ink(`doc.notes.push({id:'theia-save-check',x:30,y:30,width:560,markdown:'Theia 原生手写页保存验证'});parent.inkspaceTheiaValidation.notifyDirty();render()`);
 await evaluate(`[...inkspaceTheiaValidation.shell.mainPanel.widgets()].find(widget=>widget.id==='inkspace-native-canvas').saveable.save().then(()=>true)`);
 const saved=JSON.parse(await fs.readFile(file,'utf8'));assert(saved.pages[0].document.notes.some(note=>note.id==='theia-save-check'),'Theia Saveable writes native note');
 await evaluate('inkspaceTheiaValidation.openText('+JSON.stringify(pathToFileURL(path.join(workspace,'README.md')).href)+').then(()=>true)');
 await evaluate(`inkspaceTheiaValidation.editors.currentEditor.editor.getControl().trigger('keyboard','type',{text:'<!-- unsaved-close-proof -->'})`);
 await evaluate(`window.theiaCloseResult=undefined;inkspaceTheiaValidation.requestClose().then(result=>window.theiaCloseResult=result);true`);
 let cancelled=false;for(let i=0;i<50;i++){cancelled=await evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Cancel');if(button){button.click();return true}return false})()`);if(cancelled)break;await pause(100)}assert(cancelled,'Theia offered cancellation for unsaved text');
 for(let i=0;i<30;i++){if(await evaluate('window.theiaCloseResult===false'))break;await pause(100)}assert.equal(await evaluate('window.theiaCloseResult'),false,'unsaved text can prevent desktop close');
 await evaluate('inkspaceTheiaValidation.editors.currentEditor.saveable.save().then(()=>true)');await evaluate('inkspaceTheiaValidation.open().then(()=>true)');
 await pause(500);await fs.mkdir(path.join(root,'artifacts'),{recursive:true});await fs.writeFile(path.join(root,'artifacts','theia-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 const report={passed:true,theiaWorkspace:true,theiaTextEditor:true,textEditSave:true,fileCreateRename:true,markdownInitialImage:true,terminalCommand:true,customNoteOpener:true,nativeNoteSave:true,unsavedTextCloseCancelled:true,native:status,syntheticRapidDots:150,scaledInput:true,undoRedo:true,rendererTiming:timing,physicalPen:'requires user device testing'};await fs.writeFile(path.join(root,'artifacts','theia-smoke.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
};
