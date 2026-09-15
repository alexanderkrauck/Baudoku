import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ReportData } from "../types";
import { defectIndex } from "../lib/defectIndex";
import { driveToken } from "../lib/session";
import { Photo } from "../pages/ReportPage";

export default function DefectRegister({
  reports,
  preview = false,
}: {
  reports: ReportData[];
  preview?: boolean;
}) {
  const [project, setProject] = useState("");
  const [trade, setTrade] = useState("");
  const [status, setStatus] = useState("");
  const [token, setToken] = useState(driveToken);
  useEffect(() => {
    const update = () => setToken(driveToken());
    window.addEventListener("baudoku:drive-session", update);
    window.addEventListener("focus", update);
    return () => {
      window.removeEventListener("baudoku:drive-session", update);
      window.removeEventListener("focus", update);
    };
  }, []);
  const rows = defectIndex(reports);
  const visible = rows.filter(
    (d) =>
      (!project || d.project === project) &&
      (!trade || d.trade === trade) &&
      (!status || d.status === status),
  );
  return (
    <section className="defect-register">
      <h2>Mängelübersicht</h2>
      <p className="muted">
        {visible.length} Mängel aus deinen geladenen Begehungen. Zum Bearbeiten
        die Begehung öffnen.
      </p>
      <div className="register-filters">
        <label>
          Projekt
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">Alle Projekte</option>
            {[...new Set(rows.map((d) => d.project))].sort().map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Gewerk
          <select value={trade} onChange={(e) => setTrade(e.target.value)}>
            <option value="">Alle Gewerke</option>
            {[...new Set(rows.map((d) => d.trade))].sort().map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Offen + erledigt</option>
            <option value="open">Offen</option>
            <option value="done">Erledigt</option>
          </select>
        </label>
      </div>
      <div className="register-table">
        <table>
          <thead>
            <tr>
              {[
                "Projekt",
                "Gewerk",
                "Top/Raum",
                "Beschreibung",
                "Status",
                "Foto",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((d) => (
              <tr key={d.key}>
                <td>
                  <Link to={preview ? "/__preview" : `/report/${d.reportId}`}>
                    {d.project}
                  </Link>
                </td>
                <td>{d.trade}</td>
                <td>{d.location}</td>
                <td>{d.description}</td>
                <td>
                  <span
                    className={`defect-status-badge ${d.status === "done" ? "done" : "open"}`}
                  >
                    {d.status === "done" ? "ERLEDIGT" : "OFFEN"}
                  </span>
                </td>
                <td>
                  {d.photos.map((p) =>
                    preview ? (
                      <img
                        key={p.id}
                        src={`/__preview-assets/${encodeURIComponent(p.id)}.jpg`}
                        alt="Befundfoto"
                      />
                    ) : (
                      <Photo
                        key={p.id}
                        id={p.id}
                        driveId={p.annotatedDriveId || p.driveId}
                        token={token}
                      />
                    ),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && <p>Keine Mängel für diese Auswahl vorhanden.</p>}
    </section>
  );
}
