// Edit Markdown source in place; the stored model remains the source of truth.
(()=>{
  let session=null;
  function finish(redraw=true){
    const current=session;if(!current)return;session=null;
    current.el.classList.remove('editing-text');current.cache.markdown=null;
    if(current.created&&!current.note.markdown.trim()&&notebook.activePage===current.page&&doc.notes.includes(current.note)){doc.notes=doc.notes.filter(n=>n!==current.note);persist()}
    if(redraw){renderNotes();renderBackground()}
  }
  function sync(){if(session&&(session.page!==notebook.activePage||!doc.notes.includes(session.note)))finish(false)}
  edit=function(note){
    if(note.kind==='image')return;
    if(session?.note===note){session.input.focus();return}
    finish();finishInteraction();clearSelection();
    const created=!doc.notes.includes(note);
    if(created){checkpoint();note.markdown='';doc.notes.push(note)}
    renderNotes();const cache=noteCache.get(note.id),input=document.createElement('textarea');
    input.className='inline-note-editor';input.spellcheck=false;input.placeholder='输入文本或 Markdown…';input.setAttribute('aria-label','文本框内容');input.value=note.markdown;
    session={note,created,checkpointed:created,page:notebook.activePage,input,el:cache.el,cache};cache.el.classList.add('editing-text');cache.body.replaceChildren(input);
    const resizeInput=()=>{input.style.height='0px';input.style.height=Math.max(textSize()*1.75,input.scrollHeight)+'px';layoutNote(note,cache);scheduleA4Pages()};
    input.addEventListener('input',()=>{if(session?.input!==input)return;if(!session.checkpointed){checkpoint();session.checkpointed=true}note.markdown=input.value;resizeInput();persist()});
    input.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button===0&&!space)event.stopPropagation()});
    input.addEventListener('keydown',event=>{if(event.isComposing)return;if(event.key==='Escape'||event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();event.stopImmediatePropagation();finish();viewport.tabIndex=-1;viewport.focus()}});
    input.addEventListener('blur',()=>{if(session?.input===input)finish()});
    input.focus();input.setSelectionRange(input.value.length,input.value.length);resizeInput();renderBackground();overlaySelection();if(created)persist();
  };
  document.addEventListener('pointerdown',event=>{if(session&&event.pointerType==='mouse'&&!session.input.contains(event.target))finish()},{capture:true});
  const switchBeforeInlineText=switchPage;
  switchPage=function(id){if(id!==notebook.activePage)finish();return switchBeforeInlineText(id)};
  function layoutNote(note,cache){
    if(note.kind==='image')return;
    const input=session?.note===note?session.input:null,signature=JSON.stringify([note.width,textSize(),note.markdown,!!input]);if(cache.guideSignature===signature)return;
    let root=cache.body,mirror;
    if(input){mirror=document.createElement('div');mirror.style.cssText=`position:absolute;visibility:hidden;pointer-events:none;white-space:pre-wrap;overflow-wrap:anywhere;left:${input.offsetLeft}px;top:${input.offsetTop}px;width:${input.clientWidth}px;line-height:1.75`;mirror.textContent=input.value||input.placeholder;root=mirror;cache.el.append(mirror)}
    const rects=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);let node;
    while(node=walker.nextNode()){
      if(node.nodeType===Node.ELEMENT_NODE){if(node.matches('img,.katex')){const rect=node.getBoundingClientRect();if(rect.width&&rect.height)rects.push(rect)}continue}
      if(!node.textContent.trim()||node.parentElement.closest('.katex'))continue;const range=document.createRange();range.selectNodeContents(node);for(const rect of range.getClientRects())if(rect.width&&rect.height)rects.push(rect);
    }
    const outer=cache.el.getBoundingClientRect(),scale=view.scale*(note.scale||1),style=getComputedStyle(cache.el),origin={left:outer.left+parseFloat(style.borderLeftWidth)*scale,top:outer.top+parseFloat(style.borderTopWidth)*scale},first=rects[0],last=rects.at(-1);
    if(first){const x=Math.min(...rects.map(r=>r.left)),y=Math.min(...rects.map(r=>r.top)),right=Math.max(...rects.map(r=>r.right)),bottom=Math.max(...rects.map(r=>r.bottom));
      for(const [key,value]of Object.entries({left:(x-origin.left)/scale,top:(y-origin.top)/scale,width:(right-x)/scale,height:(bottom-y)/scale,startX:(first.left-origin.left)/scale,startY:(first.top-origin.top)/scale,endX:(last.right-origin.left)/scale,endY:(last.bottom-origin.top)/scale}))cache.el.style.setProperty('--text-'+key,value+'px');
    }else{for(const [key,value]of Object.entries({left:21,top:33,width:Math.max(0,(note.width||320)-42),height:textSize()*1.75,startX:21,startY:33,endX:21,endY:33+textSize()*1.75}))cache.el.style.setProperty('--text-'+key,value+'px')}
    mirror?.remove();cache.guideSignature=signature;
    if(input){const visibleWidth=parseFloat(cache.el.style.getPropertyValue('--text-left'))+parseFloat(cache.el.style.getPropertyValue('--text-width'))-input.offsetLeft+6;input.style.clipPath=`inset(0 ${Math.max(0,input.clientWidth-visibleWidth)}px 0 0)`}
  }
  window.inkspaceInlineText={finish,sync,layoutNote,renderNote:note=>session?.note===note,isEditing:()=>!!session};
  document.fonts?.ready.then(()=>{for(const cache of noteCache.values())cache.guideSignature=null;renderNotes()});
})();
