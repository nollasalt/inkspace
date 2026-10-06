// Orthogonal obstacle routing. Search only when the simple route is blocked.
function crosses(a,b,r){
  const epsilon=1e-7;
  if(Math.abs(a.x-b.x)<epsilon)return a.x>r.x+epsilon&&a.x<r.x+r.w-epsilon&&Math.max(a.y,b.y)>r.y+epsilon&&Math.min(a.y,b.y)<r.y+r.h-epsilon;
  if(Math.abs(a.y-b.y)<epsilon)return a.y>r.y+epsilon&&a.y<r.y+r.h-epsilon&&Math.max(a.x,b.x)>r.x+epsilon&&Math.min(a.x,b.x)<r.x+r.w-epsilon;
  return true;
}
function blocked(points,rects){return rects.some(r=>points.some((p,i)=>i&&crosses(points[i-1],p,r)))}
class MinHeap{
  constructor(){this.items=[]}
  push(entry){const a=this.items;let i=a.length;a.push(entry);while(i){const p=(i-1)>>1;if(a[p].cost<=entry.cost)break;a[i]=a[p];i=p}a[i]=entry}
  pop(){const a=this.items,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&a[child+1].cost<a[child].cost)child++;if(a[child].cost>=last.cost)break;a[i]=a[child];i=child}a[i]=last}return first}
}
function search(start,end,rects){
  const xs=[...new Set([start.x,end.x,...rects.flatMap(r=>[r.x,r.x+r.w])])].sort((a,b)=>a-b);
  const ys=[...new Set([start.y,end.y,...rects.flatMap(r=>[r.y,r.y+r.h])])].sort((a,b)=>a-b);
  const width=xs.length,total=width*ys.length,dist=new Float64Array(total*3);dist.fill(Infinity);
  const previous=new Int32Array(total*3);previous.fill(-1);
  const source=(ys.indexOf(start.y)*width+xs.indexOf(start.x))*3,target=ys.indexOf(end.y)*width+xs.indexOf(end.x);
  const point=node=>({x:xs[node%width],y:ys[Math.floor(node/width)]});
  const heap=new MinHeap();heap.push({id:source,cost:Math.abs(start.x-end.x)+Math.abs(start.y-end.y),g:0});dist[source]=0;
  while(heap.items.length){
    const {id,g:cost}=heap.pop();if(cost!==dist[id])continue;
    const node=Math.floor(id/3),direction=id%3,a=point(node);
    if(node===target){const path=[];for(let key=id;key>=0;key=previous[key])path.push(point(Math.floor(key/3)));return path.reverse()}
    const x=node%width,y=Math.floor(node/width);
    for(const [nx,ny,nextDirection]of [[x-1,y,1],[x+1,y,1],[x,y-1,2],[x,y+1,2]]){
      if(nx<0||ny<0||nx>=width||ny>=ys.length)continue;
      const next=ny*width+nx,b=point(next);if(rects.some(r=>crosses(a,b,r)))continue;
      const key=next*3+nextDirection,value=cost+Math.abs(a.x-b.x)+Math.abs(a.y-b.y)+(direction&&direction!==nextDirection?12:0);
      if(value<dist[key]){dist[key]=value;previous[key]=id;heap.push({id:key,g:value,cost:value+Math.abs(b.x-end.x)+Math.abs(b.y-end.y)})}
    }
  }
  return null;
}
function simplify(points){return points.filter((p,i)=>!i||i===points.length-1||!((points[i-1].x===p.x&&p.x===points[i+1].x)||(points[i-1].y===p.y&&p.y===points[i+1].y)))}
function avoidObstacles(points,obstacles){
  const endpoints=[points[1],points.at(-2)],contains=(r,p)=>p.x>r.x&&p.x<r.x+r.w&&p.y>r.y&&p.y<r.y+r.h;
  const rects=obstacles.filter(r=>r&&r.w>0&&r.h>0).map(r=>{const padded={...r,x:r.x-8,y:r.y-8,w:r.w+16,h:r.h+16};return endpoints.some(p=>contains(padded,p)&&!contains(r,p))?r:padded});
  const middle=points.slice(1,-1);if(!blocked(middle,rects))return points;
  // Iteratively include blockers; unrelated distant blocks do not enlarge the grid.
  const included=new Set();let route=middle;
  for(let pass=0;pass<=rects.length;pass++){
    for(const r of rects)if(blocked(route,[r]))included.add(r);
    const next=search(middle[0],middle.at(-1),[...included]);if(!next)return points;
    route=next;if(!blocked(route,rects))return[points[0],...simplify(route),points.at(-1)];
  }
  return points;
}
module.exports={avoidObstacles,crosses};
