const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),binary=require('../vscode/binary-store.cjs');
async function convert(source,target=source.replace(/\.inkspace\.json$/i,'.ink')){
 if(source===target)throw Error('Source and target must differ');const bytes=await fs.readFile(source),model=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));if(model.format!=='inkspace'||model.version!==2||!Array.isArray(model.pages))throw Error('Expected an Inkspace notebook');
 const backup=source+'.backup-original';try{await fs.copyFile(source,backup,require('node:fs').constants.COPYFILE_EXCL)}catch(e){if(e.code!=='EEXIST')throw e;assert((await fs.readFile(backup)).equals(bytes),'Original backup differs; choose another destination before conversion')}
 try{await fs.stat(target);throw Error('Target already exists; refusing to overwrite a notebook')}catch(e){if(e.code!=='ENOENT')throw e}
 const size=await binary.write(target,model),decoded=binary.decode(await fs.readFile(target));assert.deepEqual(decoded.model,model);assert((await fs.readFile(source)).equals(bytes),'Source changed during conversion');assert((await fs.readFile(backup)).equals(bytes));
 const result={source,target,backup,sourceBytes:bytes.length,binaryBytes:size,pages:model.pages.length,strokes:model.pages.reduce((n,p)=>n+p.document.strokes.length,0),points:model.pages.reduce((n,p)=>n+p.document.strokes.reduce((s,q)=>s+q.points.length,0),0),sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),allContentExact:true};return result;
}
if(require.main===module)convert(process.argv[2],process.argv[3]).then(result=>{console.log(JSON.stringify(result));if(process.argv[4])return fs.writeFile(process.argv[4],JSON.stringify(result,null,2))}).catch(e=>{console.error(e);process.exitCode=1});
module.exports={convert};
