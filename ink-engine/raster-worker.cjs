const native=require('../desktop/native/ink-native.node');
process.on('message',({id,operation,payload})=>{try{payload.points=new Float64Array(payload.points);const result=operation==='raster'?native.raster(payload):native.path(payload);process.send({id,data:operation==='raster'?Buffer.from(result):result});}catch(error){process.send({id,error:error.message});}});

process.send({ready:true,status:native.status()});
