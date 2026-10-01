// The canvas shares the desktop origin. Pen packets bypass the Theia backend.
const nativeHost = parent.inkspaceHost;
if (!nativeHost) throw Error('此手写验证页面需要从 Theia 桌面宿主启动');
window.desktop = {
  inkStatus: () => nativeHost.inkStatus(),
  inkRaster: data => nativeHost.inkRaster(data),
  inkPath: data => nativeHost.inkPath(data),
  onPen: callback => nativeHost.onPen(packets => {
    const rect = frameElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = parent.devicePixelRatio || 1;
    const sx = rect.width / innerWidth, sy = rect.height / innerHeight;
    callback(packets.map(packet => ({
      ...packet,
      samples: packet.samples.map(sample => ({
        ...sample,
        x: (sample.x - rect.left * dpr) / sx,
        y: (sample.y - rect.top * dpr) / sy
      }))
    })));
  }),
  save: (data, saveAs) => nativeHost.save(data, saveAs),
  open: () => nativeHost.open(),
  newDocument: () => nativeHost.newDocument(),
  openAccepted: () => nativeHost.openAccepted(),
  recover: () => Promise.resolve(null),
  backup: () => { parent.inkspaceTheiaValidation?.notifyDirty(); return Promise.resolve(true); }
};
