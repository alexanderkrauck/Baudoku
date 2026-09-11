import { useEffect, useState } from "react";
import DefectOverview from "../components/DefectOverview";
import type { ReportData } from "../types";

/** Development-only, isolated in-memory preview. Never writes to Firebase or Drive. */
export default function PreviewPage() {
  const [report, setReport] = useState<ReportData>();
  const [editing, setEditing] = useState(false);
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
      <div className="preview-banner">
        DEVELOPMENT-PREVIEW · Änderungen nur in dieser Ansicht · Live-Daten
        bleiben unverändert
      </div>
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "24px" }}>
        <span className="eyebrow">BAUDOKU / TESTVERSION</span>
        <h1>{report?.title || "Begehung laden"}</h1>
        {error && <p role="alert">{error}</p>}
        {report && (
          <>
            <p className="muted">{report.summary}</p>
            <div className="split">
              <p>
                Gewerke, Top/Raum, Status und Fotozuordnung ausprobieren. Die
                Beispielzuordnung ist eine lokale Kopie deines Berichts.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => setEditing(!editing)}
              >
                {editing ? "Bearbeitung fertig" : "Felder bearbeiten"}
              </button>
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
            <details>
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
