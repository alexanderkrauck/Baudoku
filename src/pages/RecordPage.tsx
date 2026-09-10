import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  Check,
  Download,
  Mic,
  Pause,
  Play,
  Square,
  Trash2,
  Upload,
  WandSparkles,
  CloudUpload,
} from "lucide-react";
import { Shell, Notice, BlobImage, AudioPreview, Busy } from "../components/UI";
import { getDraft, putDraft, deleteDraft } from "../lib/local";
import { uid, saveReport } from "../lib/reports";
import { errorMessage, connectGoogle, driveToken } from "../lib/session";
import { analyzeDraft, backupDraft, syncReport } from "../lib/workflow";
import {
  MAX_FILE_BYTES,
  MAX_PHOTOS,
  audioExtension,
} from "../../shared/analysis";
import type { Draft } from "../types";
import DriveSettings from "../components/DriveSettings";
import { RecordingClock, reconcileDraftPhotos } from "../lib/recording";
const fresh = (): Draft => ({
  report: {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    title: "",
    summary: "",
    rooms: [],
    status: "pending",
  },
  photos: [],
});
export const formatTime = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, "0")}`;
export default function RecordPage() {
  const navigate = useNavigate();
  const [accountId] = useState(uid);
  const [draft, setDraft] = useState<Draft>(fresh);
  const current = useRef(draft);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<
    "ready" | "recording" | "paused" | "review"
  >("ready");
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const clock = useRef(new RecordingClock());
  const operation = useRef(false);
  const revision = useRef(0);
  const photoTime = useRef<number | null>(0);
  const queue = useRef(Promise.resolve());
  const active = useRef(true);
  const photoInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const elapsedNow = () => clock.current.read();
  const persist = (next: Draft) => {
    current.current = next;
    const writeRevision = ++revision.current;
    if (active.current) {
      setDraft(next);
      setSaved(false);
    }
    queue.current = queue.current
      .catch(() => {})
      .then(() => putDraft(accountId, next));
    queue.current
      .then(() => {
        if (active.current && writeRevision === revision.current)
          setSaved(true);
      })
      .catch(() => {
        if (active.current)
          setError(
            "Lokales Speichern fehlgeschlagen. Bitte die Aufnahme herunterladen und freien Gerätespeicher prüfen.",
          );
      });
    return queue.current;
  };
  useEffect(() => {
    active.current = true;
    let cancelled = false;
    getDraft(accountId)
      .then((d) => {
        if (d && !cancelled) {
          current.current = d;
          setDraft(d);
          setState(d.audio ? "review" : "ready");
          setDuration(d.report.durationMs || 0);
          clock.current.reset(d.report.durationMs || 0);
          setSaved(true);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const timer = setInterval(() => {
      if (recorder.current?.state === "recording") setDuration(elapsedNow());
    }, 250);
    const unload = (e: BeforeUnloadEvent) => {
      if (
        (recorder.current && recorder.current.state !== "inactive") ||
        current.current.audio
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      cancelled = true;
      active.current = false;
      clearInterval(timer);
      window.removeEventListener("beforeunload", unload);
      clock.current.pause();
      if (recorder.current) {
        if (recorder.current.state !== "inactive") recorder.current.stop();
        recorder.current.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);
  async function start() {
    if (operation.current) return;
    operation.current = true;
    let stream: MediaStream | undefined;
    setBusy("Mikrofon vorbereiten …");
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "Aufnahme wird in diesem Browser nicht unterstützt. Bitte eine Audiodatei importieren oder einen aktuellen Browser über HTTPS verwenden.",
        );
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!active.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const mime = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(stream, {
          ...(mime ? { mimeType: mime } : {}),
          audioBitsPerSecond: 64000,
        });
      } catch (e) {
        stream.getTracks().forEach((t) => t.stop());
        throw e;
      }
      recorder.current = rec;
      chunks.current = [];
      clock.current.reset();
      rec.ondataavailable = (e) => {
        if (!e.data.size) return;
        chunks.current.push(e.data);
        const audio = new Blob(chunks.current, {
          type: rec.mimeType || e.data.type,
        });
        void persist({
          ...current.current,
          audio,
          report: { ...current.current.report, durationMs: elapsedNow() },
        }).catch(() => {});
        if (audio.size > MAX_FILE_BYTES - 512000 && rec.state !== "inactive") {
          if (active.current)
            setWarning(
              "Die maximale Aufnahmegröße ist erreicht. Die Aufnahme wurde beendet.",
            );
          stop();
        }
      };
      rec.onerror = () => {
        if (active.current)
          setError(
            "Die Aufnahme wurde unterbrochen. Prüfe die bisher gespeicherte Aufnahme.",
          );
        if (rec.state !== "inactive") stop();
        else {
          clock.current.pause();
          stream?.getTracks().forEach((t) => t.stop());
          if (active.current) setState("review");
        }
      };
      rec.onstop = () => {
        const finalDuration = clock.current.pause();
        stream?.getTracks().forEach((t) => t.stop());
        if (current.current.audio)
          void persist({
            ...current.current,
            report: { ...current.current.report, durationMs: finalDuration },
          }).catch(() => {});
        if (active.current) {
          setDuration(finalDuration);
          setState("review");
        }
      };
      rec.start(5000);
      clock.current.resume();
      setState("recording");
      setDuration(0);
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      if (active.current)
        setError(
          (e as Error).name === "NotAllowedError"
            ? "Mikrofonzugriff nicht erlaubt. Bitte in den Browser-Einstellungen freigeben oder Audio importieren."
            : errorMessage(e),
        );
    } finally {
      operation.current = false;
      if (active.current) setBusy("");
    }
  }
  function pause() {
    const rec = recorder.current;
    if (!rec) return;
    if (rec.state === "recording") {
      const time = clock.current.pause();
      rec.pause();
      rec.requestData();
      setState("paused");
      setDuration(time);
    } else if (rec.state === "paused") {
      clock.current.resume();
      rec.resume();
      setState("recording");
    }
  }
  function stop() {
    const rec = recorder.current;
    if (!rec || rec.state === "inactive") return;
    const time = clock.current.pause();
    if (active.current) setDuration(time);
    rec.stop();
  }
  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setError("");
    try {
      if (current.current.photos.length + files.length > MAX_PHOTOS)
        throw new Error(`Maximal ${MAX_PHOTOS} Fotos pro Begehung.`);
      const photos = [];
      for (const file of Array.from(files)) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
          throw new Error(
            "Bitte JPG-, PNG- oder WebP-Fotos verwenden. HEIC vorher als JPG exportieren.",
          );
        if (file.size > 10 * 1024 * 1024)
          throw new Error("Ein Foto darf maximal 10 MB groß sein.");
        photos.push({
          id: `photo_${crypto.randomUUID()}`,
          blob: file,
          relativeTimeMs: photoTime.current,
        });
      }
      await persist(
        reconcileDraftPhotos(current.current, [
          ...current.current.photos,
          ...photos,
        ]),
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function importAudio(file?: File) {
    if (!file || operation.current) return;
    setError("");
    if (
      file.size > MAX_FILE_BYTES ||
      !file.size ||
      ![
        "audio/webm",
        "audio/mp4",
        "audio/mpeg",
        "audio/wav",
        "audio/x-wav",
        "audio/ogg",
        "audio/aac",
        "audio/flac",
      ].includes(file.type)
    ) {
      setError(
        "Bitte eine Audiodatei bis 25 MB wählen (WebM, M4A, MP3, WAV, Ogg, AAC oder FLAC).",
      );
      return;
    }
    // The in-memory audio remains downloadable even if IndexedDB is full.
    clock.current.reset();
    setDuration(0);
    setState("review");
    await persist({
      ...current.current,
      audio: file,
      report: { ...current.current.report, durationMs: 0 },
    });
  }
  async function process(analyze: boolean) {
    if (!current.current.audio || operation.current) return;
    operation.current = true;
    setError("");
    setWarning("");
    setBusy("Google Drive verbinden …");
    try {
      // Invoke OAuth directly within the click gesture and lock out duplicate runs.
      const token = driveToken() || (await connectGoogle());
      if (!active.current || uid() !== accountId) return;
      setBusy("Entwurf lokal sichern …");
      await queue.current.catch(() => {});
      if (!active.current) return;
      let d = reconcileDraftPhotos(current.current, current.current.photos);
      d.report.title ||= `Begehung vom ${new Date(d.report.date).toLocaleDateString("de-AT")}`;
      await persist(d);
      if (!active.current || uid() !== accountId) return;
      const cloudWarning = await saveReport(d.report);
      if (cloudWarning) setWarning(cloudWarning);
      if (!active.current || uid() !== accountId) return;
      await backupDraft(d, token, setBusy);
      await persist({ ...d });
      if (!active.current) return;
      if (analyze) {
        setBusy(
          "Räume, Befunde und Fotos analysieren … Bitte diese Seite geöffnet lassen.",
        );
        try {
          const result = await analyzeDraft(d);
          d = { ...d, report: result };
          await persist(d);
        } catch (e) {
          d = {
            ...d,
            report: { ...d.report, status: "error", error: errorMessage(e) },
          };
          await persist(d);
          if (!active.current || uid() !== accountId) throw e;
          await saveReport(d.report);
          try {
            if (!active.current || uid() !== accountId) throw e;
            await syncReport(d.report, token);
          } catch {
            /* primary analysis error remains visible */
          }
          throw e;
        }
      }
      if (!active.current) return;
      setBusy("Bericht in Google Drive speichern …");
      const result = await syncReport(d.report, token);
      await persist({ ...d, report: result.report });
      if (result.warning) setWarning(result.warning);
      await deleteDraft(accountId);
      current.current = fresh();
      if (active.current) navigate(`/report/${result.report.id}`);
    } catch (e) {
      if (active.current) setError(errorMessage(e));
    } finally {
      operation.current = false;
      if (active.current) setBusy("");
    }
  }
  async function discard() {
    if (
      !window.confirm(
        "Diesen lokalen Entwurf einschließlich der Aufnahme verwerfen? Bereits in Drive gespeicherte Dateien bleiben erhalten.",
      )
    )
      return;
    await queue.current.catch(() => {});
    await deleteDraft(accountId);
    const d = fresh();
    current.current = d;
    setDraft(d);
    setState("ready");
    clock.current.reset();
    setDuration(0);
    setError("");
    setWarning("");
    setSaved(false);
  }
  function download() {
    if (!draft.audio) return;
    const url = URL.createObjectURL(draft.audio);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aufnahme.${audioExtension(draft.audio.type)}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (loading)
    return (
      <Shell>
        <Busy text="Lokalen Entwurf laden …" />
      </Shell>
    );
  const recording = state === "recording" || state === "paused";
  return (
    <Shell
      actions={
        <button
          className="btn btn-ghost"
          disabled={recording || !!busy}
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeft size={18} />
          Übersicht
        </button>
      }
    >
      <div className="record-heading">
        <span className="eyebrow">NEUE BEGEHUNG</span>
        <div className="steps">
          <span className={state !== "review" ? "active" : ""}>
            01 Aufnahme
          </span>
          <i />
          <span className={state === "review" ? "active" : ""}>
            02 Prüfen & sichern
          </span>
          <i />
          <span>03 Bericht</span>
        </div>
      </div>
      {error && <Notice>{error}</Notice>}
      {warning && <Notice kind="info">{warning}</Notice>}
      <div className="record-layout">
        <section className="panel capture-panel">
          <label className="field-label" htmlFor="title">
            PROJEKT / BEGEHUNG
          </label>
          <input
            id="title"
            className="title-input"
            placeholder="z. B. Wohnhaus · Begehung EG"
            value={draft.report.title}
            disabled={!!busy}
            onChange={(e) => {
              void persist({
                ...current.current,
                report: {
                  ...current.current.report,
                  title: e.target.value,
                  projectName: e.target.value,
                },
              }).catch(() => {});
            }}
          />
          <div
            className={`recorder ${state === "recording" ? "is-recording" : ""}`}
          >
            <span className="badge">
              <span className="status-dot" />
              {state === "ready"
                ? "BEREIT FÜR DEINEN RUNDGANG"
                : state === "recording"
                  ? "AUFNAHME LÄUFT"
                  : state === "paused"
                    ? "AUFNAHME PAUSIERT"
                    : saved
                      ? "AUFNAHME LOKAL GESPEICHERT"
                      : "AUFNAHME ZUM PRÜFEN"}
            </span>
            <div className="timer">{formatTime(duration)}</div>
            <div className="waveform" aria-hidden="true">
              {Array.from({ length: 35 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    height: `${10 + ((i * 17 + 9) % 48)}px`,
                    animationDelay: `${i * 0.04}s`,
                  }}
                />
              ))}
            </div>
            <p>
              {state === "review"
                ? "Hör kurz rein. Danach kann die KI deinen Bericht erstellen."
                : "Nenne den Raum und beschreibe, was du siehst."}
            </p>
            {state === "ready" ? (
              <button
                className="record-button"
                onClick={start}
                disabled={!!busy}
                aria-label="Aufnahme starten"
              >
                <Mic size={30} />
              </button>
            ) : recording ? (
              <div className="record-controls">
                <button
                  className="btn btn-dark"
                  onClick={pause}
                  aria-label={
                    state === "paused"
                      ? "Aufnahme fortsetzen"
                      : "Aufnahme pausieren"
                  }
                >
                  {state === "paused" ? <Play /> : <Pause />}
                  {state === "paused" ? "Fortsetzen" : "Pause"}
                </button>
                <button
                  className="record-button stop"
                  onClick={stop}
                  aria-label="Aufnahme beenden"
                >
                  <Square size={25} fill="currentColor" />
                </button>
              </div>
            ) : (
              draft.audio && <AudioPreview blob={draft.audio} />
            )}
          </div>
          <div className="capture-footer">
            <span className="small muted">
              {saved ? (
                <>
                  <Check size={15} /> Entwurf lokal gespeichert
                </>
              ) : (
                "Entwurf wird auf diesem Gerät gesichert"
              )}
            </span>
            {state === "ready" && (
              <button
                className="btn btn-ghost"
                disabled={!!busy}
                onClick={() => audioInput.current?.click()}
              >
                <Upload size={16} />
                Audio importieren
              </button>
            )}
            {state === "review" && (
              <button className="btn btn-ghost" onClick={download}>
                <Download size={16} />
                Audio herunterladen
              </button>
            )}
          </div>
          <input
            type="file"
            ref={audioInput}
            hidden
            accept="audio/*"
            onChange={(e) => {
              void importAudio(e.target.files?.[0]).catch((e) =>
                setError(errorMessage(e)),
              );
              e.target.value = "";
            }}
          />
        </section>
        <aside className="record-aside">
          <section className="panel photo-panel">
            <div className="split">
              <h2>
                Fotos <span className="count">{draft.photos.length}</span>
              </h2>
              <Camera size={20} />
            </div>
            <p className="muted small">
              Während der Aufnahme erhalten Fotos einen Zeitstempel für die
              Raumzuordnung.
            </p>
            <div className="photo-grid">
              {draft.photos.map((p, i) => (
                <figure key={p.id}>
                  <BlobImage blob={p.blob} alt={`Baustellenfoto ${i + 1}`} />
                  <figcaption>
                    {p.relativeTimeMs === null
                      ? "Ohne Zeitstempel"
                      : formatTime(p.relativeTimeMs)}
                  </figcaption>
                  <button
                    aria-label={`Foto ${i + 1} entfernen`}
                    disabled={!!busy}
                    onClick={() => {
                      void persist(
                        reconcileDraftPhotos(
                          current.current,
                          current.current.photos.filter((v) => v.id !== p.id),
                        ),
                      ).catch(() => {});
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </figure>
              ))}
            </div>
            <button
              className="btn photo-add"
              disabled={
                state === "ready" || !!busy || draft.photos.length >= MAX_PHOTOS
              }
              onClick={() => {
                photoTime.current = state === "review" ? null : elapsedNow();
                photoInput.current?.click();
              }}
            >
              <Camera size={19} />
              Foto hinzufügen
            </button>
            <input
              type="file"
              capture="environment"
              accept="image/jpeg,image/png,image/webp"
              hidden
              ref={photoInput}
              onChange={(e) => {
                void addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </section>
          <div className="record-tip">
            <span className="eyebrow">EIN GUTER BEFUND BEGINNT SO</span>
            <p>
              „Ich bin jetzt im Wohnzimmer. An der Nordwand ist ein Riss neben
              dem Fenster.“
            </p>
            <span className="muted small">
              Raumwechsel laut ansagen. Details fotografieren. Den Rest
              strukturieren wir zusammen.
            </span>
          </div>
        </aside>
      </div>
      {busy && <Busy text={busy} />}
      {state === "review" && (
        <div className="review-actions">
          <div>
            <h2>Bereit für den Bericht?</h2>
            <p className="muted">
              Originale zuerst in Drive sichern. Danach Räume und Befunde mit KI
              aufbereiten.
            </p>
            <button
              className="text-button"
              onClick={() => setSettings(!settings)}
              disabled={!!busy}
            >
              Speicherort in Drive wählen
            </button>
          </div>
          <div className="actions">
            <button
              className="btn"
              disabled={!!busy}
              onClick={() => process(false)}
            >
              <CloudUpload size={18} />
              Nur sichern
            </button>
            <button
              className="btn btn-primary"
              disabled={!!busy}
              onClick={() => process(true)}
            >
              <WandSparkles size={18} />
              Bericht erstellen
            </button>
          </div>
        </div>
      )}
      {settings && <DriveSettings />}
      {!recording && (
        <button
          className="btn btn-ghost danger"
          disabled={!!busy}
          onClick={() => void discard().catch((e) => setError(errorMessage(e)))}
        >
          <Trash2 size={16} />
          Entwurf verwerfen
        </button>
      )}
    </Shell>
  );
}
