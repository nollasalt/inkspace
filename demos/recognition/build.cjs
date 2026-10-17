const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'dist/recognition-demo');
function build() {
  fs.mkdirSync(output, { recursive: true });
  const source = path.join(__dirname, 'WindowsText.cs'), exe = path.join(output, 'WindowsText.exe');
  const assembly = path.join(process.env.CommonProgramFiles || 'C:/Program Files/Common Files', 'Microsoft Shared/Ink/Microsoft.Ink.dll');
  if (process.platform === 'win32' && fs.existsSync(assembly)) {
    const compiler = path.join(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
    try {
      execFileSync(compiler, ['/nologo', '/target:exe', '/platform:x64', '/out:' + exe,
        '/reference:' + assembly, '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll', source], { windowsHide: true, stdio: 'pipe' });
    } catch (error) { throw Error('Windows 识别组件编译失败：' + error.stdout?.toString()); }
    fs.copyFileSync(assembly, path.join(output, 'Microsoft.Ink.dll'));
  }
  esbuild.buildSync({ entryPoints: [path.join(__dirname, 'renderer.js')], bundle: true, format: 'iife',
    outfile: path.join(output, 'renderer.js'), target: 'es2022', legalComments: 'eof' });
  fs.copyFileSync(path.join(__dirname, 'index.html'), path.join(output, 'index.html'));
  fs.copyFileSync(path.join(__dirname, 'style.css'), path.join(output, 'style.css'));
  fs.copyFileSync(path.join(root, 'node_modules/katex/dist/katex.min.css'), path.join(output, 'katex.min.css'));
  fs.cpSync(path.join(root, 'node_modules/katex/dist/fonts'), path.join(output, 'fonts'), { recursive: true });
  return output;
}
if (require.main === module) console.log(build());
module.exports = { build, output };
