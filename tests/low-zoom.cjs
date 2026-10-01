const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{createCanvas,Path2D}=require('@napi-rs/canvas'),asar=require('@electron/asar');
const load=b=>{const context=vm.createContext({});vm.runInContext(b,context);return context.InkContent};
const brush=load(fs.readFileSync('vendor/content.js','utf8'));
// New captures never straighten legitimate low-zoom detail or discard tiny
// world-space movements at high zoom. Geometry keeps pressure-only samples.
for(const scale of [.001,.04,.36,1,100,10000]){
  const points=Array.from({length:100},(_,i)=>({x:i*.01/scale,y:Math.sin(i/5)*.15/scale,p:.1+i*.008}));
  points.push({...points.at(-1),p:1});
  const stroke={brush:'raw-contour',width:2,inputScale:scale,step:.05/scale,points},state=brush.createStrokeState(stroke);
  for(const p of points)brush.appendStrokePoint(state,p);
  assert.equal(JSON.stringify(state.points),JSON.stringify(points));
  assert.equal(JSON.stringify(state.vertices),JSON.stringify(points),'no zoom-dependent refitting');
  assert.ok(!/NaN|Infinity/.test(brush.strokePath(stroke)));
}
for(const scale of [.36,.2,.05,.01,.001]){
  const points=Array.from({length:801},(_,i)=>({x:Math.round(10+i*.05)/scale,y:Math.round(90-i*.018)/scale,p:1})),stroke={width:4,inputScale:scale,step:.05/scale,points},state=brush.createStrokeState(stroke);
  for(const p of points)brush.appendStrokePoint(state,p);
  assert.equal(state.vertices.length,1,`integer-coordinate diagonal is a single run at ${scale}`);
  const [a,b]=brush.strokeTailPoints(state),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  const deviation=Math.max(...points.map(p=>Math.abs((p.x-a.x)*dy-(p.y-a.y)*dx)/length*scale));assert.ok(deviation<=1.25+1e-8,'bounded in capture screen coordinates');
  const corner=brush.createStrokeState({width:4,inputScale:scale});for(let i=0;i<=40;i++)brush.appendStrokePoint(corner,{x:i/scale,y:0,p:1});for(let i=1;i<=40;i++)brush.appendStrokePoint(corner,{x:40/scale,y:i/scale,p:1});assert.ok(corner.vertices.length>=2,'real right-angle turn remains');
}
const scale=.05,stroke={width:4,inputScale:scale,step:.05/scale,points:Array.from({length:1001},(_,i)=>({x:Math.round(10+i*.05)/scale,y:Math.round(90-i*.018)/scale,p:1}))};
let old;try{old=load(fs.readFileSync('artifacts/previous-content.js','utf8')).strokePath(stroke)}catch{}
const out=createCanvas(1200,900),c=out.getContext('2d');c.fillStyle='#f6f7f5';c.fillRect(0,0,1200,900);c.fillStyle='#263f43';c.font='20px Segoe UI';c.fillText('0.3.1: quantized samples + clamped curves',30,30);c.fillText('0.3.2: same samples + screen-space corridor + contour',30,480);
function draw(d,top){c.save();c.translate(-150,top-1400);c.fillStyle='#263f43';c.fill(new Path2D(d));c.restore()}
if(old)draw(old,50);draw(brush.strokePath(stroke),500);fs.writeFileSync('artifacts/low-zoom-comparison.png',out.toBuffer('image/png'));
console.log('通过：20%、5%、1%、0.1% 整数采样直线重建、屏幕误差边界与真实直角保留。');

const actual=JSON.parse(fs.readFileSync('tests/fixtures/quantized-pen.json')),state=brush.createStrokeState(actual);
actual.points.forEach(p=>brush.appendStrokePoint(state,p));
assert.ok(state.vertices.length<actual.points.length/8,'actual pen quantization reconstructed');
assert.equal(JSON.stringify(actual.points),JSON.stringify(state.points),'original pen samples preserved');
assert.ok(Math.abs(.05/actual.step-.04076220397836617)<1e-12);
const canvas=createCanvas(1200,760),ctx=canvas.getContext('2d'),center=actual.points[170];
ctx.fillStyle='#f6f7f5';ctx.fillRect(0,0,1200,760);
function comparison(path,y){ctx.save();ctx.beginPath();ctx.rect(0,y,1200,340);ctx.clip();ctx.translate(600-center.x*.9,y+170-center.y*.9);ctx.scale(.9,.9);ctx.fillStyle='#263f43';ctx.fill(new Path2D(path));ctx.restore()}
ctx.font='20px Segoe UI';ctx.fillStyle='#263f43';ctx.fillText('Actual saved pen samples, viewed at 90%: previous',20,25);comparison(fs.readFileSync('tests/fixtures/quantized-pen-previous.path','utf8'),35);ctx.fillText('Same raw samples, new pressure contour',20,405);comparison(brush.strokePath(actual),420);
fs.writeFileSync('artifacts/actual-pen-comparison.png',canvas.toBuffer('image/png'));
console.log('Passed actual 342-sample pen fixture: 21 contour runs; original coordinates preserved; 90% comparison rendered.');

const vertices=[...state.vertices,brush.strokeTailPoints(state)[1]];
const segmentDistance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)||0));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)};
const maxError=Math.max(...actual.points.map(p=>Math.min(...vertices.slice(1).map((b,i)=>segmentDistance(p,vertices[i],b)))))*(.05/actual.step);
assert.ok(maxError<=1.25+1e-10,'actual pen geometry stays within screen-space error budget');
