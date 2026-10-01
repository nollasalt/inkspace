// Corresponding source for the GPL-derived native ink distribution. Explicit
// paths exclude user documents, recovery files, backups and build caches.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const version=require('../package.json').version;
const roots=['.gitignore','.gitattributes','REQUIREMENTS.md','ROADMAP.md','examples','app.js','renderer.js','pdf.js','index.html','style.css','package.json','package-lock.json','README.md','RESEARCH.md','VALIDATION.md','LICENSE','src','scripts','tests','desktop','native/ink-native.cpp','native/xournal-contour.h','native/napi-dynamic.h','native/include','native/UPSTREAM.md','native/deps/cairo-1.18.4.tar.xz','native/deps/pixman-0.43.4.tar.gz'];
const files=[];
function visit(file){if(fs.statSync(file).isDirectory()){for(const name of fs.readdirSync(file))visit(path.join(file,name))}else if(!file.endsWith('.node'))files.push(file)}
roots.forEach(visit);fs.mkdirSync('artifacts',{recursive:true});const list='artifacts/source-file-list.json';fs.writeFileSync(list,JSON.stringify(files));
const output=`dist/Inkspace-${version}-Source.zip`;
const script="import json,zipfile,sys; z=zipfile.ZipFile(sys.argv[2],'w',compression=zipfile.ZIP_DEFLATED,compresslevel=1); [z.write(p,p) for p in json.load(open(sys.argv[1],encoding='utf-8'))]; z.close()";
const r=spawnSync('python',['-c',script,list,output],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr);console.log(output);

