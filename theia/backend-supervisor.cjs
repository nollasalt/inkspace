// Keep process-tree cleanup out of the Electron UI thread and native HWND hooks.
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, process.argv.slice(2), {
  cwd: __dirname, env: process.env, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit']
});
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  if (child.exitCode !== null) return process.exit(0);
  const cleanup = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
    windowsHide: true, stdio: 'ignore'
  });
  cleanup.on('exit', () => process.exit(0));
  cleanup.on('error', () => { child.kill(); process.exit(1); });
}
process.stdin.on('data', stop);
process.stdin.on('end', stop);
child.on('error', error => { console.error(error); process.exit(1); });
child.on('exit', code => { if (!stopping) process.exit(code ?? 1); });
