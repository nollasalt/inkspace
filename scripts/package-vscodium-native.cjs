// Package runtime and the explicitly selected extension, excluding all profiles.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const version=require('../vscode/package.json').version;
const root=path.resolve(__dirname,'..'),host=path.join(root,'dist','Inkspace-VSCodium-Native'),files=[];
function visit(file){if(fs.statSync(file).isDirectory()){for(const name of fs.readdirSync(file))visit(path.join(file,name))}else files.push(file)}
for(const name of fs.readdirSync(host))if(name!=='data')visit(path.join(host,name));
const extension=path.join(host,'data','extensions','nollasalt.inkspace-'+version);
if(!fs.existsSync(path.join(extension,'package.json')))throw Error('Install the current extension before packaging');
visit(extension);
const list=path.join(root,'artifacts','native-package-files.json');fs.writeFileSync(list,JSON.stringify(files));
const output=path.join(root,'dist','Inkspace-VSCodium-Native-'+version+'-Windows.zip');
const script="import json,zipfile,sys,os; z=zipfile.ZipFile(sys.argv[2],'w',compression=zipfile.ZIP_DEFLATED,compresslevel=1); [z.write(p,os.path.relpath(p,sys.argv[3])) for p in json.load(open(sys.argv[1],encoding='utf-8'))]; z.close()";
const result=spawnSync('python',['-c',script,list,output,path.dirname(host)],{encoding:'utf8',windowsHide:true});
if(result.status!==0)throw Error(result.stderr);console.log(output);
