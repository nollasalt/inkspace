const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
exports.read=()=>{for(const file of [process.env.INKSPACE_NATIVE_CONFIG,process.env.INKSPACE_ENGINE_CONFIG,path.join(process.env.INKSPACE_ENGINE_HOME||path.join(os.homedir(),'.inkspace-engine'),'connection.json')].filter(Boolean)){try{const config=JSON.parse(fs.readFileSync(file,'utf8'));if(/^http:\/\/127\.0\.0\.1:\d+$/.test(config.endpoint)&&/^[a-f0-9]{64}$/.test(config.key))return config}catch{}}return null};
let starting;
exports.ensure=()=>starting||(starting=ensure().finally(()=>{starting=null}));
async function alive(config){if(!config)return false;try{const http=require('node:http');return await new Promise(resolve=>{const req=http.request(config.endpoint+'/status',{method:'POST',headers:{'X-Inkspace-Key':config.key},timeout:1500},res=>{res.resume();resolve(res.statusCode===200)});req.on('timeout',()=>req.destroy());req.on('error',()=>resolve(false));req.end('{}')})}catch{return false}}
async function ensure(){const existing=exports.read();if(await alive(existing))return existing;
 const root=fs.existsSync(path.join(__dirname,'engine-runtime','ink-engine','service.cjs'))?path.join(__dirname,'engine-runtime'):path.resolve(__dirname,'..'),service=path.join(root,'ink-engine','service.cjs');if(!fs.existsSync(service))throw Error('未找到 Ink Engine，请安装包含引擎的 Inkspace 版本。');
 const home=process.env.INKSPACE_ENGINE_HOME||path.join(os.homedir(),'.inkspace-engine');fs.mkdirSync(home,{recursive:true});const log=fs.openSync(path.join(home,'service.log'),'a');
 const child=require('node:child_process').spawn(process.execPath,[service,...(process.env.INKSPACE_ENGINE_TEST==='1'?['--test']:[])],{cwd:root,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,detached:true,stdio:['ignore',log,log]});child.unref();fs.closeSync(log);let error;child.on('error',e=>{error=e});
 for(let i=0;i<60;i++){if(error)throw error;await new Promise(r=>setTimeout(r,100));const config=exports.read();if(config?.pid===child.pid&&await alive(config))return config}
 throw Error('Ink Engine 启动失败，请检查 '+path.join(home,'service.log'));
}
