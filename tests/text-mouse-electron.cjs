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
        w.webContents.sendInputEvent({type:'mouseMove',x:point.x+1,y:point.y});await pause(40);await run('selected.notes=[0];tool="select";overlaySelection();');
        const control=await run("(()=>{const el=noteCache.get('real-double-click').el,r=el.querySelector('.note-scale').getBoundingClientRect(),b=window.inkspaceInlineText.bounds(doc.notes[0]);return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),dx:b.w*.5,dy:b.h*.5,toolbar:el.querySelector('.note-bar').getBoundingClientRect().width,toolbarHeight:el.querySelector('.note-bar').getBoundingClientRect().height,textWidth:b.w}})()");assert(Math.abs(control.toolbar-control.textWidth-12)<.6&&Math.abs(control.toolbarHeight-6)<.6);
        assert(await run('document.elementFromPoint('+control.x+','+control.y+').classList.contains("note-scale")'),'Selected text scale handle is obscured');w.webContents.sendInputEvent({type:'mouseMove',x:control.x,y:control.y});w.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:control.x,y:control.y});await pause(30);assert(await run('active?.type==="resize-text"'));for(const factor of [.1,.2,.3,.4,.5,.4,.3,.2,.1,0,-.1,-.2,-.1,0,.1,.2,.3,.4,.5]){w.webContents.sendInputEvent({type:'mouseMove',x:Math.round(control.x+control.dx*factor*2),y:Math.round(control.y+control.dy*factor*2)});await pause(15);assert(await run('active?.type==="resize-text"'),'Continuous selected text drag stopped')}await pause(40);w.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:Math.round(control.x+control.dx),y:Math.round(control.y+control.dy)});await pause(40);
        const scaled=await run('({scale:doc.notes[0].scale,width:doc.notes[0].width,x:view.x,y:view.y,selection:selectionBounds(),selectionDisplay:getComputedStyle(document.querySelector("#selection")).display})');assert(scaled.selection===null&&scaled.selectionDisplay==='none');assert(Math.abs(scaled.scale-1.5)<.02&&scaled.width===320&&scaled.x===80&&scaled.y===60,JSON.stringify(scaled));
        for(const clickCount of [1,2,1,2]){
          const next=await run("(()=>{const n=doc.notes[0],r=noteCache.get(n.id).el.querySelector('.note-scale').getBoundingClientRect(),b=window.inkspaceInlineText.bounds(n);return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),dx:b.w*.02,dy:b.h*.02,scale:n.scale}})()");
          w.webContents.sendInputEvent({type:'mouseMove',x:next.x,y:next.y});w.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount,x:next.x,y:next.y});await pause(15);assert(await run('active?.type==="resize-text"'),'Repeated text scale did not start');
          for(const fraction of [.25,.5,.75,1]){w.webContents.sendInputEvent({type:'mouseMove',x:Math.round(next.x+next.dx*fraction),y:Math.round(next.y+next.dy*fraction)});await pause(5);assert(await run('active?.type==="resize-text"'),'Repeated drag interrupted')}
          w.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount,x:Math.round(next.x+next.dx),y:Math.round(next.y+next.dy)});await pause(20);
          const state=await run('({active:active?.type,editing:window.inkspaceInlineText.isEditing(),scale:doc.notes[0].scale,trace:mouseTrace.splice(0)})');assert(!state.active&&!state.editing&&state.scale>next.scale,JSON.stringify({clickCount,...state}));
        }

      }
    }


    const codeLayout=await run('('+async function(){
      await document.fonts.ready;let checked=0;
      const code='    const value = "'+('long_identifier_'.repeat(30))+'";\n'+Array.from({length:55},(_,i)=>'    console.log('+i+', value);').join('\n');
      for(const language of ['js','unknown'])for(const width of [100,180,320])for(const zoom of [.75,1,2])for(const noteScale of [1,1.7]){
        window.inkspaceInlineText.finish();finishInteraction();const source='~~~'+language+'\n'+code+'\n~~~';doc={...doc,notes:[{id:'code-wrap',x:40,y:40,width,scale:noteScale,markdown:source}],strokes:[],shapes:[],pdfs:[],diagram:undefined};view={x:80,y:60,scale:zoom};clearSelection();render();const n=doc.notes[0],el=noteCache.get(n.id).el,pre=el.querySelector('pre'),r=pre.getBoundingClientRect(),body=el.querySelector('.note-body').getBoundingClientRect(),bounds=window.inkspaceInlineText.bounds(n),totalScale=zoom*noteScale;
        if(pre.textContent!==code+'\n')throw Error('Code source changed');if(r.left<body.left-.2||r.right>body.right+.2||pre.scrollWidth>pre.clientWidth+1||pre.scrollHeight>pre.clientHeight+1||pre.clientHeight<=420)throw Error(JSON.stringify({width,zoom,noteScale,rect:r.toJSON(),scrollWidth:pre.scrollWidth,clientWidth:pre.clientWidth,scrollHeight:pre.scrollHeight,clientHeight:pre.clientHeight}));
        const walker=document.createTreeWalker(pre,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){const range=document.createRange();range.selectNodeContents(node);for(const glyph of range.getClientRects())if(glyph.width&&(glyph.left<r.left-.2||glyph.right>r.right+.2||glyph.bottom>r.bottom+.2))throw Error('Code glyph escaped code block')}
        const top=el.getBoundingClientRect().top+parseFloat(getComputedStyle(el).borderTopWidth)*totalScale,guideTop=top+(bounds.y-n.y)*zoom,guideBottom=guideTop+bounds.h*zoom;if(guideTop>r.top+.2||guideBottom<r.bottom-.2||bounds.w*zoom<r.width-.2)throw Error('Code background escaped text controls');
        edit(n);const input=el.querySelector('textarea');if(input.scrollWidth>input.clientWidth+1||input.scrollHeight>input.clientHeight+1)throw Error('Code source escaped editor');input.value+='\n';input.dispatchEvent(new Event('input',{bubbles:true}));window.inkspaceInlineText.finish();if(n.markdown!==source+'\n'||n.width!==width||n.scale!==noteScale)throw Error('Wrapping changed saved source or geometry');checked++;
      }
      return {checked,longLinesWrapped:true,wholeBlockVisible:true,backgroundInsideControls:true,sourcePreserved:true};
    }.toString()+')()');
    console.log(JSON.stringify({codeLayout}));
    const alignment=await run(
      '('+async function(){
        await document.fonts.ready;
        const firstGlyph=root=>{const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){if(!node.textContent.trim()||node.parentElement.closest('.katex'))continue;const range=document.createRange();range.setStart(node,node.textContent.search(/\S/));range.setEnd(node,node.textContent.trimEnd().length);const rect=range.getClientRects()[0];if(rect?.height)return rect.top}throw Error('Missing glyph')};
        const editorGlyph=input=>{const mirror=document.createElement('div'),r=input.getBoundingClientRect(),style=getComputedStyle(input),scale=view.scale*(doc.notes[0].scale||1);Object.assign(mirror.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:input.clientWidth+'px',font:style.font,lineHeight:style.lineHeight,whiteSpace:'pre-wrap',transform:'scale('+scale+')',transformOrigin:'0 0',visibility:'hidden'});mirror.textContent=input.value;document.body.append(mirror);const top=firstGlyph(mirror);mirror.remove();return top};
        const cases=['Plain text','## Heading','- List item','> Quote','~~~js\nconst n=1;\n~~~','\n\nParagraph after blank lines'];let checked=0,maxError=0;
        for(const source of cases)for(const zoom of [.75,1,2])for(const noteScale of [1,1.7]){
          window.inkspaceInlineText.finish();finishInteraction();doc={...doc,notes:[{id:'alignment',x:40,y:40,width:320,scale:noteScale,markdown:source}],strokes:[],shapes:[],pdfs:[],diagram:undefined};view={x:80,y:60,scale:zoom};clearSelection();render();const n=doc.notes[0],el=noteCache.get(n.id).el,before=firstGlyph(el.querySelector('.note-body'));edit(n);const input=el.querySelector('textarea'),during=editorGlyph(input),error=Math.abs(before-during);maxError=Math.max(maxError,error);if(error>.2)throw Error(JSON.stringify({source,zoom,noteScale,before,during,error}));
          input.value=source+' extra';input.dispatchEvent(new Event('input',{bubbles:true}));const edited=editorGlyph(input);window.inkspaceInlineText.finish();const after=firstGlyph(el.querySelector('.note-body'));if(Math.abs(after-edited)>.2)throw Error('Changed text moved after commit');if(n.x!==40||n.y!==40||n.scale!==noteScale)throw Error('Text model moved');checked++;
        }
        return {checked,maxError};
      }.toString()+')()');
    console.log(JSON.stringify({textEditAlignment:alignment}));
    console.log(JSON.stringify({passed:true,chromiumMouseInput:true,doubleClickTools:['pen','pan','select'],correctText:true,noExtraNote:true,penHoverHidden:true,realMouseScale:true,selectedTextHandleUnobscured:true,continuousGrowShrinkGrow:true,repeatedResizeGestures:4,quickSecondResize:true,noSelectionAfterDirectScale:true,fullWidthThinToolbar:true}));fs.rmSync(testHtml,{force:true});app.exit(0);
  }catch(error){console.error(error);fs.rmSync(testHtml,{force:true});app.exit(1)}
});
