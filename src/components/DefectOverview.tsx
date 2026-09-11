import type { ReactNode } from "react";
import type { Defect, RoomReport } from "../types";
import { groupDefects } from "../lib/defects";

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
  const groups = groupDefects(rooms);
  const count = groups.reduce((n, g) => n + g.defects.length, 0);
  const done = groups.reduce(
    (n, g) => n + g.defects.filter((d) => d.status === "done").length,
    0,
  );
  return (
    <section className="trade-overview">
      <div className="split">
        <div>
          <span className="eyebrow">MÄNGEL NACH GEWERKEN</span>
          <h2>Was ist noch zu tun?</h2>
        </div>
        <span className="tag">
          {count - done} offen · {done} erledigt
        </span>
      </div>
      {!count && (
        <p className="muted">
          Dieser ältere Bericht enthält noch keine einzeln erfassten Mängel. Die
          ursprünglichen Befunde und Fotos stehen vollständig unter
          „Raumdokumentation“. Dort kannst du einzelne Mängel ergänzen.
        </p>
      )}
      {groups.map((group) => (
        <section className="trade-group panel" key={group.trade}>
          <div className="split">
            <h3>{group.trade}</h3>
            <span className="small muted">{group.defects.length} Mängel</span>
          </div>
          {group.defects.map((d) => {
            const key = `${d.roomIndex}-${d.id}`;
            const update = (patch: Partial<Defect>) =>
              onChange(d.roomIndex, d.defectIndex, patch);
            return (
              <article
                className={`trade-defect ${d.status === "done" ? "is-done" : ""}`}
                key={key}
              >
                <div className="trade-defect-content">
                  {editing ? (
                    <div className="defect-fields">
                      <label>
                        Gewerk
                        <input
                          className="field"
                          aria-label={`Gewerk ${key}`}
                          defaultValue={
                            rooms[d.roomIndex].defects![d.defectIndex].trade ||
                            ""
                          }
                          placeholder="Nicht zugeordnet"
                          onBlur={(e) => update({ trade: e.target.value })}
                        />
                      </label>
                      <label>
                        Top / Raum
                        <input
                          className="field"
                          aria-label={`Top / Raum ${key}`}
                          value={
                            rooms[d.roomIndex].defects![d.defectIndex]
                              .location ?? rooms[d.roomIndex].name
                          }
                          onChange={(e) => update({ location: e.target.value })}
                        />
                      </label>
                    </div>
                  ) : (
                    <span className="eyebrow">{d.location}</span>
                  )}
                  {editing ? (
                    <label>
                      Beschreibung
                      <textarea
                        className="field"
                        aria-label={`Beschreibung ${key}`}
                        value={d.description}
                        onChange={(e) =>
                          update({ description: e.target.value })
                        }
                      />
                    </label>
                  ) : (
                    <h4>{d.description}</h4>
                  )}
                  <label className="defect-status no-print">
                    Status
                    <select
                      className="field"
                      aria-label={`Status ${d.description}`}
                      value={d.status}
                      onChange={(e) =>
                        update({ status: e.target.value as "open" | "done" })
                      }
                    >
                      <option value="open">Offen</option>
                      <option value="done">Erledigt</option>
                    </select>
                  </label>
                  <span className="defect-print-status">
                    {d.status === "done" ? "Erledigt" : "Offen"}
                  </span>
                  {editing && (
                    <fieldset className="photo-assignment no-print">
                      <legend>Zugehörige Fotos</legend>
                      {photos.map((photo, index) => (
                        <label key={photo.id}>
                          <input
                            type="checkbox"
                            checked={d.photoIds.includes(photo.id)}
                            onChange={(e) =>
                              update({
                                photoIds: e.target.checked
                                  ? [...d.photoIds, photo.id]
                                  : d.photoIds.filter((id) => id !== photo.id),
                              })
                            }
                          />{" "}
                          Foto {index + 1}
                        </label>
                      ))}
                    </fieldset>
                  )}
                </div>
                <div className="defect-gallery">
                  {d.photoIds.length ? (
                    d.photoIds.map((id) => (
                      <div key={id}>
                        {renderPhoto(id)}
                        <span className="small muted">
                          Foto {photos.findIndex((p) => p.id === id) + 1}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="small muted">
                      Noch keine Fotos zugeordnet. Die Raumfotos bleiben unten
                      erhalten.
                    </p>
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
