const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(r=>setTimeout(r,ms));
app.setPath('userData',path.join(root,'artifacts/ownership-profile'));
app.whenReady().then(async()=>{
 const w=new BrowserWindow({width:1380,height:920,show:true,webPreferences:{backgroundThrottling:false}});
 const run=s=>w.webContents.executeJavaScript(s),inject=require('./mouse-input.cjs')(w.webContents);
 const send=(type,p,extra={})=>inject({type,...p,...extra});
 const click=async p=>{send('mouseMove',p);send('mouseDown',p,{button:'left',clickCount:1});send('mouseUp',p,{button:'left',clickCount:1});await pause(25)};
 const elementPoint=selector=>run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
 const html=path.join(root,'vscode/media/ownership-test.html');
 try{
  const assets=require('node:url').pathToFileURL(path.join(root,'vscode/media/index.html')).href;
  fs.writeFileSync(html,fs.readFileSync(path.join(root,'vscode/media/index.html'),'utf8').replace('<body>','<body><meta id="inkspace-assets" content="'+assets+'"><meta id="inkspace-boot" content="'+Buffer.from(JSON.stringify({client:'ownership-test'})).toString('base64')+'">'));
  await w.loadFile(html);await w.webContents.insertCSS(fs.readFileSync(path.join(root,'vscode/codium.css'),'utf8'));
  await run(`window.acquireVsCodeApi=()=>({getState:()=>({}),setState:()=>{},postMessage:()=>{}});window.inkspaceNative={status:()=>({connected:false,error:'test'})};void 0;`);
  for(const file of ['inline-text.js','navigation-data.js','navigation.js','adapter.js'])await run(fs.readFileSync(path.join(root,'vscode',file),'utf8'));
  await run('document.fonts.ready.then(()=>new Promise(requestAnimationFrame))');w.focus();await pause(80);
  const reset=async(zoom=1,scale=1,extra={})=>run(`window.inkspaceInlineText.finish();finishInteraction();adoptDocument({...newCanvas(),notes:[{id:'source',x:40,y:40,width:330,scale:${scale},markdown:'Short text',...${JSON.stringify(extra)}},{id:'target',x:600,y:300,width:300,markdown:'Target'}]});view={x:40,y:40,scale:${zoom}};activateTool('select',false);clearPenCursor();render();history=[];future=[];void 0;`);
  let geometries=0,adjacentPorts=0;
  for(const zoom of [.5,1,2])for(const scale of [.5,1,2])for(const extra of [
   {},{markdown:'A paragraph of words that wraps. '.repeat(4)},
   {format:'html',markdown:'<h2>Title</h2><p>Body</p>'},
   {viewMode:'window',viewHeight:120,markdown:'Line\n\n'.repeat(20)},
   {kind:'image',src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCrkAAAAASUVORK5CYII=',aspect:2,markdown:''}
  ]){
   await reset(zoom,scale,extra);
   await run("doc.notes[1].x=3000;doc.notes[1].y=3000;renderNotes();");
   const geometry=await run(`(()=>{const n=doc.notes[0],el=noteCache.get(n.id).el,b=itemBounds('notes',n);selectBox({x:b.x-.001,y:b.y-.001,w:b.w+.002,h:b.h+.002});overlaySelection();const selectedFrame=$('#selection').getBoundingClientRect(),r=el.getBoundingClientRect(),s=getComputedStyle(el,'::after'),outer=getComputedStyle(el),k=view.scale*(n.scale||1),border=parseFloat(s.borderLeftWidth);return{chosen:selected.notes.slice(),selection:selectedFrame.toJSON(),frame:{x:r.x+(parseFloat(outer.borderLeftWidth)+parseFloat(s.left))*k,y:r.y+(parseFloat(outer.borderTopWidth)+parseFloat(s.top))*k,width:(parseFloat(s.width)+(s.boxSizing==='border-box'?0:border*2))*k,height:(parseFloat(s.height)+(s.boxSizing==='border-box'?0:border*2))*k}}})()`);
   assert.deepEqual(geometry.chosen,[0]);for(const key of ['x','y','width','height'])assert(Math.abs(geometry.selection[key]-geometry.frame[key])<.7,JSON.stringify({zoom,scale,extra,key,geometry}));geometries++;
  }
  // Put a neighbour beneath the source's outside port, without overlapping bodies.
  for(const zoom of [.5,1,2])for(const scale of [.5,1,2]){
   await reset(zoom,scale);
   await run(`(()=>{const a=itemBounds('notes',doc.notes[0]),b=itemBounds('notes',doc.notes[1]);doc.notes[1].x+=a.x+a.w+2/view.scale-b.x;doc.notes[1].y+=a.y+a.h/2-b.y-b.h/2;renderNotes();noteCache.get('source').el.classList.add('mouse-hover');})()`);
   const p=await elementPoint('[data-id=source] .note-connect-right');
   assert(await run(`(()=>{const vp=viewport.getBoundingClientRect(),b=itemBounds('notes',doc.notes[1]);return InkInteraction.contains(b,world(${p.x}-vp.left,${p.y}-vp.top))})()`),'Fixture misses adjacent body');
   await click(p);assert.deepEqual(await run('selected.notes'),[1]);assert.equal(await run('window.inkspaceInteraction.machine.connection'),null);assert.equal(await run('history.length'),0);adjacentPorts++;
  }
  await reset();let p=await run(`(()=>{const b=itemBounds('notes',doc.notes[0]),r=viewport.getBoundingClientRect();return{x:Math.round(r.left+view.x+(b.x+b.w/2)*view.scale),y:Math.round(r.top+view.y+(b.y+b.h/2)*view.scale)}})()`);
  send('mouseMove',p);send('mouseDown',p,{button:'left',clickCount:1});await pause(25);
  send('mouseMove',{x:p.x+70,y:p.y+30});await pause(30);
  assert.equal(await run('window.inkspaceInteraction.machine.gesture.owner'),'selection');assert.equal(await run('window.inkspaceInteraction.machine.gesture.phase'),'dragging');
  send('keyDown',{keyCode:'Escape'});send('keyUp',{keyCode:'Escape'});await pause(30);send('mouseUp',{x:p.x+70,y:p.y+30},{button:'left',clickCount:1});
  assert.equal(await run('doc.notes[0].x'),40);assert.equal(await run('history.length'),0);assert.equal(await run('window.inkspaceInteraction.machine.gesture'),null);
  // Cancellation restores a width change even when the 80-entry history is full.
  await run('history=Array.from({length:80},()=>snapshot());future=[];clearSelection();selected.notes=[0];overlaySelection();');
  p=await elementPoint('.media-width');send('mouseMove',p);send('mouseDown',p,{button:'left',clickCount:1});send('mouseMove',{x:p.x+50,y:p.y});await pause(40);
  assert.equal(await run('doc.notes[0].width'),380);send('keyDown',{keyCode:'Escape'});send('keyUp',{keyCode:'Escape'});send('mouseUp',{x:p.x+50,y:p.y},{button:'left',clickCount:1});await pause(30);
  assert.equal(await run('doc.notes[0].width'),330);assert.equal(await run('history.length'),80);
  // Explicit connection remains usable; external document transitions clear ownership.
  await reset();p=await elementPoint('[data-id=source] .note-hit');send('mouseMove',p);await pause(25);
  await click(await elementPoint('[data-id=source] .note-connect-right'));assert(await run('!!window.inkspaceInteraction.machine.connection'));
  const target=await elementPoint('[data-id=target] .note-hit');await click(target);assert.equal(await run('window.inkspaceDiagram.graph.getChildEdges(window.inkspaceDiagram.graph.getDefaultParent()).length'),1);
  await run('clearSelection();selected.notes=[0];overlaySelection();');p=await elementPoint('[data-id=source] .note-hit');send('mouseMove',p);send('mouseDown',p,{button:'left',clickCount:1});send('mouseMove',{x:p.x+40,y:p.y+20});await pause(40);
  const live=await run('window.inkspaceDiagram.graph.getChildEdges(window.inkspaceDiagram.graph.getDefaultParent())[0].geometry.sourcePoint.x');send('mouseUp',{x:p.x+40,y:p.y+20},{button:'left',clickCount:1});await pause(30);
  const committed=await run('window.inkspaceDiagram.graph.getChildEdges(window.inkspaceDiagram.graph.getDefaultParent())[0].geometry.sourcePoint.x');assert(Math.abs(live-committed)<.1,'Live and committed geometry differ: '+live+' / '+committed);
  fs.writeFileSync(path.join(root,'artifacts/ownership-layout.png'),(await w.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({passed:true,geometries,adjacentPorts,oneGestureOwner:true,escapeRestoresMove:true,fullHistoryCancellation:true,explicitConnections:true,liveConnectionGeometry:true}));
 }catch(error){console.error(error);process.exitCode=1}finally{w.destroy();fs.rmSync(html,{force:true});app.exit(process.exitCode||0)}
});
