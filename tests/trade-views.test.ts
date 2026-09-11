import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DefectOverview from "../src/components/DefectOverview";
import { tradeOptions } from "../src/lib/trades";
import { groupDefects } from "../src/lib/defects";
import type { RoomReport } from "../src/types";
const rooms: RoomReport[] = [
  {
    name: "Top 3",
    summary: "Original",
    transcription: "Originalaufnahme",
    photoIds: ["p"],
    defects: [
      {
        id: "a",
        description: "Steckdose",
        status: "open",
        photoIds: ["p"],
        tradeSuggestion: "Elektro",
      },
      { id: "b", description: "Tür", status: "done", trade: "Sondergewerk" },
    ],
  },
];
describe("trade work queue and report", () => {
  it("includes central and previously assigned custom trades", () => {
    expect(tradeOptions(rooms)).toContain("Elektro");
    expect(tradeOptions(rooms)).toContain("Sondergewerk");
  });
  it("keeps suggestions unassigned and moves only the explicitly assigned defect", () => {
    const before = JSON.stringify(rooms);
    expect(
      groupDefects(rooms).find((g) => g.trade === "Nicht zugeordnet")!
        .defects[0].description,
    ).toBe("Steckdose");
    const next = structuredClone(rooms);
    next[0].defects![0].trade = "Elektro";
    expect(
      groupDefects(next).find((g) => g.trade === "Elektro")!.defects[0],
    ).toMatchObject({ status: "open", photoIds: ["p"] });
    expect(JSON.stringify(rooms)).toBe(before);
  });
  it("renders assignment controls only in edit cards and keeps report cards clean", () => {
    const render = (editing: boolean) =>
      renderToStaticMarkup(
        createElement(DefectOverview, {
          rooms,
          photos: [{ id: "p" }],
          editing,
          onChange: () => {},
          renderPhoto: () =>
            createElement("img", { src: "/test.jpg", alt: "Foto" }),
        }),
      );
    const edit = render(true);
    expect(edit).toContain("NOCH ZUZUORDNEN");
    expect(edit).toContain("Gewerk zuordnen: Steckdose");
    expect(edit).toContain("+ neues Gewerk");
    const report = render(false);
    expect(report).not.toContain("Gewerk zuordnen:");
    expect(report).not.toContain("textarea");
    expect(report).not.toContain("checkbox");
    expect(report).toContain("SONDERGEWERK");
    expect(report).toContain("Erledigt");
  });
});
