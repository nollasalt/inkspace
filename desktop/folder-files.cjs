const fs=require('node:fs/promises'),path=require('node:path');
const markdown=file=>/\.(md|markdown|txt)$/i.test(file);
const within=(root,target)=>{const relative=path.relative(root,target);return !path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)};
function createFolderBrowser(){
  let root=null;
  async function resolve(relative){const selectedRoot=root;if(!selectedRoot||typeof relative!=='string'||relative.includes('\0'))throw Error('请先打开文件夹');const candidate=path.resolve(selectedRoot,relative);if(!within(selectedRoot,candidate))throw Error('文件不在当前文件夹中');const real=await fs.realpath(candidate);if(!within(selectedRoot,real))throw Error('不支持访问文件夹外的链接');return real}
  async function kind(file){if(markdown(file))return'markdown';if(/\.inkspace\.json$/i.test(file))return'notebook';if(!/\.json$/i.test(file))return null;const handle=await fs.open(file,'r');try{const bytes=Buffer.alloc(4096),{bytesRead}=await handle.read(bytes,0,bytes.length,0);return /"format"\s*:\s*"inkspace"/.test(bytes.toString('utf8',0,bytesRead))?'notebook':null}finally{await handle.close()}}
  return{
    async open(directory){const real=await fs.realpath(directory);if(!(await fs.stat(real)).isDirectory())throw Error('需要一个文件夹');root=real;return{root,name:path.basename(real)||real}},
    state(){return root?{root,name:path.basename(root)||root}:null},
    close(){root=null},
    async list(relative=''){const selectedRoot=root;const directory=await resolve(relative),entries=[];for(const item of await fs.readdir(directory,{withFileTypes:true})){if(item.isSymbolicLink()||['.git','node_modules'].includes(item.name))continue;const child=path.join(directory,item.name),childRelative=path.relative(selectedRoot,child);if(item.isDirectory())entries.push({name:item.name,path:childRelative,kind:'directory'});else if(item.isFile()){try{const type=await kind(child);if(type)entries.push({name:item.name,path:childRelative,kind:type})}catch{}}}entries.sort((a,b)=>(a.kind==='directory'?0:1)-(b.kind==='directory'?0:1)||a.name.localeCompare(b.name,'zh-CN',{numeric:true}));return entries},
    async read(relative){const file=await resolve(relative),type=await kind(file);if(!type)throw Error('仅支持 Inkspace 笔记和 Markdown 文件');const stat=await fs.stat(file);if(!stat.isFile()||stat.size>(type==='markdown'?10:150)*1024*1024)throw Error('文件过大或不可读取');const raw=await fs.readFile(file,'utf8');return{file,kind:type,data:raw.replace(/^\uFEFF/,''),revision:stat.mtimeMs+':'+stat.size,bom:raw.startsWith('\uFEFF'),newline:raw.includes('\r\n')?'\r\n':'\n'}},
    resolve
  };
}
module.exports={createFolderBrowser,markdown,within};
