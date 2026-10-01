(async()=>{
  const assert=(value,message)=>{if(!value)throw Error(message)},previousGuard=allowReplace;
  allowReplace=async()=>true;
  try{
    while(documentTabs.length)await closeDocumentTab(documentTabs[0].id);
    assert(activeDocumentTab===null&&documentTabs.length===0,'closing last tab does not create a notebook');
    assert(document.body.classList.contains('empty-workspace')&&getComputedStyle(viewport).display==='none','blank editor shown');
    assert($('#document-tabs').children.length===0&&$('#file-status-path').textContent==='','no phantom file label');
    assert(JSON.parse(documentJSON()).workspaceRecovery.tabs.length===0,'empty session persists without placeholder tabs');
    assert(await saveNotebook()===false,'empty workspace cannot save a phantom note');
    await $('#new').onclick();assert(documentTabs.length===1&&!document.body.classList.contains('empty-workspace')&&getComputedStyle(viewport).display!=='none','explicit new creates an editable canvas');
    await closeDocumentTab(activeDocumentTab);assert(documentTabs.length===0,'new note can close to blank workspace');
    return{passed:true,lastTabClosesToEmpty:true,explicitNew:true,noPhantomRecovery:true};
  }finally{allowReplace=previousGuard}
})()
