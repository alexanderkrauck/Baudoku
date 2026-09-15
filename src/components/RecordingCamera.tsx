import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import "./recording-camera.css";
import { clampZoom, zoomCrop } from "../lib/cameraZoom";

export default function RecordingCamera({
  onCapture,
  onClose,
  onFallback,
}: {
  onCapture: (blob: Blob) => Promise<void> | void;
  onClose: () => void;
  onFallback: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const dialog = useRef<HTMLElement>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  const callbacks = useRef({ onCapture, onClose, onFallback });
  callbacks.current = { onCapture, onClose, onFallback };
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const update = () => {
      const box = preview.current,
        source = video.current;
      if (!box || !source?.videoWidth) return;
      const scale = Math.min(
        box.clientWidth / source.videoWidth,
        box.clientHeight / source.videoHeight,
      );
      setFrame({
        width: source.videoWidth * scale,
        height: source.videoHeight * scale,
      });
    };
    const observer = new ResizeObserver(update);
    if (preview.current) observer.observe(preview.current);
    update();
    return () => observer.disconnect();
  }, [ready]);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");
  const trackRef = useRef<MediaStreamTrack | undefined>(undefined);
  const [zoom, setZoom] = useState(1);
  const [zoomBusy, setZoomBusy] = useState(false);
  const changingZoom = useRef(false);
  const [range, setRange] = useState({
    min: 1,
    max: 4,
    step: 0.05,
    hardware: false,
  });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const changeZoom = async (value: number) => {
    if (changingZoom.current || busy.current) return;
    const next = clampZoom(value, range.min, range.max, range.step);
    changingZoom.current = true;
    setZoomBusy(true);
    try {
      if (range.hardware)
        await trackRef.current?.applyConstraints({
          advanced: [{ zoom: next } as MediaTrackConstraintSet],
        });
      if (mounted.current) setZoom(next);
    } catch {
      if (mounted.current)
        setError(
          "Dieser Zoomwert wird von der Kamera nicht unterstützt. Bitte einen anderen Wert wählen.",
        );
    } finally {
      changingZoom.current = false;
      if (mounted.current) setZoomBusy(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let stream: MediaStream | undefined;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error("unsupported");
        // This stream belongs exclusively to the camera. Never request or stop audio here.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (video.current) {
          const track = stream.getVideoTracks()[0];
          trackRef.current = track;
          const capability = (
            track.getCapabilities?.() as MediaTrackCapabilities & {
              zoom?: { min: number; max: number; step: number };
            }
          )?.zoom;
          if (capability && capability.max > capability.min) {
            setRange({ ...capability, hardware: true });
            setZoom(
              (track.getSettings() as MediaTrackSettings & { zoom?: number })
                .zoom || capability.min,
            );
          }
          video.current.srcObject = stream;
          await video.current.play();
        }
      } catch {
        stream?.getTracks().forEach((track) => track.stop());
        if (!disposed)
          setError(
            "Kamera nicht verfügbar. Erlaube den Kamerazugriff oder wähle ein vorhandenes Foto.",
          );
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busy.current) callbacks.current.onClose();
      }
      if (event.key === "Tab") {
        const buttons = Array.from(
          dialog.current?.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ) || [],
        );
        const first = buttons[0],
          last = buttons.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialog.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === dialog.current)
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    void start();
    return () => {
      disposed = true;
      mounted.current = false;
      stream?.getTracks().forEach((track) => track.stop());
      if (video.current) video.current.srcObject = null;
      document.removeEventListener("keydown", onKey);
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  const capture = async () => {
    const source = video.current;
    if (
      !source?.videoWidth ||
      !source.videoHeight ||
      busy.current ||
      changingZoom.current
    )
      return;
    busy.current = true;
    setCapturing(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(
        1,
        1920 / Math.max(source.videoWidth, source.videoHeight),
      );
      canvas.width = Math.round(source.videoWidth * scale);
      canvas.height = Math.round(source.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas-unavailable");
      const crop = zoomCrop(
        source.videoWidth,
        source.videoHeight,
        range.hardware ? 1 : zoom,
      );
      context.drawImage(
        source,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) =>
            result ? resolve(result) : reject(new Error("capture-failed")),
          "image/jpeg",
          0.92,
        );
      });
      if (!mounted.current) return;
      await callbacks.current.onCapture(blob);
      if (mounted.current) callbacks.current.onClose();
    } catch {
      if (mounted.current)
        setError(
          "Foto konnte nicht übernommen werden. Bitte versuche es erneut.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setCapturing(false);
    }
  };

  return (
    <section
      className="walk-camera-view"
      role="dialog"
      aria-modal="true"
      aria-label="Foto aufnehmen"
      ref={dialog}
      tabIndex={-1}
    >
      <header className="walk-camera-header">
        <div>
          <span>BEGEHUNG</span>
          <h2>Foto aufnehmen</h2>
        </div>
        <button
          type="button"
          aria-label="Kamera schließen"
          onClick={onClose}
          disabled={capturing}
        >
          <X size={24} />
        </button>
      </header>
      <div
        className="walk-camera-preview"
        ref={preview}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2)
            pinch.current = { distance: distance(), zoom };
        }}
        onPointerMove={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pinch.current?.distance && pointers.current.size === 2)
            void changeZoom(
              (pinch.current.zoom * distance()) / pinch.current.distance,
            );
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
        }}
      >
        <div
          className="walk-camera-image"
          style={frame.width ? frame : { width: "100%", height: "100%" }}
        >
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            aria-label="Live-Kamerabild"
            style={{ transform: range.hardware ? undefined : `scale(${zoom})` }}
            onCanPlay={() => setReady(true)}
          />
        </div>
        {!ready && !error && (
          <div className="walk-camera-loading" role="status">
            <Loader2 className="spin" size={28} />
            <span>Kamera wird geöffnet …</span>
          </div>
        )}
        {error && (
          <div className="walk-camera-error" role="alert">
            {error}
          </div>
        )}
      </div>
      <footer className="walk-camera-controls">
        <label className="camera-zoom">
          {range.hardware ? "Kamera-Zoom" : "Digitaler Zoom"} ·{" "}
          {zoom.toFixed(1)}×
          <input
            aria-label="Kamera-Zoom"
            type="range"
            min={range.min}
            max={range.max}
            step={range.step}
            value={zoom}
            onChange={(e) => void changeZoom(Number(e.target.value))}
            disabled={!ready || capturing}
          />
        </label>
        <div>
          <button
            type="button"
            className="walk-camera-library"
            onClick={onFallback}
            disabled={capturing}
          >
            <ImagePlus size={23} />
            <span>Fotos wählen</span>
          </button>
          <button
            type="button"
            className="walk-camera-shutter"
            aria-label="Foto jetzt aufnehmen"
            onClick={() => void capture()}
            disabled={!ready || capturing || zoomBusy}
          >
            {capturing ? (
              <Loader2 className="spin" size={28} />
            ) : (
              <Camera size={30} />
            )}
          </button>
          <span className="walk-camera-balance" aria-hidden="true" />
        </div>
      </footer>
    </section>
  );
}
