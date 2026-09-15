import { describe, expect, it } from "vitest";
import { annotateDraftPhoto } from "./annotations";
import { clampZoom, zoomCrop } from "./cameraZoom";
import { defectCounts, defectIndex } from "./defectIndex";
import type { Draft } from "../types";
describe("photo safety and defect index", () => {
  it("changes only the annotated copy, preserving the original and assignments across restore/reset", async () => {
    const original = new Blob(["original bytes"]);
    const draft: Draft = {
      report: {
        id: "one",
        title: "Projekt",
        date: "2026-09-15",
        summary: "",
        rooms: [
          {
            name: "Top 1",
            summary: "",
            transcription: "",
            photoIds: ["p"],
            defects: [
              {
                id: "d",
                description: "Steckdose",
                trade: "Elektro",
                status: "done",
                photoIds: ["p"],
              },
            ],
          },
        ],
        photos: [
          {
            id: "p",
            relativeTimeMs: 0,
            driveId: "original-id",
            annotatedDriveId: "old-copy",
          },
        ],
      },
      photos: [{ id: "p", relativeTimeMs: 0, blob: original }],
    };
    const next = annotateDraftPhoto(
      draft,
      "p",
      [
        {
          tool: "circle",
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.5, y: 0.5 },
          ],
        },
      ],
      new Blob(["marked"]),
    );
    expect(next.photos[0].blob).toBe(original);
    const recovered = structuredClone(next);
    expect(await recovered.photos[0].blob.text()).toBe("original bytes");
    expect(await recovered.photos[0].annotatedBlob!.text()).toBe("marked");
    expect(recovered.report.rooms).toEqual(draft.report.rooms);
    expect(next.report.photos![0]).toEqual({
      id: "p",
      relativeTimeMs: 0,
      driveId: "original-id",
    });
    expect(draft.report.photos![0].annotatedDriveId).toBe("old-copy");
    const reset = annotateDraftPhoto(next, "p", []);
    expect(reset.photos[0].annotatedBlob).toBeUndefined();
    expect(reset.photos[0].blob).toBe(original);
    expect(defectCounts(reset.report)).toEqual({ open: 0, done: 1 });
    expect(defectIndex([reset.report])[0]).toMatchObject({
      trade: "Elektro",
      location: "Top 1",
      project: "Projekt",
    });
  });
  it.each([
    [1920, 1080],
    [1080, 1920],
  ])("keeps camera zoom proportional for %s × %s", (width, height) => {
    const crop = zoomCrop(width, height, 2);
    expect(crop.width / crop.height).toBeCloseTo(width / height);
    expect(crop.x * 2 + crop.width).toBe(width);
    expect(crop.y * 2 + crop.height).toBe(height);
    expect(clampZoom(9, 1, 4, 0.5)).toBe(4);
    expect(clampZoom(0, 1, 4)).toBe(1);
  });
});
