// Windows build from pinned upstream sources: static Cairo/Pixman,
// stable Node-API. No dependency on a separately installed Xournal++ runtime.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);
const log=path.join(root,'artifacts/native-build.log');fs.mkdirSync(path.dirname(log),{recursive:true});fs.writeFileSync(log,'');
const env={...process.env,CC:'gcc',CXX:'g++',PYTHONPATH:path.join(root,'native/build-tools')};
function run(cmd,args){const r=spawnSync(cmd,args,{cwd:root,env,encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024});fs.appendFileSync(log,`\n${cmd} ${args.join(' ')}\n${r.stdout||''}${r.stderr||''}`);if(r.error||r.status!==0)throw Error(`${cmd} failed: ${r.error||r.stderr?.slice(-2000)||r.status}. See ${log}`)}
const dependencies=[
  ['cairo-1.18.4.tar.xz','445ed8208a6e4823de1226a74ca319d3600e83f6369f99b14265006599c32ccb'],
  ['pixman-0.43.4.tar.gz','a0624db90180c7ddb79fc7a9151093dc37c646d8c38d3f232f767cf64b85a226']
];
(async()=>{
  if(process.platform!=='win32')throw Error('Native pen backend targets Windows x64');
  fs.mkdirSync('native/deps',{recursive:true});
  for(const [name,hash] of dependencies){
    const file=path.join('native/deps',name);
    if(!fs.existsSync(file)){const r=await fetch('https://cairographics.org/releases/'+name);if(!r.ok)throw Error(`Download ${name}: ${r.status}`);fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()))}
    if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==hash)throw Error('Source hash mismatch: '+name);
  }
  if(!fs.existsSync('native/deps/cairo-1.18.4/meson.build'))run('python',['-c',"import tarfile;tarfile.open('native/deps/cairo-1.18.4.tar.xz').extractall('native/deps',filter='data')"]);
  if(!fs.existsSync('native/deps/cairo-1.18.4/subprojects/pixman-0.43.4/meson.build'))run('python',['-c',"import tarfile;tarfile.open('native/deps/pixman-0.43.4.tar.gz').extractall('native/deps/cairo-1.18.4/subprojects',filter='data')"]);
  if(!fs.existsSync('native/build-tools/mesonbuild'))run('python',['-m','pip','install','--target','native/build-tools','meson==1.12.1']);
  if(!fs.existsSync('native/build-cairo/build.ninja'))run('python',['-m','mesonbuild.mesonmain','setup','native/build-cairo','native/deps/cairo-1.18.4','--default-library=static','--buildtype=release',...['tests','fontconfig','freetype','dwrite','png','quartz','tee','xcb','xlib','zlib','lzo','glib','spectre','symbol-lookup','pixman:tests','pixman:demos'].map(k=>`-D${k}=disabled`)]);
  run('ninja',['-C','native/build-cairo','-j','6']);
  fs.mkdirSync('desktop/native',{recursive:true});
  run('g++',['-std=c++20','-O2','-shared','-static','-static-libgcc','-static-libstdc++','-DCAIRO_WIN32_STATIC_BUILD','-Inative/include','-Inative/deps/cairo-1.18.4/src','-Inative/build-cairo/src','native/ink-native.cpp','native/build-cairo/src/libcairo.a','native/build-cairo/subprojects/pixman-0.43.4/pixman/libpixman-1.a','-lgdi32','-lmsimg32','-luser32','-lcomctl32','-ldl','-lole32','-o','desktop/native/ink-native.node']);
  const manifest={cairo:'1.18.4',pixman:'0.43.4',xournalCommit:'9882ffaaf2c012a1de4c33161eb4284468d84b9d',sources:dependencies.map(([file,sha256])=>({file,sha256})),binarySha256:crypto.createHash('sha256').update(fs.readFileSync('desktop/native/ink-native.node')).digest('hex')};
  fs.writeFileSync('desktop/native/build-manifest.json',JSON.stringify(manifest,null,2));
  console.log('Built native Windows pen + Xournal++ contour + Cairo 1.18.4.');
})().catch(error=>{console.error(error);process.exitCode=1});
