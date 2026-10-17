const fs = require('node:fs'), path = require('node:path');
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { resolveProfile } = require('./models.cjs');
const running = new Map();
function run(exe, args, { input = '', cwd, signal, timeout = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(exe, args, { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    let stdout = '', stderr = '', failure = null;
    const stop = error => {
      if (failure) return;
      failure = error;
      if (child.pid && process.platform === 'win32') {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill());
      } else child.kill();
    };
    running.set(child, stop);
    const abort = () => stop(Error('AI 请求已取消'));
    const timer = setTimeout(() => stop(Error('AI 响应超时，请缩小范围后重试')), timeout);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 4 * 1024 * 1024) stop(Error('AI 输出过大')); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-12000); });
    child.stdin.on('error', () => {}); child.stdin.end(input, 'utf8');
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); running.delete(child); };
    child.on('error', error => { cleanup(); reject(failure || error); });
    child.on('close', code => { cleanup(); failure ? reject(failure) : resolve({ stdout, stderr, code, elapsedMs: performance.now() - started }); });
  });
}
function codexCommand() {
  if (process.env.INKSPACE_CODEX_EXE) {
    if (!fs.existsSync(process.env.INKSPACE_CODEX_EXE)) throw Error('INKSPACE_CODEX_EXE 路径不存在');
    return { exe: process.env.INKSPACE_CODEX_EXE, args: [] };
  }
  const bases = [path.join(process.env.APPDATA || '', 'npm/node_modules/@openai/codex'), path.resolve(__dirname, '../node_modules/@openai/codex')];
  for (const base of bases) {
    if (!fs.existsSync(path.join(base, 'package.json'))) continue;
    if (process.platform === 'win32') {
      const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
      try {
        const nativeBase = path.dirname(require.resolve('@openai/codex-win32-' + arch + '/package.json', { paths: [base] }));
        const triple = arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
        for (const folder of ['bin', 'codex']) {
          const exe = path.join(nativeBase, 'vendor', triple, folder, 'codex.exe');
          if (fs.existsSync(exe)) return { exe, args: [] };
        }
      } catch {}
    }
    return { exe: process.env.INKSPACE_DEMO_NODE || (process.platform === 'win32' ? path.join(process.env.ProgramFiles || 'C:/Program Files', 'nodejs/node.exe') : 'node'), args: [path.join(base, 'bin/codex.js')] };
  }
  return { exe: 'codex', args: [] };
}
function structuredArgs({ jobDirectory, schemaPath, instructionsFile, images = [], profileId = 'fast' }) {
  const profile = resolveProfile(profileId);
  return ['exec', '--model', profile.model, '-c', `model_reasoning_effort="${profile.reasoningEffort}"`,
    '-c', 'model_instructions_file=' + JSON.stringify(instructionsFile), '-c', 'memories.use_memories=false',
    '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
    ...['shell_tool', 'multi_agent', 'apps', 'hooks', 'remote_plugin', 'browser_use', 'computer_use', 'plugins'].flatMap(feature => ['--disable', feature]),
    '-c', 'include_apply_patch_tool=false', '-c', 'web_search="disabled"', '-c', 'approval_policy="never"',
    '--json', '--color', 'never', '--cd', jobDirectory, '--output-schema', schemaPath,
    '--output-last-message', path.join(jobDirectory, 'result.json'), ...images.flatMap(image => ['--image', image]), '-'];
}
async function runStructured(options) {
  const command = codexCommand(), profile = resolveProfile(options.profileId);
  let response;
  try { response = await run(command.exe, [...command.args, ...structuredArgs(options)], { input: options.prompt, cwd: options.jobDirectory, signal: options.signal }); }
  catch (error) { if (error.code === 'ENOENT') throw Error('没有找到 Codex CLI。请先安装 @openai/codex 并运行 codex login，再重试。'); throw error; }
  if (response.code !== 0) throw Error('Codex 请求失败：' + (response.stderr.trim().slice(-1400) || '请检查 Codex 登录状态及网络连接'));
  let result;
  try { result = JSON.parse(fs.readFileSync(path.join(options.jobDirectory, 'result.json'), 'utf8')); } catch { throw Error('Codex 未返回有效的结构化结果'); }
  let usage = null;
  for (const line of response.stdout.split(/\r?\n/)) { try { const event = JSON.parse(line); if (event.type === 'turn.completed') usage = event.usage || null; } catch {} }
  return { provider: 'codex', model: profile.model, reasoningEffort: profile.reasoningEffort, elapsedMs: response.elapsedMs, usage, result };
}
function shutdown() { for (const stop of running.values()) stop(Error('AI 服务已关闭')); }
module.exports = { run, codexCommand, structuredArgs, runStructured, shutdown };
