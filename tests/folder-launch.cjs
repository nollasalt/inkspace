const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {folderArgument}=require('../desktop/folder-launch.cjs');
assert.equal(folderArgument(['--open-folder','C:\\笔记 folder']), 'C:\\笔记 folder');
assert.equal(folderArgument(['--open-folder=C:\\笔记 folder']), 'C:\\笔记 folder');
for(const argv of [[],['--open-folder'],['--open-folder','relative'],['--open-folder','C:\\bad\0path']])assert.equal(folderArgument(argv),null);
const fixture=path.resolve('artifacts','右键 打开测试');fs.mkdirSync(fixture,{recursive:true});fs.writeFileSync(path.join(fixture,'阅读.md'),'# 文件夹启动');
const second=path.resolve('artifacts','右键 第二个目录');fs.mkdirSync(second,{recursive:true});fs.writeFileSync(path.join(second,'第二份.md'),'# 切换');
const result=spawnSync(require('electron'),['.','--test-folder-launch','--open-folder',fixture],{stdio:'inherit',windowsHide:true,timeout:40000});if(result.status!==0)throw Error('Folder launch test failed: '+result.status);
