(async()=>{
  const assert=(condition,message)=>{if(!condition)throw Error(message)};
  const original=doc,originalView={...view};
  clearSelection();doc={format:'inkspace',version:1,strokes:[],shapes:[],background:{type:'dots',color:'#f6f7f5',spacing:'auto',fontSize:16},notes:[160,319.75,560].map((width,index)=>({id:'layout-'+index,x:20+index*600,y:20,width,markdown:'# 缩放时保持文字排布\n\n这是用于检查换行边界的长段落。包含 **粗体文字**、中文标点，以及 English words near a wrapping boundary. Zoom should preserve every line break.\n\n> 引用段落也应固定排布，不受固定边距与倍率影响。A blockquote with several words and mixed text.\n\n- 列表第一项：这一行包含足够多的文字，以便在不同文本框宽度下换行。\n- 第二项，带有公式 $E=mc^2$。\n\n$$\\frac{x^2+y^2}{z}=\\sum_{i=1}^{n} i$$\n\n```python\ndef example(value):\n    return value * value\n```'}))};view={x:20,y:20,scale:1};render();await document.fonts.ready;
  function signature(el){
    const walker=document.createTreeWalker(el.querySelector('.note-body'),NodeFilter.SHOW_TEXT),breaks=[];
    while(walker.nextNode()){
      const node=walker.currentNode,range=document.createRange(),lines=[];let top=null;
      for(let index=0;index<node.length;index++){
        range.setStart(node,index);range.setEnd(node,index+1);const rect=range.getBoundingClientRect();
        if(top===null||Math.abs(rect.top-top)>.1*view.scale){lines.push(index);top=rect.top}
      }breaks.push(lines);
    }
    return JSON.stringify({width:el.offsetWidth,height:el.offsetHeight,font:getComputedStyle(el).fontSize,blocks:[...el.querySelectorAll('.note-body *')].map(n=>[n.offsetTop,n.offsetLeft,n.offsetWidth,n.offsetHeight]),breaks});
  }
  const elements=doc.notes.map(n=>document.querySelector(`[data-id="${n.id}"]`)),baseline=elements.map(signature),heights=doc.notes.map(n=>itemBounds('notes',n).h),scales=[.001,.04,.1,.17,.36,.49,.5,.75,.9,1,1.25,2,8,32];
  for(const scale of scales){
    zoom(scale,200,160);
    elements.forEach((el,index)=>{assert(signature(el)===baseline[index],'unchanged character line breaks and block layout at '+scale+', width '+doc.notes[index].width);assert(itemBounds('notes',doc.notes[index]).h===heights[index],'stable selection world height at '+scale);assert(Math.abs(el.getBoundingClientRect().height-heights[index]*scale)<=scale+0.01,'display height follows zoom at '+scale)});
  }
  // Intentional width changes still trigger reflow; zoom changes never do.
  doc.notes[0].width=560;render();assert(signature(elements[0])!==baseline[0],'resizing text box still changes layout');
  doc=original;view=originalView;render();return{passed:true,scales,widths:[160,319.75,560],characterLineBreaks:true,blockLayout:true,worldHeight:true,resizing:true};
})()
.catch(error=>{throw Error(error.stack)})
