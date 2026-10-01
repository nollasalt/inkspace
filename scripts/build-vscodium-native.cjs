const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=process.env.INKSPACE_CODIUM_HOME||path.join(process.env.LOCALAPPDATA,'Programs','VSCodium'),output=path.join(root,'dist','Inkspace-VSCodium-Native');
if(!fs.existsSync(path.join(source,'VSCodium.exe')))throw Error('Installed VSCodium not found');
if(path.resolve(source)===path.resolve(output))throw Error('Source must be the original installation');
fs.mkdirSync(output,{recursive:true});fs.cpSync(source,output,{recursive:true,filter:file=>!/^unins\d+\./i.test(path.basename(file))});
const app=path.join(output,'resources','app'),bridge=path.join(app,'inkspace-native');fs.mkdirSync(bridge,{recursive:true});
for(const file of ['bootstrap.cjs','frame-geometry.cjs','entry.mjs'])fs.copyFileSync(path.join(root,'vscode-native',file),path.join(bridge,file));
fs.copyFileSync(path.join(root,'desktop','native','ink-native.node'),path.join(bridge,'ink-native.node'));fs.copyFileSync(path.join(root,'LICENSE'),path.join(bridge,'LICENSE'));fs.copyFileSync(path.join(root,'native','UPSTREAM.md'),path.join(bridge,'UPSTREAM.md'));fs.cpSync(path.join(root,'desktop','native','licenses'),path.join(bridge,'licenses'),{recursive:true});
const packageFile=path.join(app,'package.json'),data=JSON.parse(fs.readFileSync(packageFile));if(data.main!=='./out/main.js')throw Error('Unexpected upstream VSCodium entry point');data.main='./inkspace-native/entry.mjs';fs.writeFileSync(packageFile,JSON.stringify(data,null,2));
fs.mkdirSync(path.join(output,'data','user-data'),{recursive:true});fs.mkdirSync(path.join(output,'data','extensions'),{recursive:true});
const settings=path.join(output,'data','user-data','User','settings.json');if(!fs.existsSync(settings)){fs.mkdirSync(path.dirname(settings),{recursive:true});fs.writeFileSync(settings,JSON.stringify({'update.mode':'none','window.titleBarStyle':'custom','workbench.startupEditor':'none','workbench.colorTheme':'Default Light Modern','workbench.secondarySideBar.defaultVisibility':'hidden'},null,2))}
fs.writeFileSync(path.join(output,'启动墨境 VSCodium.cmd'),'@echo off\r\nsetlocal\r\nset ELECTRON_RUN_AS_NODE=\r\n"%~dp0VSCodium.exe" --user-data-dir="%~dp0data\\user-data" --extensions-dir="%~dp0data\\extensions" %*\r\n');
fs.writeFileSync(path.join(output,'INKSPACE-NATIVE.txt'),'Dedicated VSCodium build with Windows HIMETRIC + Xournal++ + Cairo.\r\nLaunch using the adjacent CMD file. Requires the Inkspace 0.2 extension.\r\nUpstream VSCodium installation is not modified.\r\nSource: https://github.com/nollasalt/inkspace\r\n');
console.log(output);
