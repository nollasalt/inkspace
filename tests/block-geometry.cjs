const assert=require('node:assert/strict'),geometry=require('../src/block-geometry.cjs');
let cases=0;
for(const scale of [.05,.75,1,2,20])for(const sourceSide of Object.keys(geometry.sides))for(const targetSide of Object.keys(geometry.sides)){
 const source=geometry.port({x:-80*scale,y:35*scale,w:160*scale,h:90*scale},sourceSide),target=geometry.port({x:270*scale,y:170*scale,w:180*scale,h:110*scale},targetSide),route=geometry.routePorts(source,target),normal=geometry.sides[sourceSide],endNormal=geometry.sides[targetSide];
 for(let i=1;i<route.length;i++)assert(route[i].x===route[i-1].x||route[i].y===route[i-1].y,'Diagonal route');
 assert.equal(route[1].x-route[0].x,normal.nx*24);assert.equal(route[1].y-route[0].y,normal.ny*24);
 const last=route.at(-1),previous=route.at(-2);assert(Math.abs(previous.x-last.x-endNormal.nx*24)<1e-9);assert(Math.abs(previous.y-last.y-endNormal.ny*24)<1e-9);
 const moved=geometry.routePorts({...source,x:source.x+17,y:source.y-91},{...target,x:target.x+17,y:target.y-91});assert.equal(moved.length,route.length);for(let i=0;i<route.length;i++){assert(Math.abs(moved[i].x-route[i].x-17)<1e-9);assert(Math.abs(moved[i].y-route[i].y+91)<1e-9)}cases++;
}
console.log(JSON.stringify({passed:true,portPairs:cases,orthogonalEverySegment:true,outwardSource:true,inwardArrow:true,translationInvariant:true}));
