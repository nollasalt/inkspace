const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const noop=()=>{},handlers=new Map(),elements=new Map(),storage=new Map();
const ctx=new Proxy({},{get:()=>noop,set:()=>true});
function element(id){if(elements.has(id))return elements.get(id);const e={id,value:id==='#color'?'#263f43':id==='#width'?'4':id==='#shape-kind'?'rect':'',style:{setProperty:noop},classList:{add:noop,toggle:noop,remove:noop},dataset:{},clientWidth:1000,clientHeight:700,offsetHeight:200,getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:1000,height:700}),addEventListener:(name,fn)=>handlers.set(id+':'+name,fn),setPointerCapture:noop,replaceChildren:noop,append:noop,remove:noop,querySelector:s=>s==='.note-body'?element(id+':body'):null,closest:()=>null,showModal(){this.open=true},close(){this.open=false},focus:noop,click(){this.onclick?.()},matches:()=>false};elements.set(id,e);return e}
const context=vm.createContext({document:{compatMode:'CSS1Compat',querySelector:element,querySelectorAll:()=>[],createElement:()=>element('article')},window:{devicePixelRatio:1,innerHeight:800,dispatchEvent:noop,addEventListener:(name,fn)=>handlers.set('window:'+name,fn)},localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)},crypto:{randomUUID:()=> 'test-note'},setTimeout:()=>0,clearTimeout:noop,URL:{},Blob,console,CustomEvent:class{},Path2D:class{constructor(d){this.d=d}addPath(){}}});
for(const file of ['vendor/interaction.js','block-model.js','vendor/content.js','desktop/ink-renderer.js','renderer.js','app.js','canvas-interaction.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const run=s=>vm.runInContext(s,context),read=s=>JSON.parse(JSON.stringify(run(s)));
function pointer(name,x,y,pointerType='mouse'){if(name==='pointerdown')run('inputTools.use('+JSON.stringify(pointerType)+');inputTools.set(tool)');handlers.get('#viewport:'+name)({pointerId:1,pointerType,pressure:.7,button:0,preventDefault:noop,stopImmediatePropagation:noop,clientX:x,clientY:y,target:element('target')})}
run("doc={format:'inkspace',version:1,strokes:[],notes:[],shapes:[]};view={x:0,y:0,scale:1};history=[];future=[];tool='select'");
pointer('pointerdown',10,10);pointer('pointermove',40,40);pointer('pointerup',40,40);assert.equal(run('doc.strokes.length'),0);run("clearSelection();tool='pen'");pointer('pointerdown',10,10,'pen');pointer('pointermove',40,40,'pen');pointer('pointerup',40,40,'pen');
assert.equal(run('doc.strokes.length'),1);assert.equal(run('doc.strokes[0].points.length'),2);
handlers.get('window:keydown')({key:'z',ctrlKey:true,preventDefault:noop,target:element('target')});assert.equal(run('doc.strokes.length'),0);
handlers.get('window:keydown')({key:'y',ctrlKey:true,preventDefault:noop,target:element('target')});assert.equal(run('doc.strokes.length'),1);
run("tool='shape'");pointer('pointerdown',100,100);pointer('pointermove',200,180);pointer('pointerup',200,180);
assert.equal(run('doc.shapes.length'),1);assert.deepEqual(read('itemBounds("shapes",doc.shapes[0])'),{x:100,y:100,w:100,h:80});
run("doc.notes.push({id:'n1',x:250,y:100,markdown:'# Hello'});tool='select'");
pointer('pointerdown',0,0);pointer('pointermove',600,350);pointer('pointerup',600,350);
assert.deepEqual(read('selected'),{strokes:[0],notes:[0],shapes:[0],pdfs:[],pdfPages:[]});
pointer('pointerdown',50,50);pointer('pointermove',70,80);pointer('pointerup',70,80);
assert.equal(run('doc.strokes[0].points[0].x'),30);assert.equal(run('doc.notes[0].y'),130);assert.equal(run('doc.shapes[0].x'),120);
run('undo()');assert.equal(run('doc.shapes[0].x'),100);run('redo()');assert.equal(run('doc.shapes[0].x'),120);
run('selectBox({x:0,y:0,w:1000,h:1000})');handlers.get('window:keydown')({key:'Delete',preventDefault:noop,target:element('target')});assert.equal(run('doc.shapes.length+doc.strokes.length+doc.notes.length'),0);run('undo()');assert.equal(run('doc.shapes.length'),1);
run('view={x:0,y:0,scale:1};zoom(2,100,100)');assert.deepEqual(read('world(100,100)'),{x:100,y:100});assert.equal(run('view.scale'),2);
assert.equal(run('valid(JSON.parse(JSON.stringify(doc)))'),true);
assert.equal(run('valid({format:"inkspace",version:1,strokes:[],notes:[],shapes:[{kind:"script"}]})'),false);
assert.equal(run('valid({format:"inkspace",version:1,strokes:[],notes:[]})'),true);
assert.match(run('markdown("# 标题\\n\\n**粗体**\\n\\n<script>alert(1)</script>")'),/<h1\b[^>]*>标题<\/h1>/);
assert.ok(!run('markdown("<script>alert(1)</script>")').includes('<script>'));
assert.ok(!run('markdown("[坏链接](javascript:alert)")').includes('href='));
assert.match(run('markdown("`**raw**`")'),/^<p\b[^>]*><code>\*\*raw\*\*<\/code><\/p>$/);
run('flushPersist()');assert.ok(storage.has('inkspace.document'));
console.log('通过：笔迹、图形、混合框选移动、删除、Ctrl+Z / Ctrl+Y、缩放锚点、JSON 校验与 Markdown 安全渲染。');

run("doc={format:'inkspace',version:1,strokes:[{brush:'xournal',color:'#000000',width:2,points:[{x:10,y:20,p:.2},{x:30,y:40,p:.9}]}],shapes:[{kind:'rect',x:40,y:50,x2:80,y2:90,width:3,color:'#000000'}],notes:[{id:'scale-test',x:100,y:110,width:320,markdown:'text'}]};selected={strokes:[0],shapes:[0],notes:[0]};history=[];future=[];checkpoint();scaleSelection(2,{x:0,y:0},selectionScaleSnapshot())");
assert.equal(run('doc.strokes[0].points[1].x'),60);assert.equal(run('doc.strokes[0].points[1].p'),.9);assert.equal(run('doc.strokes[0].width'),4);assert.equal(run('doc.shapes[0].x2'),160);assert.equal(run('doc.notes[0].scale'),undefined);assert.equal(run('doc.notes[0].width'),640);assert.equal(run('itemBounds("notes",doc.notes[0]).w'),640);assert(run('valid(doc)'));run('undo()');assert.equal(run('doc.strokes[0].width'),2);assert.equal(run('doc.notes[0].scale'),undefined);run('redo()');assert.equal(run('doc.notes[0].width'),640);assert.equal(run('JSON.parse(JSON.stringify(doc)).notes[0].width'),640);console.log('Passed mixed selection scaling, pressure preservation, text layout, JSON round-trip and undo/redo.');

// Device profiles retain every supported tool; embedded editors retain ownership.
for(const name of ['pen','erase','pan','select','text','shape','diagram','pdftext']){
 run('inputTools.use("mouse");inputTools.set('+JSON.stringify(name)+');inputTools.use("pen");inputTools.set('+JSON.stringify(name)+');tool='+JSON.stringify(name));
 assert.equal(run('pointerTool({pointerType:"mouse"})'),name);
 assert.equal(run('pointerTool({pointerType:"pen"})'),name);
 assert.equal(run('objectControls({pointerType:"mouse",target:{closest:()=>null}})'),['pan','select','text','diagram'].includes(name));
}
run('doc={format:"inkspace",version:1,strokes:[],notes:[],shapes:[]};view={x:0,y:0,scale:1};tool="pen";history=[];future=[];clearSelection()');
pointer('pointerdown',10,10);pointer('pointermove',40,40);pointer('pointerup',40,40);assert.equal(run('doc.strokes.length'),1);assert.equal(run('doc.strokes[0].hasPressure'),false);
run('tool="select";clearSelection();history=[]');pointer('pointerdown',25,25);pointer('pointerup',25,25);assert.equal(run('selected.strokes[0]'),0);assert.equal(run('history.length'),0,'Selecting creates no drawing undo entry');
const ui={closest:selector=>selector.includes('input')?{}:null};handlers.get('#viewport:pointerdown')({pointerId:2,pointerType:'mouse',button:0,target:ui,preventDefault:noop,stopImmediatePropagation:noop,clientX:10,clientY:10});assert.equal(run('active'),null);assert.equal(run('pointers.size'),0);
console.log('Passed 8-tool mouse/pen policy, mouse drawing without a toggle, click-hit selection, selection without undo entries and embedded UI ownership.');

assert.equal(run('validPdfs([null])'),false);assert.equal(run('validPdfs([{id:"null-page",name:"test",data:"AAAA",pages:[null]}])'),false);
