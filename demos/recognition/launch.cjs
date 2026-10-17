const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { build } = require('./build.cjs');
build();
const root = path.resolve(__dirname, '../..'), data = path.join(root, 'artifacts/recognition-demo');
fs.mkdirSync(data, { recursive: true });
const log = fs.openSync(path.join(data, 'demo.log'), 'a'), env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// This process owns an interactive GUI. Hiding its startup window also hides
// the first BrowserWindow on Windows; only recognition helpers should be hidden.
const child = spawn(require('electron'), [path.join(__dirname, 'main.cjs')], { cwd: root, env, windowsHide: false,
  detached: true, stdio: ['ignore', log, log] });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.unref(); fs.closeSync(log);
console.log('已请求打开手写识别 Demo。界面位于独立窗口，启动详情见 artifacts/recognition-demo/demo.log。');
