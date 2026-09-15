import { describe, expect, it, vi } from "vitest";
import { analysisSections, recordingSections } from "./audioSections";
import type { Draft } from "../types";
const draft: Draft = {
  report: {
    id: "r",
    title: "Test",
    date: "2026-09-14",
    summary: "",
    rooms: [],
    durationMs: 7000,
  },
  photos: [],
};
describe("large and resumed recordings", () => {
  it("preserves separate playable containers and their timeline", () => {
    const a = new Blob(["a"]),
      b = new Blob(["b"]);
    const sections = recordingSections({
      ...draft,
      audioParts: [{ blob: a, startTimeMs: 0, durationMs: 4000 }],
      audio: b,
      audioStartMs: 4000,
    });
    expect(sections.map((s) => [s.blob, s.startTimeMs, s.durationMs])).toEqual([
      [a, 0, 4000],
      [b, 4000, 3000],
    ]);
  });
  it("splits audio above the old total size limit into bounded WAV analysis copies", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "AudioContext",
      class {
        decodeAudioData = async () => ({
          duration: 500,
          sampleRate: 10,
          length: 5000,
          numberOfChannels: 1,
          getChannelData: () => new Float32Array(5000),
        });
        close = close;
      },
    );
    try {
      const source = new Blob([new Uint8Array(26 * 1024 * 1024)]);
      const parts = [];
      for await (const part of analysisSections({
        ...draft,
        audio: source,
        audioStartMs: 1000,
      }))
        parts.push(part);
      expect(parts.map((p) => p.startTimeMs)).toEqual([1000, 241000, 481000]);
      expect(parts.map((p) => p.durationMs)).toEqual([240000, 240000, 20000]);
      expect(parts.every((p) => p.blob.size < 8 * 1024 * 1024)).toBe(true);
      expect(await parts[0].blob.slice(0, 4).text()).toBe("RIFF");
      expect(source.size).toBe(26 * 1024 * 1024);
      expect(close).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
