const {spawnSync}=require('node:child_process'),fs=require('node:fs');
fs.mkdirSync('desktop/native',{recursive:true});
const result=spawnSync('g++',['-std=c++20','-O2','-shared','-static','-static-libgcc','-static-libstdc++','-Inative/include','native/terminal-native.cpp','-o','desktop/native/terminal-native.node'],{encoding:'utf8',windowsHide:true});
if(result.status!==0)throw Error(result.stderr);console.log('Built Windows ConPTY terminal.');
