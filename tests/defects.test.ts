import { describe, expect, it } from "vitest";
import { validateAnalysis } from "../shared/analysis";
import { reportToMarkdown } from "../src/lib/markdown";
import { groupDefects } from "../src/lib/defects";

const room = {
  name: "Wohnzimmer",
  summary: "Zwei Mängel",
  transcription: "Riss und Tür",
  photoIds: [],
  tags: ["Mangel"],
};
const analysis = { title: "Test", summary: "Begehung", rooms: [room] };
describe("individual defect status", () => {
  it("groups by trade and room without mutating legacy data or losing completion", () => {
    const rooms = [
      {
        ...room,
        defects: [
          {
            id: "1",
            description: "Tür",
            status: "done" as const,
            trade: "Tischler",
            location: "Top 2",
            photoIds: ["p"],
          },
          {
            id: "2",
            description: "Riss",
            status: "open" as const,
            trade: "Maler",
            location: "Top 3",
            photoIds: [],
          },
          { id: "3", description: "Alt", status: "open" as const },
          {
            id: "4",
            description: "Riss 2",
            status: "open" as const,
            trade: "Maler",
            location: "Top 1",
            photoIds: [],
          },
        ],
      },
    ];
    const before = JSON.stringify(rooms);
    const groups = groupDefects(rooms);
    expect(groups.map((g) => g.trade)).toEqual([
      "Maler",
      "Tischler",
      "Nicht zugeordnet",
    ]);
    expect(groups[0].defects.map((d) => d.location)).toEqual([
      "Top 1",
      "Top 3",
    ]);
    expect(groups[1].defects[0]).toMatchObject({
      status: "done",
      photoIds: ["p"],
    });
    expect(groups[2].defects[0].location).toBe("Wohnzimmer");
    expect(JSON.stringify(rooms)).toBe(before);
  });
  it("validates new fields and excludes unrecognized photo references", () => {
    const result = validateAnalysis(
      {
        ...analysis,
        rooms: [
          {
            ...room,
            defects: [
              {
                description: "Riss",
                trade: "Maler",
                location: "Top 3",
                photoIds: ["p", "unknown", "p"],
              },
            ],
          },
        ],
      },
      ["p"],
    );
    expect(result.rooms[0].defects![0]).toMatchObject({
      trade: "Maler",
      location: "Top 3",
      photoIds: ["p"],
    });
    const md = reportToMarkdown({
      ...result,
      id: "r",
      date: "2026-09-10",
      photos: [{ id: "p", driveId: "drive-p", relativeTimeMs: 0 }],
    });
    expect(md).toContain("### Maler");
    expect(md).toContain("| Top 3 | Riss | Offen |");
    expect(md).toContain("drive.google.com/file/d/drive-p/view");
  });
  it("keeps distinct defects and leaves completion to the user", () => {
    const result = validateAnalysis(
      {
        ...analysis,
        rooms: [
          {
            ...room,
            defects: [
              { description: "Riss", status: "done" },
              { description: "Tür" },
            ],
          },
        ],
      },
      [],
    );
    expect(result.rooms[0].defects).toEqual([
      { id: "defect-1", description: "Riss", status: "open" },
      { id: "defect-2", description: "Tür", status: "open" },
    ]);
    result.rooms[0].defects![0].status = "done";
    const md = reportToMarkdown({ ...result, id: "r", date: "2026-09-10" });
    expect(md).toContain("| Riss | Erledigt |");
    expect(md).toContain("| Tür | Offen |");
    expect(JSON.parse(JSON.stringify(result)).rooms[0].defects[0].status).toBe(
      "done",
    );
  });
  it("preserves older reports without inventing individual defects", () => {
    expect(validateAnalysis(analysis, []).rooms[0].defects).toBeUndefined();
  });
  it.each([null, {}, [{ description: " " }], [{ description: 7 }]])(
    "rejects invalid generated defects %j",
    (defects) => {
      expect(() =>
        validateAnalysis({ ...analysis, rooms: [{ ...room, defects }] }, []),
      ).toThrow("ungültige Mängel");
    },
  );
});
