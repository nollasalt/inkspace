const {contextBridge,ipcRenderer}=require('electron');
const nativeCall=(channel,payload)=>{const result=ipcRenderer.sendSync(channel,payload);if(result?.error)throw Error(result.error);return result?.data};
contextBridge.exposeInMainWorld('desktop',{
  inkStatus:()=>ipcRenderer.sendSync('ink-native-status'),
  inkRaster:payload=>nativeCall('ink-native-raster',payload),
  inkPath:payload=>nativeCall('ink-native-path',payload),
  onPen:callback=>{ipcRenderer.on('ink-native-pen',(_event,packets)=>callback(packets))},
  openAccepted:()=>ipcRenderer.invoke('document-open-accepted'),
  newDocument:()=>ipcRenderer.invoke('document-new'),
  save:(data,saveAs=false)=>ipcRenderer.invoke('document-save',data,saveAs),
  open:()=>ipcRenderer.invoke('document-open'),
  recover:()=>ipcRenderer.invoke('recovery-read'),
  backup:data=>ipcRenderer.invoke('recovery-write',data)
});
