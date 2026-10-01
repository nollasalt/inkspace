const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createCanvas,Path2D}=require('@napi-rs/canvas');
const native=require('../desktop/native/ink-native.node');
const context=vm.createContext({});vm.runInContext(fs.readFileSync('vendor/content.js','utf8'),context);
assert.equal(native.status().cairo,'1.18.4');
const positions=Array.from({length:30},(_,i)=>native.calibration({h:10000+i,deviceStart:0,deviceEnd:100000,screenStart:-1920,screenEnd:0}));
assert.equal(new Set(positions.map(Math.round)).size,2);
assert.equal(new Set(positions).size,30);
assert.ok(Math.abs(positions[1]-positions[0]-.0192)<1e-10);
for(const scale of [.04,.36,1,4,100]){
  const points=Array.from({length:200},(_,i)=>({x:(30+i*.6)/scale,y:(70+30*Math.sin(i/25))/scale,p:.1+.85*i/200}));
  const stroke={brush:'xournal',width:2,color:'#263f43',hasPressure:true,points};
  const request={points:new Float64Array(points.flatMap(p=>[p.x,p.y,p.p])),width:stroke.width,hasPressure:true,color:0x263f43,pixelWidth:220,pixelHeight:150,scale,tx:0,ty:0};
  const rgba=native.raster(request);assert.equal(rgba.length,220*150*4);
  assert.ok(rgba.some((v,i)=>i%4===3&&v>0&&v<255),'Cairo produces partial pixel coverage');
  const svg=context.InkContent.strokePath(stroke);assert.ok(!/NaN|Infinity/.test(svg));
  const canvas=createCanvas(220,150),c=canvas.getContext('2d');c.scale(scale,scale);c.fill(new Path2D(svg));
  const exported=c.getImageData(0,0,220,150).data;
  let missing=0,ink=0;for(let i=3;i<rgba.length;i+=4){if(rgba[i]>200){ink++;if(exported[i]<100)missing++}}
  assert.ok(missing<=Math.max(2,ink*.01),'SVG adapter and C++ contour agree on the interior');
}
assert.throws(()=>native.raster({points:new Float64Array([NaN,1,1]),width:2,hasPressure:true}),/sample/);
assert.throws(()=>native.raster({points:new Float64Array(),width:2,hasPressure:true,pixelWidth:1e8,pixelHeight:1e8,scale:1,tx:0,ty:0,color:0}),/bounds/);
console.log('Passed native Cairo, subpixel HIMETRIC calibration, pressure contours, SVG interior parity and invalid-input guards.');
