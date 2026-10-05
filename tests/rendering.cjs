const vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {createCanvas,Path2D}=require('@napi-rs/canvas');

function app(raw=false,dpr=1){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{runScripts:'outside-only',url:'https://inkspace.test/'}),w=dom.window;
  const canvases=new Map(),contextRequests=[];let rectReads=0,visibleClears=0;
  Object.defineProperty(w,'devicePixelRatio',{value:dpr});
  if(raw)w.onpointerrawupdate=null;else delete w.onpointerrawupdate;
  assert.equal('onpointerrawupdate' in w,raw);
  const rect={left:0,top:0,width:1200,height:700};
  w.HTMLElement.prototype.getBoundingClientRect=function(){rectReads++;return this.tagName==='HEADER'?{...rect,height:96}:rect};
  Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get:()=>1200});
  Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get:()=>700});
  Object.defineProperty(w.HTMLElement.prototype,'offsetHeight',{get:()=>200});
  w.HTMLElement.prototype.setPointerCapture=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
  w.HTMLDialogElement.prototype.close=function(){this.open=false};
  w.HTMLCanvasElement.prototype.getContext=function(kind,options){
    contextRequests.push({id:this.id,options});
    const el=this;if(canvases.has(el.id))return canvases.get(el.id).proxy;
    const native=createCanvas(el.width,el.height),c=native.getContext('2d');
    const sync=()=>{if(native.width!==el.width)native.width=el.width;if(native.height!==el.height)native.height=el.height};
    const proxy=new Proxy(c,{get(t,k){sync();if(k==='clearRect'&&el.id==='ink')return(...args)=>{visibleClears++;return t.clearRect(...args)};if(k==='drawImage')return(image,...args)=>t.drawImage(canvases.get(image.id)?.native||image,...args);const value=t[k];return typeof value==='function'?value.bind(t):value},set(t,k,v){sync();t[k]=v;return true}});
    canvases.set(el.id,{native,proxy});return proxy;
  };
  w.Path2D=Path2D;
  for(const file of ['vendor/content.js','desktop/ink-renderer.js','renderer.js','app.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
  const run=s=>w.eval(s),read=s=>JSON.parse(JSON.stringify(run(s)));
  const pointer=(type,x,y,options={})=>{
    const {timeStamp,...properties}=options;
    const event=new w.Event(type,{bubbles:true});Object.assign(event,{pointerId:1,pointerType:'pen',button:0,clientX:x,clientY:y,pressure:.5,...properties});
    if(timeStamp!==undefined)Object.defineProperty(event,'timeStamp',{value:timeStamp});
    w.document.querySelector('#viewport').dispatchEvent(event);
  };
  return{w,dom,run,read,pointer,canvases,contextRequests,reads:()=>rectReads,visibleClears:()=>visibleClears};
}
const a=app();const {run,read,pointer,w}=a;
const sample=String.raw`# 公式与代码

行内：$E=mc^2$，以及 \(x_1+x_2\)。

$$
\int_0^1 x^2\,dx=\frac{1}{3}
$$

\[
\begin{pmatrix}a&b\\c&d\end{pmatrix}
\]

~~~python
def square(x):
    return x ** 2
~~~
`.replace(/~~~/g,'```');
run('doc.notes[0].markdown='+JSON.stringify(sample)+';render()');
assert.equal(w.document.querySelectorAll('.katex-display').length,2);
assert.equal(w.document.querySelectorAll('.katex').length,4);
assert.equal(w.document.querySelectorAll('.katex-error').length,0);
assert.ok(w.document.querySelector('code.language-python .hljs-keyword'));
assert.ok(w.document.querySelector('math'));

// Display math may follow ordinary text without an intervening blank line.
const schedulerSource="于是 Scheduler 估算：\n\\[\n\\text{Expected useful tokens}\n\\times\n\\text{Engine step rate}\n\\]";
for(const source of [schedulerSource,schedulerSource.replaceAll('\n','\r\n'),schedulerSource+'\n下一段文字',schedulerSource.replace('\\[',()=> '$$').replace('\\]',()=> '$$')]){
  const rendered=new JSDOM(run('markdown('+JSON.stringify(source)+')')).window.document;
  assert.equal(rendered.querySelectorAll('.katex-display').length,1);assert.equal(rendered.querySelectorAll('.katex-error').length,0);assert.equal(rendered.querySelector('math mtext').textContent.replace(/\s/g,' '),'Expected useful tokens');assert.ok(rendered.querySelector('math').textContent.replace(/\s/g,' ').includes('Engine step rate'));
}
const literalMath=new JSDOM(run('markdown('+JSON.stringify('\x60\x60\x60text\n'+schedulerSource+'\n\x60\x60\x60')+')')).window.document;
assert.equal(literalMath.querySelectorAll('.katex').length,0);assert.ok(literalMath.querySelector('code').textContent.includes('\\['));
const note=w.document.querySelector('.note'),body=note.querySelector('.note-body');
run('zoom(2,400,300)');assert.equal(w.document.querySelector('.note'),note);assert.equal(note.querySelector('.note-body'),body);
run("doc={format:'inkspace',version:1,strokes:[],notes:[],shapes:[]};view={x:0,y:0,scale:1};render()");
const malicious=String.raw`<script>alert(1)</script>
$\href{javascript:alert(1)}{bad}$
~~~html
<img src=x onerror=alert(1)>
~~~
`.replace(/~~~/g,'```');
run('doc.notes.push({id:"security",x:900,y:20,markdown:'+JSON.stringify(malicious)+'});render()');
assert.equal(w.document.querySelectorAll('.note script,.note img,.note [onerror],.note a[href^="javascript:"]').length,0);
const markup=run('markdown('+JSON.stringify('```imaginary\n$x$ <tag>\n```')+')');assert.ok(markup.includes('&lt;tag&gt;'));assert.ok(!markup.includes('katex'));
assert.equal(run('inline("`$x$`")'),'<code>$x$</code>');
assert.ok(!run('inline("\\\\$5")').includes('katex'));
const link=run('inline('+JSON.stringify('[公式 $x^2$](https://example.com/$y$)')+')');
const linkDoc=new JSDOM(link).window.document;
assert.equal(linkDoc.querySelector('a').getAttribute('href'),'https://example.com/$y$');
assert.equal(linkDoc.querySelectorAll('a .katex').length,1);
assert.doesNotThrow(()=>run('markdown('+JSON.stringify('$$\n\\def\\a{\\a}\\a\n$$')+')'));

// A large existing document must not be repainted or deep-copied for each input sample.
run(`for(let i=0;i<1000;i++)doc.strokes.push({color:'#263f43',width:4,points:Array.from({length:80},(_,j)=>({x:i*2+j,y:450+Math.sin(j/8)*20,p:.6}))});render()`);
const before=read('renderStats'),reads=a.reads();
pointer('pointerdown',30,150,{pressure:.2});
assert.equal(run('history.at(-1).strokes[0]===doc.strokes[0]'),true);
for(let i=1;i<=1500;i++)pointer('pointermove',30+i*.5,150+Math.sin(i/30)*45,{pressure:.2+.6*(i%200)/200});
assert.equal(run('doc.strokes.at(-1).points.length'),1501);
const during=read('renderStats');
assert.equal(during.scenePaints,before.scenePaints);assert.equal(during.noteBuilds,before.noteBuilds);
assert.equal(a.reads()-reads,2); // viewport coordinates read once on down, once for the stroke.
assert.ok(during.maxTailSamples<=64);
pointer('pointerup',780,150+Math.sin(50)*45,{pressure:0});
assert.equal(run('doc.strokes.length'),1001);assert.equal(run('active'),null);
assert.equal(run('doc.strokes.at(-1).points.at(-1).p'),.5);assert.equal(run('doc.strokes.at(-1).points.length'),1501);
assert.equal(run('renderStats.outlineBuilds'),before.outlineBuilds+1);
assert.equal(run('surface.dpr'),1);assert.equal(w.document.querySelector('#ink').width,1584);
const ink=a.canvases.get('ink').native.getContext('2d').getImageData(217,292,800,150).data;
assert.ok(ink.some((value,i)=>i%4===3&&value>0&&value<255),'antialiased ink edge');
const outline=w.InkContent.strokeOutline({width:4,points:[{x:10,y:10,p:1},{x:40,y:10,p:1}]});
assert.ok(outline.every(p=>p.every(Number.isFinite)));
assert.ok(Math.max(...outline.map(p=>p[1]))-Math.min(...outline.map(p=>p[1]))<=4.01);
assert.match(run('cachedStroke(doc.strokes.at(-1)).d'),/ L /);

// Moving a previously cached stroke must invalidate its path on every drag update.
run("tool='select';selected={strokes:[1000],notes:[],shapes:[]}");
const original=run('doc.strokes[1000].points[0].x');
pointer('pointerdown',100,150);pointer('pointermove',110,160);pointer('pointermove',130,170);pointer('pointerup',130,170);
assert.equal(run('doc.strokes[1000].points[0].x'),original+30);
assert.equal(run('cachedStroke(doc.strokes[1000]).d===InkContent.strokePath(doc.strokes[1000])'),true);
run('undo()');assert.equal(run('doc.strokes[1000].points[0].x'),original);
run('redo()');assert.equal(run('doc.strokes[1000].points[0].x'),original+30);
run('flushPersist()');assert.ok(w.localStorage.getItem('inkspace.document'));

// Panning previews transform existing overscanned layers rather than filling all paths.
run("tool='pan';clearSelection()");
const panBefore=read('renderStats'),panView=read('view'),panReads=a.reads();
const paperPosition=w.document.querySelector('#paper').style.backgroundPosition;
pointer('pointerdown',20,20,{pointerType:'mouse'});
for(let i=1;i<=200;i++){pointer('pointermove',20+i*.3,20+i*.15,{pointerType:'mouse'});if(i%4===0)run('presentInteraction()')}
const panDuring=read('renderStats');
assert.equal(w.document.querySelector('#paper').parentElement,w.document.querySelector('#viewport'));
assert.equal(w.document.querySelector('#paper').style.backgroundPosition,paperPosition);
assert.equal(panDuring.scenePaints,panBefore.scenePaints);assert.equal(panDuring.outlineBuilds,panBefore.outlineBuilds);assert.equal(panDuring.noteBuilds,panBefore.noteBuilds);
assert.equal(a.reads()-panReads,2);assert.ok(w.document.querySelector('#scene').style.transform.includes('60px'));
pointer('pointerup',80,50,{pointerType:'mouse'});
assert.equal(run('renderStats.scenePaints'),panBefore.scenePaints+1);assert.equal(w.document.querySelector('#scene').style.transform,'');
assert.equal(run('renderStats.fullScenePaints'),panBefore.fullScenePaints);assert.equal(run('renderStats.stripPaints'),panBefore.stripPaints+1);
assert.equal(run('view.x'),panView.x+60);assert.equal(run('view.y'),panView.y+30);
assert.equal(run('doc.strokes[1000].points[0].x'),original+30);
pointer('pointerdown',0,0,{pointerType:'mouse'});pointer('pointermove',600,0,{pointerType:'mouse'});run('presentInteraction()');
assert.equal(w.document.querySelector('#scene').style.transform,'');assert.equal(run('paintedView.x===view.x'),true);
pointer('pointerup',600,0,{pointerType:'mouse'});

// Moving selected ink rebuilds geometry once at commit, not on every drag sample.
run("view={x:0,y:0,scale:1};tool='select';selected={strokes:[1000],notes:[],shapes:[]};render()");
const groupX=run('doc.strokes[1000].points[0].x');pointer('pointerdown',150,150);
const groupBefore=read('renderStats');
for(let i=1;i<=100;i++)pointer('pointermove',150+i*.3,150+i*.1);run('presentInteraction()');
assert.equal(run('doc.strokes[1000].points[0].x'),groupX);
assert.equal(run('renderStats.scenePaints'),groupBefore.scenePaints);assert.equal(run('renderStats.outlineBuilds'),groupBefore.outlineBuilds);
assert.ok(w.document.querySelector('#ink-stream').style.transform.includes('30px'));
pointer('pointerup',180,160);assert.ok(Math.abs(run('doc.strokes[1000].points[0].x')-(groupX+30))<1e-8);
assert.equal(run('renderStats.outlineBuilds'),groupBefore.outlineBuilds+1);
run('undo()');assert.equal(run('doc.strokes[1000].points[0].x'),groupX);

// High-rate pen selection and scaling must leave the scene and geometry intact.
run("view={x:0,y:0,scale:1};tool='select';clearSelection();render()");
const selectionPaints=run('renderStats.scenePaints');
pointer('pointerdown',900,500);
for(let i=0;i<1000;i++)pointer('pointermove',900+i*.01,500+i*.01);
run('presentInteraction()');assert.equal(run('renderStats.scenePaints'),selectionPaints);
pointer('pointerup',910,510);
run("selected={strokes:[1000],notes:[],shapes:[]};render()");
const scaleBounds=read('selectionBounds()'),scaleWidth=run('doc.strokes[1000].width');
const scaleHandle=w.document.querySelector('.selection-scale');
const down=new w.Event('pointerdown',{bubbles:true});Object.assign(down,{pointerId:1,pointerType:'pen',button:0,clientX:scaleBounds.x+scaleBounds.w,clientY:scaleBounds.y+scaleBounds.h});scaleHandle.dispatchEvent(down);
const scaleBefore=read('renderStats');
for(let i=1;i<=1000;i++)pointer('pointermove',scaleBounds.x+scaleBounds.w*(1+i/1000),scaleBounds.y+scaleBounds.h*(1+i/1000));
run('presentInteraction()');
assert.equal(run('renderStats.scenePaints'),scaleBefore.scenePaints);
assert.equal(run('renderStats.outlineBuilds'),scaleBefore.outlineBuilds);
assert.equal(run('doc.strokes[1000].width'),scaleWidth);
assert.equal(w.document.querySelector('#ink-stream').style.transform,'scale(2)');
pointer('pointerup',scaleBounds.x+scaleBounds.w*2,scaleBounds.y+scaleBounds.h*2);
assert.equal(run('doc.strokes[1000].width'),scaleWidth*2);
assert.equal(w.document.querySelector('#ink-stream').style.transform,'');
run('undo()');assert.equal(run('doc.strokes[1000].width'),scaleWidth);
console.log('Passed 1000 pen selection and 1000 scaling samples with zero scene paints/geometry rebuilds during drag.');

// Tool keys toggle the requested tool against the previous tool, once per press.
run("tool='pen';previousTool='pen'");
const toolKey=(key,options={})=>w.document.body.dispatchEvent(new w.KeyboardEvent('keydown',{bubbles:true,key,...options}));
toolKey('e');assert.equal(run('tool'),'erase');toolKey('e',{repeat:true});assert.equal(run('tool'),'erase');
toolKey('e');assert.equal(run('tool'),'pen');toolKey('e');assert.equal(run('tool'),'erase');
toolKey('v');assert.equal(run('tool'),'select');toolKey('v');assert.equal(run('tool'),'erase');
w.document.querySelector('[data-tool="text"]').click();toolKey('v');toolKey('v');assert.equal(run('tool'),'text');toolKey('h');assert.equal(run('tool'),'pan');toolKey('h');assert.equal(run('tool'),'text');assert.equal(w.document.querySelector('[data-tool="pan"]'),null);
const source=w.document.querySelector('#source');source.dispatchEvent(new w.KeyboardEvent('keydown',{bubbles:true,key:'e'}));assert.equal(run('tool'),'text');
run("tool='select'");

// Background styles follow world coordinates and survive save, validation and undo.
const setBackground=(id,value)=>{const el=w.document.querySelector(id);el.value=value;el.dispatchEvent(new w.Event('change'))};
setBackground('#background-kind','grid');assert.equal(run('doc.background.type'),'grid');assert.ok(w.document.querySelector('#a4-pages pattern path[stroke]'));
setBackground('#background-spacing','48');assert.equal(run('doc.background.spacing'),48);run('undo()');assert.equal(run('backgroundSettings().spacing'),'auto');
setBackground('#background-kind','ruled');assert.ok(w.document.querySelector('#a4-pages pattern path[stroke]'));
setBackground('#background-color','#202020');assert.equal(run('doc.background.color'),'#202020');assert.ok(w.document.querySelector('#a4-pages pattern path[stroke]'));
setBackground('#background-kind','blank');assert.equal(w.document.querySelector('#paper').style.backgroundImage,'none');
run('flushPersist()');assert.equal(JSON.parse(w.localStorage.getItem('inkspace.document')).background.type,'blank');
assert.equal(run('valid(JSON.parse(JSON.stringify(doc)))'),true);
assert.equal(run('valid({...doc,background:{type:"evil",color:"red",spacing:0}})'),false);
setBackground('#background-kind','dots');assert.ok(run('backgroundSvg(bounds())').includes('<pattern'));

// Dense slow samples never cause a committed segment to be recalculated.
const brush=w.InkContent,state=brush.createStrokeState({width:4,step:.25}),base=[];
let stable='';for(let i=0;i<400;i++){const p={x:i*.025,y:20+Math.sin(i)*.25,p:.5+(i%2?.03:-.03)};base.push(p);stable+=brush.appendStrokePoint(state,p)+' '}
const frozen=stable;for(let i=400;i<600;i++){const p={x:i*.025,y:20+Math.sin(i)*.25,p:.5};base.push(p);stable+=brush.appendStrokePoint(state,p)+' '}
assert.ok(stable.startsWith(frozen));assert.equal(stable+brush.strokeTailPath(state),brush.strokePath({width:4,step:.25,points:base}));
assert.ok(state.points.length<base.length);assert.ok(state.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.p)));
const slowY=state.points.slice(20).map(p=>p.y);assert.ok(Math.max(...slowY)-Math.min(...slowY)<.5);

// Raw/move duplicate delivery is ignored; coalesced pressure samples remain intact.
const b=app(true);b.run("doc={format:'inkspace',version:1,strokes:[],notes:[],shapes:[]};view={x:0,y:0,scale:1};render()");
b.pointer('pointerdown',10,10,{pressure:.2});
b.pointer('pointerrawupdate',40,40,{getCoalescedEvents:()=>[{clientX:20,clientY:20,pointerType:'pen',pressure:0},{clientX:30,clientY:30,pointerType:'pen',pressure:.3},{clientX:40,clientY:40,pointerType:'pen',pressure:.7}]});
assert.equal(b.run('doc.strokes[0].points.length'),4);assert.equal(b.run('doc.strokes[0].points[1].p'),0);
b.pointer('pointerup',40,40,{pressure:0});assert.equal(b.run('doc.strokes[0].points.length'),4);

// Coalesced move replays must not make the pen travel backwards after raw input.
b.pointer('pointerdown',50,50,{pressure:.2});
b.pointer('pointerrawupdate',70,70,{getCoalescedEvents:()=>[
  {clientX:60,clientY:60,pointerType:'pen',pressure:.3,timeStamp:100},
  {clientX:70,clientY:70,pointerType:'pen',pressure:.4,timeStamp:101}]});
b.pointer('pointermove',70,70,{getCoalescedEvents:()=>[
  {clientX:60,clientY:60,pointerType:'pen',pressure:.3,timeStamp:100},
  {clientX:70,clientY:70,pointerType:'pen',pressure:.4,timeStamp:101}]});
assert.equal(b.run('doc.strokes.at(-1).points.length'),3);
b.pointer('pointerrawupdate',70,70,{pressure:.8,timeStamp:102});
assert.equal(b.run('doc.strokes.at(-1).points.at(-1).p'),.8,'stationary pressure is retained');
b.pointer('pointerrawupdate',999,999,{pressure:0,buttons:0,timeStamp:103});
assert.equal(b.run('doc.strokes.at(-1).points.length'),4,'hover cannot extend the contact stroke');
b.pointer('pointercancel',999,999,{pressure:0});
assert.equal(b.run('doc.strokes.at(-1).points.length'),4,'cancel cannot add a tail');

// Pan interruption and transition to pinch must settle the preview transform.
b.run("tool='pan'");b.pointer('pointerdown',10,10,{pointerType:'touch'});b.pointer('pointermove',60,10,{pointerType:'touch'});b.run('presentInteraction()');
assert.ok(b.w.document.querySelector('#scene').style.transform.includes('50px'));
b.pointer('pointerdown',100,10,{pointerId:2,pointerType:'touch'});
assert.equal(b.w.document.querySelector('#scene').style.transform,'');
b.pointer('pointermove',140,10,{pointerId:2,pointerType:'touch'});assert.ok(b.run('view.scale')>1);
b.pointer('pointerup',140,10,{pointerId:2,pointerType:'touch'});b.pointer('pointerup',60,10,{pointerType:'touch'});
b.pointer('pointerdown',10,10,{pointerType:'mouse'});b.pointer('pointermove',40,40,{pointerType:'mouse'});b.run('presentInteraction()');b.w.dispatchEvent(new b.w.Event('blur'));
assert.equal(b.w.document.querySelector('#scene').style.transform,'');assert.equal(b.run('active'),null);

// Mixed selection previews include shape ink and text without editing their data mid-drag.
b.run("view={x:0,y:0,scale:1};doc.notes.push({id:'mixed',x:100,y:100,markdown:'$x^2$'});doc.shapes.push({kind:'rect',x:150,y:120,x2:220,y2:180,color:'#263f43',width:4});render();tool='select';selectBox({x:0,y:0,w:500,h:500})");
b.pointer('pointerdown',50,50);b.pointer('pointermove',80,70);b.run('presentInteraction()');
assert.equal(b.run('doc.notes[0].x'),100);assert.equal(b.run('doc.shapes[0].x'),150);
assert.equal(b.w.document.querySelector('.note').style.left,'130px');
b.pointer('pointerup',80,70);assert.equal(b.run('doc.notes[0].x'),130);assert.equal(b.run('doc.shapes[0].x'),180);
b.run('undo()');assert.equal(b.run('doc.notes[0].x'),100);assert.equal(b.run('doc.shapes[0].x'),150);

// Partial pan updates match full rendering within native antialias rounding.
for(const [dx,dy] of [[-75.5,28.5],[160,-100],[-220,-75],[65,40]]){
  b.run(`view.x+=${dx};view.y+=${dy};rebasePan()`);
  const image=b.canvases.get('ink').native.getContext('2d'),width=b.w.document.querySelector('#ink').width,height=b.w.document.querySelector('#ink').height;
  const partial=Buffer.from(image.getImageData(0,0,width,height).data);
  b.run('render()');const full=Buffer.from(image.getImageData(0,0,width,height).data);
  let alphaError=0,colorError=0;
  for(let i=0;i<partial.length;i+=4){alphaError=Math.max(alphaError,Math.abs(partial[i+3]-full[i+3]));for(let channel=0;channel<3;channel++)colorError=Math.max(colorError,Math.abs(partial[i+channel]*partial[i+3]/255-full[i+channel]*full[i+3]/255))}
  assert.ok(alphaError<=3&&colorError<=2,`partial pan preserves ink coverage (alpha ${alphaError}, premultiplied color ${colorError})`);
}

// Text keeps one world-coordinate layout at every fractional zoom.
const mixed=b.w.document.querySelector('.note'),mixedBody=mixed.querySelector('.note-body');
const sizeControl=b.w.document.querySelector('#text-size');sizeControl.value='20';sizeControl.dispatchEvent(new b.w.Event('change'));
const ruledControl=b.w.document.querySelector('#background-kind');ruledControl.value='ruled';ruledControl.dispatchEvent(new b.w.Event('change'));
assert.equal(b.run('backgroundSettings().spacing'),'auto');assert.equal(b.run('backgroundSpacing()'),35);
for(const scale of [.75,1.1,1.25,1.6,2]){
  b.run(`zoom(${scale},400,300)`);
  assert.equal(mixed.style.transform,`scale(${scale})`);assert.equal(Number.parseFloat(mixed.style.fontSize),20);assert.equal(Number.parseFloat(mixed.style.width),320);
  assert.equal(mixed.querySelector('.note-body'),mixedBody);
  assert.equal(Number.parseFloat(b.w.document.querySelector('#paper').style.backgroundSize),35*scale);
}
b.run('zoom(100,400,300)');assert.equal(b.run('view.scale'),100);assert.equal(b.w.document.querySelector('#in').disabled,false);
b.run('zoom(.001,400,300)');assert.equal(b.run('view.scale'),.001);assert.equal(b.w.document.querySelector('#out').disabled,false);
assert.equal(a.visibleClears(),0);assert.equal(b.visibleClears(),0);
assert.ok([...a.contextRequests,...b.contextRequests].every(request=>request.options?.desynchronized!==true));
b.run('flushPersist()');assert.equal(JSON.parse(b.w.localStorage.getItem('inkspace.document')).background.fontSize,20);

// Every accepted pen coordinate equals an input coordinate, including sharp corners.
const detail=brush.createStrokeState({width:4,brush:'detail',step:.05}),corners=[{x:0,y:0,p:.5},{x:1,y:0,p:.5},{x:1,y:1,p:.5},{x:2,y:1,p:.5},{x:2,y:2,p:.5}];
for(const p of corners)brush.appendStrokePoint(detail,p);
assert.deepEqual(JSON.parse(JSON.stringify(detail.points.map(p=>[p.x,p.y]))),corners.map(p=>[p.x,p.y]));


// Fractional zoom retains world layout below readable text sizes.
b.run('doc.notes[0].width=880;zoom(.1,400,300)');
assert.equal(mixed.style.width,'880px');assert.equal(mixed.style.fontSize,'20px');assert.equal(mixed.style.transform,'scale(0.1)');
assert.equal(b.run('itemBounds("notes",doc.notes[0]).w'),880);
const beforeZoom=b.run('renderStats.fullScenePaints');
for(let i=0;i<120;i++)b.run('interactiveZoom(.2+(.8*'+i+'/120),400,300)');
assert.equal(b.run('renderStats.fullScenePaints'),beforeZoom);
b.run('settleZoom()');assert.equal(b.run('renderStats.fullScenePaints'),beforeZoom+1);
assert.match(brush.strokePath({width:2,points:corners}),/ L /);
assert.equal(b.run('validPdfs([{id:"p",name:"a.pdf",data:"JVBERg==",pages:[{x:0,y:0,width:600,height:800}]}])'),true);
assert.equal(b.run('validPdfs([{id:"p",data:"bad!",pages:[]}])'),false);

// New documents can be undone, including PDF assets and explicit note widths.
b.run("$('#new').click()");assert.equal(b.run('doc.notes.length'),0);b.run('undo()');assert.equal(b.run('doc.notes[0].width'),880);
// Translucent shapes must keep their alpha after another pen stroke is baked.
b.run("tool='pen';view={x:0,y:0,scale:1};doc={format:'inkspace',version:1,notes:[],strokes:[],shapes:[{kind:'highlight',x:0,y:0,x2:200,y2:100,color:'#ffe066',width:1}]};render()");
const highlighted=b.canvases.get('ink').native.getContext('2d').getImageData(233,233,1,1).data[3];
b.pointer('pointerdown',10,10);b.pointer('pointermove',180,20);b.pointer('pointerup',180,20);
assert.equal(b.run('doc.strokes.length'),1);
assert.equal(b.canvases.get('ink').native.getContext('2d').getImageData(233,233,1,1).data[3],highlighted);
b.run("tool='shape'");b.pointer('pointerdown',300,100);const shapePaints=b.run('renderStats.scenePaints');for(let i=0;i<100;i++)b.pointer('pointermove',400+i,200);assert.equal(b.run('renderStats.scenePaints'),shapePaints);b.pointer('pointerup',499,200);assert.equal(b.run('active'),null);

// Local assets referenced by the page and the formula font CSS must exist offline.
for(const el of w.document.querySelectorAll('script[src],link[href]'))assert.ok(fs.existsSync(el.getAttribute('src')||el.getAttribute('href')));
for(const match of fs.readFileSync('vendor/katex.min.css','utf8').matchAll(/url\(([^)]+)\)/g))assert.ok(fs.existsSync(path.join('vendor',match[1])));
console.log(`通过：真实 DOM 公式/高亮、安全转义、离线字体、压感轮廓抗锯齿、原始/合并采样、移动缓存与历史。已有 1000 条笔迹时，1500 次书写更新新增场景重绘 ${during.scenePaints-before.scenePaints} 次、文本构建 ${during.noteBuilds-before.noteBuilds} 次，实时尾部最多 ${during.maxTailSamples} 个采样。`);
console.log('通过：稳定曲线前缀、慢速微抖动、平移及混合框选图层预览、背景切换/保存/撤销、平移中断和双指缩放衔接。');
console.log('通过：显示画布无 clearRect、条带栅格对比、背景同层同步、字号/行距关联、缩放保持文字布局、原始转折保留、无固定上下限的缩放。');
// Live coverage must agree with the saved vector union, across tile seams,
// dense samples, pressure changes, crossings and fractional display density.
for(const dpr of [1,1.25,2]){
  const t=app(true,dpr);
  t.run("doc={format:'inkspace',version:1,strokes:[],notes:[],shapes:[]};view={x:.3,y:.7,scale:.36};render();$('#width').value='2'");
  t.pointer('pointerdown',30.1,100.2,{pressure:0});
  // Capability detection alone cannot disable fallback on a device that sends no raw events.
  t.pointer('pointermove',30.2,100.3,{pressure:.1});
  assert.equal(t.run('doc.strokes[0].points.length'),2);
  for(let i=1;i<=360;i++)t.pointer('pointerrawupdate',30.2+i*.55,100.3+Math.sin(i/23)*25,{pressure:.15+.8*(i%35)/35});
  const last=t.read('doc.strokes[0].points.at(-1)');
  const snapshot=t.read('doc.strokes[0]');
  assert.equal(snapshot.points[0].p,0,'zero pressure on down is preserved');
  const live=t.canvases.get('ink-stream').native;
  const actualPixels=live.getContext('2d').getImageData(0,0,live.width,live.height).data;
  t.pointer('pointerup',229,115,{pressure:0});
  const expectedPixels=t.canvases.get('ink').native.getContext('2d').getImageData(0,0,live.width,live.height).data;
  let max=0;for(let i=3;i<actualPixels.length;i+=4)max=Math.max(max,Math.abs(actualPixels[i]-expectedPixels[i]));
  assert.equal(max,0,`live/final coverage at DPR ${dpr}`);
  assert.deepEqual(t.read('doc.strokes[0].points.at(-1)'),last,'rounded pen-up cannot add a spurious tail');
  assert.equal(t.run('valid(JSON.parse(JSON.stringify(doc)))'),true);
  t.dom.window.close();
}
console.log('通过：实时/保存墨迹覆盖一致（DPR 1/1.25/2）、raw 事件缺失回退、零压力落笔与抬笔坐标跳变。');
a.dom.window.close();b.dom.window.close();


const pt=app(),pw=pt.w,pr=pt.run;
pr("doc={format:'inkspace',version:1,strokes:[],notes:[],shapes:[],background:{type:'blank',color:'#ffffff',spacing:'auto',fontSize:16,layout:'a4-portrait'}};view={x:0,y:0,scale:1};render()");
const pages=()=>Array.from(pw.document.querySelectorAll('#a4-pages rect')).map(el=>el.dataset.cell).sort();
assert.deepEqual(pages(),['0,0']);
assert.equal(pw.document.querySelector('#a4-pages').hidden,false,'empty canvas starts with one visible sheet');
pr("doc.notes.push({id:'empty-text',x:40,y:40,width:320,markdown:'  \\n '});render()");
assert.deepEqual(pages(),['0,0'],'empty text boxes do not create additional paper');
pr('doc.notes=[];render()');
pr("doc.background.type='ruled';render()");
assert.equal(pw.document.querySelector('#paper').style.backgroundImage,'none','empty paper has no global ruling');
assert.equal(pw.document.querySelector('#paper').style.backgroundColor,'rgb(232, 234, 237)');
pr("doc.strokes.push({brush:'xournal',width:4,color:'#000000',points:[{x:790,y:100,p:.5},{x:800,y:100,p:.5}]});render()");
assert.deepEqual(pages(),['0,0','1,0']);
assert.equal(pw.document.querySelector('#a4-pages g').getAttribute('fill'),'url(#a4-pattern)','ruling is clipped to occupied paper');
assert.equal(Number(pw.document.querySelector('#a4-pages').dataset.pageWidth),210*96/25.4);
assert(pw.document.querySelector('#a4-pages g').getAttribute('stroke-dasharray'));
pr("doc.strokes[0].points.push({x:800,y:1130,p:.5});view.scale=.4;renderA4Pages()");
assert.deepEqual(pages(),['0,0','1,0','1,1']);
pr("doc.strokes=[];render()");assert.deepEqual(pages(),['0,0'],'erasing all content returns to the initial sheet');
pr("doc.shapes=[{kind:'line',x:-5,y:10,x2:5,y2:10,width:2,color:'#000000'}];render()");
assert.deepEqual(pages(),['-1,0','0,0']);
pr("doc.shapes=[];doc.strokes=[{brush:'xournal',width:2,color:'#000000',points:[{x:10,y:10,p:.5},{x:1590,y:2250,p:.5}]}];view.scale=.2;render()");
assert(!pages().includes('0,2'),'a diagonal does not allocate its entire bounding rectangle');
pr("doc.strokes[0].points=doc.strokes[0].points.map(p=>({...p,x:p.x+3000}));render()");
assert(!pages().includes('0,0'),'moving a stroke removes its old paper coverage');
pr("doc.strokes=[];doc.notes=[{id:'paper-image',kind:'image',src:'data:image/png;base64,AA==',aspect:1,markdown:'',x:790,y:20,width:160}];render()");
assert.deepEqual(pages(),['0,0','1,0'],'images allocate all occupied paper');
pr("doc.background.color='#fffefb';doc.background.type='blank';renderA4Pages()");
assert.equal(pw.document.querySelector('#a4-pages g').getAttribute('fill'),'#ffffff','A4 paper is pure white even for an older cream background');
pr("doc.background.layout='a4-landscape';render()");
assert.equal(Number(pw.document.querySelector('#a4-pages').dataset.pageWidth),297*96/25.4);
assert(pr('valid(JSON.parse(JSON.stringify(doc)))'));pr('flushPersist()');
assert.equal(JSON.parse(pw.localStorage.getItem('inkspace.document')).background.layout,'a4-landscape');
pr("doc.background.layout='infinite';render()");assert.equal(Number(pw.document.querySelector('#a4-pages').dataset.pageWidth),210*96/25.4,'legacy infinite documents use A4 portrait');
assert.equal(pw.document.querySelector('#page-layout option[value=infinite]'),null);
pt.dom.window.close();
console.log('Passed gapless dashed A4 borders, occupancy, live expansion, deletion, negative coordinates and persistence.');

const clip=app(),cw=clip.w,cr=clip.run;
vm.runInContext(fs.readFileSync('desktop/workspace.js','utf8'),clip.dom.getInternalVMContext());
cr("doc={...newCanvas(),strokes:[{brush:'xournal',color:'#000000',width:3,points:[{x:10,y:10,p:0},{x:30,y:20,p:.8}]},{color:'#000000',width:2,points:[{x:900,y:900,p:.5}]}],shapes:[{kind:'rect',color:'#000000',width:2,x:40,y:10,x2:80,y2:40}],notes:[{id:'copy-text',x:100,y:10,width:160,markdown:'**copy**',scale:2},{id:'copy-image',x:300,y:10,width:160,markdown:'',kind:'image',src:'data:image/png;base64,AA==',aspect:1.5}]};view={x:0,y:0,scale:2};selected={strokes:[0],shapes:[0],notes:[0,1]};render()");
const clipboardData=new Map(),copyEvent=new cw.Event('copy',{bubbles:true,cancelable:true});
copyEvent.clipboardData={setData:(type,text)=>clipboardData.set(type,text)};cw.document.body.dispatchEvent(copyEvent);
assert(copyEvent.defaultPrevented);const fragment=clipboardData.get('text/plain');assert(fragment.startsWith('INKSPACE_SELECTION_V1\n'));
cr('pasteAnchor={x:1000,y:600}');
const pasteEvent=new cw.Event('paste',{bubbles:true,cancelable:true});pasteEvent.clipboardData={items:[],getData:()=>fragment};cw.document.body.dispatchEvent(pasteEvent);
assert(pasteEvent.defaultPrevented);assert.equal(cr('doc.strokes.length'),3);assert.equal(cr('doc.shapes.length'),2);assert.equal(cr('doc.notes.length'),4);
assert.equal(cr('doc.strokes[2].points[0].p'),0);assert.equal(cr('doc.strokes[2].points[1].p'),.8);
assert.equal(cr('doc.notes[2].scale'),2);assert.equal(cr('doc.notes[3].aspect'),1.5);
assert.equal(cr('new Set(doc.notes.map(n=>n.id)).size'),4);assert.equal(cr('selectionBounds().x'),500);assert.equal(cr('selectionBounds().y'),300);
assert.equal(cr('selected.strokes[0]'),2);assert(cr('valid(JSON.parse(JSON.stringify(doc)))'));
cr('undo()');assert.equal(cr('doc.strokes.length'),2);assert.equal(cr('doc.notes.length'),2);cr('redo()');assert.equal(cr('doc.notes.length'),4);
assert.throws(()=>cr("pasteSelectionText('INKSPACE_SELECTION_V1\\n{}')"));
const savedFragment=JSON.parse(fragment.slice('INKSPACE_SELECTION_V1\n'.length));
cr('adoptDocument(newCanvas());pasteAnchor={x:100,y:100}');
assert(clip.run('pasteSelectionText('+JSON.stringify(fragment.replace('INKSPACE_SELECTION_V1\n','INKSPACE_SELECTION_V1\r\n'))+')'));assert.equal(cr('doc.strokes.length'),1);assert.equal(cr('doc.notes.length'),2);
assert.equal(cr('doc.strokes[0].points[1].p'),savedFragment.document.strokes[0].points[1].p);
const textEvent=new cw.Event('copy',{bubbles:true,cancelable:true});textEvent.clipboardData=copyEvent.clipboardData;cw.document.querySelector('#source').dispatchEvent(textEvent);assert(!textEvent.defaultPrevented);
clip.dom.window.close();console.log('Passed mixed selection copy/paste, original pressure, unique image/text IDs, cursor placement, cross-page paste and atomic undo/redo.');

// Undo/redo reuse unchanged ink objects and repaint only the changed region.
const historyApp=app(),historyRun=historyApp.run;
historyRun("doc={format:'inkspace',version:1,strokes:Array.from({length:1000},(_,i)=>({brush:'raw-contour',color:'#263f43',width:2,points:[{x:(i%40)*20,y:Math.floor(i/40)*20,p:.5},{x:(i%40)*20+8,y:Math.floor(i/40)*20+8,p:.7}]})),notes:[],shapes:[],background:{layout:'a4-portrait',type:'blank',color:'#ffffff',spacing:'auto',fontSize:16}};view={x:0,y:0,scale:1};history=[];future=[];render()");
const historyPixels=()=>Buffer.from(historyApp.canvases.get('ink').native.getContext('2d').getImageData(0,0,historyApp.canvases.get('ink').native.width,historyApp.canvases.get('ink').native.height).data);
const beforeHistoryPixels=historyPixels();historyRun("checkpoint();doc.strokes.push({brush:'raw-contour',color:'#263f43',width:3,points:[{x:31,y:31,p:.5}]});render()");const afterHistoryPixels=historyPixels(),historyPaints=historyRun('renderStats.fullScenePaints'),historyBuilds=historyRun('renderStats.outlineBuilds');
historyRun('undo()');assert.equal(historyRun('renderStats.fullScenePaints'),historyPaints);assert.equal(historyRun('renderStats.outlineBuilds'),historyBuilds);assert.deepEqual(historyPixels(),beforeHistoryPixels);
historyRun('redo()');assert.equal(historyRun('renderStats.fullScenePaints'),historyPaints);assert.deepEqual(historyPixels(),afterHistoryPixels);historyApp.dom.window.close();
console.log('Passed 1000-stroke region undo/redo: zero full-scene paints, zero contour rebuilds and exact pixels.');
