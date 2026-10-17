// Electron 44 exposes the asynchronous ClipboardItem API.
async function copyImage(clipboard, ClipboardItem, bytes) {
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
  return true;
}
async function pasteImage(clipboard, nativeImage) {
  const items = await clipboard.read();
  for (const item of items) {
    if (!item.types.includes('image/png')) continue;
    const data = await item.getType('image/png');
    if (data.size > 16 * 1024 * 1024) throw Error('剪贴板图片超过 16 MB');
    const image = nativeImage.createFromBuffer(Buffer.from(await data.arrayBuffer()));
    return image.isEmpty() ? null : image.toDataURL();
  }
  return null;
}
module.exports = { copyImage, pasteImage };
