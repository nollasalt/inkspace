const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const testHtml=path.resolve(__dirname,'../vscode/media/text-mouse-test.html');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(r=>setTimeout(r,ms));
app.setPath('userData',path.join(root,'artifacts','text-mouse-profile'));
app.whenReady().then(async()=>{
  const w=new BrowserWindow({width:1100,height:820,show:true,webPreferences:{backgroundThrottling:false}}),run=async code=>{try{return await w.webContents.executeJavaScript(code)}catch(error){console.error('Failed renderer source:',code.slice(0,180));throw error}};
  w.webContents.on('console-message',event=>console.error(event.message));
  try{
    fs.writeFileSync(testHtml,fs.readFileSync(path.join(root,'vscode','media','index.html'),'utf8').replace('<body>','<body><meta id="inkspace-assets" content="'+require('node:url').pathToFileURL(path.join(root,'vscode','media','index.html')).href+'">'));await w.loadFile(testHtml);
    await w.webContents.insertCSS(fs.readFileSync(path.join(root,'vscode','codium.css'),'utf8'));
    await run(fs.readFileSync(path.join(root,'vscode','inline-text.js'),'utf8'));w.focus();await pause(200);
    await run(`window.mouseTrace=[];for(const type of ['pointerdown','pointerup','click','dblclick'])document.addEventListener(type,e=>mouseTrace.push({type,target:e.target.className,detail:e.detail}),true);`);
    for(const toolName of ['pen','pan','select']){
      const point=await run(`window.inkspaceInlineText.finish();finishInteraction();doc={...doc,notes:[{id:'real-double-click',x:40,y:40,width:320,markdown:'Edit this text'}],strokes:[],shapes:[],pdfs:[],diagram:undefined};tool=${JSON.stringify(toolName)};view={x:80,y:60,scale:1};clearSelection();render();(()=>{const r=noteCache.get('real-double-click').el.querySelector('.note-hit').getBoundingClientRect();return{x:Math.round(r.left+30),y:Math.round(r.bottom-8)}})()`);
      w.webContents.sendInputEvent({type:'mouseMove',...point});
      for(const clickCount of [1,2]){w.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount,...point});await pause(30);w.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount,...point});await pause(40)}
      const result=await run(`({editing:window.inkspaceInlineText.isEditing(),value:document.querySelector('.inline-note-editor')?.value,focused:document.activeElement?.className,notes:doc.notes.length,trace:mouseTrace.splice(0)})`);
      assert(result.editing&&result.value==='Edit this text'&&result.focused==='inline-note-editor'&&result.notes===1,JSON.stringify({tool:toolName,...result}));
      if(toolName==='pan'){
        await run('window.inkspaceInlineText.finish();clearPenCursor();');w.webContents.sendInputEvent({type:'mouseMove',...point});await pause(40);
        assert(await run("noteCache.get('real-double-click').el.classList.contains('mouse-hover')"));
        await run("updatePenCursor({pointerType:'pen',clientX:100,clientY:100});");assert(await run("getComputedStyle(noteCache.get('real-double-click').el.querySelector('.note-scale')).opacity==='0'"));await pause(200);
        w.webContents.sendInputEvent({type:'mouseMove',x:point.x+1,y:point.y});await pause(40);
        const control=await run("(()=>{const el=noteCache.get('real-double-click').el,r=el.querySelector('.note-scale').getBoundingClientRect(),b=window.inkspaceInlineText.bounds(doc.notes[0]);return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),dx:b.w*.5,dy:b.h*.5,toolbar:el.querySelector('.note-bar').getBoundingClientRect().width}})()");assert(control.toolbar<=48.1);
        w.webContents.sendInputEvent({type:'mouseMove',x:control.x,y:control.y});w.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:control.x,y:control.y});await pause(30);w.webContents.sendInputEvent({type:'mouseMove',x:Math.round(control.x+control.dx),y:Math.round(control.y+control.dy)});await pause(40);w.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:Math.round(control.x+control.dx),y:Math.round(control.y+control.dy)});await pause(40);
        const scaled=await run('({scale:doc.notes[0].scale,width:doc.notes[0].width,x:view.x,y:view.y})');assert(Math.abs(scaled.scale-1.5)<.02&&scaled.width===320&&scaled.x===80&&scaled.y===60,JSON.stringify(scaled));
      }
    }
    console.log(JSON.stringify({passed:true,chromiumMouseInput:true,doubleClickTools:['pen','pan','select'],correctText:true,noExtraNote:true,penHoverHidden:true,realMouseScale:true,compactToolbar:true}));fs.rmSync(testHtml,{force:true});app.exit(0);
  }catch(error){console.error(error);fs.rmSync(testHtml,{force:true});app.exit(1)}
});
