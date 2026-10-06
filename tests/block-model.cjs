const assert=require('node:assert/strict'),model=require('../block-model.js'),geometry=require('../src/block-geometry.cjs'),{crosses}=require('../src/obstacle-router.cjs');
const document={pdfs:[{id:'asset',name:'test.pdf',data:'shared-bytes',pages:[{x:0,y:0,width:100,height:160},{x:0,y:160,width:100,height:160}]}]};
const old=document.pdfs[0],pages=model.pages(document);assert.equal(pages[1].pageIndex,1);model.updatePage(document,pages[1].id,p=>({...p,x:40}));assert.equal(old.pages[1].x,0);assert.equal(model.pages(document)[1].x,40);assert.equal(document.pdfs[0].data,old.data);model.removePages(document,[pages[0].id]);assert.equal(model.pages(document)[0].pageIndex,1);assert.equal(model.pages(document)[0].id,pages[1].id);assert.equal(model.fragment(document,[pages[1].id])[0].pages.length,1);
assert.equal(model.textFormat({kind:'html'}),'html');assert.equal(model.textFormat({}),'md');assert.equal(model.textFormat({format:'html'}),'html');
let checked=0;for(const side of ['top','right','bottom','left'])for(const targetSide of ['top','right','bottom','left']){
 const source={x:0,y:0,w:160,h:90},target={x:350,y:190,w:180,h:120},obstacle={x:190,y:45,w:100,h:150};
 const points=geometry.routePorts(geometry.port(source,side),geometry.port(target,targetSide),24,[source,target,obstacle]);
 for(let i=1;i<points.length;i++){assert(points[i].x===points[i-1].x||points[i].y===points[i-1].y);for(const r of [source,target,obstacle])assert(!crosses(points[i-1],points[i],r),side+'/'+targetSide+' crosses '+JSON.stringify(r));}checked++;
}
console.log(JSON.stringify({passed:true,immutablePageEdits:true,sharedBytes:true,deletedPageKeepsSourceIndex:true,legacyHtml:true,obstacleRoutes:checked}));

const inserted={pdfs:[]},before=inserted.pdfs;model.insertAssets(inserted,[old],true);assert.equal(before.length,0);const prior=inserted.pdfs;const aliases=model.insertAssets(inserted,[{...old,id:'copy',pages:[{...old.pages[0],id:'copy-page',pageIndex:0}]}],true);assert.equal(aliases.get('copy'),old.id);assert.equal(prior[0].pages.length,2);assert.equal(inserted.pdfs[0].pages.length,3);assert.equal(inserted.pdfs[0].data,old.data);
