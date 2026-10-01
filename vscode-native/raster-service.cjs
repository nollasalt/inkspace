const {app,utilityProcess}=require('electron'),path=require('node:path');
let worker=null,sequence=0;
const pending=new Map();
function ensureWorker(){
  if(worker)return worker;
  worker=utilityProcess.fork(path.join(__dirname,'raster-worker.cjs'),[],{serviceName:'Inkspace Cairo',stdio:'ignore'});
  worker.on('message',message=>{const task=pending.get(message.id);if(!task)return;pending.delete(message.id);clearTimeout(task.timer);message.error?task.reject(Error(message.error)):task.resolve(message.data)});
  worker.on('exit',()=>{worker=null;for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error('Cairo process exited'))}pending.clear()});
  return worker;
}
exports.call=async(operation,payload)=>{
  await app.whenReady();const target=ensureWorker(),id=++sequence;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Cairo process timeout'))},30000);pending.set(id,{resolve,reject,timer});target.postMessage({id,operation,payload})});
};
exports.status=()=>({rasterProcess:worker?.pid||null,rasterPending:pending.size});
app.whenReady().then(ensureWorker);
app.on('will-quit',()=>worker?.kill());
