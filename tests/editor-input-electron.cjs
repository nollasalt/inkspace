module.exports=async win=>{
 const evaluate=code=>win.webContents.executeJavaScript(code),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const previous=await evaluate('(async()=>{const previous=activeDocumentTab;await activateTab(documentTabs.find(t=>t.md).id);inkspaceWorkbench.setMarkdownMode("edit");inkspaceTextEditor.editor.setValue("# 输入测试\\n");return previous})()');
 win.show();win.focus();await pause(150);const point=await evaluate('(()=>{const r=document.querySelector("#markdown-code-editor").getBoundingClientRect();return{x:Math.round(r.x+120),y:Math.round(r.y+25)}})()');
 for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,...point});await pause(30);
 for(const key of ['p','e','s','t','v','h','Space']){win.webContents.sendInputEvent({type:'keyDown',keyCode:key});win.webContents.sendInputEvent({type:'char',keyCode:key==='Space'?' ':key});win.webContents.sendInputEvent({type:'keyUp',keyCode:key})}await pause(120);
 const result=await evaluate('({text:inkspaceTextEditor.editor.getValue(),focused:inkspaceTextEditor.editor.hasTextFocus()})');win.hide();if(!result.focused||!result.text.includes('pestvh '))throw Error('Typing after releasing mouse failed: '+JSON.stringify(result));
 await evaluate('inkspaceWorkbench.setMarkdownMode("split");activateTab('+JSON.stringify(previous)+')');return{passed:true,mouseReleased:true,canvasShortcutsIsolated:true};
};
