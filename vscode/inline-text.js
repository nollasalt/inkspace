// Edit Markdown source in place; the stored model remains the source of truth.
(()=>{
  let session=null,hovered=null,viewTarget=null,viewSignature=null;
  function viewChanged(){const note=selectedNote();viewSignature=JSON.stringify([note?.id,note?.viewMode,!!session,tool]);window.dispatchEvent(new CustomEvent('inkspace-text-view-change'))}
  function selectedNote(){const note=session?.note||doc.notes.find(n=>n.id===viewTarget?.id);return note&&doc.notes.includes(note)&&note.kind!=='image'?note:null}
  function observePointer(event){if(event.pointerType!=='mouse'||event.button!==0)return;const el=event.target.closest('.note'),note=el&&doc.notes.find(n=>n.id===el.dataset.id);if(note&&note.kind!=='image'){viewTarget=note;viewChanged()}else if(!el&&!event.target.closest('.zoom')){viewTarget=null;viewChanged()}}
  function applyView(note,cache){
    const temporary=session?.note===note?session.temporaryView:null,storedWindow=note.viewMode==='window',small=note.kind!=='image'&&(storedWindow||!!temporary);cache.el.classList.toggle('window-text',small);cache.el.classList.toggle('editing-window',!!temporary);
    if(temporary)cache.el.style.width=temporary.width+'px';
    if(note.kind!=='image'&&!cache.viewToggle){
      const toggle=document.createElement('button');toggle.className='note-view-toggle';toggle.type='button';toggle.onclick=event=>window.inkspaceInteraction?.activateTextView(note.id,event);cache.el.append(toggle);cache.viewToggle=toggle;
      const height=document.createElement('div');height.className='note-height-resize';height.tabIndex=0;height.setAttribute('role','slider');height.setAttribute('aria-label','小窗高度');height.setAttribute('aria-valuemin','80');height.setAttribute('aria-valuemax','1200');height.title='拖动调整小窗高度 · 方向键微调';height.addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();event.stopPropagation();const current=doc.notes.find(n=>n.id===note.id);if(current?.viewMode==='window'){finish();finishInteraction();const value=Math.max(80,Math.min(1200,(Number(current.viewHeight)||240)+(event.key==='ArrowUp'?-1:1)*(event.shiftKey?48:16)));if(value!==current.viewHeight){checkpoint();current.viewHeight=value;renderNotes();renderBackground();persist()}}});height.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation()});cache.el.append(height);cache.heightControl=height;
    }
    if(cache.viewToggle){cache.viewToggle.hidden=note.kind==='image'||!!temporary;cache.viewToggle.textContent=small?'↕':'▤';cache.viewToggle.title=small?'全部显示：展开完整文本':'小窗显示：固定高度、滚轮查看';cache.viewToggle.setAttribute('aria-label',cache.viewToggle.title);cache.viewToggle.setAttribute('aria-pressed',String(small));cache.heightControl.hidden=!storedWindow||!!temporary;cache.heightControl.setAttribute('aria-valuenow',String(note.viewHeight||240))}
    let frame=cache.body.querySelector(':scope > .note-scroll-viewport');
    if(small){if(!frame){frame=document.createElement('div');frame.className='note-scroll-viewport';frame.setAttribute('aria-label','文本框滚动内容');frame.tabIndex=0;frame.append(...cache.body.childNodes);cache.body.append(frame);frame.scrollTop=cache.viewScrollTop||0;frame.addEventListener('scroll',()=>{cache.viewScrollTop=frame.scrollTop},{passive:true})}frame.style.marginTop=(temporary?.offset||0)+'px';frame.style.height=Math.max(80,Math.min(1200,temporary?.height||(active?.type==='resize-window'&&active.n.id===note.id?active.height:Number(note.viewHeight)||240)))+'px';if(session?.note===note){let tail=frame.querySelector('.editor-scroll-tail');if(!tail){tail=document.createElement('div');tail.className='editor-scroll-tail';tail.setAttribute('aria-hidden','true');tail.style.pointerEvents='none';frame.append(tail)}tail.style.height=frame.style.height}else frame.querySelector('.editor-scroll-tail')?.remove();}
    else if(frame){cache.body.replaceChildren(...frame.childNodes);cache.viewScrollTop=0;}
    cache.scrollViewport=small?frame:null;
  }
  function setView(mode,note=selectedNote()){if(!note||!['full','window'].includes(mode)||(note.viewMode==='window'?'window':'full')===mode)return false;finish();finishInteraction();checkpoint();if(mode==='window'){note.viewMode='window';note.viewHeight=Number(note.viewHeight)||240}else delete note.viewMode;renderNotes();renderBackground();overlaySelection();persist();viewChanged();return true}
  function previewHeight(){if(active?.type!=='resize-window')return;const cache=noteCache.get(active.n.id);if(cache){cache.guideSignature=null;layoutNote(active.n,cache);cache.heightControl.setAttribute('aria-valuenow',String(Math.round(active.height)))}}
  function finishHeight(){if(active?.type!=='resize-window')return;cancelInteractionFrame();const current=active;active=null;const cache=noteCache.get(current.n.id);cache?.el.classList.remove('resizing-window');if(Math.abs(current.height-current.baseHeight)>.001){checkpoint();current.n.viewHeight=current.height}if(cache){cache.guideSignature=null;layoutNote(current.n,cache)}renderBackground();overlaySelection();persist()}
  function scrollWheel(event){
    if(!objectControls(event)||pointerTool(event)==='pan'||event.ctrlKey||event.metaKey||event.altKey||active)return false;
    const el=event.target.closest('.note'),cache=el&&noteCache.get(el.dataset.id),frame=cache?.scrollViewport;
    if(!frame||event.target.closest('.note-bar,.note-resize,.note-scale,.note-view-toggle,.note-height-resize'))return false;
    event.preventDefault();event.stopImmediatePropagation();const note=doc.notes.find(n=>n.id===el.dataset.id),unit=event.deltaMode===1?textSize(note)*1.75:event.deltaMode===2?frame.clientHeight:1,scale=event.deltaMode===0?view.scale*(note?.scale||1):1;
    frame.scrollTop+=event.deltaY*unit/scale;frame.scrollLeft+=event.deltaX*unit/scale;return true;
  }
  function mouseHover(el){if(hovered===el){hovered?.classList.add('mouse-hover');return;}hovered?.classList.remove('mouse-hover');hovered=el;hovered?.classList.add('mouse-hover')}
  function hoverPointer(event){
    if(event.pointerType==='pen'||event.pointerType==='touch'){mouseHover(null);return}
    if(event.pointerType!=='mouse'||event.sourceCapabilities?.firesTouchEvents||viewport.classList.contains('pen-input'))return;
    if(!objectControls(event)){mouseHover(null);return}
    const control=window.inkspaceInteraction?.controlAt(event),hit=window.inkspaceBlocks?.pick(event);
    const el=event.target.closest('.inline-note-editor')?.closest('.note')||control?.el.closest('.note')||(hit?.kind==='notes'?noteCache.get(blockValue(hit.kind,hit.index).id)?.el:null);
    if(el){mouseHover(el);return}
    if(!hit||hit.kind==='diagram'&&window.inkspaceDiagram?.graph?.getModel().getCell(hit.id)?.edge){
      const p=local(event),pos=world(p.x,p.y);let nearest=null,distance=40/view.scale;
      for(const note of doc.notes){const b=itemBounds('notes',note);if(!b)continue;const d=Math.hypot(Math.max(b.x-pos.x,0,pos.x-b.x-b.w),Math.max(b.y-pos.y,0,pos.y-b.y-b.h));if(d<=distance){distance=d;nearest=note}}
      if(nearest){mouseHover(noteCache.get(nearest.id)?.el);return}
    }
    mouseHover(null);
  }
  viewport.addEventListener('pointerleave',()=>mouseHover(null));window.addEventListener('blur',()=>mouseHover(null));
  const cursorBeforeTextHover=updatePenCursor;
  updatePenCursor=function(event,rect){cursorBeforeTextHover(event,rect);if(event.pointerType==='pen')mouseHover(null)};
  function bounds(note){if(!note)return null;if(session?.note===note&&session.temporaryView&&session.previewBounds)return{...session.previewBounds};const el=noteCache.get(note.id)?.el;if(!el)return null;const size=note.scale||1,value=key=>parseFloat(el.style.getPropertyValue('--text-'+key)),r={x:note.x+value('left')*size,y:note.y+value('top')*size,w:Math.max(1,value('width')*size),h:Math.max(1,value('height')*size)};return Object.values(r).every(Number.isFinite)?r:null}
  function finish(redraw=true,keepEmpty=false){
    const current=session;if(!current)return;session=null;window.inkspaceInteraction?.machine.edit(null);
    if(current.fragment){current.fragment.style.visibility=current.fragmentVisibility;current.input.remove()}
    const value=sessionSource(current);
    if(value!==current.original&&(!current.created||value.trim()||keepEmpty)&&doc.notes.includes(current.note)){if(current.created)doc.notes=doc.notes.filter(n=>n!==current.note);checkpoint();if(current.created)doc.notes.push(current.note);current.note.markdown=value;persist()}
    current.el.classList.remove('editing-text');current.cache.markdown=null;
    if(current.created&&!keepEmpty&&!current.note.markdown.trim()&&notebook.activePage===current.page&&doc.notes.includes(current.note)){doc.notes=doc.notes.filter(n=>n!==current.note);persist()}
    if(redraw){renderNotes();if(current.cache.scrollViewport&&current.previewScroll!==undefined){current.cache.scrollViewport.scrollTop=current.previewScroll;current.cache.viewScrollTop=current.previewScroll}renderBackground();if(doc.notes.includes(current.note)){clearSelection();selected.notes=[doc.notes.indexOf(current.note)];window.inkspaceBlocks?.expandSelection()}}viewChanged();overlaySelection();window.dispatchEvent(new CustomEvent('inkspace-text-draft',{detail:null}));
  }
  function sessionSource(current){if(current.input.value===current.originalInput)return current.original;return current.original.slice(0,current.rawStart)+current.input.value+current.original.slice(current.rawEnd)}
  function cancel(){const current=session;if(!current)return;session=null;window.inkspaceInteraction?.machine.edit(null);if(current.fragment){current.fragment.style.visibility=current.fragmentVisibility;current.input.remove()}current.el.classList.remove('editing-text');current.cache.markdown=null;if(current.created){doc.notes=doc.notes.filter(n=>n!==current.note);persist()}renderNotes();renderBackground();viewChanged();overlaySelection();window.dispatchEvent(new CustomEvent('inkspace-text-draft',{detail:null}))}
  function fullSource(){const current=session;if(!current)return;const caret=current.start+current.input.selectionStart,note=current.note;finish();edit(note,null,{full:true,caret})}
  function history(command){if(!session||document.activeElement!==session.input)return false;document.execCommand(command);return true}
  function indentText(input,outdent){
    const text=input.value,start=input.selectionStart,end=input.selectionEnd,direction=input.selectionDirection;
    if(!outdent&&start===end){document.execCommand('insertText',false,'    ');return}
    const first=start===0?0:text.lastIndexOf('\n',start-1)+1,last=end>start&&text[end-1]==='\n'?end-1:end,lineEnd=text.indexOf('\n',last),limit=lineEnd<0?text.length:lineEnd,edits=[];
    let offset=first;
    const replacement=text.slice(first,limit).split('\n').map(line=>{const removed=outdent?(line.match(/^(?:\t| {1,4})/)?.[0].length||0):0,added=outdent?'':'    ';if(removed||added)edits.push({offset,removed,added:added.length});offset+=line.length+1;return added+line.slice(removed)}).join('\n');
    if(!edits.length)return;
    const mapped=position=>position+edits.reduce((delta,edit)=>position>=edit.offset?delta+edit.added-Math.min(edit.removed,position-edit.offset):delta,0);
    input.setSelectionRange(first,limit);document.execCommand('insertText',false,replacement);input.setSelectionRange(mapped(start),mapped(end),direction);
    if(session?.input===input)revealCaret(session.note,session.cache,input,input.selectionEnd);
  }
  function sync(){if(session&&(session.page!==notebook.activePage||!doc.notes.includes(session.note)))finish(false);const note=selectedNote();if(viewSignature!==JSON.stringify([note?.id,note?.viewMode,!!session,tool]))viewChanged()}
  function sourceCaret(note,cache,position){
    const root=cache?.body;if(!root)return note.markdown.replace(/\r\n|\r/g,'\n').length;
    // Hit through the transparent interaction layer before replacing the preview.
    const hit=cache.el.querySelector('.note-hit'),beforeHit=hit?.style.pointerEvents,beforeBody=root.style.pointerEvents;let range;
    try{if(hit)hit.style.pointerEvents='none';root.style.pointerEvents='auto';range=document.caretRangeFromPoint(position.x,position.y)}finally{if(hit)hit.style.pointerEvents=beforeHit;root.style.pointerEvents=beforeBody}
    let node=range?.startContainer,offset=range?.startOffset||0;
    if(!node||!root.contains(node)||node.nodeType!==Node.TEXT_NODE){
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let current,distance=Infinity;
      while(current=walker.nextNode()){if(!current.textContent.trim()||current.parentElement.closest('.katex-mathml,[data-ink-code-ui]'))continue;const r=document.createRange();r.selectNodeContents(current);for(const box of r.getClientRects()){const d=Math.hypot(Math.max(box.left-position.x,0,position.x-box.right),Math.max(box.top-position.y,0,position.y-box.bottom));if(d<distance){distance=d;node=current;offset=position.x<box.left?0:current.textContent.length}}}
    }
    if(!node||!root.contains(node))return 0;
    const normalized=note.markdown.replace(/\r\n|\r/g,'\n'),block=node.parentElement.closest('[data-ink-source-start]')||root,start=Number(block.dataset.inkSourceStart)||0,end=Number(block.dataset.inkSourceEnd)||normalized.length,raw=normalized.slice(start,end),map=[];let decoded='';
    const special=/\\[!"#$%&'()*+,\-.\/:;<=>?@[\]\\^_`{|}~]|&(?:#[xX][\da-fA-F]+|#\d+|[a-zA-Z][\da-zA-Z]+);/y;
    for(let i=0;i<raw.length;){special.lastIndex=i;const match=special.exec(raw),length=match?match[0].length:1,text=match?InkContent.unescapeMarkdown(match[0]):raw[i];for(let j=0;j<text.length;j++)map.push(i);decoded+=text;i+=length}map.push(raw.length);
    let cursor=0,result=start;const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);let current;
    while(current=walker.nextNode()){
      if(current.nodeType===Node.ELEMENT_NODE){if(!current.hasAttribute('data-ink-math'))continue;const text=current.getAttribute('data-ink-math'),index=decoded.indexOf(text,cursor);if(index>=0){if(current.contains(node)){result=start+map[index];break}cursor=index+text.length}continue}
      if(current.parentElement.closest('[data-ink-math],.katex-mathml,[data-ink-code-ui]'))continue;
      const text=current.textContent;if(!text)continue;let index=decoded.indexOf(text,cursor);
      if(index<0){const first=text.search(/\S/);index=decoded.indexOf(text.trim(),cursor);if(index>=0)index-=Math.max(0,first)}
      if(index<0){if(current===node){result=start+(map[cursor]??raw.length);break}continue}
      if(current===node){result=start+(map[Math.max(0,Math.min(decoded.length,index+offset))]??raw.length);break}
      cursor=index+text.length;
      // A link's destination is source syntax, not the next visible text node.
      if(current.parentElement.closest('a')&&decoded.slice(cursor,cursor+2)===']('){let depth=1,i=cursor+2;for(;i<decoded.length&&depth;i++){if(decoded[i]==='(')depth++;if(decoded[i]===')')depth--}cursor=i}
    }
    // Textarea values normalize Windows newlines; offsets must use that same text.
    return result;
  }
  function revealCaret(note,cache,input,offset,position){
    const frame=cache.scrollViewport;if(!frame)return;
    const r=input.getBoundingClientRect(),style=getComputedStyle(input),scale=view.scale*(note.scale||1),mirror=document.createElement('div'),marker=document.createElement('span');
    Object.assign(mirror.style,{position:'fixed',visibility:'hidden',pointerEvents:'none',left:r.left+'px',top:r.top+'px',width:input.clientWidth+'px',font:style.font,lineHeight:style.lineHeight,whiteSpace:'pre-wrap',overflowWrap:'anywhere',transform:'scale('+scale+')',transformOrigin:'0 0'});
    mirror.append(document.createTextNode(input.value.slice(0,offset)));marker.textContent='\u200b';mirror.append(marker,document.createTextNode(input.value.slice(offset)));document.body.append(mirror);
    const caret=marker.getBoundingClientRect(),rect=frame.getBoundingClientRect();mirror.remove();
    if(caret.height){const half=caret.height/2,target=position?Math.max(rect.top+half,Math.min(rect.bottom-half,position.y)):Math.max(rect.top+half,Math.min(rect.bottom-half,caret.top+half));frame.scrollTop+=(caret.top+half-target)/scale}cache.viewScrollTop=frame.scrollTop;
  }
  function editingViewport(note,cache,position){
    if(!cache)return null;
    const b=bounds(note),scale=view.scale*(note.scale||1),vp=viewport.getBoundingClientRect(),top=vp.top+view.y+b.y*view.scale,desiredHeight=Math.min(560,Math.max(320,vp.height*.65));
    let visibleTop=Math.max(top,vp.top+8);
    // Keep the editing window around the clicked passage of a long preview.
    if(position)visibleTop=Math.max(visibleTop,Math.min(position.y-desiredHeight/2,vp.bottom-desiredHeight-8));
    const height=Math.max(80,Math.min(1200,Math.min(desiredHeight,vp.bottom-visibleTop-8)/scale)),left=vp.left+view.x+note.x*view.scale,availableWidth=Math.max(160,vp.right-left-16),width=Math.max(note.width||320,Math.min(720,Math.max(480,vp.width*.55),availableWidth)/scale);
    return{height,width,offset:Math.max(0,(visibleTop-top)/scale)};
  }
  edit=function(note,position,options={}){
    if(note.kind==='image'||window.inkspaceArrangement?.locked({kind:'notes',id:note.id}))return;
    if(session?.note===note){session.input.focus({preventScroll:true});return}
    const previousFrame=window.inkspaceGeometry?.bounds(note);const previousCache=noteCache.get(note.id),caret=options.caret??(position&&InkBlockModel.textFormat(note)!=='html'?sourceCaret(note,previousCache,position):0),previewBounds=previousCache?bounds(note):null,temporaryView=doc.notes.includes(note)?editingViewport(note,previousCache,position):null,previewScroll=previousCache?.scrollViewport?.scrollTop;
    const normalizedSource=note.markdown.replace(/\r\n|\r/g,'\n'),range=position&&!options.full&&InkBlockModel.textFormat(note)!=='html'?InkContent.sourceRange(normalizedSource,caret):{start:0,end:normalizedSource.length,type:'document'};
    let fragment=null;
    if(position&&range.type!=='document'&&document.body.classList.contains('media-workbench')){
      fragment=[...previousCache.body.querySelectorAll('[data-ink-source-start]')].find(el=>{const start=Number(el.dataset.inkSourceStart),end=Number(el.dataset.inkSourceEnd);return (start===range.start||range.type==='fence'&&start>=range.start&&start<range.end)&&end===range.end});
      // A whole list item keeps nested lists valid. Other unsupported DOM shapes
      // fall back explicitly to the full source editor.
      if(fragment?.matches('li'))fragment=null;
    }
    if(previousCache?.scrollViewport)previousCache.viewScrollTop=previousCache.scrollViewport.scrollTop;
    finish();finishInteraction();window.inkspaceDiagram?.noteConnectors()?.cancel();clearSelection();
    const created=!doc.notes.includes(note);
    if(created){note.markdown='';doc.notes.push(note)}
    renderNotes();const cache=noteCache.get(note.id),input=document.createElement('textarea');
    const editRange=fragment?range:{start:0,end:normalizedSource.length},rawOffset=offset=>{let normalized=0;for(let raw=0;raw<note.markdown.length;raw++){if(normalized===offset)return raw;if(note.markdown[raw]==='\r'&&note.markdown[raw+1]==='\n')raw++;normalized++}return note.markdown.length};
    input.className='inline-note-editor'+(fragment?' note-fragment-editor':'');input.spellcheck=false;input.placeholder=InkBlockModel.textFormat(note)==='html'?'输入 HTML 源码…':'输入文本或 Markdown…';input.setAttribute('aria-label',fragment?'编辑当前 Markdown 片段':'文本框内容');input.value=normalizedSource.slice(editRange.start,editRange.end);
    viewTarget=note;session={note,original:note.markdown,originalInput:input.value,start:editRange.start,rawStart:rawOffset(editRange.start),rawEnd:rawOffset(editRange.end),fragment,created,creationAnchor:created?{x:note.x,y:note.y}:null,checkpointed:created,page:notebook.activePage,input,el:cache.el,cache,temporaryView:fragment?null:temporaryView,previewBounds,previewScroll};cache.el.classList.add('editing-text');
    if(fragment){const r=fragment.getBoundingClientRect(),outer=cache.el.getBoundingClientRect(),vp=viewport.getBoundingClientRect(),scale=view.scale*(note.scale||1);session.fragmentVisibility=fragment.style.visibility;fragment.style.visibility='hidden';Object.assign(input.style,{position:'absolute',left:(r.left-outer.left)/scale+'px',top:(Math.max(vp.top+8,r.top)-outer.top)/scale+'px',width:Math.max(r.width/scale,Math.min(600,Math.max(300,(vp.right-r.left-16)/scale)))+'px',maxWidth:'none',minHeight:'120px',maxHeight:'480px',background:getComputedStyle(viewport).getPropertyValue('--vscode-input-background')||'#ffffff',zIndex:'6'});cache.el.append(input)}else{cache.body.replaceChildren(input);applyView(note,cache)}viewChanged();
    const resizeInput=()=>{if(fragment){const scale=view.scale*(note.scale||1);input.style.minHeight=(100/scale)+'px';input.style.height='0px';input.style.height=Math.max(100/scale,Math.min(480,input.scrollHeight))+'px';return}input.style.height='0px';input.style.height=Math.max(textSize(note)*1.75,input.scrollHeight)+'px';layoutNote(note,cache);if(session?.creationAnchor){const size=note.scale||1,style=getComputedStyle(cache.el),anchor=session.creationAnchor;note.x=anchor.x-(parseFloat(cache.el.style.getPropertyValue('--text-startX'))+parseFloat(style.borderLeftWidth))*size;note.y=anchor.y-(parseFloat(cache.el.style.getPropertyValue('--text-startY'))+parseFloat(style.borderTopWidth))*size;placeNote(note,cache.el);if(input.value.length)session.creationAnchor=null}scheduleA4Pages()};
    input.addEventListener('input',()=>{if(session?.input!==input)return;resizeInput();revealCaret(note,cache,input,input.selectionEnd);window.dispatchEvent(new CustomEvent('inkspace-text-draft',{detail:{id:note.id,page:session.page,source:sessionSource(session),createdNote:session.created?{...note}:undefined}}));window.inkspaceMediaFrame?.refresh()});
    input.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button===0&&!space)event.stopPropagation()});
    input.addEventListener('keydown',event=>{if(event.isComposing)return;if(event.key==='Tab'&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();event.stopImmediatePropagation();indentText(input,event.shiftKey);return}if(event.key==='Enter'&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&!event.altKey){const change=InkBlockModel.textFormat(note)==='html'?null:InkContent.listEnterEdit(input.value,input.selectionStart,input.selectionEnd);if(change){event.preventDefault();event.stopImmediatePropagation();input.setSelectionRange(change.start,change.end);document.execCommand('insertText',false,change.text);return}}if((event.ctrlKey||event.metaKey)&&!event.altKey){const key=event.key.toLowerCase(),command=key==='z'?(event.shiftKey?'redo':'undo'):key==='y'?'redo':null;if(command){event.preventDefault();event.stopImmediatePropagation();history(command);return}}if(event.key==='Escape'||event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();event.stopImmediatePropagation();event.key==='Escape'?cancel():finish();viewport.tabIndex=-1;viewport.focus()}});
    input.addEventListener('blur',()=>{if(session?.input===input)finish()});
    input.addEventListener('keyup',event=>{if(session?.input===input&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(event.key))revealCaret(note,cache,input,input.selectionEnd)});
    session.previewFrame=previousFrame;window.inkspaceInteraction?.machine.edit(note.id);input.focus({preventScroll:true});resizeInput();const localCaret=Math.max(0,Math.min(input.value.length,caret-editRange.start));input.setSelectionRange(localCaret,localCaret);revealCaret(note,cache,input,localCaret,position);renderBackground();overlaySelection();if(created)persist();
  };
  function preparePointer(event,control){
    if(!session||event.pointerType!=='mouse'||session.input.contains(event.target))return;
    if(event.button===1||space||event.target.closest('.media-action-strip')||session.input===document.activeElement&&event.target.closest('.note-fragment-editor'))return;
    finish(true,event.button===0&&control?.closest('.note')===session.el);
  }
  const switchBeforeInlineText=switchPage;
  switchPage=function(id){if(id!==notebook.activePage)finish();return switchBeforeInlineText(id)};
  function contentRects(root){
    const rects=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);let node;
    while(node=walker.nextNode()){
      if(node.nodeType===Node.ELEMENT_NODE){if(node.matches('img,.katex')){const rect=node.getBoundingClientRect();if(rect.width&&rect.height)rects.push(rect)}continue}
      if(!node.textContent.trim()||node.parentElement.closest('.katex,[data-ink-code-ui]'))continue;const range=document.createRange();range.setStart(node,node.textContent.search(/\S/));range.setEnd(node,node.textContent.trimEnd().length);for(const rect of range.getClientRects())if(rect.width&&rect.height)rects.push(rect);
    }
    return rects;
  }
  function layoutNote(note,cache){
    if(session?.note===note&&session.fragment)return;
    applyView(note,cache);
    const input=session?.note===note?session.input:null,signature=JSON.stringify([note.width,note.kind,note.format,note.height,note.fontSize,textSize(note),note.markdown,note.src,note.aspect,note.viewMode,note.viewHeight,active?.type==='resize-window'&&active.n.id===note.id?active.height:null,!!input]);if(cache.guideSignature===signature)return;
    if(InkBlockModel.textFormat(note)==='html'&&!input&&!cache.scrollViewport){const host=cache.body.querySelector('.html-content');if(host){const r=host.getBoundingClientRect(),outer=cache.el.getBoundingClientRect(),scale=view.scale*(note.scale||1),left=(r.left-outer.left)/scale-1,top=(r.top-outer.top)/scale-1,width=r.width/scale,height=r.height/scale;for(const [key,value]of Object.entries({left,top,width,height,startX:left,startY:top,endX:left+width,endY:top+height}))cache.el.style.setProperty('--text-'+key,value+'px');cache.guideSignature=signature;return}}
    // Frame geometry includes the scrollbar; clientWidth only measures its content.
    if(cache.scrollViewport&&!input){const scale=view.scale*(note.scale||1),outer=cache.el.getBoundingClientRect(),style=getComputedStyle(cache.el),r=cache.scrollViewport.getBoundingClientRect(),left=(r.left-outer.left)/scale-parseFloat(style.borderLeftWidth),top=(r.top-outer.top)/scale-parseFloat(style.borderTopWidth),width=cache.scrollViewport.offsetWidth,height=cache.scrollViewport.offsetHeight;for(const [key,value]of Object.entries({left,top,width,height,startX:left,startY:top,endX:left+width,endY:top+height}))cache.el.style.setProperty('--text-'+key,value+'px');cache.guideSignature=signature;return}
    let root=cache.body,mirror;
    if(input){
      // Match the rendered first glyph without moving saved text or overlaid ink.
      const preview=cache.body.cloneNode(false);preview.style.cssText='position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;width:100%';preview.innerHTML=markdown(note.markdown||input.placeholder);if(cache.scrollViewport){const frame=document.createElement('div');frame.className='note-scroll-viewport';frame.style.height=cache.scrollViewport.style.height;frame.style.marginTop=cache.scrollViewport.style.marginTop;frame.append(...preview.childNodes);preview.append(frame)}cache.el.append(preview);const renderedStart=contentRects(preview)[0];preview.remove();
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
    }else{for(const [key,value]of Object.entries({left:21,top:33,width:Math.max(0,(note.width||320)-42),height:textSize(note)*1.75,startX:21,startY:33,endX:21,endY:33+textSize(note)*1.75}))cache.el.style.setProperty('--text-'+key,value+'px')}
    if(cache.scrollViewport){const r=cache.scrollViewport.getBoundingClientRect(),left=(r.left-origin.left)/scale,top=(r.top-origin.top)/scale,width=cache.scrollViewport.offsetWidth,height=cache.scrollViewport.offsetHeight;for(const [key,value]of Object.entries({left,top,width,height,startX:left,startY:top,endX:left+width,endY:top+height}))cache.el.style.setProperty('--text-'+key,value+'px')}
    if(input&&!cache.scrollViewport){
      // The editor is a full-width input surface, even for an empty or short
      // source. Its frame and controls must not use placeholder/glyph bounds.
      const r=input.getBoundingClientRect();
      for(const [key,value]of Object.entries({left:(r.left-origin.left)/scale,top:(r.top-origin.top)/scale,width:input.offsetWidth,height:input.offsetHeight}))cache.el.style.setProperty('--text-'+key,value+'px');
    }
    mirror?.remove();cache.guideSignature=signature;
    if(input)input.style.clipPath='';
  }
  window.inkspaceInlineText={preparePointer,observePointer,hoverPointer,scrollWheel,frameBounds:note=>session?.note===note?session.previewFrame:null,finish,cancel,fullSource,sync,history,layoutNote,bounds,selectedNote,setView,previewHeight,finishHeight,clearViewTarget:()=>{viewTarget=null},renderNote:note=>session?.note===note,isEditing:()=>!!session,transientNoteId:()=>session?.created?session.note.id:null,excludeDraft(model){const id=session?.created?session.note.id:null;return id?{...model,pages:model.pages.map(page=>({...page,document:{...page.document,notes:page.document.notes.filter(n=>n.id!==id)}}))}:model},editingState:()=>session&&{id:session.note.id,source:sessionSource(session),start:session.start+session.input.selectionStart,end:session.start+session.input.selectionEnd,fragment:!!session.fragment},restoreDraft(draft){if(!draft||typeof draft.source!=='string')return false;const page=notebook.pages.find(p=>p.id===draft.page),existing=page?.document.notes.find(n=>n.id===draft.id),note=existing||draft.createdNote;if(!page||!note||!valid({...newCanvas(),notes:[note]}))return false;if(notebook.activePage!==page.id)switchPage(page.id);edit(note,null,{full:true});session.input.value=draft.source.replace(/\r\n|\r/g,'\n');session.input.dispatchEvent(new Event('input',{bubbles:true}));return true}};
  document.fonts?.ready.then(()=>{for(const cache of noteCache.values())cache.guideSignature=null;renderNotes()});
})();
