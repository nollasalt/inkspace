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
    const resizeInput=()=>{input.style.height='0px';input.style.height=Math.max(72,input.scrollHeight)+'px';scheduleA4Pages()};
    input.addEventListener('input',()=>{if(session?.input!==input)return;if(!session.checkpointed){checkpoint();session.checkpointed=true}note.markdown=input.value;resizeInput();persist()});
    input.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button===0&&!space)event.stopPropagation()});
    input.addEventListener('keydown',event=>{if(event.isComposing)return;if(event.key==='Escape'||event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();event.stopImmediatePropagation();finish();viewport.tabIndex=-1;viewport.focus()}});
    input.addEventListener('blur',()=>{if(session?.input===input)finish()});
    input.focus();input.setSelectionRange(input.value.length,input.value.length);resizeInput();renderBackground();overlaySelection();if(created)persist();
  };
  document.addEventListener('pointerdown',event=>{if(session&&event.pointerType==='mouse'&&!session.input.contains(event.target))finish()},{capture:true});
  const switchBeforeInlineText=switchPage;
  switchPage=function(id){if(id!==notebook.activePage)finish();return switchBeforeInlineText(id)};
  window.inkspaceInlineText={finish,sync,renderNote:note=>session?.note===note,isEditing:()=>!!session};
})();
