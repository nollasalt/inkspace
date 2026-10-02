const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=process.env.INKSPACE_PROBE_OUTPUT||path.join(root,'dist','RawInputProbe');fs.mkdirSync(out,{recursive:true});
execFileSync('g++',['-std=c++20','-O2','-static','-municode','-mwindows',path.join(root,'native','raw-input-probe.cpp'),'-luser32','-lhid','-lgdi32','-lshell32','-o',path.join(out,'RawInputProbe.exe')],{stdio:'inherit',windowsHide:true});
console.log(path.join(out,'RawInputProbe.exe'));
