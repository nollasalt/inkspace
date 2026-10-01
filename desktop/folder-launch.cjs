const path=require('node:path');
function folderArgument(argv){const inline=argv.find(value=>value.startsWith('--open-folder='));const index=argv.indexOf('--open-folder');const value=inline?inline.slice('--open-folder='.length):index<0?null:argv[index+1];return typeof value==='string'&&path.isAbsolute(value)&&!value.includes('\0')?value:null}
module.exports={folderArgument};
