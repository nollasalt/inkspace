// Each canvas remains a v1 page; the notebook envelope owns navigation and views.
let notebook={format:'inkspace',version:2,title:'未命名笔记',activePage:null,pages:[]};
const pageSessions=new Map();
const pageValidator=valid;
const imageSource=s=>typeof s==='string'&&/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s);
valid=function(d){
  if(d?.version===2)return d.format==='inkspace'&&typeof d.title==='string'&&Array.isArray(d.pages)&&d.pages.length>0&&d.pages.length<=10000&&new Set(d.pages.map(p=>p.id)).size===d.pages.length&&d.pages.some(p=>p.id===d.activePage)&&d.pages.every(p=>typeof p.id==='string'&&/^[\w-]+$/.test(p.id)&&typeof p.title==='string'&&p.document?.version===1&&valid(p.document)&&(!p.view||[p.view.x,p.view.y,p.view.scale].every(Number.isFinite)&&p.view.scale>0&&Number.isFinite(1/p.view.scale)));
  return pageValidator(d)&&d.notes.every(n=>n.kind===undefined||n.kind==='html'||n.kind==='image'&&imageSource(n.src)&&Number.isFinite(n.aspect)&&n.aspect>0);
};
function rememberPage(){const p=notebook.pages.find(p=>p.id===notebook.activePage);if(p){p.document=doc;p.view={...view};pageSessions.set(p.id,{history,future})}}
function documentData(){rememberPage();return notebook}
function documentJSON(pretty=false){return JSON.stringify(documentData(),null,pretty?2:0)}
function newCanvas(){return{format:'inkspace',version:1,strokes:[],notes:[],shapes:[],pdfs:[],background:{...backgroundSettings()}}}
function adoptDocument(data){
  finishInteraction();clearSelection();pageSessions.clear();
  notebook=data.version===2?data:{format:'inkspace',version:2,title:'未命名笔记',activePage:'page-1',pages:[{id:'page-1',title:'第 1 页',document:data,view:{x:100,y:80,scale:1}}]};
  const p=notebook.pages.find(p=>p.id===notebook.activePage);doc=p.document;view=p.view?{...p.view}:{x:100,y:80,scale:1};history=[];future=[];pasteAnchor=null;render();renderPageList();
}
function switchPage(id){
  if(id===notebook.activePage)return;finishInteraction();rememberPage();clearSelection();
  const p=notebook.pages.find(p=>p.id===id);if(!p)return;notebook.activePage=id;doc=p.document;view=p.view?{...p.view}:{x:100,y:80,scale:1};
  const session=pageSessions.get(id);history=session?.history||[];future=session?.future||[];pasteAnchor=null;render();renderPageList();persist();
}
function renderPageList(){
  const root=$('#page-list');root.replaceChildren();
  notebook.pages.forEach((p,i)=>{const button=document.createElement('button');button.className='page-item'+(p.id===notebook.activePage?' active':'');button.setAttribute('aria-current',p.id===notebook.activePage?'page':'false');button.title='点击切换 · 双击重命名';
    const number=document.createElement('span');number.className='page-number';number.textContent=String(i+1).padStart(2,'0');const label=document.createElement('span');label.textContent=p.title;button.append(number,label);button.onclick=()=>switchPage(p.id);button.ondblclick=()=>renamePage(p.id);root.append(button)});
  $('#document-title').textContent=notebook.title;$('#page-count').textContent=notebook.pages.length+' 页';
}
function askAction(message,choices){return new Promise(resolve=>{const dialog=$('#action-dialog');$('#action-message').textContent=message;const footer=$('#action-choices');footer.replaceChildren();for(const [value,label] of choices){const button=document.createElement('button');button.textContent=label;button.type='button';button.onclick=()=>{dialog.close();resolve(value)};footer.append(button)}dialog.oncancel=()=>resolve('cancel');dialog.showModal()})}
async function renamePage(id){const p=notebook.pages.find(p=>p.id===id);if(!p)return;const dialog=$('#rename-dialog');dialog.returnValue='cancel';$('#page-name').value=p.title;dialog.showModal();$('#page-name').focus();dialog.onclose=()=>{if(dialog.returnValue==='save'){p.title=$('#page-name').value.trim().slice(0,100)||p.title;renderPageList();persist()}}}
$('#page-add').onclick=()=>{finishInteraction();rememberPage();const p={id:crypto.randomUUID(),title:'第 '+(notebook.pages.length+1)+' 页',document:newCanvas(),view:{x:100,y:80,scale:1}};notebook.pages.push(p);switchPage(p.id)};
$('#page-rename').onclick=()=>renamePage(notebook.activePage);
$('#page-delete').onclick=async()=>{if(notebook.pages.length===1){toast('至少保留一个页面');return}const id=notebook.activePage,p=notebook.pages.find(p=>p.id===id);if(await askAction('删除“'+p.title+'”？该页内容将一并删除。',[['cancel','取消'],['delete','删除页面']])!=='delete')return;finishInteraction();rememberPage();const index=notebook.pages.findIndex(p=>p.id===id);notebook.pages.splice(index,1);pageSessions.delete(id);switchPage(notebook.pages[Math.min(index,notebook.pages.length-1)].id)};
let savedDocument='';
function contentSignature(){rememberPage();return JSON.stringify({title:notebook.title,pages:notebook.pages.map(p=>({id:p.id,title:p.title,document:p.document}))})}
async function saveNotebook(saveAs=false){finishInteraction();try{const data=documentJSON(true);if(window.desktop){const file=await desktop.save(data,saveAs);if(!file)return false;notebook.title=file.split(/[\\/]/).at(-1).replace(/\.inkspace\.json$|\.json$/i,'');}else download(data,'application/json',notebook.title+'.inkspace.json');savedDocument=contentSignature();renderPageList();toast('已保存整本笔记');return true}catch(e){toast('保存失败：'+e.message);return false}}
async function allowReplace(){finishInteraction();if(contentSignature()===savedDocument)return true;const action=await askAction('当前笔记有尚未保存到文件的修改。',[['cancel','取消'],['discard','放弃修改'],['save','保存并继续']]);return action==='discard'||action==='save'&&await saveNotebook()}
$('#save').onclick=()=>saveNotebook();$('#save-as').onclick=()=>saveNotebook(true);
$('#new').onclick=async()=>{if(!await allowReplace())return;adoptDocument(newCanvas());if(window.desktop)await desktop.newDocument();savedDocument=contentSignature();persist()};
async function openNotebook(){if(!await allowReplace())return;if(!window.desktop){$('#file').click();return}try{const result=await desktop.open();if(!result)return;const incoming=JSON.parse(result.data);if(!valid(incoming))throw Error('文件格式无效');adoptDocument(incoming);notebook.title=result.file.split(/[\\/]/).at(-1).replace(/\.inkspace\.json$|\.json$/i,'');await desktop.openAccepted();savedDocument=contentSignature();renderPageList();persist();toast('已打开整本笔记')}catch(e){toast('打开失败：'+e.message)}}
$('#load').onclick=openNotebook;
$('#file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>150*1024*1024)throw Error('文件过大');const data=JSON.parse(await f.text());if(!valid(data))throw Error('格式无效');adoptDocument(data);notebook.title=f.name.replace(/\.inkspace\.json$|\.json$/i,'');savedDocument=contentSignature();renderPageList();persist()}catch(e){toast('打开失败：'+e.message)}finally{e.target.value=''}};
flushPersist=function(){if(active){persist();return}const data=documentJSON();if(window.desktop)desktop.backup(data).catch(()=>toast('自动恢复保存失败，请手动保存'));else try{localStorage.setItem('inkspace.document',data)}catch{toast('自动恢复保存失败，请手动保存')}};
let pasteAnchor=null;
viewport.addEventListener('pointermove',e=>{if(e.pointerType!=='touch')pasteAnchor=local(e)});
const selectionClipboardHeader='INKSPACE_SELECTION_V1\n';
function selectionClipboardText(){
  finishInteraction();const diagram=window.inkspaceDiagram?.copy(),origin=union([selectionBounds(),diagram?.bounds].filter(Boolean));if(!origin)return '';
  const fragment={format:'inkspace',version:1,background:{...backgroundSettings()},strokes:[],notes:[],shapes:[],pdfs:[]};
  for(const {kind,value}of selectionScaleSnapshot())if(kind!=='diagram')fragment[kind].push(value);
  const refs=new Set((window.inkspaceBlocks?.references()||[]).map(r=>r.kind+':'+r.id));fragment.groups=(doc.groups||[]).filter(g=>g.members.every(r=>refs.has(r.kind+':'+r.id))).map(g=>({...g,members:g.members.map(r=>r.kind==='diagram'?{...r,id:diagram.ids[r.id]}:{...r})}));
  if(diagram)fragment.diagram=diagram.xml;
  return selectionClipboardHeader+JSON.stringify({origin:{x:origin.x,y:origin.y},document:fragment});
}
function pasteSelectionText(text){
  const header=typeof text==='string'&&text.match(/^INKSPACE_SELECTION_V1\r?\n/);if(!header)return false;
  if(text.length>150*1024*1024)throw Error('选中内容超过 150 MB');
  const data=JSON.parse(text.slice(header[0].length));
  if(![data.origin?.x,data.origin?.y].every(Number.isFinite)||!valid(data.document))throw Error('剪贴板中的笔记内容无效');
  if(!['strokes','notes','shapes','pdfs'].some(kind=>data.document[kind]?.length)&&!data.document.diagram)return true;
  finishInteraction();const point=world(pasteAnchor?.x??viewport.clientWidth/2,pasteAnchor?.y??viewport.clientHeight/2),dx=point.x-data.origin.x,dy=point.y-data.origin.y;
  const translate=p=>({...p,x:p.x+dx,y:p.y+dy});
  const fragment=data.document,idMaps={strokes:{},notes:{},shapes:{},pdfs:{},diagram:{}};for(const kind of ['strokes','notes','shapes','pdfs'])for(const item of fragment[kind]||[]){const old=item.id;if(old||kind==='notes'||kind==='pdfs'){item.id=crypto.randomUUID();if(old)idMaps[kind][old]=item.id}}
  fragment.strokes=fragment.strokes.map(s=>({...s,points:s.points.map(translate)}));
  fragment.shapes=fragment.shapes.map(s=>({...translate(s),x2:s.x2+dx,y2:s.y2+dy}));
  fragment.notes=fragment.notes.map(translate);fragment.pdfs=(fragment.pdfs||[]).map(a=>({...a,pages:a.pages.map(translate)}));
  checkpoint();clearSelection();
  for(const kind of ['strokes','notes','shapes','pdfs']){doc[kind]??=[];const start=doc[kind].length;doc[kind].push(...fragment[kind]);selected[kind]=fragment[kind].map((_,i)=>start+i)}
  if(fragment.diagram)idMaps.diagram=window.inkspaceDiagram?.paste(fragment.diagram,dx,dy,idMaps.notes,idMaps)||{};doc.groups=(doc.groups||[]).concat((fragment.groups||[]).map(g=>({id:crypto.randomUUID(),members:g.members.flatMap(r=>idMaps[r.kind]?.[r.id]?[{kind:r.kind,id:idMaps[r.kind][r.id]}]:[])})).filter(g=>g.members.length>1));
  render();persist();return true;
}
document.addEventListener('copy',event=>{
  if(event.target.closest?.('input,textarea,[contenteditable="true"]')||document.querySelector('dialog[open]')||tool==='pdftext'||window.getSelection?.().toString())return;
  const text=selectionClipboardText();if(!text||!event.clipboardData)return;
  event.preventDefault();event.clipboardData.setData('text/plain',text);
});
async function pasteItems(items,text){
  finishInteraction();const pageId=notebook.activePage,point=world(pasteAnchor?.x??viewport.clientWidth/2,pasteAnchor?.y??viewport.clientHeight/2);const inserted=[];
  for(const file of items){if(!file.type.startsWith('image/'))continue;if(file.size>30*1024*1024){toast('图片超过 30 MB');continue}const src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});if(!imageSource(src)){toast('支持 PNG、JPEG、WebP 和 GIF 图片');continue}const image=new Image();image.src=src;await image.decode();const width=Math.max(160,Math.min(image.naturalWidth,640));inserted.push({id:crypto.randomUUID(),kind:'image',markdown:'',src,aspect:image.naturalWidth/image.naturalHeight,x:point.x+inserted.length*24,y:point.y+inserted.length*24,width})}
  if(!inserted.length&&text)inserted.push({id:crypto.randomUUID(),x:point.x,y:point.y,width:560,markdown:text});
  if(pageId!==notebook.activePage){toast('粘贴期间切换了页面，请重新粘贴');return}if(!inserted.length)return;checkpoint();doc.notes.push(...inserted);clearSelection();selected.notes=inserted.map(n=>doc.notes.indexOf(n));render();persist();toast('已粘贴，可拖动顶部移动，拖动右下角调整大小');
}
document.addEventListener('paste',e=>{if(e.target.closest('input,textarea,[contenteditable="true"]')||document.querySelector('dialog[open]'))return;const files=[...(e.clipboardData?.items||[])].filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter(Boolean),text=e.clipboardData?.getData('text/plain');if(!files.length&&!text)return;e.preventDefault();try{if(pasteSelectionText(text))return;pasteItems(files,text).catch(()=>toast('粘贴失败，请重试'))}catch(error){toast('粘贴失败：'+error.message)}});
// The cursor lives outside the transformed scene, so its size follows zoom once.
const penCursor=$('#pen-cursor');let penPosition=null,lastPenCursorTime=-Infinity;
function clearPenCursor(){penPosition=null;viewport.classList.remove('pen-input');penCursor.hidden=true}
function updatePenCursor(e,rect){
  if(e.pointerType==='mouse'){
    // Lifting a Windows pen can emit compatibility mouse/hover transitions.
    // A mouse click is intentional; passive transitions immediately after pen
    // input must not replace the pen cursor before the next hover sample.
    if(nativeContact||e.sourceCapabilities?.firesTouchEvents)return;
    if(penPosition&&e.type!=='pointerdown'&&(e.type==='pointerover'||e.type==='pointerup'||performance.now()-lastPenCursorTime<150))return;
    clearPenCursor();return;
  }
  if(e.pointerType!=='pen')return;
  lastPenCursorTime=performance.now();const bounds=rect||(active?.type==='pen'?active.rect:null);penPosition=bounds?{x:e.clientX-bounds.left,y:e.clientY-bounds.top}:local(e);viewport.classList.add('pen-input');refreshPenCursor();
}
function refreshPenCursor(){if(!penPosition)return;const diameter=Number($('#width').value)*view.scale;penCursor.style.width=penCursor.style.height=diameter+'px';penCursor.style.left=penPosition.x+'px';penCursor.style.top=penPosition.y+'px';penCursor.style.backgroundColor=$('#color').value;penCursor.hidden=false}
for(const type of ['pointerover','pointermove','pointerrawupdate','pointerdown','pointerup'])viewport.addEventListener(type,updatePenCursor,{capture:true});
viewport.addEventListener('pointerleave',e=>{if(penPosition&&e.pointerType!=='pen')return;const p=local(e);if(p.x>=0&&p.y>=0&&p.x<viewport.clientWidth&&p.y<viewport.clientHeight)return;clearPenCursor()});window.addEventListener('blur',clearPenCursor);
$('#width').addEventListener('change',refreshPenCursor);$('#color').addEventListener('input',refreshPenCursor);
function refreshToolOptions(){syncInputMode();refreshPenCursor();$('#diagram-sidebar').hidden=false;$('#diagram-options').hidden=false;$('#shape-options').hidden=tool!=='shape';$('#pen-options').hidden=!['pen','shape','erase'].includes(tool);$('#pdf-options').hidden=tool!=='pdftext';viewport.style.cursor='default'}
function setDiagramSidebarCollapsed(collapsed,remember=true){
  finishInteraction();document.body.classList.toggle('diagram-sidebar-hidden',collapsed);
  const button=$('#diagram-sidebar-toggle'),label=(collapsed?'展开':'收起')+'画布侧栏';
  button.setAttribute('aria-expanded',String(!collapsed));button.setAttribute('aria-label',label);button.title=label;
  if(remember){try{localStorage.setItem('inkspace.diagramSidebarCollapsed',String(collapsed))}catch{}window.dispatchEvent(new CustomEvent('inkspace-sidebar-change',{detail:{collapsed}}))}
  resize();
}
$('#diagram-sidebar-toggle').onclick=()=>setDiagramSidebarCollapsed(!document.body.classList.contains('diagram-sidebar-hidden'));
try{if(localStorage.getItem('inkspace.diagramSidebarCollapsed')==='true')setDiagramSidebarCollapsed(true,false)}catch{}
const originalRender=render;render=function(){originalRender();refreshToolOptions()};
document.querySelectorAll('.menu').forEach(menu=>menu.addEventListener('toggle',()=>{if(menu.open)document.querySelectorAll('.menu').forEach(other=>{if(other!==menu)other.open=false})}));
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.menu'))document.querySelectorAll('.menu').forEach(m=>m.open=false)});
document.querySelectorAll('.menu button').forEach(button=>button.addEventListener('click',()=>button.closest('.menu').open=false));
$('#sidebar-toggle').onclick=()=>{document.body.classList.toggle('sidebar-hidden');$('#sidebar-toggle').setAttribute('aria-expanded',String(!document.body.classList.contains('sidebar-hidden')));resize()};
window.addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey))return;const key=e.key.toLowerCase();if(['s','o','n'].includes(key)&&!document.querySelector('dialog[open]')){e.preventDefault();if(key==='s')saveNotebook(e.shiftKey);if(key==='o')openNotebook();if(key==='n')$('#new').click()}});
let lastCanvasPointer='mouse';
viewport.addEventListener('pointerdown',e=>{lastCanvasPointer=e.pointerType},{capture:true});
viewport.addEventListener('dblclick',e=>{if(!objectControls(e)||e.button!==0||lastCanvasPointer!=='mouse'||e.pointerType==='pen'||e.sourceCapabilities?.firesTouchEvents||e.target.closest('.note,.zoom,.pdf-page,#diagram-layer')||document.querySelector('dialog[open]'))return;finishInteraction();clearSelection();const p=local(e),position=world(p.x,p.y);edit({id:crypto.randomUUID(),...position,width:560,markdown:''})});
// app.js already recovered legacy browser files; now accept the notebook envelope.
let initial=doc;try{const stored=JSON.parse(localStorage.getItem('inkspace.document'));if(valid(stored))initial=stored}catch{}
adoptDocument(initial);savedDocument=contentSignature();
let workspaceRecoveryReady=Promise.resolve();if(window.desktop)workspaceRecoveryReady=desktop.recover().then(data=>{if(!data)return;try{const restored=JSON.parse(data);if(valid(restored)){adoptDocument(restored);savedDocument='';toast('已恢复上次笔记；保存可写入文件')}}catch{toast('恢复文件无法读取')}});
