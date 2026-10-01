const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'artifacts','codium-installer-manifest.json')));
const target=path.join(root,'artifacts',`codium-installed-${manifest.version}`);
function run(exe,args,env=process.env){return new Promise((resolve,reject)=>{const child=spawn(exe,args,{env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`${path.basename(exe)} exited ${code}`)))})}
(async()=>{
  assert(typeof manifest.installer==='string','installer build must finish before verification');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(manifest.installer)).digest('hex'),manifest.sha256,'installer checksum');
  assert(target.startsWith(path.join(root,'artifacts')+path.sep));
  // /TEST exercises real extraction/uninstallation without replacing user shell entries.
  await run(manifest.installer,['/S','/TEST',`/D=${target}`]);
  for(const [file,expected]of Object.entries(manifest.critical))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(target,file))).digest('hex'),expected,file);
  assert(!fs.existsSync(path.join(target,'data')),'portable profile excluded');
  const preserved=path.join(target,'user-note-to-preserve.txt');fs.writeFileSync(preserved,'Uninstaller must preserve unknown user files.');
  await run(process.execPath,[path.join(root,'scripts','test-vscode.cjs')],{...process.env,INKSPACE_CODIUM:path.join(target,'VSCodium.exe'),INKSPACE_TEST_EXTENSION:path.join(target,'resources','app','extensions','nollasalt.inkspace')});
  const runtime=JSON.parse(fs.readFileSync(path.join(root,'artifacts','codium-test','result.json')));assert(runtime.passed);
  // NSIS uninstaller relaunches from a temporary copy; _?= keeps verification synchronous.
  await run(path.join(target,'Uninstall.exe'),['/S',`_?=${target}`]);
  assert.equal(fs.readFileSync(preserved,'utf8'),'Uninstaller must preserve unknown user files.');
  assert(!fs.existsSync(path.join(target,'VSCodium.exe')),'installed runtime removed');
  const report={passed:true,version:manifest.version,installer:manifest.installer,bytes:manifest.bytes,sha256:manifest.sha256,criticalFilesExact:true,profilesExcluded:true,installedRuntime:runtime,uninstallPreservesUnknownFiles:true};
  fs.writeFileSync(path.join(root,'artifacts','codium-installer-verification.json'),JSON.stringify(report,null,2));console.log('Installer extraction, installed native runtime and safe uninstall verified.');
})().catch(error=>{console.error(error);process.exitCode=1});
