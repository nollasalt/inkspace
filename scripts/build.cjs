const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
fs.mkdirSync('vendor',{recursive:true});
esbuild.buildSync({entryPoints:['src/content.js'],bundle:true,format:'iife',globalName:'InkContent',outfile:'vendor/content.js',minify:true,target:'es2022',legalComments:'eof'});
esbuild.buildSync({entryPoints:['src/pdf-api.js'],bundle:true,format:'iife',globalName:'PdfApi',outfile:'vendor/pdf-api.js',minify:true,target:'es2022',legalComments:'eof'});
fs.copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.mjs','vendor/pdf.worker.mjs');
fs.copyFileSync('node_modules/pdfjs-dist/web/pdf_viewer.css','vendor/pdf_viewer.css');
for(const folder of ['cmaps','standard_fonts','wasm'])fs.cpSync('node_modules/pdfjs-dist/'+folder,'vendor/pdf-'+folder,{recursive:true});
fs.copyFileSync('node_modules/katex/dist/katex.min.css','vendor/katex.min.css');
fs.cpSync('node_modules/katex/dist/fonts','vendor/fonts',{recursive:true});
fs.copyFileSync('node_modules/highlight.js/styles/github.min.css','vendor/highlight.min.css');
for(const name of ['katex','highlight.js','pdfjs-dist','pdf-lib','html-to-image']){
  const base=path.join('node_modules',name),file=fs.readdirSync(base).find(f=>/^license/i.test(f));
  if(file)fs.copyFileSync(path.join(base,file),path.join('vendor',name+'-LICENSE'));
}
console.log('已打包离线公式、代码高亮和压感笔迹渲染依赖。');
