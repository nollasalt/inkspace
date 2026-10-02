const vscode=require('vscode'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
exports.run=async()=>{const root=process.env.INKSPACE_ENGINE_TEST_ROOT,report=path.join(root,'result.json');try{
 const extension=vscode.extensions.getExtension('nollasalt.inkspace'),api=await extension.activate();
 const uri=vscode.Uri.file(path.join(root,'workspace','Engine-test.inkspace.json'));await vscode.workspace.fs.writeFile(uri,Buffer.from(JSON.stringify(require('../extension.cjs').emptyNotebook('独立 Ink Engine'))));await vscode.commands.executeCommand('vscode.openWith',uri,'inkspace.notebook');
 for(let i=0;i<120&&!api.ready(uri);i++)await new Promise(r=>setTimeout(r,100));assert(api.ready(uri));
 const inspect=await api.diagnostic(uri,'inspect');assert(inspect.native.independentEngine);assert.equal(inspect.native.hooks,0,'ordinary VS Code has no injected HWND hooks');assert(inspect.nativeState.rawInput);
 const dense=await api.diagnostic(uri,'dense');assert.equal(dense.samples,300);
 const dots=await api.diagnostic(uri,'dots');assert.equal(dots.dots,60);assert(dots.pixelsExact);
 const zoom=await api.diagnostic(uri,'zoom');assert(zoom.continuous&&zoom.finalPixelsExact);
 const cairo=await api.diagnostic(uri,'cairo'),expected=require('../../desktop/native/ink-native.node').raster({...cairo.payload,points:new Float64Array(cairo.payload.points)});assert.deepEqual(Buffer.from(cairo.rgba),expected);
 const selectionScale=await api.diagnostic(uri,'selection-scale');assert(selectionScale.mouseHandle&&selectionScale.undoRedo);
 const viewLoading=await api.diagnostic(uri,'view-loading');assert(viewLoading.immediateCompletePreview);
 const settings=await api.diagnostic(uri,'settings');assert.equal(settings.background,'grid');assert.equal((await vscode.workspace.openTextDocument(uri)).isDirty,false);assert.equal(JSON.parse(fs.readFileSync(uri.fsPath)).pages[0].document.background.type,'grid');
 await vscode.commands.executeCommand('inkspace.save');const doc=await vscode.workspace.openTextDocument(uri);assert.equal(doc.isDirty,false);
 const createdFolder=vscode.Uri.file(path.join(root,'workspace','new-notes'));await vscode.workspace.fs.createDirectory(createdFolder);await vscode.commands.executeCommand('inkspace.new',createdFolder);await vscode.commands.executeCommand('inkspace.new',createdFolder);assert((await vscode.workspace.fs.readDirectory(createdFolder)).filter(([name])=>name.endsWith('.inkspace.json')).length>=2);
 fs.writeFileSync(report,JSON.stringify({settingsAutoSaved:true,newNoteInSelectedFolder:true,passed:true,host:vscode.env.appName,version:vscode.version,independentEngine:true,hostHooks:0,dense,dots,zoom,viewLoading,selectionScale,cairoPixelsExact:true,cairoRoundTripMs:cairo.elapsed,saved:true,physicalPenTested:false},null,2));
}catch(e){fs.writeFileSync(report,JSON.stringify({passed:false,error:e.stack},null,2));throw e}finally{if(process.env.INKSPACE_ENGINE_HOME===path.join(root,'engine')){try{const config=JSON.parse(fs.readFileSync(path.join(root,'engine','connection.json')));await fetch(config.endpoint+'/shutdown',{method:'POST',headers:{'X-Inkspace-Key':config.key},body:'{}'})}catch{}}}};
