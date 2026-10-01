const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFile}=require('node:child_process'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version,output=process.env.INKSPACE_PACKAGE_OUTPUT||path.join(root,'dist'),exe=path.join(output,`Inkspace-${version}-Windows.exe`),archive=path.join(output,'win-unpacked','resources','app.asar'),report=path.join(root,'artifacts','package-verification.json');
for(const file of ['index.html','style.css','app.js','renderer.js','pdf.js','desktop/main.cjs','desktop/preload.cjs','desktop/bridge.js','desktop/workspace.js','desktop/files.js','desktop/workbench.js','vendor/text-editor.js','vendor/text-editor.css','vendor/editor.worker.js','desktop/folder-files.cjs','desktop/folder-ipc.cjs','desktop/ink-renderer.js','desktop/native-ink.cjs','desktop/native/ink-native.node','vendor/content.js','vendor/pdf-api.js']){
  if(!asar.extractFile(archive,path.normalize(file)).equals(fs.readFileSync(path.join(root,file))))throw Error('Packaged source differs: '+file);
}
if(fs.existsSync(report))fs.unlinkSync(report);
execFile(exe,['--verify-package','--report-root='+root],{cwd:root,windowsHide:true,timeout:60000},(error,stdout,stderr)=>{
  if(error){console.error(error,stderr);process.exitCode=1;return}
  const result=JSON.parse(fs.readFileSync(report,'utf8'));if(!result.passed){console.error(result);process.exitCode=1;return}
  const manifest={...result,version,executable:path.basename(exe),bytes:fs.statSync(exe).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex'),verifiedAt:new Date().toISOString(),sourceMatchesArchive:true};fs.writeFileSync(path.join(root,'artifacts','release-verification.json'),JSON.stringify(manifest,null,2));console.log(manifest);
});
