(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.InkspaceNavigationData=api})(globalThis,()=>{
  function search(book,query,limit=300){
    if(!query)return{items:[],limited:false};const expression=new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu'),items=[];
    for(const page of book.pages){const sources=[{kind:'page',text:page.title},...(page.document.notes||[]).filter(note=>note.kind!=='image').map(note=>({kind:'text',note:note.id,text:note.markdown||''}))];for(const source of sources){expression.lastIndex=0;let match;while(match=expression.exec(source.text)){if(items.length===limit)return{items,limited:true};items.push({page:page.id,pageTitle:page.title,kind:source.kind,note:source.note,start:match.index,end:match.index+match[0].length,snippet:source.text.slice(Math.max(0,match.index-24),match.index+match[0].length+48).replace(/\s+/g,' ')});}}}
    return{items,limited:false};
  }
  function movePage(book,id,direction){if(![-1,1].includes(direction))return false;const index=book.pages.findIndex(page=>page.id===id),next=index+direction;if(index<0||next<0||next>=book.pages.length)return false;[book.pages[index],book.pages[next]]=[book.pages[next],book.pages[index]];return true}
  function nextTitle(book){const titles=new Set(book.pages.map(page=>page.title));let number=book.pages.length+1;while(titles.has('第 '+number+' 页'))number++;return '第 '+number+' 页'}
  return{search,movePage,nextTitle};
});
