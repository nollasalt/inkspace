const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
fs.mkdirSync('vendor',{recursive:true});
esbuild.buildSync({entryPoints:['src/interaction/index.ts'],bundle:true,format:'iife',globalName:'InkInteraction',outfile:'vendor/interaction.js',target:'es2022',legalComments:'eof'});
esbuild.buildSync({entryPoints:['src/diagram.js'],bundle:true,format:'iife',outfile:'vendor/diagram.js',minify:true,keepNames:true,target:'es2022',legalComments:'eof'});
esbuild.buildSync({entryPoints:['src/ai/canvas.js'],bundle:true,format:'iife',outfile:'vendor/ai.js',target:'es2022',legalComments:'eof'});
esbuild.buildSync({entryPoints:['vscode/ai-host.cjs'],bundle:true,platform:'node',format:'cjs',outfile:'vscode/ai-runtime.cjs',target:'node22',legalComments:'eof'});
fs.mkdirSync('vscode/ai',{recursive:true});
fs.copyFileSync('ai/instructions.txt','vscode/ai/instructions.txt');
fs.copyFileSync('node_modules/mxgraph/LICENSE','vendor/mxgraph-LICENSE');
fs.cpSync('node_modules/mxgraph/javascript/src/images','vendor/mxgraph/images',{recursive:true});
esbuild.buildSync({entryPoints:['src/file-move.js'],bundle:true,platform:'node',format:'cjs',outfile:'vendor/file-move.cjs',minify:true,target:'node22',legalComments:'eof'});
const contentBuild=esbuild.buildSync({entryPoints:['src/content.js'],bundle:true,format:'iife',globalName:'InkContent',outfile:'vendor/content.js',minify:true,target:'es2022',legalComments:'eof',loader:{'.css':'text'},metafile:true});
fs.copyFileSync('src/code.css','vendor/code.css');
// Include notices for every package actually bundled into the content renderer.
const contentPackages=new Set(Object.keys(contentBuild.metafile.inputs).filter(file=>file.startsWith('node_modules/')).map(file=>{const parts=file.slice(13).split('/');return parts[0].startsWith('@')?parts.slice(0,2).join('/'):parts[0]}));
for(const name of contentPackages){const base=path.join('node_modules',name),license=fs.readdirSync(base).find(file=>/^license/i.test(file));if(license)fs.copyFileSync(path.join(base,license),path.join('vendor',name.replaceAll('/','-')+'-LICENSE'));}
esbuild.buildSync({entryPoints:['src/pdf-api.js'],bundle:true,format:'iife',globalName:'PdfApi',outfile:'vendor/pdf-api.js',minify:true,target:'es2022',legalComments:'eof'});
esbuild.buildSync({entryPoints:['src/text-editor.js'],bundle:true,format:'iife',outfile:'vendor/text-editor.js',minify:true,target:'es2022',legalComments:'eof',loader:{'.ttf':'file'},assetNames:'editor-assets/[name]-[hash]'});
esbuild.buildSync({entryPoints:['src/terminal.js'],bundle:true,format:'iife',outfile:'vendor/terminal.js',minify:true,target:'es2022',legalComments:'eof'});
esbuild.buildSync({entryPoints:['node_modules/monaco-editor/esm/vs/editor/editor.worker.js'],bundle:true,format:'esm',outfile:'vendor/editor.worker.js',minify:true,target:'es2022',legalComments:'eof'});
fs.copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.mjs','vendor/pdf.worker.mjs');
fs.copyFileSync('node_modules/pdfjs-dist/web/pdf_viewer.css','vendor/pdf_viewer.css');
for(const folder of ['cmaps','standard_fonts','wasm'])fs.cpSync('node_modules/pdfjs-dist/'+folder,'vendor/pdf-'+folder,{recursive:true});
fs.copyFileSync('node_modules/katex/dist/katex.min.css','vendor/katex.min.css');
fs.cpSync('node_modules/katex/dist/fonts','vendor/fonts',{recursive:true});
fs.copyFileSync('node_modules/highlight.js/styles/github.min.css','vendor/highlight.min.css');
for(const name of ['katex','highlight.js','pdfjs-dist','pdf-lib','html-to-image','monaco-editor','@xterm/xterm','@xterm/addon-fit','markdown-it','markdown-it-task-lists','markdown-it-texmath','dompurify','fs-extra','argparse','entities','linkify-it','mdurl','punycode.js','uc.micro','graceful-fs','jsonfile','universalify']){
  const base=path.join('node_modules',name),file=fs.readdirSync(base).find(f=>/^license/i.test(f));
  if(file)fs.copyFileSync(path.join(base,file),path.join('vendor',name.replaceAll('/','-')+'-LICENSE'));
}
console.log('已打包离线公式、代码高亮和压感笔迹渲染依赖。');
