// Runs inside the dedicated VSCodium Electron main process. The unchanged
// Windows/Xournal++/Cairo addon hooks this process's own HWNDs on the UI thread.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const native=require('./ink-native.node'),{measureFrame,toFrame,toRoot}=require('./frame-geometry.cjs');
const key=crypto.randomBytes(32).toString('hex'),clients=new Map(),test=process.env.INKSPACE_NATIVE_TEST==='1';
const dataIndex=process.argv.indexOf('--user-data-dir'),dataArg=process.argv.find(value=>value.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length)||(dataIndex>=0?process.argv[dataIndex+1]:null);
const profile=dataArg||path.join(path.dirname(process.execPath),'data','user-data'),config=process.env.INKSPACE_NATIVE_CONFIG||path.join(profile,'native-bridge.json');process.env.INKSPACE_NATIVE_CONFIG=config;
const settings=path.join(profile,'User','settings.json');if(!fs.existsSync(settings)){fs.mkdirSync(path.dirname(settings),{recursive:true});fs.writeFileSync(settings,JSON.stringify({'update.mode':'none','window.titleBarStyle':'custom','workbench.startupEditor':'none','workbench.colorTheme':'Default Light Modern','workbench.secondarySideBar.defaultVisibility':'hidden'},null,2))}
let attachedWindow=null,pumping=false,packetQueue=[],injectedPackets=0;
function attach(win){if(!win||win.isDestroyed())return;try{native.attach(win.getNativeWindowHandle());attachedWindow=win}catch{}}
app.on('browser-window-created',(_event,win)=>{if(!attachedWindow)attach(win);win.on('focus',()=>attach(win));win.webContents.on('dom-ready',()=>{if(!attachedWindow||attachedWindow===win)attach(win)});win.on('closed',()=>{for(const [id,client]of clients)if(client.win===win)clients.delete(id);if(attachedWindow===win)attachedWindow=null})});
const rescan=setInterval(()=>{const focused=BrowserWindow.getFocusedWindow();attach(focused||attachedWindow||BrowserWindow.getAllWindows()[0])},500);rescan.unref();
async function findClient(id){
  for(const win of BrowserWindow.getAllWindows()){
    const frames=win.webContents.mainFrame.framesInSubtree;
    const results=await Promise.allSettled(frames.map(async frame=>{const marker=await frame.executeJavaScript('document.querySelector("#inkspace-native-client")?.content||null');return marker===id?frame:null}));
    const found=results.find(result=>result.status==='fulfilled'&&result.value);if(found){const frame=found.value,layout=await measureFrame(frame),client={id,win,frame,layout};clients.set(id,client);if(win.isFocused()||!attachedWindow)attach(win);return client}
  }
  throw Error('Native canvas frame not found');
}
async function deliver(packet,win){
  for(const [id,client]of clients){if(client.win!==win)continue;if(client.frame.isDestroyed()){clients.delete(id);continue}
    if(packet.type==='pointerdown'){try{client.layout=await measureFrame(client.frame)}catch{continue}}
    const translated={...packet,samples:packet.samples.map(sample=>toFrame(sample,client.layout))};
    if(packet.type==='pointerdown'){const point=translated.samples.at(-1);if(!point||point.x<0||point.y<0||point.x/client.layout.dpr>client.layout.width||point.y/client.layout.dpr>client.layout.height)continue}
    await client.frame.executeJavaScript(`window.dispatchEvent(new CustomEvent('inkspace-native-packets',{detail:${JSON.stringify([translated])}}))`);
  }
}
async function pump(){if(pumping)return;pumping=true;try{while(packetQueue.length){const item=packetQueue.shift();while(item.packet.type==='pointermove'&&packetQueue[0]?.win===item.win&&packetQueue[0]?.packet.type==='pointermove'&&packetQueue[0]?.packet.samples.at(-1)?.id===item.packet.samples.at(-1)?.id)item.packet.samples.push(...packetQueue.shift().packet.samples);await deliver(item.packet,item.win)}}catch(error){for(const client of clients.values())client.frame.executeJavaScript(`window.dispatchEvent(new CustomEvent('inkspace-native-error',{detail:${JSON.stringify(error.message)}}))`).catch(()=>{})}finally{pumping=false}}
const drain=setInterval(()=>{const packets=native.drain();for(const packet of packets)packetQueue.push({packet,win:attachedWindow});if(packetQueue.length)pump()},4);drain.unref();
function reply(res,status,data,type='application/json'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(type==='application/json'?JSON.stringify(data):data)}
const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;
  if(origin){if(!/^vscode-webview:\/\//.test(origin)&&!/^https:\/\/[a-z0-9-]+\.vscode-webview\.net$/i.test(origin)&&origin!=='null'){reply(res,403,{error:'Invalid origin'});return}res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}
  res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Inkspace-Key');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Private-Network','true');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
  if(req.method!=='POST'||req.headers['x-inkspace-key']!==key){reply(res,403,{error:'Unauthorized'});return}
  try{let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>32*1024*1024)throw Error('Request too large');chunks.push(chunk)}const payload=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
    if(req.url==='/status'){reply(res,200,{...native.status(),mainProcess:true,registered:clients.has(payload.client),injectedPackets});return}
    if(req.url==='/register'){if(typeof payload.client!=='string'||!/^[\w-]{16,100}$/.test(payload.client))throw Error('Invalid client');const client=await findClient(payload.client);reply(res,200,{...native.status(),layout:client.layout});return}
    if(req.url==='/raster'||req.url==='/path'){payload.points=new Float64Array(payload.points);const result=req.url==='/raster'?native.raster(payload):native.path(payload);reply(res,200,result,req.url==='/raster'?'application/octet-stream':'application/json');return}
    if(req.url==='/test/fixture'&&test){const client=clients.get(payload.client);if(!client)throw Error('Test frame not registered');client.layout=await measureFrame(client.frame);for(const packet of payload.packets){const rootPacket={...packet,synthetic:true,samples:packet.samples.map(sample=>({...sample,...toRoot(sample,client.layout)}))};injectedPackets++;await deliver(rootPacket,client.win)}reply(res,200,{passed:true,layout:client.layout});return}
    if(req.url==='/test/layout'&&test){const client=clients.get(payload.client);if(!client)throw Error('Test frame not registered');client.layout=await measureFrame(client.frame);reply(res,200,client.layout);return}
    if(req.url==='/test/capture'&&test){const client=clients.get(payload.client);if(!client)throw Error('Test frame not registered');const image=await client.win.webContents.capturePage();reply(res,200,image.toPNG(),'image/png');return}
    reply(res,404,{error:'Unknown operation'});
  }catch(error){reply(res,400,{error:error?.message||String(error)})}
});
const ready=new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',async()=>{try{let peerAlive=false;try{const peer=JSON.parse(fs.readFileSync(config));if(/^http:\/\/127\.0\.0\.1:\d+$/.test(peer.endpoint)&&/^[a-f0-9]{64}$/.test(peer.key)){const response=await fetch(peer.endpoint+'/status',{method:'POST',headers:{'X-Inkspace-Key':peer.key,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(500)});peerAlive=response.ok&&(await response.json()).mainProcess}}catch{}if(!peerAlive){fs.mkdirSync(path.dirname(config),{recursive:true});fs.writeFileSync(config,JSON.stringify({endpoint:'http://127.0.0.1:'+server.address().port,key,test,pid:process.pid,version:1}))}resolve()}catch(error){reject(error)}})});
app.on('will-quit',()=>{clearInterval(rescan);clearInterval(drain);server.close();try{const saved=JSON.parse(fs.readFileSync(config));if(saved.pid===process.pid)fs.unlinkSync(config)}catch{}});
module.exports={ready};
