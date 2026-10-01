const path=require('node:path');
const native=require(path.join(__dirname,'native','ink-native.node'));

module.exports=function installNativeInk(win,ipcMain){
  const allowed=event=>event.sender===win.webContents&&event.senderFrame?.url.startsWith('inkspace://app/');
  for(const [channel,fn] of [['ink-native-raster',native.raster],['ink-native-path',native.path]]){
    ipcMain.on(channel,(event,payload)=>{
      if(!allowed(event)){event.returnValue={error:'Invalid sender'};return}
      try{event.returnValue={data:fn(payload)}}catch(error){event.returnValue={error:error.message}}
    });
  }
  ipcMain.on('ink-native-status',event=>{event.returnValue=allowed(event)?native.status():null});
  const attach=()=>{if(!win.isDestroyed())native.attach(win.getNativeWindowHandle())};
  attach();win.webContents.on('dom-ready',attach);
  const rescan=setInterval(attach,500);
  const drain=setInterval(()=>{const packets=native.drain();if(packets.length&&!win.isDestroyed())win.webContents.send('ink-native-pen',packets)},4);
  win.on('closed',()=>{clearInterval(rescan);clearInterval(drain)});
  return native;
};
