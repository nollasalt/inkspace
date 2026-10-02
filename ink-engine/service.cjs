// Ordinary Node service. No Electron APIs, IDE injection, or window hooks.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto'),readline=require('node:readline'),{spawn,fork}=require('node:child_process'),{WebSocketServer}=require('ws');
const root=path.resolve(__dirname,'..'),home=process.env.INKSPACE_ENGINE_HOME||path.join(os.homedir(),'.inkspace-engine');fs.mkdirSync(home,{recursive:true});
const key=crypto.randomBytes(32).toString('hex'),test=process.argv.includes('--test'),clients=new Set();let samples=0,sequence=0;
let worker,workerReady=false,stopping=false,restartTimer;
const pending=new Map();
function failRequests(error){for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(error)}pending.clear()}
function startWorker(){
 workerReady=false;const current=fork(path.join(__dirname,'raster-worker.cjs'),[],{silent:true,windowsHide:true,serialization:'advanced',execArgv:[]});worker=current;
 current.stderr.on('data',data=>process.stderr.write(data));
 current.on('message',m=>{if(m.ready){workerReady=true;return}const entry=pending.get(m.id);if(!entry)return;pending.delete(m.id);clearTimeout(entry.timer);m.error?entry.reject(Error(m.error)):entry.resolve(m.data)});
 current.on('error',error=>{workerReady=false;console.error('Cairo worker error:',error.message);failRequests(error)});
 current.on('exit',(code,signal)=>{workerReady=false;console.error('Cairo worker exited:',code,signal);failRequests(Error('Cairo worker stopped'));if(!stopping)restartTimer=setTimeout(startWorker,1000)});
}
startWorker();
function raster(operation,payload){return new Promise((resolve,reject)=>{if(!workerReady||!worker?.connected){reject(Error('Cairo worker is restarting'));return}const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Cairo timeout'))},10000);pending.set(id,{resolve,reject,timer});try{worker.send({id,operation,payload},error=>{if(!error)return;const entry=pending.get(id);if(entry){pending.delete(id);clearTimeout(entry.timer);entry.reject(error)}})}catch(error){pending.delete(id);clearTimeout(timer);reject(error)}})}
function validOrigin(origin){return !origin||origin==='null'||/^vscode-webview:\/\//.test(origin)||/^https:\/\/[a-z0-9-]+\.vscode-webview\.net$/i.test(origin)}
const status=()=>({cairo:'1.18.4',hooks:0,rendererReady:workerReady,rendererPid:worker?.pid,inputReady:workerReady&&!!probe&&probe.exitCode===null,inputBackend:'raw-hid',independentEngine:true,samples,clients:clients.size,rasterPending:pending.size,physicalInput:!!probe&&probe.exitCode===null});
const server=http.createServer(async(req,res)=>{
  if(!validOrigin(req.headers.origin)){res.writeHead(403);return res.end()}
  if(req.headers.origin)res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Inkspace-Key');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Private-Network','true');res.setHeader('Cache-Control','no-store');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
  if(req.method!=='POST'||req.headers['x-inkspace-key']!==key){res.writeHead(403);return res.end()}
  try{let length=0;const chunks=[];for await(const c of req){length+=c.length;if(length>32*1024*1024)throw Error('Request too large');chunks.push(c)}const p=JSON.parse(Buffer.concat(chunks).toString()||'{}');
    if(req.url==='/shutdown'){res.end('{}');setTimeout(stop,50);return}
    if(req.url==='/status'||req.url==='/register'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(status()))}
    if(req.url==='/raster'||req.url==='/path'){const result=await raster(req.url.slice(1),p);res.setHeader('Content-Type',req.url==='/raster'?'application/octet-stream':'application/json');return res.end(req.url==='/raster'?Buffer.from(result):JSON.stringify(result))}
    res.writeHead(404);res.end();
  }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}))}
});
const ws=new WebSocketServer({noServer:true,maxPayload:4*1024*1024});
server.on('upgrade',(req,socket,head)=>{const u=new URL(req.url,'http://localhost');if(u.pathname!=='/pen'||u.searchParams.get('key')!==key||!validOrigin(req.headers.origin)){socket.destroy();return}ws.handleUpgrade(req,socket,head,s=>ws.emit('connection',s,req))});
ws.on('connection',socket=>{clients.add(socket);socket.on('close',()=>clients.delete(socket));socket.on('message',data=>{try{const m=JSON.parse(data);if(test&&m.type==='fixture')socket.send(JSON.stringify({type:'fixture',id:m.id,packets:m.packets}));}catch{socket.close(1003)}})});
let batch=[],flush=null;
function enqueue(sample){samples++;batch.push(sample);if(!flush)flush=setTimeout(()=>{const message=JSON.stringify({type:'raw',samples:batch});batch=[];flush=null;for(const c of clients){if(c.bufferedAmount>4*1024*1024){c.close(1013,'Input receiver stalled');continue}c.send(message)}},2)}
let probe;
server.listen(0,'127.0.0.1',()=>{
  const config={endpoint:'http://127.0.0.1:'+server.address().port,key,transport:'raw-input',test,pid:process.pid};fs.writeFileSync(path.join(home,'connection.json'),JSON.stringify(config));
  probe=spawn(path.join(root,'dist','RawInputProbe','RawInputProbe.exe'),['--stream','--duration=0','--out='+path.join(home,'probe')],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  readline.createInterface({input:probe.stdout}).on('line',line=>{try{enqueue(JSON.parse(line))}catch{}});probe.on('error',e=>console.error(e));
  console.log('Ink Engine ready:',config.endpoint);
});
function stop(){stopping=true;clearTimeout(restartTimer);probe?.kill();worker?.kill();try{const current=JSON.parse(fs.readFileSync(path.join(home,'connection.json')));if(current.pid===process.pid)fs.unlinkSync(path.join(home,'connection.json'))}catch{}server.close();for(const c of clients)c.close();process.exit(0)}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
