import {getDocument as loadDocument} from 'pdfjs-dist/build/pdf.mjs';
export {GlobalWorkerOptions,TextLayer,PDFWorker} from 'pdfjs-dist/build/pdf.mjs';
export {PDFDocument,rgb,degrees} from 'pdf-lib';
export {toPng} from 'html-to-image';

// The host owns the shared worker. Disposing one PDF must only release its
// transport, not destroy the worker serving other pages or rapid undo/reopen.
let sharedWorker=null;
export function setSharedWorker(worker){sharedWorker=worker}
export function getDocument(source={}){
  if(!sharedWorker)return loadDocument(source);
  const options=typeof source==='string'||source instanceof URL?{url:source}:
    source instanceof ArrayBuffer||ArrayBuffer.isView(source)?{data:source}:source;
  return loadDocument({...options,worker:options.worker||sharedWorker});
}
