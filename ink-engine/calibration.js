(function(root){
  function fit(points){
    if(points.length!==3)throw Error('Three calibration contacts required');
    const [a,b,c]=points,d=a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y);
    if(Math.abs(d)<1)throw Error('Calibration points must form a triangle');
    const solve=k=>[(a[k]*(b.y-c.y)+b[k]*(c.y-a.y)+c[k]*(a.y-b.y))/d,(a[k]*(c.x-b.x)+b[k]*(a.x-c.x)+c[k]*(b.x-a.x))/d,(a[k]*(b.x*c.y-c.x*b.y)+b[k]*(c.x*a.y-a.x*c.y)+c[k]*(a.x*b.y-b.x*a.y))/d];
    return {x:solve('screenX'),y:solve('screenY')};
  }
  function map(matrix,x,y){return{x:matrix.x[0]*x+matrix.x[1]*y+matrix.x[2],y:matrix.y[0]*x+matrix.y[1]*y+matrix.y[2]}}
  const api={fit,map};if(typeof module==='object')module.exports=api;else root.InkCalibration=api;
})(typeof window==='object'?window:globalThis);
