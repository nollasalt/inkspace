// Edit Markdown source in place; the stored model remains the source of truth.
(()=>{
  let session=null,hovered=null,viewTarget=null,viewSignature=null;
  function viewChanged(){const note=selectedNote();viewSignature=JSON.stringify([note?.id,note?.viewMode,!!session,tool]);window.dispatchEvent(new CustomEvent('inkspace-text-view-change'))}
  function selectedNote(){const note=session?.note||doc.notes.find(n=>n.id===viewTarget?.id);return note&&doc.notes.includes(note)&&note.kind!=='image'?note:null}
  viewport.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'||event.button!==0)return;const el=event.target.closest('.note'),note=el&&doc.notes.find(n=>n.id===el.dataset.id);if(note&&note.kind!=='image'){viewTarget=note;viewChanged()}else if(!el&&!event.target.closest('.zoom')){viewTarget=null;viewChanged()}},{capture:true});
  function applyView(note,cache){
    const small=note.kind!=='image'&&note.viewMode==='window';cache.el.classList.toggle('window-text',small);
    if(note.kind!=='image'&&!cache.viewToggle){
      const toggle=document.createElement('button');toggle.className='note-view-toggle';toggle.type='button';toggle.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button===0){event.preventDefault();event.stopPropagation()}});toggle.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation()});toggle.onclick=event=>{if(event.pointerType&&event.pointerType!=='mouse'||event.sourceCapabilities?.firesTouchEvents)return;event.stopPropagation();const current=doc.notes.find(n=>n.id===note.id);if(current){setView(current.viewMode==='window'?'full':'window',current);toggle.focus({preventScroll:true})}};cache.el.append(toggle);cache.viewToggle=toggle;
      const height=document.createElement('div');height.className='note-height-resize';height.tabIndex=0;height.setAttribute('role','slider');height.setAttribute('aria-label','小窗高度');height.setAttribute('aria-valuemin','80');height.setAttribute('aria-valuemax','1200');height.title='拖动调整小窗高度 · 方向键微调';height.addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();event.stopPropagation();const current=doc.notes.find(n=>n.id===note.id);if(current?.viewMode==='window'){finish();finishInteraction();const value=Math.max(80,Math.min(1200,(Number(current.viewHeight)||240)+(event.key==='ArrowUp'?-1:1)*(event.shiftKey?48:16)));if(value!==current.viewHeight){checkpoint();current.viewHeight=value;renderNotes();renderBackground();persist()}}});height.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation()});cache.el.append(height);cache.heightControl=height;
    }
    if(cache.viewToggle){cache.viewToggle.hidden=note.kind==='image';cache.viewToggle.textContent=small?'↕':'▤';cache.viewToggle.title=small?'全部显示：展开完整文本':'小窗显示：固定高度、滚轮查看';cache.viewToggle.setAttribute('aria-label',cache.viewToggle.title);cache.viewToggle.setAttribute('aria-pressed',String(small));cache.heightControl.hidden=!small;cache.heightControl.setAttribute('aria-valuenow',String(note.viewHeight||240))}
    let frame=cache.body.querySelector(':scope > .note-scroll-viewport');
    if(small){if(!frame){frame=document.createElement('div');frame.className='note-scroll-viewport';frame.setAttribute('aria-label','文本框滚动内容');frame.tabIndex=0;frame.append(...cache.body.childNodes);cache.body.append(frame);frame.scrollTop=cache.viewScrollTop||0;frame.addEventListener('scroll',()=>{cache.viewScrollTop=frame.scrollTop},{passive:true})}frame.style.height=Math.max(80,Math.min(1200,active?.type==='resize-window'&&active.n.id===note.id?active.height:Number(note.viewHeight)||240))+'px';}
    else if(frame){cache.body.replaceChildren(...frame.childNodes);cache.viewScrollTop=0;}
    cache.scrollViewport=small?frame:null;
  }
  function setView(mode,note=selectedNote()){if(!note||!['full','window'].includes(mode)||(note.viewMode==='window'?'window':'full')===mode)return false;finish();finishInteraction();checkpoint();if(mode==='window'){note.viewMode='window';note.viewHeight=Number(note.viewHeight)||240}else delete note.viewMode;renderNotes();renderBackground();overlaySelection();persist();viewChanged();return true}
  function previewHeight(){if(active?.type!=='resize-window')return;const cache=noteCache.get(active.n.id);if(cache){cache.guideSignature=null;layoutNote(active.n,cache);cache.heightControl.setAttribute('aria-valuenow',String(Math.round(active.height)))}}
  function finishHeight(){if(active?.type!=='resize-window')return;cancelInteractionFrame();const current=active;active=null;const cache=noteCache.get(current.n.id);cache?.el.classList.remove('resizing-window');if(Math.abs(current.height-current.baseHeight)>.001){checkpoint();current.n.viewHeight=current.height}if(cache){cache.guideSignature=null;layoutNote(current.n,cache)}renderBackground();overlaySelection();persist()}
  viewport.addEventListener('pointerdown',event=>{const handle=event.target.closest('.note-height-resize');if(!handle||event.pointerType!=='mouse'||event.button!==0)return;event.preventDefault();event.stopImmediatePropagation();finish();finishInteraction();const note=doc.notes.find(n=>n.id===handle.closest('.note').dataset.id);if(note?.viewMode!=='window')return;clearSelection();const height=Number(note.viewHeight)||240;active={type:'resize-window',id:event.pointerId,n:note,baseHeight:height,height,startY:event.clientY,scale:view.scale*(note.scale||1)};noteCache.get(note.id).el.classList.add('resizing-window');try{handle.setPointerCapture(event.pointerId)}catch{}},{capture:true});
  viewport.addEventListener('pointermove',event=>{if(active?.type!=='resize-window'||active.id!==event.pointerId)return;event.preventDefault();event.stopImmediatePropagation();active.height=Math.max(80,Math.min(1200,active.baseHeight+(event.clientY-active.startY)/active.scale));scheduleInteractionFrame()},{capture:true});
  viewport.addEventListener('lostpointercapture',event=>{if(active?.type==='resize-window'&&active.id===event.pointerId)finishHeight()});
  window.addEventListener('keydown',event=>{if(event.key!=='Escape'||active?.type!=='resize-window')return;event.preventDefault();event.stopImmediatePropagation();cancelInteractionFrame();const current=active;active=null;const cache=noteCache.get(current.n.id);if(cache){cache.el.classList.remove('resizing-window');cache.guideSignature=null;layoutNote(current.n,cache);if(cache.heightControl.hasPointerCapture(current.id))cache.heightControl.releasePointerCapture(current.id)}},{capture:true});
  viewport.addEventListener('wheel',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey||active)return;
    const el=event.target.closest('.note'),cache=el&&noteCache.get(el.dataset.id),frame=cache?.scrollViewport;
    if(!frame||event.target.closest('.note-bar,.note-resize,.note-scale,.note-view-toggle,.note-height-resize'))return;
    event.preventDefault();event.stopImmediatePropagation();const note=doc.notes.find(n=>n.id===el.dataset.id),unit=event.deltaMode===1?textSize()*1.75:event.deltaMode===2?frame.clientHeight:1,scale=event.deltaMode===0?view.scale*(note?.scale||1):1;
    frame.scrollTop+=event.deltaY*unit/scale;frame.scrollLeft+=event.deltaX*unit/scale;
  },{capture:true,passive:false});
  function mouseHover(el){if(hovered===el)return;hovered?.classList.remove('mouse-hover');hovered=el;hovered?.classList.add('mouse-hover')}
  function hoverPointer(event){if(event.pointerType==='pen'||event.pointerType==='touch'){mouseHover(null);return}if(event.pointerType==='mouse'&&!event.sourceCapabilities?.firesTouchEvents&&!viewport.classList.contains('pen-input'))mouseHover(event.target.closest('.note'))}
  for(const type of ['pointerover','pointermove','pointerdown'])viewport.addEventListener(type,hoverPointer,{capture:true});
  viewport.addEventListener('pointerleave',()=>mouseHover(null));window.addEventListener('blur',()=>mouseHover(null));
  const cursorBeforeTextHover=updatePenCursor;
  updatePenCursor=function(event,rect){cursorBeforeTextHover(event,rect);if(event.pointerType==='pen')mouseHover(null)};
  function bounds(note){if(!note)return null;const el=noteCache.get(note.id)?.el;if(!el)return null;const size=note.scale||1,value=key=>parseFloat(el.style.getPropertyValue('--text-'+key)),r={x:note.x+value('left')*size,y:note.y+value('top')*size,w:Math.max(1,value('width')*size),h:Math.max(1,value('height')*size)};return Object.values(r).every(Number.isFinite)?r:null}
  function finish(redraw=true){
    const current=session;if(!current)return;session=null;
    current.el.classList.remove('editing-text');current.cache.markdown=null;
    if(current.created&&!current.note.markdown.trim()&&notebook.activePage===current.page&&doc.notes.includes(current.note)){doc.notes=doc.notes.filter(n=>n!==current.note);persist()}
    if(redraw){renderNotes();renderBackground()}viewChanged();
  }
  function history(command){if(!session||document.activeElement!==session.input)return false;document.execCommand(command);return true}
  function sync(){if(session&&(session.page!==notebook.activePage||!doc.notes.includes(session.note)))finish(false);const note=selectedNote();if(viewSignature!==JSON.stringify([note?.id,note?.viewMode,!!session,tool]))viewChanged()}
  edit=function(note){
    if(note.kind==='image')return;
    if(session?.note===note){session.input.focus({preventScroll:true});return}
    finish();finishInteraction();clearSelection();
    const created=!doc.notes.includes(note);
    if(created){checkpoint();note.markdown='';doc.notes.push(note)}
    renderNotes();const cache=noteCache.get(note.id),input=document.createElement('textarea');
    input.className='inline-note-editor';input.spellcheck=false;input.placeholder='输入文本或 Markdown…';input.setAttribute('aria-label','文本框内容');input.value=note.markdown;
    viewTarget=note;session={note,created,creationAnchor:created?{x:note.x,y:note.y}:null,checkpointed:created,page:notebook.activePage,input,el:cache.el,cache};cache.el.classList.add('editing-text');cache.body.replaceChildren(input);applyView(note,cache);viewChanged();
    const resizeInput=()=>{input.style.height='0px';input.style.height=Math.max(textSize()*1.75,input.scrollHeight)+'px';layoutNote(note,cache);if(session?.creationAnchor){const size=note.scale||1,style=getComputedStyle(cache.el),anchor=session.creationAnchor;note.x=anchor.x-(parseFloat(cache.el.style.getPropertyValue('--text-startX'))+parseFloat(style.borderLeftWidth))*size;note.y=anchor.y-(parseFloat(cache.el.style.getPropertyValue('--text-startY'))+parseFloat(style.borderTopWidth))*size;placeNote(note,cache.el);if(input.value.length)session.creationAnchor=null}scheduleA4Pages()};
    input.addEventListener('input',()=>{if(session?.input!==input)return;if(!session.checkpointed){checkpoint();session.checkpointed=true}note.markdown=input.value;resizeInput();persist()});
    input.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button===0&&!space)event.stopPropagation()});
    input.addEventListener('keydown',event=>{if(event.isComposing)return;if((event.ctrlKey||event.metaKey)&&!event.altKey){const key=event.key.toLowerCase(),command=key==='z'?(event.shiftKey?'redo':'undo'):key==='y'?'redo':null;if(command){event.preventDefault();event.stopImmediatePropagation();history(command);return}}if(event.key==='Escape'||event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();event.stopImmediatePropagation();finish();viewport.tabIndex=-1;viewport.focus()}});
    input.addEventListener('blur',()=>{if(session?.input===input)finish()});
    input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);resizeInput();renderBackground();overlaySelection();if(created)persist();
  };
  document.addEventListener('pointerdown',event=>{if(session&&event.pointerType==='mouse'&&!session.input.contains(event.target))finish()},{capture:true});
  const switchBeforeInlineText=switchPage;
  switchPage=function(id){if(id!==notebook.activePage)finish();return switchBeforeInlineText(id)};
  function contentRects(root){
    const rects=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);let node;
    while(node=walker.nextNode()){
      if(node.nodeType===Node.ELEMENT_NODE){if(node.matches('img,.katex')){const rect=node.getBoundingClientRect();if(rect.width&&rect.height)rects.push(rect)}continue}
      if(!node.textContent.trim()||node.parentElement.closest('.katex'))continue;const range=document.createRange();range.setStart(node,node.textContent.search(/\S/));range.setEnd(node,node.textContent.trimEnd().length);for(const rect of range.getClientRects())if(rect.width&&rect.height)rects.push(rect);
    }
    return rects;
  }
  function layoutNote(note,cache){
    applyView(note,cache);
    const input=session?.note===note?session.input:null,signature=JSON.stringify([note.width,textSize(),note.markdown,note.src,note.aspect,note.viewMode,note.viewHeight,active?.type==='resize-window'&&active.n.id===note.id?active.height:null,!!input]);if(cache.guideSignature===signature)return;
    // Frame geometry includes the scrollbar; clientWidth only measures its content.
    if(cache.scrollViewport&&!input){const scale=view.scale*(note.scale||1),outer=cache.el.getBoundingClientRect(),style=getComputedStyle(cache.el),r=cache.scrollViewport.getBoundingClientRect(),left=(r.left-outer.left)/scale-parseFloat(style.borderLeftWidth),top=(r.top-outer.top)/scale-parseFloat(style.borderTopWidth),width=cache.scrollViewport.offsetWidth,height=cache.scrollViewport.offsetHeight;for(const [key,value]of Object.entries({left,top,width,height,startX:left,startY:top,endX:left+width,endY:top+height}))cache.el.style.setProperty('--text-'+key,value+'px');cache.guideSignature=signature;return}
    let root=cache.body,mirror;
    if(input){
      // Match the rendered first glyph without moving saved text or overlaid ink.
      const preview=cache.body.cloneNode(false);preview.style.cssText='position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;width:100%';preview.innerHTML=markdown(note.markdown||input.placeholder);if(cache.scrollViewport){const frame=document.createElement('div');frame.className='note-scroll-viewport';frame.style.height=cache.scrollViewport.style.height;frame.append(...preview.childNodes);preview.append(frame)}cache.el.append(preview);const renderedStart=contentRects(preview)[0];preview.remove();
      const scale=view.scale*(note.scale||1),outer=cache.el.getBoundingClientRect(),style=getComputedStyle(cache.el),origin={left:outer.left+parseFloat(style.borderLeftWidth)*scale,top:outer.top+parseFloat(style.borderTopWidth)*scale};
      mirror=document.createElement('div');const positionMirror=()=>{const rect=input.getBoundingClientRect();mirror.style.left=(rect.left-origin.left)/scale+'px';mirror.style.top=(rect.top-origin.top)/scale+'px'};
      mirror.style.cssText=`position:absolute;visibility:hidden;pointer-events:none;white-space:pre-wrap;overflow-wrap:anywhere;width:${input.clientWidth}px;line-height:1.75`;mirror.textContent=input.value||input.placeholder;cache.el.append(mirror);positionMirror();const editorStart=contentRects(mirror)[0];
      // Source and rendered text share the scroll origin, not the screen position.
      if(renderedStart&&editorStart){input.style.marginTop=((parseFloat(input.style.marginTop)||0)+(renderedStart.top-editorStart.top)/scale-(cache.scrollViewport?.scrollTop||0))+'px';positionMirror()}root=mirror;
    }
    const rects=contentRects(root);
    const outer=cache.el.getBoundingClientRect(),scale=view.scale*(note.scale||1),style=getComputedStyle(cache.el),origin={left:outer.left+parseFloat(style.borderLeftWidth)*scale,top:outer.top+parseFloat(style.borderTopWidth)*scale},first=rects[0],last=rects.at(-1);
    if(first){const boxes=[...rects,...root.querySelectorAll('pre')].map(r=>r instanceof Element?r.getBoundingClientRect():r);const x=Math.min(...boxes.map(r=>r.left)),y=Math.min(...boxes.map(r=>r.top)),right=Math.max(...boxes.map(r=>r.right)),bottom=Math.max(...boxes.map(r=>r.bottom));
      for(const [key,value]of Object.entries({left:(x-origin.left)/scale,top:(y-origin.top)/scale,width:(right-x)/scale,height:(bottom-y)/scale,startX:(first.left-origin.left)/scale,startY:(first.top-origin.top)/scale,endX:(last.right-origin.left)/scale,endY:(last.bottom-origin.top)/scale}))cache.el.style.setProperty('--text-'+key,value+'px');
    }else{for(const [key,value]of Object.entries({left:21,top:33,width:Math.max(0,(note.width||320)-42),height:textSize()*1.75,startX:21,startY:33,endX:21,endY:33+textSize()*1.75}))cache.el.style.setProperty('--text-'+key,value+'px')}
    if(cache.scrollViewport){const r=cache.scrollViewport.getBoundingClientRect(),left=(r.left-origin.left)/scale,top=(r.top-origin.top)/scale,width=cache.scrollViewport.offsetWidth,height=cache.scrollViewport.offsetHeight;for(const [key,value]of Object.entries({left,top,width,height,startX:left,startY:top,endX:left+width,endY:top+height}))cache.el.style.setProperty('--text-'+key,value+'px')}
    mirror?.remove();cache.guideSignature=signature;
    if(input){const visibleWidth=parseFloat(cache.el.style.getPropertyValue('--text-left'))+parseFloat(cache.el.style.getPropertyValue('--text-width'))-input.offsetLeft+6;input.style.clipPath=`inset(0 ${Math.max(0,input.clientWidth-visibleWidth)}px 0 0)`}
  }
  window.inkspaceInlineText={finish,sync,history,layoutNote,bounds,selectedNote,setView,previewHeight,finishHeight,clearViewTarget:()=>{viewTarget=null},renderNote:note=>session?.note===note,isEditing:()=>!!session};
  document.fonts?.ready.then(()=>{for(const cache of noteCache.values())cache.guideSignature=null;renderNotes()});
})();
