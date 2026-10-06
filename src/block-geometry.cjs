// World-coordinate geometry shared by block ports, mxGraph edges and previews.
// No DOM or mutable document state belongs here.
const sides = Object.freeze({
  top: {x: .5, y: 0, nx: 0, ny: -1},
  right: {x: 1, y: .5, nx: 1, ny: 0},
  bottom: {x: .5, y: 1, nx: 0, ny: 1},
  left: {x: 0, y: .5, nx: -1, ny: 0}
});

function port(bounds, side) {
  const direction = sides[side];
  return bounds && direction ? {
    x: bounds.x + bounds.w * direction.x,
    y: bounds.y + bounds.h * direction.y,
    side
  } : null;
}

function nearestSide(bounds, point) {
  return Object.keys(sides).reduce((best, side) => {
    const a = port(bounds, side), b = port(bounds, best);
    return Math.hypot(a.x-point.x, a.y-point.y) < Math.hypot(b.x-point.x, b.y-point.y) ? side : best;
  }, 'top');
}

function routePorts(source, target, clearance = 24) {
  const a = sides[source.side], b = sides[target.side];
  if (!a || !b) throw Error('Invalid connection side');
  const start = {x: source.x+a.nx*clearance, y: source.y+a.ny*clearance};
  const end = {x: target.x+b.nx*clearance, y: target.y+b.ny*clearance};
  const points = [source, start];
  if (!!a.nx === !!b.nx) {
    if (a.nx) {
      const x = source.side === target.side ?
        (a.nx > 0 ? Math.max(start.x,end.x)+clearance : Math.min(start.x,end.x)-clearance) : (start.x+end.x)/2;
      points.push({x,y:start.y}, {x,y:end.y});
    } else {
      const y = source.side === target.side ?
        (a.ny > 0 ? Math.max(start.y,end.y)+clearance : Math.min(start.y,end.y)-clearance) : (start.y+end.y)/2;
      points.push({x:start.x,y}, {x:end.x,y});
    }
  } else {
    points.push(a.nx ? {x:end.x,y:start.y} : {x:start.x,y:end.y});
  }
  points.push(end, target);
  return points.filter((p,i) => !i || p.x !== points[i-1].x || p.y !== points[i-1].y)
    .map(({x,y})=>({x,y}));
}

function translated(bounds, dx, dy) {
  return {...bounds, x:bounds.x+dx, y:bounds.y+dy};
}

module.exports = {sides, port, nearestSide, routePorts, translated};
