import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/features/register.all.js';
import 'monaco-editor/languages/definitions/markdown/register.js';
import 'monaco-editor/languages/definitions/javascript/register.js';
import 'monaco-editor/languages/definitions/python/register.js';
window.MonacoEnvironment={getWorker:()=>new Worker(new URL('vendor/editor.worker.js',location.href),{type:'module'})};
const options={editContext:false,language:'markdown',theme:'vs',fontFamily:'Consolas, "Microsoft YaHei", monospace',fontSize:14,lineHeight:22,minimap:{enabled:false},automaticLayout:true,scrollBeyondLastLine:false,wordWrap:'on',tabSize:4,insertSpaces:true,renderLineHighlight:'all',padding:{top:12,bottom:12},bracketPairColorization:{enabled:true},multiCursorModifier:'alt',stickyScroll:{enabled:false}};
function mount(textarea,id){const element=document.createElement('div');element.id=id;element.className='code-editor';textarea.before(element);textarea.classList.add('editor-mirror');return monaco.editor.create(element,{...options,model:null})}
const editor=mount(mdSource,'markdown-code-editor'),dialogEditor=mount($('#source'),'note-code-editor'),models=new Map();let binding=false,boundKey=null;
function syncFromEditor(instance,textarea){if(binding)return;textarea.value=instance.getValue();textarea.dispatchEvent(new Event('input',{bubbles:true}))}
editor.onDidChangeModelContent(()=>syncFromEditor(editor,mdSource));dialogEditor.onDidChangeModelContent(()=>syncFromEditor(dialogEditor,$('#source')));
function bind(){
  const key=activeDocumentTab,tab=documentTabs.find(t=>t.id===key);
  if(boundKey!==key&&boundKey&&models.has(boundKey))models.get(boundKey).view=editor.saveViewState();
  for(const [id,entry]of models)if(!documentTabs.some(t=>t.id===id)){if(editor.getModel()===entry.model)editor.setModel(null);entry.model.dispose();models.delete(id)}
  if(!tab?.md){editor.setModel(null);boundKey=null;return}
  if(boundKey!==key){if(boundKey&&models.has(boundKey))models.get(boundKey).view=editor.saveViewState();let entry=models.get(key);if(!entry){entry={model:monaco.editor.createModel(mdSource.value,/\.txt$/i.test(tab.md.file)?'plaintext':'markdown'),view:null};models.set(key,entry)}binding=true;editor.setModel(entry.model);if(entry.model.getValue()!==mdSource.value)entry.model.setValue(mdSource.value);editor.restoreViewState(entry.view);binding=false;boundKey=key}
  monaco.editor.setModelLanguage(editor.getModel(),/\.txt$/i.test(tab.md.file)?'plaintext':'markdown');editor.layout();updatePosition();
  for(const [id,entry]of models)if(!documentTabs.some(t=>t.id===id)){entry.model.dispose();models.delete(id)}
}
mdSource.addEventListener('input',()=>{if(editor.getModel()&&editor.getValue()!==mdSource.value){binding=true;editor.setValue(mdSource.value);binding=false}});
const tabRender=renderDocumentTabs;renderDocumentTabs=function(){tabRender();bind()};
const position=document.createElement('span');position.id='editor-position';$('#file-statusbar').insertBefore(position,$('#file-status-kind'));
function updatePosition(){const p=editor.getPosition();position.textContent=markdownFile&&p?'行 '+p.lineNumber+'，列 '+p.column:''}
editor.onDidChangeCursorPosition(updatePosition);
const noteModel=monaco.editor.createModel('','markdown');dialogEditor.setModel(noteModel);
new MutationObserver(()=>{if($('#editor').open){binding=true;dialogEditor.setValue($('#source').value);binding=false;requestAnimationFrame(()=>{dialogEditor.layout();dialogEditor.focus()})}}).observe($('#editor'),{attributes:true,attributeFilter:['open']});
$('#source').addEventListener('input',()=>{if(dialogEditor.getValue()!==$('#source').value){binding=true;dialogEditor.setValue($('#source').value);binding=false}});
window.inkspaceTextEditor={editor,dialogEditor,monaco,bind};bind();
