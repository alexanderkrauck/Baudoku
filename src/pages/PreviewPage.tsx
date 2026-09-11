import { useEffect, useState } from "react";
import DefectOverview from "../components/DefectOverview";
import ReportHeader from "../components/ReportHeader";
import ReportFooter from "../components/ReportFooter";
import type { ReportData } from "../types";

/** Development-only, isolated in-memory preview. Never writes to Firebase or Drive. */
export default function PreviewPage() {
  const [report, setReport] = useState<ReportData>();
  const [editing, setEditing] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/__preview-assets/report.json")
      .then((r) => {
        if (!r.ok)
          throw new Error(
            "Die lokalen Preview-Daten sind noch nicht vorbereitet.",
          );
        return r.json();
      })
      .then(setReport)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <div className="preview-banner no-print">
        DEVELOPMENT-PREVIEW · Änderungen nur in dieser Ansicht · Live-Daten
        bleiben unverändert
      </div>
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "24px" }}>
        {report ? <ReportHeader report={report} /> : <h1>Begehung laden</h1>}
        {error && <p role="alert">{error}</p>}
        {report && (
          <>
            <details className="no-print">
              <summary>Zusammenfassung anzeigen</summary>
              <p className="muted">{report.summary}</p>
            </details>
            <div className="split no-print">
              <p>
                Gewerke, Top/Raum, Status und Fotozuordnung ausprobieren. Die
                Beispielzuordnung ist eine lokale Kopie deines Berichts.
              </p>
              <div className="actions">
                <button
                  className="btn"
                  aria-pressed={editing}
                  onClick={() => setEditing(true)}
                >
                  Bearbeiten
                </button>
                <button
                  className="btn"
                  aria-pressed={!editing}
                  onClick={() => setEditing(false)}
                >
                  Bericht
                </button>
                {!editing && (
                  <button
                    className="btn btn-primary"
                    onClick={() => window.print()}
                  >
                    PDF / Drucken
                  </button>
                )}
              </div>
            </div>
            <DefectOverview
              rooms={report.rooms}
              photos={report.photos || []}
              editing={editing}
              onChange={(i, j, patch) =>
                setReport(
                  (current) =>
                    current && {
                      ...current,
                      rooms: current.rooms.map((r, index) =>
                        index === i
                          ? {
                              ...r,
                              defects: r.defects!.map((d, index) =>
                                index === j ? { ...d, ...patch } : d,
                              ),
                            }
                          : r,
                      ),
                    },
                )
              }
              renderPhoto={(id) => (
                <img
                  src={`/__preview-assets/${encodeURIComponent(id)}.jpg`}
                  alt={`Befundfoto ${id}`}
                />
              )}
            />
            {!editing && <ReportFooter date={report.date} />}
            <details className="no-print">
              <summary>
                Ursprüngliche Raumdokumentation ({report.rooms.length} Bereiche)
              </summary>
              {report.rooms.map((room, i) => (
                <section className="panel" key={i}>
                  <h3>{room.name}</h3>
                  <p>{room.summary}</p>
                  <p>{room.transcription}</p>
                </section>
              ))}
            </details>
          </>
        )}
      </main>
    </>
  );
}
