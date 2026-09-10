import { describe, expect, it } from "vitest";
import { validateAnalysis } from "../shared/analysis";
import { reportToMarkdown } from "../src/lib/markdown";

const room = {
  name: "Wohnzimmer",
  summary: "Zwei Mängel",
  transcription: "Riss und Tür",
  photoIds: [],
  tags: ["Mangel"],
};
const analysis = { title: "Test", summary: "Begehung", rooms: [room] };
describe("individual defect status", () => {
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
