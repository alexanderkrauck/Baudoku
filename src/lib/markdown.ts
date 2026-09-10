import type { ReportData } from "../types";

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_{}\[\]()#+.!|~-])/g, "\\$1");
}
function heading(text: string): string {
  return escapeText(text.replace(/[\r\n]+/g, " "));
}
function time(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}
const driveLink = (id: string) =>
  `https://drive.google.com/file/d/${encodeURIComponent(id).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}/view`;
function verbatim(text: string): string {
  // A longer fence keeps literal Markdown/HTML in the original transcript intact.
  const longest = Math.max(
    0,
    ...(text.match(/`+/g) || []).map((run) => run.length),
  );
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}

/** Portable human-readable export. Drive links retain the files' existing private permissions. */
export function reportToMarkdown(report: ReportData): string {
  const lines = [
    `# ${heading(report.title)}`,
    "",
    `Datum: ${heading(report.date)}`,
  ];
  if (Number.isFinite(report.durationMs))
    lines.push(`Aufnahmedauer: ${time(report.durationMs!)}`);
  if (report.rawAudioUrl)
    lines.push(
      "",
      `[Originalaufnahme in Google Drive](${driveLink(report.rawAudioUrl)})`,
    );
  lines.push("", "## Zusammenfassung", "", escapeText(report.summary));
  const photos =
    report.photos ||
    (report.rawPhotoUrls || [])
      .map((driveId, index) => ({
        id: `photo_${index}`,
        driveId,
        relativeTimeMs: null,
      }))
      .filter((photo) => photo.driveId);
  const assigned = new Set<string>();
  function photoLine(photo: {
    id: string;
    driveId?: string;
    relativeTimeMs: number | null;
  }) {
    const label = heading(photo.id);
    const reference = photo.driveId
      ? `[${label}](${driveLink(photo.driveId)})`
      : `${label} (noch nicht in Drive gesichert)`;
    return `- ${reference} · ${photo.relativeTimeMs === null ? "Aufnahmezeit unbekannt" : time(photo.relativeTimeMs)}`;
  }
  report.rooms.forEach((room, index) => {
    lines.push("", `## ${index + 1}. ${heading(room.name)}`);
    if (room.tags?.length)
      lines.push("", `Tags: ${room.tags.map(heading).join(", ")}`);
    if (room.defects?.length) {
      lines.push(
        "",
        "### Mängelstatus",
        "",
        "| Mangel | Status |",
        "| --- | --- |",
      );
      room.defects.forEach((d) =>
        lines.push(
          `| ${heading(d.description)} | ${d.status === "done" ? "Erledigt" : "Offen"} |`,
        ),
      );
    }
    if (Number.isFinite(room.startTimeMs) && Number.isFinite(room.endTimeMs))
      lines.push(
        "",
        `Audioabschnitt: ${time(room.startTimeMs!)} – ${time(room.endTimeMs!)}`,
      );
    lines.push(
      "",
      "### Zusammenfassung",
      "",
      escapeText(room.summary),
      "",
      "### Transkription",
      "",
      verbatim(room.transcription),
    );
    const roomPhotos = photos.filter(
      (photo) =>
        !assigned.has(photo.id) &&
        ((room.photoIds || []).includes(photo.id) ||
          Boolean(photo.driveId && room.photoUrls?.includes(photo.driveId))),
    );
    if (roomPhotos.length) {
      lines.push("", "### Fotos", "");
      for (const photo of roomPhotos) {
        if (!assigned.has(photo.id)) lines.push(photoLine(photo));
        assigned.add(photo.id);
      }
    }
  });
  const unassigned = photos.filter((photo) => !assigned.has(photo.id));
  if (unassigned.length)
    lines.push(
      "",
      "## Nicht zugeordnete Fotos",
      "",
      ...unassigned.map(photoLine),
    );
  return `${lines.join("\n")}\n`;
}
