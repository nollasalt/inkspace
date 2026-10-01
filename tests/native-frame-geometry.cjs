const assert=require('node:assert/strict'),{compose,toFrame,toRoot}=require('../vscode-native/frame-geometry.cjs');
// A border offset and two differently scaled parent frames at 150% display DPI.
const inner=compose({width:600,height:400},{x:1.25,y:2.5,width:720,height:480},{x:0,y:0,sx:1,sy:1});
const outer=compose({width:1000,height:800},{x:250.5,y:90.25,width:1250,height:1000},inner);
assert.deepEqual(outer,{x:252.0625,y:93.375,sx:1.5,sy:1.5});
const layout={originX:outer.x*1.5,originY:outer.y*1.5,scaleX:2.25,scaleY:2.25,dpr:1.5};
const mapped=toFrame({x:500.125,y:300.375,p:.4375,precise:true},layout);
assert(Math.abs(mapped.x/1.5-54.236111111111114)<1e-10);assert(Math.abs(mapped.y/1.5-71.25)<1e-10);assert.equal(mapped.p,.4375);assert.equal(mapped.precise,true);
for(const scale of [.75,1,1.25,1.5,2,3]){const m={...layout,scaleX:scale,scaleY:scale,dpr:scale};const values=Array.from({length:300},(_,i)=>toRoot({x:11.123+i*.0192,y:-5.234+i*.0275},m));assert.equal(new Set(values.map(p=>p.x)).size,300);for(let i=0;i<300;i++){const p=toFrame({...values[i],p:.5},m);assert(Math.abs(p.x/m.dpr-(11.123+i*.0192))<1e-10)}}
assert.throws(()=>compose({width:0,height:1},{x:0,y:0,width:1,height:1},{x:0,y:0,sx:1,sy:1}),/geometry/);
// innerWidth is rounded; fractional iframe clipping must never scale pen data.
assert.deepEqual(compose({width:541,height:401},{x:.125,y:.375,width:540.5,height:400.5,scaleX:1,scaleY:1},{x:0,y:0,sx:1,sy:1}),{x:.125,y:.375,sx:1,sy:1});
console.log('Passed nested frame borders/scales, independent physical pixel mapping, subpixel preservation and invalid geometry rejection.');
