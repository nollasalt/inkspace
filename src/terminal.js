import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
const panel=document.createElement('section');panel.id='terminal-panel';panel.hidden=true;panel.innerHTML='<div id="terminal-divider" role="separator" aria-label="调整终端高度" tabindex="0"></div><div class="terminal-toolbar"><strong>终端</strong><span id="terminal-title">PowerShell</span><button id="terminal-new" title="重新启动终端">＋</button><button id="terminal-clear" title="清屏">清屏</button><button id="terminal-stop" title="终止终端进程">终止</button><button id="terminal-hide" title="隐藏终端 · Ctrl+Alt+N">×</button></div><div id="terminal-screen"></div>';
$('#editor-shell').insertBefore(panel,$('#file-statusbar'));
const terminal=new Terminal({fontFamily:'Consolas, "Microsoft YaHei", monospace',fontSize:13,lineHeight:1.2,scrollback:5000,cursorBlink:true,theme:{background:'#1e1e1e',foreground:'#cccccc'}}),fit=new FitAddon();terminal.loadAddon(fit);let opened=false;
let running=false,starting=null;
terminal.onData(data=>{if(running)desktop.terminalInput(data)});terminal.onResize(size=>{if(running)desktop.terminalResize(size)});
desktop.onTerminalOutput(data=>terminal.write(data));desktop.onTerminalState(state=>{if(state.error){terminal.writeln('\r\n'+state.error);return}running=false;$('#terminal-title').textContent='PowerShell · 已退出 '+state.exitCode});
async function start(){if(running)return;if(starting)return starting;starting=(async()=>{try{const cwd=openedFolder?.root||(currentFolderFile?currentFolderFile.replace(/[\\/][^\\/]+$/,''):undefined);const state=await desktop.terminalStart({cwd});running=true;$('#terminal-title').textContent='PowerShell · '+state.cwd;fit.fit();desktop.terminalResize({cols:terminal.cols,rows:terminal.rows})}catch(error){terminal.writeln('\r\n终端启动失败：'+error.message)}finally{starting=null}})();return starting}
async function toggle(force){panel.hidden=typeof force==='boolean'?!force:!panel.hidden;resize();if(!panel.hidden){if(!opened){terminal.open($('#terminal-screen'));opened=true}else{const fontSize=terminal.options.fontSize;terminal.options.fontSize=fontSize+1;terminal.options.fontSize=fontSize}fit.fit();await start();terminal.focus()}}
async function restart(){await starting;await desktop.terminalStop();running=false;terminal.reset();await toggle(true)}
$('#terminal-hide').onclick=()=>toggle(false);$('#terminal-new').onclick=restart;$('#terminal-stop').onclick=async()=>{await desktop.terminalStop();running=false;$('#terminal-title').textContent='PowerShell · 已终止'};$('#terminal-clear').onclick=()=>terminal.clear();
new ResizeObserver(()=>{if(!panel.hidden)fit.fit()}).observe($('#terminal-screen'));
let drag=null;const divider=$('#terminal-divider');divider.onpointerdown=e=>{if(e.pointerType==='pen')return;drag={y:e.clientY,height:panel.clientHeight};divider.setPointerCapture(e.pointerId);e.preventDefault()};divider.onpointermove=e=>{if(drag)panel.style.height=Math.max(140,Math.min($('#workspace').clientHeight*.75,drag.height+drag.y-e.clientY))+'px'};divider.onpointerup=()=>{drag=null;resize()};divider.onpointercancel=()=>{drag=null;resize()};divider.onkeydown=e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();panel.style.height=Math.max(140,Math.min($('#workspace').clientHeight*.75,panel.clientHeight+(e.key==='ArrowUp'?20:-20)))+'px';resize()}};
document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.altKey&&e.code==='KeyN'){e.preventDefault();e.stopImmediatePropagation();toggle()}},true);
window.inkspaceTerminal={terminal,toggle,start,restart,isRunning:()=>running};

panel.addEventListener('keydown',event=>event.stopPropagation());
