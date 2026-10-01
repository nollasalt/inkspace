// New strokes preserve every input coordinate and pressure. The corridor is
// retained only for documents written by the older, quantized input pipeline.
import {xournalStrokePath} from './xournal-contour.js';
const radius=(s,p)=>s.width*(.35+.65*p)/2;
const number=v=>Number(v.toPrecision(15)),xy=p=>`${number(p.x)} ${number(p.y)}`;
const circle=(p,r)=>`M ${number(p.x+r)} ${number(p.y)} A ${number(r)} ${number(r)} 0 1 0 ${number(p.x-r)} ${number(p.y)} A ${number(r)} ${number(r)} 0 1 0 ${number(p.x+r)} ${number(p.y)} Z`;
function contour(s,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(s.brush==='raw-contour'?length===0:length<1e-12)return{d:circle(b,radius(s,b.p)),outline:[]};
  const nx=-dy/length,ny=dx/length,ra=radius(s,a.p),rb=radius(s,b.p);
  if(s.brush==='raw-contour'){
    // Envelope of a moving disc: join the external tangents, not perpendicular
    // offsets (which leave shoulders when the pressure changes rapidly).
    if(length<=Math.abs(rb-ra))return{d:circle(ra>=rb?a:b,Math.max(ra,rb)),outline:[]};
    const slope=(ra-rb)/length,h=Math.sqrt(Math.max(0,1-slope*slope)),ux=dx/length,uy=dy/length;
    const n1={x:ux*slope+nx*h,y:uy*slope+ny*h},n2={x:ux*slope-nx*h,y:uy*slope-ny*h};
    const ps=[{x:a.x+n1.x*ra,y:a.y+n1.y*ra},{x:b.x+n1.x*rb,y:b.y+n1.y*rb},{x:b.x+n2.x*rb,y:b.y+n2.y*rb},{x:a.x+n2.x*ra,y:a.y+n2.y*ra}];
    return{d:`M ${xy(ps[0])} L ${xy(ps[1])} A ${number(rb)} ${number(rb)} 0 ${rb>ra?1:0} 0 ${xy(ps[2])} L ${xy(ps[3])} A ${number(ra)} ${number(ra)} 0 ${ra>rb?1:0} 0 ${xy(ps[0])} Z`,outline:ps.map(p=>[p.x,p.y])};
  }
  const outline=[{x:a.x+nx*ra,y:a.y+ny*ra},{x:b.x+nx*rb,y:b.y+ny*rb},{x:b.x-nx*rb,y:b.y-ny*rb},{x:a.x-nx*ra,y:a.y-ny*ra}];
  return{d:`M ${xy(outline[0])} L ${xy(outline[1])} L ${xy(outline[2])} L ${xy(outline[3])} Z ${circle(a,ra)} ${circle(b,rb)}`,outline:outline.map(p=>[p.x,p.y])};
}
const unwrap=(angle,reference)=>{while(angle-reference>Math.PI)angle-=2*Math.PI;while(angle-reference< -Math.PI)angle+=2*Math.PI;return angle};
export function createStrokeState(stroke){
  const scale=stroke.inputScale??(stroke.step ? .05/stroke.step : 1);
  return{stroke,points:[],vertices:[],tolerance:stroke.brush!=='raw-contour'&&scale<.5?1.25/scale:0,anchor:null,tip:null,lo:-Infinity,hi:Infinity,reference:null,xx:0,xy:0,yy:0};
}
function resetRun(state,anchor){state.anchor=anchor;state.tip=anchor;state.lo=-Infinity;state.hi=Infinity;state.reference=null;state.xx=state.xy=state.yy=0}
function fittedTip(state){
  if(state.reference===null)return state.tip;
  let angle=unwrap(.5*Math.atan2(2*state.xy,state.xx-state.yy),state.reference);angle=Math.max(state.lo,Math.min(state.hi,angle));
  const length=Math.hypot(state.tip.x-state.anchor.x,state.tip.y-state.anchor.y);
  return{x:state.anchor.x+Math.cos(angle)*length,y:state.anchor.y+Math.sin(angle)*length,p:state.tip.p};
}
function extend(state,q){
  const x=q.x-state.anchor.x,y=q.y-state.anchor.y,length=Math.hypot(x,y),t=state.tolerance;
  let angle=Math.atan2(y,x);if(state.reference!==null)angle=unwrap(angle,state.reference);
  const half=length>t?Math.asin(Math.min(1,t/length)):Math.PI;
  const lo=Math.max(state.lo,angle-half),hi=Math.min(state.hi,angle+half);
  const reversal=state.reference!==null&&x*Math.cos(state.reference)+y*Math.sin(state.reference)< -t;
  if(lo>hi||reversal||(state.tip!==state.anchor&&Math.abs(q.p-state.anchor.p)>.2))return false;
  state.lo=lo;state.hi=hi;if(state.reference===null&&length>t)state.reference=angle;
  state.xx+=x*x;state.xy+=x*y;state.yy+=y*y;state.tip=q;return true;
}
export function appendStrokePoint(state,raw){
  if(state.stroke.brush==='raw-contour'){
    const last=state.points.at(-1);
    if(last&&raw.x===last.x&&raw.y===last.y&&raw.p===last.p)return '';
    const q={...raw};state.points.push(q);state.vertices.push(q);resetRun(state,q);
    return last?contour(state.stroke,last,q).d:circle(q,radius(state.stroke,q.p));
  }
  const last=state.points.at(-1);if(last&&Math.hypot(raw.x-last.x,raw.y-last.y)<Math.min(state.stroke.step??.05,.05))return '';
  const q={...raw};if(last){const distance=Math.hypot(q.x-last.x,q.y-last.y),alpha=1-Math.exp(-distance/Math.max(.08,state.stroke.width*.12));q.p=last.p+alpha*(q.p-last.p)}state.points.push(q);
  if(!state.anchor){resetRun(state,q);state.vertices.push(q);return circle(q,radius(state.stroke,q.p))}
  if(!state.tolerance){const d=contour(state.stroke,state.tip,q).d;state.vertices.push(q);resetRun(state,q);return d}
  if(extend(state,q))return '';
  const end=fittedTip(state),d=contour(state.stroke,state.anchor,end).d;state.vertices.push(end);resetRun(state,end);extend(state,q);return d;
}
export function strokeTailPoints(state){return state.anchor?[state.anchor,fittedTip(state)]:[]}
export function strokeTailPath(state){if(state.stroke.brush==='raw-contour')return '';const pts=strokeTailPoints(state);return pts.length?contour(state.stroke,pts[0],pts[1]).d:''}
export function strokePath(stroke,points=stroke.points){if(stroke.brush==='xournal')return xournalStrokePath(stroke,points);const state=createStrokeState(stroke);let d='';for(const p of points)d+=appendStrokePoint(state,p)+' ';return d+strokeTailPath(state)}
export function strokeOutline(stroke,points=stroke.points){const state=createStrokeState(stroke);for(const p of points)appendStrokePoint(state,p);if(!state.tip)return [];const ps=[...state.vertices,fittedTip(state)],out=[];for(let i=1;i<ps.length;i++)out.push(...contour(stroke,ps[i-1],ps[i]).outline);return out}
