import { describe, expect, it } from "vitest";
import { RecordingClock, reconcileDraftPhotos } from "./recording";
import type { Draft } from "../types";

describe("recording recovery", () => {
  it("excludes pauses and freezes duration before asynchronous final audio events", () => {
    let time = 100;
    const clock = new RecordingClock(() => time);
    clock.resume();
    time = 2100;
    expect(clock.pause()).toBe(2000);
    time = 92100;
    expect(clock.read()).toBe(2000);
    clock.resume();
    time = 95100;
    expect(clock.pause()).toBe(5000);
    time = 95200;
    expect(clock.read()).toBe(5000);
    expect(clock.pause()).toBe(5000);
  });
  it("retains uploaded IDs across retries while adding and removing draft photos", () => {
    const draft: Draft = {
      photos: [],
      report: {
        id: "r",
        date: "",
        title: "",
        summary: "",
        rooms: [
          {
            name: "Raum",
            summary: "",
            transcription: "",
            photoIds: ["keep", "removed"],
            photoUrls: ["drive-keep", "drive-remove"],
          },
        ],
        photos: [
          { id: "keep", relativeTimeMs: 5, driveId: "drive-keep" },
          { id: "removed", relativeTimeMs: 10, driveId: "drive-remove" },
        ],
      },
    };
    const updated = reconcileDraftPhotos(draft, [
      { id: "keep", relativeTimeMs: 5, blob: new Blob(["a"]) },
      { id: "new", relativeTimeMs: null, blob: new Blob(["b"]) },
    ]);
    expect(updated.report.photos).toEqual([
      { id: "keep", relativeTimeMs: 5, driveId: "drive-keep" },
      { id: "new", relativeTimeMs: null },
    ]);
    expect(updated.report.rooms[0].photoIds).toEqual(["keep"]);
    expect(updated.report.rooms[0].photoUrls).toEqual(["drive-keep"]);
    expect(updated.report.rawPhotoUrls).toEqual(["drive-keep", ""]);
    expect(draft.report.photos).toHaveLength(2);
  });
});
