import type { Draft, PhotoAnnotation } from "../types";

export function drawAnnotations(
  context: CanvasRenderingContext2D,
  annotations: PhotoAnnotation[],
  width: number,
  height: number,
) {
  context.save();
  context.strokeStyle = "#e00019";
  context.lineWidth = Math.max(3, Math.min(width, height) / 180);
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const annotation of annotations) {
    const points = annotation.points.map((p) => ({
      x: p.x * width,
      y: p.y * height,
    }));
    const first = points[0],
      last = points.at(-1);
    if (!first || !last) continue;
    context.beginPath();
    if (annotation.tool === "circle") {
      context.ellipse(
        (first.x + last.x) / 2,
        (first.y + last.y) / 2,
        Math.max(1, Math.abs(last.x - first.x) / 2),
        Math.max(1, Math.abs(last.y - first.y) / 2),
        0,
        0,
        Math.PI * 2,
      );
    } else {
      context.moveTo(first.x, first.y);
      if (annotation.tool === "freehand")
        points.forEach((p) => context.lineTo(p.x, p.y));
      else {
        context.lineTo(last.x, last.y);
        const angle = Math.atan2(last.y - first.y, last.x - first.x);
        const length = Math.min(
          Math.hypot(last.x - first.x, last.y - first.y) / 3,
          Math.min(width, height) / 18,
        );
        for (const offset of [-0.5, 0.5]) {
          context.moveTo(last.x, last.y);
          context.lineTo(
            last.x - length * Math.cos(angle + offset),
            last.y - length * Math.sin(angle + offset),
          );
        }
      }
    }
    context.stroke();
  }
  context.restore();
}

/** Keep the original Blob/Drive ID and all report assignments untouched. */
export function annotateDraftPhoto(
  draft: Draft,
  id: string,
  annotations: PhotoAnnotation[],
  annotatedBlob?: Blob,
): Draft {
  return {
    ...draft,
    photos: draft.photos.map((p) =>
      p.id === id ? { ...p, annotations, annotatedBlob } : p,
    ),
    report: {
      ...draft.report,
      photos: draft.report.photos?.map((p) => {
        if (p.id !== id) return p;
        const { annotatedDriveId: _previous, ...original } = p;
        return original;
      }),
    },
  };
}
