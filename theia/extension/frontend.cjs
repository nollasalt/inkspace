const {ContainerModule}=require('@theia/core/shared/inversify');
const {BaseWidget}=require('@theia/core/lib/browser/widgets/widget');
const {ApplicationShell}=require('@theia/core/lib/browser/shell/application-shell');
const {FrontendApplicationContribution}=require('@theia/core/lib/browser/frontend-application-contribution');
const {CommandContribution,CommandRegistry}=require('@theia/core/lib/common/command');
const {MenuContribution}=require('@theia/core/lib/common/menu');
const {KeybindingContribution}=require('@theia/core/lib/browser/keybinding');
const {CommonMenus}=require('@theia/core/lib/browser/common-menus');
const {OpenHandler}=require('@theia/core/lib/browser/opener-service');
const URI=require('@theia/core/lib/common/uri').default;
const {EditorManager}=require('@theia/editor/lib/browser/editor-manager');
const {OpenerService,open:openUri}=require('@theia/core/lib/browser/opener-service');
const {FileService}=require('@theia/filesystem/lib/browser/file-service');
const {FileNavigatorContribution}=require('@theia/navigator/lib/browser/navigator-contribution');
const {PreviewContribution}=require('@theia/preview/lib/browser/preview-contribution');
const {TerminalService}=require('@theia/terminal/lib/browser/base/terminal-service');
const {Emitter}=require('@theia/core/lib/common/event');
const {WindowService}=require('@theia/core/lib/browser/window/window-service');
const {StopReason}=require('@theia/core/lib/common/frontend-application-state');
const {PreviewLinkNormalizer}=require('@theia/preview/lib/browser/preview-link-normalizer');
const {MiniBrowserEnvironment}=require('@theia/mini-browser/lib/browser/environment/mini-browser-environment');
class InkspaceWidget extends BaseWidget {
 constructor(){super();this.id='inkspace-native-canvas';this.title.label='Inkspace · 手写验证';this.title.caption='Windows 原生笔输入 / Xournal++ / Cairo';this.title.closable=false;this.node.style.height='100%';this.frame=document.createElement('iframe');this.frame.id='inkspace-canvas-frame';this.frame.style.cssText='display:block;width:100%;height:100%;border:0';this.frame.src='/inkspace/index.html';this.node.append(this.frame);this.ready=new Promise(resolve=>this.frame.addEventListener('load',()=>resolve(),{once:true}));this.dirtyEvents=new Emitter();this.contentEvents=new Emitter();this.toDispose.push(this.dirtyEvents,this.contentEvents);this.saveable={dirty:false,autosaveable:false,onDirtyChanged:this.dirtyEvents.event,onContentChanged:this.contentEvents.event,save:async()=>{await this.ready;await this.frame.contentWindow.inkspaceValidation.save();this.changed()}}}
 changed(){const dirty=this.frame.contentWindow.inkspaceValidation?.dirty()??false;if(dirty!==this.saveable.dirty){this.saveable.dirty=dirty;this.dirtyEvents.fire()}this.contentEvents.fire()}
 onActivateRequest(message){super.onActivateRequest(message);this.frame.focus()}
}
class InkspaceContribution {
 initialize(){require('./languages.cjs')()}
 constructor(shell,files,container){this.container=container;this.shell=shell;this.files=files;this.widget=null;this.id='inkspace-note-opener';this.label='Inkspace 原生手写'}
 async open(uri){if(!this.widget){this.widget=new InkspaceWidget();await this.shell.addWidget(this.widget,{area:'main'})}await this.shell.revealWidget(this.widget.id);this.shell.activateWidget(this.widget.id);await this.widget.ready;if(uri){const content=await this.files.read(uri);await this.widget.frame.contentWindow.inkspaceValidation.load(content.value,uri.toString())}return this.widget}
 canHandle(uri){return uri.path.toString().toLowerCase().endsWith('.inkspace.json')?1000:0}
 registerCommands(registry){registry.registerCommand({id:'inkspace.open',label:'Inkspace：打开手写验证页面'}, {execute:()=>this.open()});registry.registerCommand({id:'inkspace.new',label:'新建 Inkspace 手写笔记'},{execute:async()=>{const widget=await this.open();return widget.frame.contentWindow.inkspaceValidation.new()}})}
 registerMenus(registry){registry.registerMenuAction(CommonMenus.VIEW_VIEWS,{commandId:'inkspace.open',label:'Inkspace 手写验证'});registry.registerMenuAction(CommonMenus.FILE_NEW,{commandId:'inkspace.new',label:'新建手写笔记'})}
 registerKeybindings(registry){registry.registerKeybinding({command:'inkspace.open',keybinding:'ctrl+alt+i'});registry.registerKeybinding({command:'terminal:new',keybinding:'ctrl+alt+n'})}
 async onDidInitializeLayout(){await this.container.get(FileNavigatorContribution).openView({reveal:true})}
 async requestClose(){if(this.widget){await this.widget.ready;if(!await this.widget.frame.contentWindow.allowReplace())return false;this.widget.saveable.dirty=false;this.widget.dirtyEvents.fire()}const safe=await this.container.get(WindowService).isSafeToShutDown(StopReason.Close);if(!safe)this.widget?.changed();return safe}
 onStart(){window.inkspaceTheiaValidation={requestClose:()=>this.requestClose(),uri:value=>new URI(value),notifyDirty:()=>this.widget?.changed(),open:uri=>this.open(uri),shell:this.shell,files:this.files,commands:this.container.get(CommandRegistry),terminals:this.container.get(TerminalService),editors:this.container.get(EditorManager),preview:uri=>this.container.get(PreviewContribution).open(new URI(uri)),openText:uri=>this.container.get(EditorManager).open(new URI(uri)),openFile:uri=>openUri(this.container.get(OpenerService),new URI(uri))};this.open().catch(error=>console.error(error))}
}
module.exports.default=new ContainerModule((bind,unbind,isBound,rebind)=>{(isBound(PreviewLinkNormalizer)?rebind:bind)(PreviewLinkNormalizer).toDynamicValue(context=>new (require('./preview-links.cjs'))(context.container.get(MiniBrowserEnvironment))).inSingletonScope();bind(InkspaceContribution).toDynamicValue(context=>new InkspaceContribution(context.container.get(ApplicationShell),context.container.get(FileService),context.container)).inSingletonScope();for(const token of [FrontendApplicationContribution,CommandContribution,MenuContribution,KeybindingContribution,OpenHandler])bind(token).toService(InkspaceContribution)});
