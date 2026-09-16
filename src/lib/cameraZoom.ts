export function clampZoom(
  value: number,
  min: number,
  max: number,
  step = 0.01,
) {
  return Math.max(
    min,
    Math.min(max, min + Math.round((value - min) / step) * step),
  );
}
export function zoomCrop(width: number, height: number, zoom: number) {
  const w = width / Math.max(1, zoom),
    h = height / Math.max(1, zoom);
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}
