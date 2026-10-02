const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),runtime=path.join(root,'vscode','engine-runtime');
for(const file of ['ink-engine/service.cjs','ink-engine/raster-worker.cjs','desktop/native/ink-native.node','desktop/native/build-manifest.json','dist/RawInputProbe/RawInputProbe.exe','LICENSE']){const target=path.join(runtime,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target)}
fs.cpSync(path.join(root,'desktop','native','licenses'),path.join(runtime,'desktop','native','licenses'),{recursive:true});
fs.cpSync(path.join(root,'node_modules','ws'),path.join(runtime,'node_modules','ws'),{recursive:true});
const output=path.join(root,'dist','Inkspace-VSCode-'+require('../vscode/package.json').version+'-win32-x64.vsix');
const lookup=spawnSync('where.exe',['npx.cmd'],{encoding:'utf8',windowsHide:true});
const npxCli=lookup.stdout?.trim().split(/\r?\n/).map(file=>path.join(path.dirname(file),'node_modules','npm','bin','npx-cli.js')).find(file=>fs.existsSync(file));
if(!npxCli)throw Error('npm/npx CLI not found');
const result=spawnSync(process.execPath,[npxCli,'--yes','@vscode/vsce@4.0.0','package','--target','win32-x64','--no-dependencies','--out',output],{cwd:path.join(root,'vscode'),stdio:'inherit',windowsHide:true});if(result.status!==0)process.exitCode=1;
