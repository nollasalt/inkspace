const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'media');fs.mkdirSync(out,{recursive:true});
for(const file of ['app.js','renderer.js','pdf.js','style.css','desktop/workspace.js','desktop/ink-renderer.js','desktop/bridge.js']){const target=path.join(out,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target)}
fs.cpSync(path.join(root,'vendor'),path.join(out,'vendor'),{recursive:true});
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const file of ['desktop/files.js','desktop/workbench.js','vendor/text-editor.js','vendor/terminal.js','desktop/titlebar.js','desktop/explorer.js'])html=html.replace(`<script src="${file}"></script>`,'');for(const file of ['vendor/text-editor.css','vendor/terminal.css'])html=html.replace(`<link rel="stylesheet" href="${file}">`,'');
html=html.replace('<body>','<body><script src="adapter.js"></script>').replace('</body>','<script src="validation.js"></script></body>').replace('<link rel="stylesheet" href="style.css">','<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="validation.css">');fs.writeFileSync(path.join(out,'index.html'),html);
for(const file of ['adapter.js','validation.js','validation.css'])fs.copyFileSync(path.join(__dirname,file),path.join(out,file));
console.log('Prepared native canvas assets without the standalone file workbench.');
