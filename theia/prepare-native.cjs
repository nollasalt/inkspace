const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const run = (exe, args, cwd = root) => execFileSync(exe, args, { cwd, stdio: 'inherit', windowsHide: true });
if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('This native pen validation build requires Windows x64.');
if (!fs.existsSync(path.join(root, 'desktop', 'native', 'ink-native.node'))) run(process.execPath, [path.join(root, 'scripts', 'build-native.cjs')]);
const keytar = path.join(__dirname, 'node_modules', 'keytar');
if (!fs.existsSync(path.join(keytar, 'build', 'Release', 'keytar.node'))) {
  run(process.execPath, [path.join(__dirname, 'node_modules', 'prebuild-install', 'bin.js'), '--runtime', 'napi'], keytar);
}
const drive = path.join(__dirname, 'node_modules', 'drivelist');
const target = path.join(drive, 'build', 'Release', 'drivelist.node');
if (!fs.existsSync(target)) {
  // Compile the unchanged npm drivelist source with the same MinGW tools as Inkspace.
  const scratch = path.join(root, 'artifacts', 'theia-native');
  fs.mkdirSync(scratch, { recursive: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  run('gendef', [process.execPath], scratch);
  const def = path.join(scratch, path.basename(process.execPath, '.exe') + '.def');
  const lib = path.join(scratch, 'libnode.a');
  run('dlltool', ['-d', def, '-l', lib, '-D', path.basename(process.execPath)]);
  run('g++', ['-std=c++17', '-O2', '-shared', '-static', '-static-libgcc', '-static-libstdc++',
    '-DNAPI_VERSION=8', '-DBUILDING_NODE_EXTENSION', '-DNODE_GYP_MODULE_NAME=drivelist',
    '-I', path.join(root, 'native', 'include'), '-I', path.join(__dirname, 'node_modules', 'node-addon-api'), '-I', drive,
    path.join(drive, 'src', 'drivelist.cpp'), path.join(drive, 'src', 'device-descriptor.cpp'), path.join(drive, 'src', 'windows', 'list.cpp'), lib,
    '-lkernel32', '-lshell32', '-lsetupapi', '-lcfgmgr32', '-lole32', '-luuid', '-o', target]);
}
require(path.join(__dirname, 'node_modules', 'keytar'));
require(path.join(__dirname, 'node_modules', 'node-pty'));
require(path.join(__dirname, 'node_modules', '@parcel', 'watcher'));
require(drive).list().then(drives => console.log(`Theia native dependencies ready (${drives.length} drives).`)).catch(error => { console.error(error); process.exitCode = 1; });
