// Independent process: Cairo work cannot block the HWND input message loop.
const native=require('./ink-native.node');
process.parentPort.on('message',event=>{
  const {id,operation,payload}=event.data;
  try{payload.points=new Float64Array(payload.points);process.parentPort.postMessage({id,data:operation==='raster'?native.raster(payload):native.path(payload)})}
  catch(error){process.parentPort.postMessage({id,error:error.message})}
});
