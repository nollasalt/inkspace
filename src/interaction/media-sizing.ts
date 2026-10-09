/** Text resizes its layout; visual media resizes its appearance. Legacy scale is preserved. */
export function resizeNote<
  T extends {
    x: number;
    y: number;
    kind?: string;
    width?: number;
    scale?: number;
    viewMode?: string;
    viewHeight?: number;
  },
>(note: T, factor: number, origin: { x: number; y: number }): T {
  const result = {
    ...note,
    x: origin.x + (note.x - origin.x) * factor,
    y: origin.y + (note.y - origin.y) * factor,
  };
  if (note.kind === "image") result.scale = (note.scale || 1) * factor;
  else {
    result.width = Math.max(160, Math.min(4000, (note.width || 320) * factor));
    if (note.viewMode === "window")
      result.viewHeight = Math.max(
        80,
        Math.min(1200, (note.viewHeight || 240) * factor),
      );
  }
  return result;
}
