const vscode=require('vscode'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
exports.run=async()=>{
  const root=process.env.INKSPACE_ENGINE_TEST_ROOT,report=path.join(root,'result.json');
  try{
    const extension=vscode.extensions.getExtension('nollasalt.inkspace'),api=await extension.activate(),binary=require('../binary-store.cjs');
    const uri=vscode.Uri.file(path.join(root,'workspace','Workbench.ink'));await vscode.workspace.fs.writeFile(uri,Buffer.alloc(0));await vscode.commands.executeCommand('vscode.open',uri);
    for(let i=0;i<120&&!api.ready(uri);i++)await new Promise(r=>setTimeout(r,100));assert(api.ready(uri));
    const initial=await api.diagnostic(uri,'inspect');assert(initial.native.independentEngine);assert.equal(initial.native.hooks,0);assert(initial.nativeState.rawInput);
    await vscode.commands.executeCommand('inkspace.tool.pen');
    const dense=await api.diagnostic(uri,'dense');assert.equal(dense.samples,300);
    const dots=await api.diagnostic(uri,'dots');assert.equal(dots.dots,60);assert(dots.pixelsExact);
    const zoom=await api.diagnostic(uri,'zoom');assert(zoom.continuous&&zoom.finalPixelsExact);
    const inputStability=await api.diagnostic(uri,'input-stability');assert.equal(inputStability.rapidTaps,100);assert(inputStability.pixelsPresent&&inputStability.focusReturnWithoutMouseClick);
    const workbench=await api.diagnostic(uri,'workbench');assert(workbench.atomicTextCommit&&workbench.sharedControls&&workbench.centeredShape&&workbench.libraryStayedOpen&&workbench.sidebarRestored);
    await vscode.commands.executeCommand('inkspace.save');const saved=binary.decode(fs.readFileSync(uri.fsPath));
    assert.equal(saved.model.pages[0].document.notes.find(n=>n.id==='workbench-validation').markdown,workbench.text);assert.equal(saved.model.pages[0].document.diagram,workbench.diagram);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');await vscode.commands.executeCommand('vscode.open',uri);for(let i=0;i<120&&!api.ready(uri);i++)await new Promise(r=>setTimeout(r,100));
    const reopened=await api.diagnostic(uri,'inspect');assert.deepEqual(reopened.model,saved.model);
    fs.writeFileSync(report,JSON.stringify({passed:true,ordinaryVSCode:true,independentEngine:true,rawInput:true,dense,dots,zoom,inputStability,workbench,saveAndReopenExact:true},null,2));
  }catch(error){fs.writeFileSync(report,JSON.stringify({passed:false,error:error.stack},null,2));throw error}
  finally{if(process.env.INKSPACE_ENGINE_HOME===path.join(root,'engine')){try{const config=JSON.parse(fs.readFileSync(path.join(root,'engine','connection.json')));await fetch(config.endpoint+'/shutdown',{method:'POST',headers:{'X-Inkspace-Key':config.key},body:'{}'})}catch{}}}
};
