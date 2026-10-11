import type { Rect } from "./geometry";

export interface Guide {
  axis: "x" | "y";
  value: number;
  from: number;
  to: number;
  spacing?: boolean;
}
/** Pure world-space snapping. Tolerance is constant in screen pixels. */
export function snapMove(
  bounds: Rect,
  dx: number,
  dy: number,
  targets: Rect[],
  scale: number,
  bypass = false,
): { x: number; y: number; guides: Guide[] } {
  if (bypass) return { x: dx, y: dy, guides: [] };
  const tolerance = 6 / scale,
    result = { x: dx, y: dy, guides: [] as Guide[] };
  for (const axis of ["x", "y"] as const) {
    const size = axis === "x" ? "w" : "h",
      cross = axis === "x" ? "y" : "x",
      extent = axis === "x" ? "h" : "w";
    const start = bounds[axis] + result[axis],
      length = bounds[size];
    let best = tolerance + 1e-9,
      correction = 0,
      guide: Guide | undefined;
    const offer = (
      distance: number,
      value: number,
      from: number,
      to: number,
      spacing = false,
    ) => {
      if (Math.abs(distance) < best) {
        best = Math.abs(distance);
        correction = distance;
        guide = { axis, value, from, to, spacing };
      }
    };
    for (const t of targets)
      for (const a of [0, 0.5, 1])
        for (const b of [0, 0.5, 1]) {
          const value = t[axis] + t[size] * b;
          offer(
            value - start - length * a,
            value,
            Math.min(bounds[cross] + result[cross], t[cross]),
            Math.max(
              bounds[cross] + result[cross] + bounds[extent],
              t[cross] + t[extent],
            ),
          );
        }
    // Equal gaps between the nearest neighbours in the same row/column.
    const neighbours = targets.filter(
      (t) =>
        t[cross] < bounds[cross] + result[cross] + bounds[extent] &&
        t[cross] + t[extent] > bounds[cross] + result[cross],
    );
    const left = neighbours
      .filter((t) => t[axis] + t[size] <= start + tolerance)
      .sort((a, b) => b[axis] + b[size] - a[axis] - a[size])[0];
    const right = neighbours
      .filter((t) => t[axis] >= start + length - tolerance)
      .sort((a, b) => a[axis] - b[axis])[0];
    if (left && right) {
      const target = (left[axis] + left[size] + right[axis] - length) / 2;
      offer(
        target - start,
        target + length / 2,
        bounds[cross] + result[cross],
        bounds[cross] + result[cross] + bounds[extent],
        true,
      );
    }
    result[axis] += correction;
    if (guide) result.guides.push(guide);
  }
  return result;
}
