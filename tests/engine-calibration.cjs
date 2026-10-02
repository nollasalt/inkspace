const assert=require('node:assert/strict'),{fit,map}=require('../ink-engine/calibration.js');
// Includes rotated axes, translation and unequal scaling, then checks unseen points.
const transform=(x,y)=>({screenX:200+.03*y,screenY:-80+.02*x});
const matrix=fit([[100,200],[25000,31000],[100,31000]].map(([x,y])=>({x,y,...transform(x,y)})));
for(const [x,y]of [[12000,15000],[100,200],[30000,27000]]){const got=map(matrix,x,y),expected=transform(x,y);assert(Math.abs(got.x-expected.screenX)<1e-8);assert(Math.abs(got.y-expected.screenY)<1e-8)}
assert.throws(()=>fit([{x:0,y:0},{x:1,y:1},{x:2,y:2}]));console.log('Passed Raw HID affine mapping, rotation and degenerate calibration handling.');
