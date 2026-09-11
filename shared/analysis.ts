import type { RoomReport } from "../src/types";
export const REPORT_TAGS = [
  "Mangel",
  "Fortschritt",
  "Erledigt",
  "Offener Punkt",
  "Sicherheit",
  "Material",
  "Entscheidung",
] as const;
export const MAX_PHOTOS = 30;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const reportSchema = {
  type: "object",
  required: ["title", "summary", "rooms"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    rooms: {
      type: "array",
      items: {
        type: "object",
        required: [
          "name",
          "summary",
          "transcription",
          "photoIds",
          "tags",
          "defects",
        ],
        properties: {
          name: { type: "string" },
          defects: {
            type: "array",
            items: {
              type: "object",
              required: ["description", "trade", "location", "photoIds"],
              properties: {
                description: { type: "string" },
                trade: { type: "string" },
                location: { type: "string" },
                photoIds: { type: "array", items: { type: "string" } },
              },
            },
          },
          summary: { type: "string" },
          transcription: { type: "string" },
          photoIds: { type: "array", items: { type: "string" } },
          tags: {
            type: "array",
            items: { type: "string", enum: [...REPORT_TAGS] },
          },
          startTimeMs: { type: "number", minimum: 0 },
          endTimeMs: { type: "number", minimum: 0 },
        },
      },
    },
  },
};
export function validateAnalysis(
  value: unknown,
  photoIds: string[],
): { title: string; summary: string; rooms: RoomReport[] } {
  const v = value as any;
  if (
    !v ||
    typeof v.title !== "string" ||
    !v.title.trim() ||
    typeof v.summary !== "string" ||
    !Array.isArray(v.rooms) ||
    !v.rooms.length
  )
    throw new Error(
      "Die KI hat keinen vollständigen Bericht geliefert. Bitte erneut versuchen.",
    );
  const assigned = new Set<string>();
  const rooms = v.rooms.map((r: any) => {
    if (
      !r ||
      ["name", "summary", "transcription"].some(
        (k) => typeof r[k] !== "string",
      ) ||
      !Array.isArray(r.photoIds) ||
      r.photoIds.some((id: unknown) => typeof id !== "string")
    )
      throw new Error("Die KI-Antwort hat ein ungültiges Format.");
    const ids = r.photoIds.filter(
      (id: string) =>
        photoIds.includes(id) && !assigned.has(id) && Boolean(assigned.add(id)),
    );
    const tags = Array.isArray(r.tags)
      ? ([
          ...new Set(
            r.tags.filter(
              (tag: unknown) =>
                typeof tag === "string" &&
                REPORT_TAGS.includes(tag as (typeof REPORT_TAGS)[number]),
            ),
          ),
        ] as string[])
      : [];
    const timeRange =
      Number.isFinite(r.startTimeMs) &&
      Number.isFinite(r.endTimeMs) &&
      r.startTimeMs >= 0 &&
      r.endTimeMs >= r.startTimeMs
        ? { startTimeMs: r.startTimeMs, endTimeMs: r.endTimeMs }
        : {};
    if (
      r.defects !== undefined &&
      (!Array.isArray(r.defects) ||
        r.defects.some(
          (d: any) =>
            !d ||
            typeof d.description !== "string" ||
            !d.description.trim() ||
            (d.trade !== undefined && typeof d.trade !== "string") ||
            (d.location !== undefined && typeof d.location !== "string") ||
            (d.photoIds !== undefined &&
              (!Array.isArray(d.photoIds) ||
                d.photoIds.some((id: unknown) => typeof id !== "string"))),
        ))
    )
      throw new Error("Die KI-Antwort enthält ungültige Mängel.");
    return {
      name: r.name,
      summary: r.summary,
      transcription: r.transcription,
      photoIds: ids,
      tags,
      ...(r.defects !== undefined
        ? {
            defects: r.defects.map((d: any, i: number) => ({
              id: `defect-${i + 1}`,
              description: d.description.trim(),
              status: "open" as const,
              ...(d.trade !== undefined ? { trade: d.trade.trim() } : {}),
              ...(d.location !== undefined
                ? { location: d.location.trim() }
                : {}),
              ...(d.photoIds !== undefined
                ? {
                    photoIds: [
                      ...new Set<string>(
                        d.photoIds.filter((id: string) =>
                          photoIds.includes(id),
                        ),
                      ),
                    ],
                  }
                : {}),
            })),
          }
        : {}),
      ...timeRange,
    };
  });
  return { title: v.title, summary: v.summary, rooms };
}
export function audioExtension(mime: string) {
  return mime.includes("flac")
    ? "flac"
    : mime.includes("aac")
      ? "aac"
      : mime.includes("mp4")
        ? "m4a"
        : mime.includes("ogg")
          ? "ogg"
          : mime.includes("wav")
            ? "wav"
            : mime.includes("mpeg")
              ? "mp3"
              : "webm";
}
