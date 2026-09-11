import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CloudUpload,
  Download,
  Edit3,
  FolderOpen,
  Image,
  MapPin,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Trash2,
  WandSparkles,
} from "lucide-react";
import type { ReportData, RoomReport } from "../types";
import { watchReports, saveReport, uid } from "../lib/reports";
import { getDraft, putDraft } from "../lib/local";
import {
  connectGoogle,
  driveToken,
  errorMessage,
  watchDriveSession,
  requestDriveSession,
} from "../lib/session";
import DefectOverview from "../components/DefectOverview";
import {
  analyzeDraft,
  backupDraft,
  restoreDraft,
  syncReport,
} from "../lib/workflow";
import { downloadDriveFile } from "../lib/drive";
import { REPORT_TAGS } from "../../shared/analysis";
import {
  Shell,
  Notice,
  Busy,
  Status,
  DriveLink,
  dateLabel,
  BlobImage,
} from "../components/UI";
import { reportToMarkdown } from "../lib/markdown";
function Photo({
  driveId,
  id,
  token,
}: {
  driveId?: string;
  id: string;
  token: string | null;
}) {
  const [blob, setBlob] = useState<Blob>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const retry = () => setAttempt((value) => value + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);
  useEffect(() => {
    let active = true;
    setBlob(undefined);
    setError("");
    if (driveId && token)
      downloadDriveFile(driveId, token)
        .then((b) => {
          if (active) setBlob(b);
        })
        .catch((e) => {
          if (active) setError(errorMessage(e));
        });
    return () => {
      active = false;
    };
  }, [driveId, token, attempt]);
  return (
    <div className="report-photo">
      {blob ? (
        <a
          href={`https://drive.google.com/file/d/${driveId}/view`}
          target="_blank"
          rel="noreferrer"
        >
          <BlobImage blob={blob} alt={`Befundfoto ${id}`} />
        </a>
      ) : (
        <div className="photo-placeholder">
          <Image size={25} />
          <span>
            {error ||
              (!driveId
                ? "Foto noch nicht in Drive"
                : !token
                  ? "Drive verbinden, um Foto zu laden"
                  : "Foto laden …")}
          </span>
          {error && token && (
            <button
              className="btn no-print"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Foto erneut laden
            </button>
          )}
        </div>
      )}
    </div>
  );
}
export default function ReportPage() {
  const { id } = useParams();
  const [report, setReport] = useState<ReportData>();
  const [edited, setEdited] = useState<ReportData>();
  const [viewMode, setViewMode] = useState<"edit" | "report">("edit");
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [token, setToken] = useState(driveToken);
  useEffect(
    () =>
      watchDriveSession(() => {
        setToken(driveToken());
        requestDriveSession();
      }),
    [],
  );
  const [activeRoom, setActiveRoom] = useState("all");
  const [tag, setTag] = useState("all");
  useEffect(
    () =>
      watchReports(
        (data, unsynced) => {
          setReport(data.find((r) => r.id === id));
          setDirty(unsynced.includes(id!));
          setLoading(false);
        },
        (e) => {
          setError(errorMessage(e));
          setLoading(false);
        },
      ),
    [id],
  );
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (edited || busy) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [edited, busy]);
  useEffect(() => {
    const guard = (event: MouseEvent) => {
      const anchor = (event.target as Element)?.closest?.("a");
      if (
        !anchor ||
        anchor.target === "_blank" ||
        new URL(anchor.href).origin !== window.location.origin
      )
        return;
      if (
        busy ||
        (edited && !window.confirm("Ungespeicherte Änderungen verwerfen?"))
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, [edited, busy]);
  useEffect(() => {
    let expanded: HTMLDetailsElement[] = [];
    const before = () => {
      expanded = Array.from(
        document.querySelectorAll<HTMLDetailsElement>(
          "details.transcript:not([open])",
        ),
      );
      expanded.forEach((section) => {
        section.open = true;
      });
    };
    const after = () => {
      expanded.forEach((section) => {
        section.open = false;
      });
      expanded = [];
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  const view = edited || report;
  const photos =
    view?.photos ||
    (view?.rawPhotoUrls || []).map((driveId, i) => ({
      id: `photo_${i}`,
      relativeTimeMs: null,
      driveId,
    }));
  const assigned = new Set(view?.rooms.flatMap((r) => r.photoIds) || []);
  const unassigned = photos.filter((p) => !assigned.has(p.id));
  async function connect() {
    setError("");
    setToken(null);
    try {
      const t = await connectGoogle();
      setToken(t);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function save(syncDrive: boolean) {
    if (!view || busy) return;
    const owner = uid();
    setBusy("Bericht speichern …");
    setError("");
    setNotice("");
    try {
      // Start the popup in the click gesture, but save locally even if it is cancelled.
      const connection = (
        syncDrive
          ? driveToken()
            ? Promise.resolve(driveToken())
            : connectGoogle()
          : Promise.resolve(null)
      )
        .then((t) => ({ token: t, error: null as unknown }))
        .catch((error) => ({ token: null, error }));
      const next = {
        ...view,
        updatedAt: new Date().toISOString(),
        ...(edited ? { driveSyncedAt: "" } : {}),
      };
      const warning = await saveReport(next);
      setReport(next);
      setDirty(!!warning);
      setEdited(undefined);
      const connected = await connection;
      if (uid() !== owner)
        throw new Error(
          "Das Google-Konto wurde gewechselt. Bitte den Bericht im ursprünglichen Konto öffnen.",
        );
      if (connected.error) {
        setNotice(
          warning ||
            "Änderungen lokal gespeichert. Drive kann später erneut verbunden werden.",
        );
        throw connected.error;
      }
      const t = connected.token;
      if (t) setToken(t);
      if (t) {
        const result = await syncReport(next, t);
        setReport(result.report);
        setDirty(!!result.warning);
        setNotice(
          result.warning ||
            "Bericht als Markdown und JSON in Drive gespeichert.",
        );
      } else
        setNotice(
          warning ||
            "Änderungen gespeichert. Für die Drive-Dateien bitte „In Drive speichern“ wählen.",
        );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  async function retry() {
    if (!report || busy) return;
    const owner = uid();
    setBusy("Aufnahmen laden …");
    setError("");
    setNotice("");
    try {
      const t = driveToken() || (await connectGoogle());
      setToken(t);
      if (uid() !== owner)
        throw new Error(
          "Das Google-Konto wurde gewechselt. Bitte den Bericht im ursprünglichen Konto öffnen.",
        );
      const local = await getDraft(owner, report.id);
      const d =
        local?.report.id === report.id && local.audio
          ? { ...local, report }
          : await restoreDraft(report, t);
      if (uid() !== owner)
        throw new Error("Das angemeldete Konto hat sich geändert.");
      if (local?.report.id === report.id) await backupDraft(d, t, setBusy);
      setBusy(
        "Räume und Befunde analysieren … Bitte diese Seite geöffnet lassen.",
      );
      const next = await analyzeDraft(d);
      if (uid() !== owner)
        throw new Error(
          "Das Google-Konto wurde gewechselt. Bitte den Bericht im ursprünglichen Konto öffnen.",
        );
      // Keep recovered results locally even if Drive/Firebase fails afterwards.
      await saveReport(next);
      setReport(next);
      if (local?.report.id === report.id)
        await putDraft(owner, { ...d, report: next });
      if (uid() !== owner)
        throw new Error(
          "Das angemeldete Konto hat sich geändert. Bitte erneut im ursprünglichen Konto öffnen.",
        );
      setBusy("Markdown-Bericht in Drive speichern …");
      const result = await syncReport(next, t);
      setReport(result.report);
      setDirty(!!result.warning);
      setNotice(
        result.warning ||
          "Analyse abgeschlossen und in Drive gespeichert. Bitte die Befunde prüfen.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  function roomChange(index: number, patch: Partial<RoomReport>) {
    if (view)
      setEdited({
        ...view,
        rooms: view.rooms.map((r, i) => (i === index ? { ...r, ...patch } : r)),
      });
  }
  async function changeDefectStatus(
    roomIndex: number,
    defectIndex: number,
    status: "open" | "done",
  ) {
    if (!view || busy) return;
    const defects = (view.rooms[roomIndex].defects || []).map((d, i) =>
      i === defectIndex ? { ...d, status } : d,
    );
    if (edited) {
      roomChange(roomIndex, { defects });
      return;
    }
    const next = {
      ...view,
      driveSyncedAt: "",
      rooms: view.rooms.map((r, i) =>
        i === roomIndex ? { ...r, defects } : r,
      ),
    };
    setBusy("Mängelstatus speichern …");
    setError("");
    setNotice("");
    try {
      const warning = await saveReport(next);
      setReport(next);
      setDirty(!!warning);
      setNotice(
        warning ||
          "Mängelstatus gespeichert. Die Drive-Dateien kannst du mit „In Drive speichern“ aktualisieren.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  function assignPhoto(photoId: string, roomIndex: number) {
    if (view)
      setEdited({
        ...view,
        rooms: view.rooms.map((r, i) => ({
          ...r,
          photoIds: [
            ...r.photoIds.filter((id) => id !== photoId),
            ...(i === roomIndex ? [photoId] : []),
          ],
        })),
      });
  }
  function download() {
    if (!view) return;
    const url = URL.createObjectURL(
      new Blob([reportToMarkdown(view)], {
        type: "text/markdown;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `begehung-${view.date.slice(0, 10)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (loading)
    return (
      <Shell>
        <Busy text="Bericht laden …" />
      </Shell>
    );
  if (!view)
    return (
      <Shell>
        {error && <Notice>{error}</Notice>}
        <div className="empty panel">
          <FolderOpen size={36} />
          <h1>Bericht nicht verfügbar</h1>
          <p className="muted">
            Prüfe deine Verbindung oder importiere den Bericht aus Drive unter
            „Speicherort“.
          </p>
          <Link className="btn" to="/dashboard">
            Zur Übersicht
          </Link>
        </div>
      </Shell>
    );
  return (
    <Shell
      actions={
        <Link className="btn btn-ghost" to="/dashboard">
          <ArrowLeft size={18} />
          Übersicht
        </Link>
      }
    >
      <fieldset
        disabled={!!busy}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <div className="report-title">
          <div className="split">
            <span className="eyebrow">
              BEGEHUNGSBERICHT / {dateLabel(view.date)}
            </span>
            <Status report={view} local={dirty} />
          </div>
          {edited && viewMode === "edit" ? (
            <input
              className="title-input"
              aria-label="Berichtstitel"
              value={view.title}
              onChange={(e) => setEdited({ ...view, title: e.target.value })}
            />
          ) : (
            <h1>{view.title}</h1>
          )}
          <div className="report-subline">
            <span>
              <MapPin size={16} />
              {view.rooms.length} Bereiche
            </span>
            <span>
              <Image size={16} />
              {photos.length} Fotos
            </span>
            <span>KI-Entwurf · bitte fachlich prüfen</span>
          </div>
        </div>
        <div className="report-actions no-print">
          <div className="actions">
            {edited ? (
              <>
                <button
                  className="btn btn-primary"
                  onClick={() => save(true)}
                  disabled={!!busy}
                >
                  <Save size={17} />
                  Speichern & Drive sichern
                </button>
                <button
                  className="btn"
                  onClick={() => save(false)}
                  disabled={!!busy}
                >
                  Auf diesem Gerät speichern
                </button>
                <button
                  className="btn"
                  disabled={!!busy}
                  onClick={() => setEdited(undefined)}
                >
                  Abbrechen
                </button>
              </>
            ) : (
              <button
                className="btn"
                onClick={() => {
                  setViewMode("edit");
                  setEdited(structuredClone(view));
                }}
                disabled={!!busy}
              >
                <Edit3 size={17} />
                Bearbeiten
              </button>
            )}
            <button
              className="btn"
              onClick={() => window.print()}
              disabled={viewMode !== "report"}
            >
              <Printer size={17} />
              PDF / Drucken
            </button>
            <button className="btn" onClick={download}>
              <Download size={17} />
              .md
            </button>
          </div>
          <div className="actions">
            {view.driveFolderId && <DriveLink id={view.driveFolderId} />}
            <button
              className="btn btn-primary"
              onClick={() => save(true)}
              disabled={!!busy}
            >
              <CloudUpload size={17} />
              In Drive speichern
            </button>
          </div>
        </div>
        {error && <Notice>{error}</Notice>}
        {notice && <Notice kind="info">{notice}</Notice>}
        {busy && <Busy text={busy} />}
        {view.status !== "completed" && (
          <div className="analysis-recovery panel no-print">
            <div>
              <span className="eyebrow">DEIN NÄCHSTER SCHRITT</span>
              <h2>
                {view.status === "error"
                  ? "Analyse erneut starten"
                  : "Aus der Aufnahme wird ein Bericht"}
              </h2>
              <p className="muted">
                {view.error ||
                  "Die KI ordnet die Aussagen und Fotos den genannten Räumen zu. Du kannst das Ergebnis anschließend bearbeiten."}
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={retry}
              disabled={!!busy || !!edited}
            >
              <WandSparkles size={18} />
              Bericht erstellen
            </button>
          </div>
        )}
        <section className="summary-panel">
          <span className="eyebrow">AUF EINEN BLICK</span>
          {edited && viewMode === "edit" ? (
            <textarea
              className="field"
              aria-label="Gesamtzusammenfassung"
              value={view.summary}
              onChange={(e) => setEdited({ ...view, summary: e.target.value })}
            />
          ) : (
            <p>{view.summary || "Noch keine Zusammenfassung erstellt."}</p>
          )}
        </section>
        {photos.length > 0 && (
          <div className="connect-photos no-print">
            <span>
              {token
                ? "Google Drive verbunden. Fotos werden automatisch geladen."
                : "Für die privaten Fotos ist eine Google-Drive-Bestätigung erforderlich."}
            </span>
            {!token && (
              <button className="btn" onClick={connect}>
                <RefreshCw size={16} />
                Google Drive verbinden
              </button>
            )}
          </div>
        )}
        <div className="actions no-print">
          <button
            className="btn"
            aria-pressed={viewMode === "edit"}
            onClick={() => setViewMode("edit")}
          >
            Bearbeiten
          </button>
          <button
            className="btn"
            aria-pressed={viewMode === "report"}
            onClick={() => setViewMode("report")}
          >
            Bericht
          </button>
        </div>
        <DefectOverview
          rooms={view.rooms}
          photos={photos}
          editing={viewMode === "edit"}
          onChange={(i, j, patch) => {
            if (!edited && patch.status)
              void changeDefectStatus(i, j, patch.status);
            else
              roomChange(i, {
                defects: view.rooms[i].defects!.map((d, k) =>
                  k === j ? { ...d, ...patch } : d,
                ),
              });
          }}
          renderPhoto={(photoId) => (
            <Photo
              id={photoId}
              driveId={photos.find((p) => p.id === photoId)?.driveId}
              token={token}
            />
          )}
        />
        <div
          className={`original-documentation ${viewMode === "report" ? "report-original" : ""}`}
        >
          <h2>Raumdokumentation</h2>
          <p className="muted">
            Ursprüngliche Befunde, Transkripte und Raumfotos bleiben vollständig
            erhalten.
          </p>
          {view.rooms.length > 0 && (
            <div className="report-body">
              <aside className="room-nav no-print">
                <span className="eyebrow">BEREICHE</span>
                <button
                  className={activeRoom === "all" ? "active" : ""}
                  onClick={() => setActiveRoom("all")}
                >
                  Alle Bereiche <span>{view.rooms.length}</span>
                </button>
                {view.rooms.map((r, i) => (
                  <button
                    key={i}
                    className={activeRoom === String(i) ? "active" : ""}
                    onClick={() => setActiveRoom(String(i))}
                  >
                    <span>
                      {String(i + 1).padStart(2, "0")} {r.name}
                    </span>
                    <span>{r.photoIds.length}</span>
                  </button>
                ))}
                <label className="field-label" htmlFor="tag-filter">
                  BEFUNDE FILTERN
                </label>
                <select
                  id="tag-filter"
                  className="field"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                >
                  <option value="all">Alle Tags</option>
                  {REPORT_TAGS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <p className="small muted">
                  Raumwechsel und Zuordnung basieren auf deinen gesprochenen
                  Beobachtungen.
                </p>
              </aside>
              <div className="rooms">
                {view.rooms.map((room, i) => {
                  const visible =
                    (activeRoom === "all" || activeRoom === String(i)) &&
                    (tag === "all" || room.tags?.includes(tag));
                  return (
                    <section
                      className={`panel room-section ${visible ? "" : "filtered-out"}`}
                      key={i}
                    >
                      <div className="room-heading">
                        <span className="room-number">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div>
                          {edited ? (
                            <input
                              className="field"
                              aria-label={`Raum ${i + 1} Name`}
                              value={room.name}
                              onChange={(e) =>
                                roomChange(i, { name: e.target.value })
                              }
                            />
                          ) : (
                            <h2>{room.name}</h2>
                          )}
                          <div className="tag-list">
                            {edited
                              ? REPORT_TAGS.map((t) => (
                                  <button
                                    key={t}
                                    className={`tag ${room.tags?.includes(t) ? "selected" : ""}`}
                                    aria-pressed={
                                      room.tags?.includes(t) || false
                                    }
                                    onClick={() =>
                                      roomChange(i, {
                                        tags: room.tags?.includes(t)
                                          ? room.tags.filter((v) => v !== t)
                                          : [...(room.tags || []), t],
                                      })
                                    }
                                  >
                                    {room.tags?.includes(t) && (
                                      <Check size={12} />
                                    )}{" "}
                                    {t}
                                  </button>
                                ))
                              : (room.tags || []).map((t) => (
                                  <span
                                    className={`tag tag-${t === "Mangel" ? "defect" : t === "Erledigt" ? "done" : "default"}`}
                                    key={t}
                                  >
                                    {t}
                                  </span>
                                ))}
                          </div>
                        </div>
                      </div>
                      <div className="defect-list">
                        <h3>Mängelstatus</h3>
                        {!room.defects?.length && (
                          <p className="small muted">
                            Noch keine einzelnen Mängel erfasst. Ergänze sie aus
                            dem Befund über „Mangel hinzufügen“.
                          </p>
                        )}
                        {(room.defects || []).map((defect, j) => (
                          <div className="defect-item" key={defect.id}>
                            {edited ? (
                              <input
                                className="field"
                                aria-label={`Mangel ${j + 1} in ${room.name}`}
                                value={defect.description}
                                onChange={(e) =>
                                  roomChange(i, {
                                    defects: room.defects!.map((d, k) =>
                                      k === j
                                        ? { ...d, description: e.target.value }
                                        : d,
                                    ),
                                  })
                                }
                              />
                            ) : (
                              <span>{defect.description}</span>
                            )}
                            <label className="defect-status no-print">
                              <span>Status</span>
                              <select
                                className="field"
                                aria-label={`Status Mangel ${j + 1} in ${room.name}`}
                                value={defect.status}
                                onChange={(e) =>
                                  changeDefectStatus(
                                    i,
                                    j,
                                    e.target.value as "open" | "done",
                                  )
                                }
                              >
                                <option value="open">Offen</option>
                                <option value="done">Erledigt</option>
                              </select>
                            </label>
                            <span className="defect-print-status">
                              {defect.status === "done" ? "Erledigt" : "Offen"}
                            </span>
                            {edited && (
                              <button
                                className="btn no-print"
                                aria-label={`Mangel ${j + 1} in ${room.name} entfernen`}
                                onClick={() =>
                                  roomChange(i, {
                                    defects: room.defects!.filter(
                                      (_, k) => k !== j,
                                    ),
                                  })
                                }
                              >
                                Entfernen
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          className="btn no-print"
                          onClick={() =>
                            roomChange(i, {
                              defects: [
                                ...(room.defects || []),
                                {
                                  id: crypto.randomUUID(),
                                  description: "Neuer Mangel",
                                  status: "open",
                                },
                              ],
                            })
                          }
                        >
                          <Plus size={16} /> Mangel hinzufügen
                        </button>
                      </div>
                      <label className="field-label">BEFUND</label>
                      {edited ? (
                        <textarea
                          className="field"
                          aria-label={`Befund ${room.name}`}
                          value={room.summary}
                          onChange={(e) =>
                            roomChange(i, { summary: e.target.value })
                          }
                        />
                      ) : (
                        <p className="room-summary">{room.summary}</p>
                      )}
                      <details
                        className="transcript"
                        open={!!edited || undefined}
                      >
                        <summary>Gesprochene Dokumentation</summary>
                        {edited ? (
                          <textarea
                            className="field"
                            aria-label={`Transkript ${room.name}`}
                            value={room.transcription}
                            onChange={(e) =>
                              roomChange(i, { transcription: e.target.value })
                            }
                          />
                        ) : (
                          <p>{room.transcription}</p>
                        )}
                      </details>
                      <div className="room-photos">
                        {room.photoIds.map((photoId) => {
                          const photo = photos.find((p) => p.id === photoId);
                          const legacy =
                            room.photoUrls?.[room.photoIds.indexOf(photoId)];
                          return (
                            <div key={photoId}>
                              <Photo
                                id={photoId}
                                driveId={photo?.driveId || legacy}
                                token={token}
                              />
                              {edited && (
                                <select
                                  className="field"
                                  aria-label="Foto zuordnen"
                                  value={i}
                                  onChange={(e) =>
                                    assignPhoto(photoId, Number(e.target.value))
                                  }
                                >
                                  <option value={-1}>Nicht zugeordnet</option>
                                  {view.rooms.map((r, j) => (
                                    <option value={j} key={j}>
                                      {r.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {edited && (
                        <button
                          className="btn btn-ghost danger"
                          onClick={() => {
                            setEdited({
                              ...view,
                              rooms: view.rooms.filter((_, j) => j !== i),
                            });
                            setActiveRoom("all");
                          }}
                        >
                          <Trash2 size={15} />
                          Bereich entfernen
                        </button>
                      )}
                    </section>
                  );
                })}
                {!view.rooms.some(
                  (r, i) =>
                    (activeRoom === "all" || activeRoom === String(i)) &&
                    (tag === "all" || r.tags?.includes(tag)),
                ) && (
                  <div className="empty panel no-print">
                    <h2>Keine Befunde mit diesem Filter</h2>
                    <button
                      className="btn"
                      onClick={() => {
                        setTag("all");
                        setActiveRoom("all");
                      }}
                    >
                      Filter zurücksetzen
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {edited && (
            <button
              className="btn no-print"
              onClick={() => {
                setEdited({
                  ...view,
                  rooms: [
                    ...view.rooms,
                    {
                      name: "Neuer Bereich",
                      summary: "",
                      transcription: "",
                      photoIds: [],
                      tags: [],
                    },
                  ],
                });
                setActiveRoom("all");
              }}
            >
              <Plus size={17} />
              Bereich hinzufügen
            </button>
          )}
          {unassigned.length > 0 && (
            <section className="panel unassigned">
              <span className="eyebrow">NOCH NICHT ZUGEORDNET</span>
              <h2>{unassigned.length} Fotos ohne eindeutigen Bereich</h2>
              <p className="muted">
                Im Bearbeitungsmodus kannst du diese Fotos einem Raum zuordnen.
              </p>
              <div className="room-photos">
                {unassigned.map((p) => (
                  <div key={p.id}>
                    <Photo id={p.id} driveId={p.driveId} token={token} />
                    {edited && (
                      <select
                        className="field"
                        aria-label="Foto einem Raum zuordnen"
                        value={-1}
                        onChange={(e) =>
                          assignPhoto(p.id, Number(e.target.value))
                        }
                      >
                        <option value={-1}>Bereich auswählen</option>
                        {view.rooms.map((r, i) => (
                          <option value={i} key={i}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </fieldset>
    </Shell>
  );
}
