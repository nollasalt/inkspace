const { spawnSync } = require('node:child_process');
const path = require('node:path');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
for (const [exe, file] of [[process.execPath, 'tests/code-highlighting.cjs'], [process.execPath, 'tests/ai-proposal.cjs'], [require('electron'), 'tests/ai-electron.cjs']]) {
  const result = spawnSync(exe, [file], { cwd: path.resolve(__dirname, '..'), env, stdio: 'inherit', windowsHide: true, timeout: 60000 });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
