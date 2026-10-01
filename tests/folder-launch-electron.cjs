const assert=require('node:assert/strict'),path=require('node:path'),{execFile}=require('node:child_process');
module.exports=async({win,root})=>{
 const evaluate=code=>win.webContents.executeJavaScript(code),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const wait=async code=>{for(let i=0;i<150;i++){if(await evaluate(code))return;await pause(40)}throw Error('Folder launch timed out: '+JSON.stringify(await evaluate('({root:openedFolder?.root,tree:document.querySelector("#folder-tree").textContent})')))};
 const first=path.join(root,'artifacts','右键 打开测试'),second=path.join(root,'artifacts','右键 第二个目录');
 await wait('typeof openedFolder!=="undefined"&&openedFolder?.root==='+JSON.stringify(first)+'&&document.querySelector("#folder-tree").textContent.includes("阅读.md")');
 const tab=await evaluate('(async()=>{await document.querySelector("#new").onclick();doc.notes.push({id:"unsaved",x:0,y:0,width:560,markdown:"保留未保存笔记"});persist();return activeDocumentTab})()');
 await new Promise((resolve,reject)=>execFile(process.execPath,[root,'--test-folder-launch','--open-folder='+second],{windowsHide:true,timeout:10000},error=>error?reject(error):resolve()));
 await wait('openedFolder?.root==='+JSON.stringify(second)+'&&document.querySelector("#folder-tree").textContent.includes("第二份.md")');
 assert.equal(await evaluate('activeDocumentTab'),tab);assert.equal(await evaluate('doc.notes[0].markdown'),'保留未保存笔记');
 console.log('Passed Explorer folder launch: Unicode/spaces, initial workspace, real second-instance forwarding, unsaved tab preserved.');
};
