(async()=>{
  const original=doc,originalToast=toast,messages=[],assert=(value,message)=>{if(!value)throw Error(message)},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  toast=message=>messages.push(message);
  try{
    const pdf=await PdfApi.PDFDocument.create();pdf.addPage([240,200]).drawText('Recovery lifecycle');
    const asset={id:'lifecycle-test',name:'lifecycle.pdf',data:pdfBase64(await pdf.save()),pages:[{x:0,y:0,width:240,height:200}]};
    doc={...newCanvas(),pdfs:[asset]};render();const old=pdfSessions.get(asset.id);
    doc.pdfs=[];render();assert(old.disposed,'removed PDF transport invalidated');
    doc.pdfs=[asset];render();const current=pdfSessions.get(asset.id);assert(current!==old,'new PDF session created');
    for(let i=0;i<100&&!current.pages.get(0)?.scale;i++)await pause(30);
    assert(current.pages.get(0)?.canvas.width>0&&current.pages.get(0)?.scale,'current PDF remains visible');
    assert(!messages.some(message=>message.includes('PDF')&&message.includes('失败')),'destroyed transport does not report a loading failure');
    return{passed:true,staleTransportIgnored:true,currentPageVisible:true};
  }finally{doc=original;toast=originalToast;render()}
})()
