import type { Draft } from "../types";
/** Synthetic, local-only recovery fixture; never included in the production route. */
export function recoveryFixture(): Draft {
  const bytes = new ArrayBuffer(32044);
  const view = new DataView(bytes);
  const text = (at: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 32036, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, 32000, true);
  return {
    report: {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      title: "Wiederherstellungstest – 100 Testbilder",
      projectName: "Wiederherstellungstest – 100 Testbilder",
      summary: "",
      rooms: [],
      durationMs: 1000,
      captureState: "recording",
    },
    audio: new Blob([bytes], { type: "audio/wav" }),
    photos: Array.from({ length: 100 }, (_, i) => ({
      id: `test-${i}`,
      relativeTimeMs: 0,
      blob: new Blob(
        [
          `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#dce7e1"/><text x="60" y="240" font-size="50">TESTFOTO ${i + 1}</text></svg>`,
        ],
        { type: "image/svg+xml" },
      ),
    })),
  };
}
