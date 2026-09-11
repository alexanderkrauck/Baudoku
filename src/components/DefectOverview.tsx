import { useState, type ReactNode } from "react";
import type { Defect, RoomReport } from "../types";
import { groupDefects, UNASSIGNED_TRADE } from "../lib/defects";
import { tradeOptions } from "../lib/trades";

function TradeSelect({
  value,
  options,
  description,
  onChange,
}: {
  value: string;
  options: string[];
  description: string;
  onChange: (trade: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  return (
    <div className="trade-control">
      <label>
        Gewerk zuordnen
        <select
          className="field"
          aria-label={`Gewerk zuordnen: ${description}`}
          value={adding ? "+" : value}
          onChange={(e) => {
            if (e.target.value === "+") setAdding(true);
            else {
              setAdding(false);
              onChange(e.target.value);
            }
          }}
        >
          <option value="">Nicht zugeordnet</option>
          {options.map((t) => (
            <option key={t}>{t}</option>
          ))}
          <option value="+">+ neues Gewerk</option>
        </select>
      </label>
      {adding && (
        <div className="new-trade">
          <input
            className="field"
            aria-label="Neues Gewerk"
            placeholder="Name des Gewerks"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="btn"
            disabled={!name.trim()}
            onClick={() => {
              const existing = options.find(
                (t) =>
                  t.toLocaleLowerCase("de") ===
                  name.trim().toLocaleLowerCase("de"),
              );
              onChange(existing || name.trim());
              setAdding(false);
              setName("");
            }}
          >
            Übernehmen
          </button>
          <button className="btn" onClick={() => setAdding(false)}>
            Abbrechen
          </button>
        </div>
      )}
    </div>
  );
}
export default function DefectOverview({
  rooms,
  photos,
  editing,
  onChange,
  renderPhoto,
}: {
  rooms: RoomReport[];
  photos: { id: string }[];
  editing: boolean;
  onChange: (
    roomIndex: number,
    defectIndex: number,
    patch: Partial<Defect>,
  ) => void;
  renderPhoto: (id: string) => ReactNode;
}) {
  const [tradeFilter, setTradeFilter] = useState("all");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const groups = groupDefects(rooms);
  const options = tradeOptions(rooms);
  const visible = groups
    .filter((g) => tradeFilter === "all" || g.trade === tradeFilter)
    .map((g) => ({
      ...g,
      defects: g.defects.filter((d) => !onlyOpen || d.status === "open"),
    }))
    .filter((g) => g.defects.length);
  // Unassigned items are a dedicated work queue, with no inferred assignments.
  visible.sort((a, b) =>
    a.trade === UNASSIGNED_TRADE ? -1 : b.trade === UNASSIGNED_TRADE ? 1 : 0,
  );
  return (
    <section
      className={`trade-overview ${editing ? "edit-view" : "report-view"}`}
    >
      <div className="defect-filters no-print">
        <label>
          Gewerk
          <select
            className="field"
            aria-label="Gewerke filtern"
            value={tradeFilter}
            onChange={(e) => setTradeFilter(e.target.value)}
          >
            <option value="all">Alle Gewerke</option>
            <option value={UNASSIGNED_TRADE}>Noch zuzuordnen</option>
            {options.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            className="field"
            aria-label="Status filtern"
            value={onlyOpen ? "open" : "all"}
            onChange={(e) => setOnlyOpen(e.target.value === "open")}
          >
            <option value="all">Offen + erledigt</option>
            <option value="open">Nur offen</option>
          </select>
        </label>
      </div>
      <p className="report-filter-summary">
        {tradeFilter === "all" ? "Alle Gewerke" : tradeFilter} ·{" "}
        {onlyOpen ? "Nur offene Mängel" : "Offene und erledigte Mängel"}
      </p>
      {!visible.length && (
        <p className="muted">
          Keine einzelnen Mängel für diese Auswahl. Bestehende Raumtexte und
          Fotos bleiben in der Raumdokumentation erhalten.
        </p>
      )}
      {visible.map((group) => (
        <section
          className={`trade-group ${group.trade === UNASSIGNED_TRADE ? "unassigned-work" : ""}`}
          key={group.trade}
        >
          <h3>
            {group.trade === UNASSIGNED_TRADE
              ? "NOCH ZUZUORDNEN"
              : group.trade.toLocaleUpperCase("de")}{" "}
            – {group.defects.filter((d) => d.status === "open").length} offen
          </h3>
          {group.trade === UNASSIGNED_TRADE && editing && (
            <p className="small">
              Wähle direkt am Mangel ein Gewerk. Er wird anschließend
              automatisch einsortiert.
            </p>
          )}
          {group.defects.map((d) => {
            const key = `${d.roomIndex}-${d.id}`;
            const update = (patch: Partial<Defect>) =>
              onChange(d.roomIndex, d.defectIndex, patch);
            const original = rooms[d.roomIndex].defects![d.defectIndex];
            return (
              <article className="trade-defect" key={key}>
                <div className="trade-defect-content">
                  {editing ? (
                    <>
                      <div className="compact-fields">
                        <label>
                          Top / Raum
                          <input
                            className="field"
                            aria-label={`Top / Raum: ${d.description}`}
                            value={original.location ?? rooms[d.roomIndex].name}
                            onChange={(e) =>
                              update({ location: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Status
                          <select
                            className="field"
                            aria-label={`Status ${d.description}`}
                            value={d.status}
                            onChange={(e) =>
                              update({
                                status: e.target.value as "open" | "done",
                              })
                            }
                          >
                            <option value="open">Offen</option>
                            <option value="done">Erledigt</option>
                          </select>
                        </label>
                      </div>
                      <label>
                        Beschreibung
                        <textarea
                          rows={2}
                          className="field"
                          aria-label={`Beschreibung ${key}`}
                          value={d.description}
                          onChange={(e) =>
                            update({ description: e.target.value })
                          }
                        />
                      </label>
                      <TradeSelect
                        value={original.trade || ""}
                        options={options}
                        description={d.description}
                        onChange={(trade) =>
                          update({ trade, tradeSuggestion: undefined })
                        }
                      />
                      {!original.trade && original.tradeSuggestion && (
                        <p className="small">
                          KI-Vorschlag: {original.tradeSuggestion}{" "}
                          <button
                            className="btn"
                            onClick={() =>
                              update({
                                trade: original.tradeSuggestion,
                                tradeSuggestion: undefined,
                              })
                            }
                          >
                            Vorschlag bestätigen
                          </button>
                        </p>
                      )}
                      <details className="photo-assignment">
                        <summary>Fotos zuordnen ({d.photoIds.length})</summary>
                        <div>
                          {photos.map((photo, index) => (
                            <label key={photo.id}>
                              <input
                                type="checkbox"
                                checked={d.photoIds.includes(photo.id)}
                                onChange={(e) =>
                                  update({
                                    photoIds: e.target.checked
                                      ? [...d.photoIds, photo.id]
                                      : d.photoIds.filter(
                                          (id) => id !== photo.id,
                                        ),
                                  })
                                }
                              />{" "}
                              Foto {index + 1}
                            </label>
                          ))}
                        </div>
                      </details>
                    </>
                  ) : (
                    <>
                      <span className="defect-location">{d.location}</span>
                      <h4>{d.description}</h4>
                      <p className="defect-meta">
                        {d.trade} ·{" "}
                        <strong className={`defect-status-badge ${d.status}`}>
                          {d.status === "done" ? "ERLEDIGT" : "OFFEN"}
                        </strong>
                      </p>
                    </>
                  )}
                  <div className="print-only">
                    <strong>{d.location}</strong>
                    <p>{d.description}</p>
                    <span>
                      {d.trade} ·{" "}
                      <strong className={`defect-status-badge ${d.status}`}>
                        {d.status === "done" ? "ERLEDIGT" : "OFFEN"}
                      </strong>
                    </span>
                  </div>
                </div>
                <div className="defect-gallery">
                  {d.photoIds.length ? (
                    d.photoIds.map((id) => (
                      <figure key={id}>
                        {renderPhoto(id)}
                        <figcaption>
                          Foto {photos.findIndex((p) => p.id === id) + 1}
                        </figcaption>
                      </figure>
                    ))
                  ) : (
                    <p className="small muted">Keine Fotos zugeordnet</p>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      ))}
    </section>
  );
}
