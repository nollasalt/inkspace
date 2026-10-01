// Match a frame to its real DOM owner using postMessage identity, never rounded
// browser pen coordinates. Compose iframe CSS transforms back to HWND pixels.
const crypto=require('node:crypto');
function compose(child,owner,transform){
  const sx=owner.scaleX??owner.width/child.width,sy=owner.scaleY??owner.height/child.height;
  if(![sx,sy,owner.x,owner.y].every(Number.isFinite)||sx<=0||sy<=0)throw Error('Invalid frame geometry');
  return{x:owner.x+transform.x*sx,y:owner.y+transform.y*sy,sx:transform.sx*sx,sy:transform.sy*sy};
}
async function measureFrame(frame){
  const target=await frame.executeJavaScript('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
  let transform={x:0,y:0,sx:1,sy:1},current=frame,child=target;
  while(current.parent){
    const parent=current.parent,nonce=crypto.randomUUID(),proof=crypto.randomUUID();
    await current.executeJavaScript(`(()=>{const nonce=${JSON.stringify(nonce)},proof=${JSON.stringify(proof)};const listener=e=>{if(e.data?.inkspaceOwnerQuery===nonce){removeEventListener('message',listener);e.source.postMessage({inkspaceOwnerReply:proof},'*')}};addEventListener('message',listener);setTimeout(()=>removeEventListener('message',listener),2000)})()`);
    const owner=await parent.executeJavaScript(`new Promise((resolve,reject)=>{const nonce=${JSON.stringify(nonce)},proof=${JSON.stringify(proof)},frames=[];function visit(root){for(const element of root.querySelectorAll('*')){if(element.tagName==='IFRAME')frames.push(element);if(element.shadowRoot)visit(element.shadowRoot)}}visit(document);const timer=setTimeout(()=>{removeEventListener('message',listener);reject(Error('Cannot locate native frame owner ('+frames.length+' iframe elements)'))},1500);function listener(e){if(e.data?.inkspaceOwnerReply!==proof)return;const element=frames.find(f=>f.contentWindow===e.source);if(!element)return;clearTimeout(timer);removeEventListener('message',listener);const rect=element.getBoundingClientRect(),style=getComputedStyle(element),px=name=>parseFloat(style[name])||0,bl=px('borderLeftWidth'),br=px('borderRightWidth'),bt=px('borderTopWidth'),bb=px('borderBottomWidth'),pl=px('paddingLeft'),pr=px('paddingRight'),pt=px('paddingTop'),pb=px('paddingBottom'),w=px('width'),h=px('height'),outerW=w+(style.boxSizing==='border-box'?0:bl+br+pl+pr),outerH=h+(style.boxSizing==='border-box'?0:bt+bb+pt+pb),sx=rect.width/outerW,sy=rect.height/outerH;resolve({x:rect.left+(bl+pl)*sx,y:rect.top+(bt+pt)*sy,width:(outerW-bl-br-pl-pr)*sx,height:(outerH-bt-bb-pt-pb)*sy,scaleX:sx,scaleY:sy})}addEventListener('message',listener);for(const f of frames)f.contentWindow.postMessage({inkspaceOwnerQuery:nonce},'*')})`);
    transform=compose(child,owner,transform);current=parent;
    child=await parent.executeJavaScript('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
  }
  return{originX:transform.x*child.dpr,originY:transform.y*child.dpr,scaleX:transform.sx*child.dpr,scaleY:transform.sy*child.dpr,dpr:target.dpr,width:target.width,height:target.height};
}
function toFrame(sample,layout){return{...sample,x:(sample.x-layout.originX)/layout.scaleX*layout.dpr,y:(sample.y-layout.originY)/layout.scaleY*layout.dpr}}
function toRoot(point,layout){return{x:layout.originX+point.x*layout.scaleX,y:layout.originY+point.y*layout.scaleY}}
module.exports={measureFrame,toFrame,toRoot,compose};
