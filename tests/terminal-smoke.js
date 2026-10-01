(async()=>{
 const assert=(value,message)=>{if(!value)throw Error(message)},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 document.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,ctrlKey:true,altKey:true,code:'KeyN',key:'n'}));
 for(let i=0;i<100&&!inkspaceTerminal.isRunning();i++)await pause(30);
 assert(inkspaceTerminal.isRunning()&&!$('#terminal-panel').hidden,'Ctrl+Alt+N starts an integrated terminal: hidden='+$('#terminal-panel').hidden+' title='+$('#terminal-title').textContent+' screen='+Array.from({length:inkspaceTerminal.terminal.buffer.active.length},(_,i)=>inkspaceTerminal.terminal.buffer.active.getLine(i)?.translateToString()).join(' '));
 let output='';desktop.onTerminalOutput(data=>{output+=data});
 desktop.terminalInput("Write-Output ('INKSPACE_' + 'PTY_OK'); [Console]::WriteLine('CWD=' + (Get-Location).Path); [Console]::WriteLine([string][char]0x4E2D + [string][char]0x6587)\r");
 for(let i=0;i<150&&(!output.includes('INKSPACE_PTY_OK')||!output.includes('中文'));i++)await pause(30);
 assert(output.includes('INKSPACE_PTY_OK')&&output.includes('中文'),'real shell command and Unicode output: '+JSON.stringify(output));assert(output.includes('CWD='+openedFolder.root),'shell starts in workspace folder');
 await inkspaceTerminal.toggle(false);assert(inkspaceTerminal.isRunning(),'hidden terminal keeps its process');await inkspaceTerminal.toggle(true);assert(inkspaceTerminal.isRunning(),'terminal can reopen');
 desktop.terminalResize({cols:92,rows:20});desktop.terminalInput("Start-Sleep -Seconds 30; Write-Output ('UNEXPECTED_' + 'COMPLETION')\r");await pause(150);desktop.terminalInput('\x03');await pause(150);desktop.terminalInput("Write-Output ('AFTER_' + 'INTERRUPT')\r");
 for(let i=0;i<120&&!output.includes('AFTER_INTERRUPT');i++)await pause(30);
 assert(output.includes('AFTER_INTERRUPT')&&!output.includes('UNEXPECTED_COMPLETION'),'Ctrl+C interrupts running command');
 const firstRow=$('.xterm-rows');assert(Math.abs(parseFloat(firstRow.style.letterSpacing))<1,'terminal character spacing remains monospace');await desktop.terminalStop();await inkspaceTerminal.toggle(false);
 assert(document.querySelector('header .tools')===null&&$('#editor-toolbar .tools'),'canvas tools belong to editor toolbar');assert([...document.querySelectorAll('header summary')].some(item=>item.textContent==='终端'),'terminal menu available');
 return{passed:true,conpty:true,shortcut:true,interactivePowerShell:true,unicode:true,workspaceCwd:true,hidePreservesSession:true,interrupt:true,editorLocalToolbar:true};
})()
