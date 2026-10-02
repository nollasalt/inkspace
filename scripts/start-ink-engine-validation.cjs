const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),home=process.env.INKSPACE_ENGINE_HOME||path.join(os.homedir(),'.inkspace-engine'),folder=path.join(root,'artifacts','engine-vscode-demo');
async function main(){
 fs.mkdirSync(home,{recursive:true});
 let running=false;try{const c=JSON.parse(fs.readFileSync(path.join(home,'connection.json')));const r=await fetch(c.endpoint+'/status',{method:'POST',headers:{'X-Inkspace-Key':c.key},body:'{}',signal:AbortSignal.timeout(1500)});running=r.ok}catch{}
 if(!running){const log=fs.openSync(path.join(home,'service.log'),'a');const child=spawn(process.execPath,[path.join(root,'ink-engine','service.cjs')],{cwd:root,windowsHide:true,detached:true,stdio:['ignore',log,log]});child.unref();fs.closeSync(log);for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,100));if(fs.existsSync(path.join(home,'connection.json'))){try{const c=JSON.parse(fs.readFileSync(path.join(home,'connection.json')));if(c.pid===child.pid){running=true;break}}catch{}}}if(!running)throw Error('Ink Engine failed to start; see '+path.join(home,'service.log'))}
 fs.mkdirSync(path.join(folder,'workspace'),{recursive:true});fs.mkdirSync(path.join(folder,'profile','User'),{recursive:true});
 fs.writeFileSync(path.join(folder,'profile','User','settings.json'),JSON.stringify({'workbench.startupEditor':'none','window.restoreWindows':'none','workbench.colorTheme':'Default Light Modern'}));
 const note=path.join(folder,'workspace','触控笔验证.inkspace.json');if(!fs.existsSync(note))fs.writeFileSync(note,JSON.stringify({format:'inkspace',version:2,title:'Raw Input 真实触控笔验证',activePage:'page-1',pages:[{id:'page-1',title:'第 1 页',view:{x:100,y:80,scale:1},document:{format:'inkspace',version:1,strokes:[],notes:[],shapes:[],pdfs:[],background:{type:'dots',color:'#f6f7f5',spacing:'auto',fontSize:16}}}]}));
 const exe=path.join(process.env.LOCALAPPDATA,'Programs','Microsoft VS Code','Code.exe');if(!fs.existsSync(exe))throw Error('Microsoft VS Code not found');
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.INKSPACE_NATIVE_CONFIG;
 const log=fs.openSync(path.join(home,'vscode.log'),'a');const editor=spawn(exe,['--new-window','--extensionDevelopmentPath='+path.join(root,'vscode'),'--user-data-dir='+path.join(folder,'profile'),'--extensions-dir='+path.join(folder,'extensions'),'--skip-welcome','--skip-release-notes',path.join(folder,'workspace'),note],{env,windowsHide:false,detached:true,stdio:['ignore',log,log]});editor.unref();fs.closeSync(log);console.log('普通 VS Code 验证窗口已启动：'+note);
}
main().catch(e=>{console.error(e);process.exitCode=1});
