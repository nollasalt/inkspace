// Windows locks loaded native modules. Build in isolation and deploy changed files only.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const staging = path.resolve(__dirname, '../artifacts/theia-build');
fs.mkdirSync(staging, { recursive: true });
for (const file of ['package.json', 'esbuild.mjs']) fs.copyFileSync(path.join(__dirname, file), path.join(staging, file));
for (const folder of ['node_modules', 'extension']) {
  const link = path.join(staging, folder);
  if (!fs.existsSync(link)) fs.symlinkSync(path.join(__dirname, folder), link, 'junction');
}
execFileSync(process.execPath, [path.join(__dirname, 'node_modules/@theia/cli/bin/theia.js'), 'build', '--mode', 'production'], {
  cwd: staging, stdio: 'inherit', windowsHide: true
});
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let copied = 0;
function deploy(source, target) {
  if (fs.statSync(source).isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const name of fs.readdirSync(source)) deploy(path.join(source, name), path.join(target, name));
  } else {
    if (fs.existsSync(target) && fs.statSync(source).size === fs.statSync(target).size && digest(source) === digest(target)) return;
    fs.copyFileSync(source, target);
    copied++;
  }
}
deploy(path.join(staging, 'lib'), path.join(__dirname, 'lib'));
console.log(`Theia build deployed (${copied} changed files). Restart the validation app to load the update.`);
