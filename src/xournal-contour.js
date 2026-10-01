// Solid pressure contour adapted from Xournal++ StrokeContour.cpp.
// Copyright Xournal++ contributors. GNU GPL v2 or later; see native/UPSTREAM.md.
// This SVG adapter keeps exports/browser previews consistent with native Cairo.
const pi=Math.PI,half=pi/2,wrap=t=>t>pi?t-2*pi:t< -pi?t+2*pi:t;
export function xournalStrokePath(stroke,raw=stroke.points){
  const points=[];
  for(const p of raw){
    const q={x:p.x,y:p.y,z:stroke.width*(stroke.hasPressure===false?1:Math.max(.001,p.p))},a=points.at(-1);
    if(a&&a.x===q.x&&a.y===q.y){a.z=Math.max(a.z,q.z);continue}
    if(a){const steps=Math.min(256,Math.max(1,Math.ceil(Math.abs(q.z-a.z)/.3)));for(let j=1;j<steps;j++){const t=j/steps;points.push({x:a.x+(q.x-a.x)*t,y:a.y+(q.y-a.y)*t,z:a.z+(q.z-a.z)*t})}}
    points.push(q);
  }
  if(!points.length)return '';
  let d='',started=false;
  const line=(x,y)=>{d+=`${started?'L':'M'} ${x} ${y} `;started=true};
  const arc=(x,y,r,a,b)=>{
    while(b<a)b+=2*pi;const delta=Math.min(2*pi,b-a);line(x+r*Math.cos(a),y+r*Math.sin(a));
    if(delta>=2*pi-1e-12){const m=a+pi;d+=`A ${r} ${r} 0 1 1 ${x+r*Math.cos(m)} ${y+r*Math.sin(m)} A ${r} ${r} 0 1 1 ${x+r*Math.cos(a)} ${y+r*Math.sin(a)} `}
    else if(delta>0)d+=`A ${r} ${r} 0 ${delta>pi?1:0} 1 ${x+r*Math.cos(b)} ${y+r*Math.sin(b)} `;
  };
  const chord=(x,y,r,a,b)=>{line(x+r*Math.cos(a),y+r*Math.sin(a));line(x+r*Math.cos(b),y+r*Math.sin(b))};
  const before=(x,y,r,a,b)=>{arc(x,y,r,a,b);line(x,y)},after=(x,y,r,a,b)=>{line(x,y);arc(x,y,r,a,b)};
  if(points.length===1){const p=points[0];arc(p.x,p.y,p.z/2,0,2*pi);return d+'Z'}
  const angle=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x),ops=[];
  let a=angle(points[0],points[1]);arc(points[0].x,points[0].y,points[0].z/2,a+half,a-half);
  for(let i=1;i<points.length-1;i++){
    const p1=points[i-1],p2=points[i],p3=points[i+1],n1=Math.hypot(p1.x-p2.x,p1.y-p2.y),n3=Math.hypot(p3.x-p2.x,p3.y-p2.y),a1=angle(p2,p1),a3=angle(p2,p3),z1=p1.z;
    if(z1<p2.z){
      if(.5*p2.z<n1||.5*p2.z<=Math.hypot(.5*z1,n1)){
        const ai=Math.asin(z1/p2.z),a=wrap(a1+ai),b=wrap(a3-half);
        (wrap(a3-a1)<=0||wrap(b-a)>0?arc:chord)(p2.x,p2.y,.5*p2.z,a,b);
        const bp=wrap(a1-ai),ap=wrap(a3+half);ops.push([wrap(a3-a1)>=0||wrap(bp-ap)>0?arc:chord,p2.x,p2.y,.5*p2.z,ap,bp]);
      }else{line(p2.x,p2.y);arc(p2.x,p2.y,.5*p2.z,a1,a3-half);ops.push([before,p2.x,p2.y,.5*p2.z,a3+half,a1])}
    }else{
      if(.5*z1<n3||.5*z1<=Math.hypot(.5*p2.z,n3)){
        const ao=Math.asin(p2.z/z1),a=wrap(a1+half),b=wrap(a3-ao);
        (wrap(a3-a1)<=0||wrap(b-a)>0?arc:chord)(p2.x,p2.y,.5*z1,a,b);
        const bp=wrap(a1-half),ap=wrap(a3+ao);ops.push([wrap(a3-a1)>=0||wrap(bp-ap)>0?arc:chord,p2.x,p2.y,.5*z1,ap,bp]);
      }else{arc(p2.x,p2.y,.5*z1,a1+half,a3);line(p2.x,p2.y);ops.push([after,p2.x,p2.y,.5*z1,a3,a1-half])}
    }
  }
  const end=points.at(-1),prev=points.at(-2);a=angle(end,prev);arc(end.x,end.y,prev.z/2,a+half,a-half);
  for(const [f,...args] of ops.reverse())f(...args);
  return d+'Z';
}
