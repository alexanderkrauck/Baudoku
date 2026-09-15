import { useEffect, useRef, useState } from "react";
import type { CapturedPhoto, PhotoAnnotation } from "../types";
import { drawAnnotations } from "../lib/annotations";
import "./photo-annotator.css";

export default function PhotoAnnotator({
  photo,
  onSave,
  onClose,
}: {
  photo: CapturedPhoto;
  onSave: (annotations: PhotoAnnotation[], blob?: Blob) => Promise<void>;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const stroke = useRef<PhotoAnnotation | null>(null);
  const pointer = useRef<number | null>(null);
  const [annotations, setAnnotations] = useState(photo.annotations || []);
  const [tool, setTool] = useState<PhotoAnnotation["tool"]>("arrow");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function paint(extra?: PhotoAnnotation) {
    const target = canvas.current,
      source = image.current;
    const context = target?.getContext("2d");
    if (!target || !source || !context) return;
    context.clearRect(0, 0, target.width, target.height);
    context.drawImage(source, 0, 0, target.width, target.height);
    drawAnnotations(
      context,
      extra ? [...annotations, extra] : annotations,
      target.width,
      target.height,
    );
  }
  useEffect(() => {
    const url = URL.createObjectURL(photo.blob);
    const source = new Image();
    source.onload = () => {
      if (!canvas.current) return;
      image.current = source;
      canvas.current.width = source.naturalWidth;
      canvas.current.height = source.naturalHeight;
      paint();
      setError("");
      setReady(true);
    };
    source.onerror = () =>
      setError(
        "Dieses Bild kann hier nicht markiert werden. Das Original bleibt erhalten.",
      );
    source.src = url;
    return () => {
      source.onload = null;
      source.onerror = null;
      URL.revokeObjectURL(url);
    };
  }, [photo.blob]);
  useEffect(() => {
    paint();
  }, [annotations]);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const blob = annotations.length
        ? await new Promise<Blob>((resolve, reject) =>
            canvas.current?.toBlob(
              (value) =>
                value
                  ? resolve(value)
                  : reject(new Error("Bild konnte nicht gespeichert werden.")),
              "image/jpeg",
              0.94,
            ),
          )
        : undefined;
      await onSave(annotations, blob);
      onClose();
    } catch {
      setError(
        "Markierung noch nicht gespeichert. Bitte erneut auf Fertig tippen. Das Original bleibt erhalten.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <section
      className="photo-annotator"
      role="dialog"
      aria-modal="true"
      aria-label="Foto markieren"
    >
      <header>
        <div>
          <strong>Mangel markieren</strong>
          <small>Original bleibt unverändert.</small>
        </div>
        <button className="btn" onClick={onClose} disabled={saving}>
          Abbrechen
        </button>
      </header>
      <div className="annotation-tools">
        {(
          [
            ["arrow", "Pfeil"],
            ["circle", "Kreis"],
            ["freehand", "Freihand"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className="btn"
            aria-pressed={tool === value}
            onClick={() => setTool(value)}
            disabled={saving}
          >
            {label}
          </button>
        ))}
        <button
          className="btn"
          onClick={() => setAnnotations((a) => a.slice(0, -1))}
          disabled={!annotations.length || saving}
        >
          Rückgängig
        </button>
        <button
          className="btn"
          onClick={() => setAnnotations([])}
          disabled={!annotations.length || saving}
        >
          Zurücksetzen
        </button>
      </div>
      <div className="annotation-stage">
        <canvas
          ref={canvas}
          aria-label="Auf dem Foto mit dem Finger zeichnen"
          onPointerDown={(e) => {
            if (!ready || saving || pointer.current !== null) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            pointer.current = e.pointerId;
            stroke.current = { tool, points: [point(e)] };
          }}
          onPointerMove={(e) => {
            if (!stroke.current || pointer.current !== e.pointerId) return;
            const p = point(e);
            stroke.current.points =
              tool === "freehand"
                ? [...stroke.current.points, p]
                : [stroke.current.points[0], p];
            paint(stroke.current);
          }}
          onPointerUp={(e) => {
            if (pointer.current !== e.pointerId) return;
            const completed = stroke.current;
            if (completed && completed.points.length > 1)
              setAnnotations((a) => [...a, completed]);
            stroke.current = null;
            pointer.current = null;
          }}
          onPointerCancel={() => {
            stroke.current = null;
            pointer.current = null;
            paint();
          }}
        />
      </div>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button
          className="btn btn-primary"
          onClick={() => void save()}
          disabled={!ready || saving}
        >
          {saving ? "Markierung sichern …" : "Fertig"}
        </button>
      </footer>
    </section>
  );
}
