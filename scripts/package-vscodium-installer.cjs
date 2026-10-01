const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),version=require('../vscode/package.json').version;
const host=path.join(root,'dist','Inkspace-VSCodium-Native');
const work=path.join(root,'artifacts',`codium-installer-${version}-${process.pid}`),payload=path.join(work,'payload');
fs.mkdirSync(payload,{recursive:true});
// Only upstream runtime files; never copy the portable data/profile directory.
for(const name of fs.readdirSync(host))if(name!=='data'&&name!=='启动墨境 VSCodium.cmd')fs.cpSync(path.join(host,name),path.join(payload,name),{recursive:true});
const bridge=path.join(payload,'resources','app','inkspace-native');
for(const name of ['bootstrap.cjs','frame-geometry.cjs','entry.mjs','raster-service.cjs','raster-worker.cjs'])fs.copyFileSync(path.join(root,'vscode-native',name),path.join(bridge,name));
const extension=path.join(payload,'resources','app','extensions','nollasalt.inkspace');
fs.mkdirSync(extension,{recursive:true});
for(const name of fs.readdirSync(path.join(root,'vscode')))if(/\.(cjs|svg)$/.test(name)||['package.json','README.md'].includes(name))fs.copyFileSync(path.join(root,'vscode',name),path.join(extension,name));
fs.copyFileSync(path.join(root,'LICENSE'),path.join(extension,'LICENSE'));
fs.cpSync(path.join(root,'vscode','media'),path.join(extension,'media'),{recursive:true});
fs.copyFileSync(path.join(root,'desktop','icon.ico'),path.join(payload,'Inkspace.ico'));
const productFile=path.join(payload,'resources','app','product.json'),product=JSON.parse(fs.readFileSync(productFile));
Object.assign(product,{nameShort:'Inkspace',nameLong:'Inkspace VSCodium',applicationName:'inkspace-codium',win32MutexName:'inkspace-codium',win32AppUserModelId:'Inkspace.VSCodium',win32ShellNameShort:'Inkspace'});
delete product.updateUrl;fs.writeFileSync(productFile,JSON.stringify(product,null,2));
const files=[],directories=[];
function visit(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory()){directories.push(path.relative(payload,file));visit(file)}else files.push(path.relative(payload,file))}}
visit(payload);
const nsisPath=relative=>relative.replaceAll('$','$$').replaceAll('"','$\\"');
const uninstall=path.join(work,'uninstall-files.nsh');
fs.writeFileSync(uninstall,'\uFEFF'+files.map(file=>`Delete "$INSTDIR\\${nsisPath(file)}"`).concat(directories.sort((a,b)=>b.split(path.sep).length-a.split(path.sep).length).map(folder=>`RMDir "$INSTDIR\\${nsisPath(folder)}"`)).join('\n'));
const critical=['resources/app/inkspace-native/bootstrap.cjs','resources/app/inkspace-native/ink-native.node','resources/app/extensions/nollasalt.inkspace/extension.cjs','resources/app/extensions/nollasalt.inkspace/html.cjs','resources/app/extensions/nollasalt.inkspace/package.json','resources/app/extensions/nollasalt.inkspace/media/desktop/workspace.js','resources/app/extensions/nollasalt.inkspace/media/native-render-async.js'];
const manifest={version,files:files.length,payload,critical:Object.fromEntries(critical.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(payload,file))).digest('hex')]))};
fs.writeFileSync(path.join(root,'artifacts','codium-installer-manifest.json'),JSON.stringify(manifest,null,2));
let compiler=process.env.INKSPACE_MAKENSIS;
if(!compiler){const cache=path.join(process.env.LOCALAPPDATA,'electron-builder','Cache','nsis-3.0.4.1');for(const folder of fs.readdirSync(cache)){const candidate=path.join(cache,folder,'Bin','makensis.exe');if(fs.existsSync(candidate)){compiler=candidate;break}}}
if(!compiler)throw Error('NSIS compiler not found. Set INKSPACE_MAKENSIS.');
const output=path.join(root,'dist',`Inkspace-VSCodium-${version}-Setup.exe`);
console.log(`Packaging ${files.length} runtime files; profiles excluded.`);
const installerScript=path.join(work,'installer.nsi');fs.writeFileSync(installerScript,'\uFEFF'+fs.readFileSync(path.join(root,'vscode-native','installer.nsi'),'utf8'));
execFileSync(compiler,['/V2',`/DVERSION=${version}`,`/DOUTPUT=${output}`,`/DPAYLOAD=${payload}`,`/DICON=${path.join(root,'desktop','icon.ico')}`,`/DLICENSE=${path.join(root,'LICENSE')}`,`/DUNINSTALL_FILES=${uninstall}`,installerScript],{stdio:'inherit',windowsHide:true});
manifest.installer=output;manifest.bytes=fs.statSync(output).size;manifest.sha256=crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex');
fs.writeFileSync(path.join(root,'artifacts','codium-installer-manifest.json'),JSON.stringify(manifest,null,2));
console.log(output);
