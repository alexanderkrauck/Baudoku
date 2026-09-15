import type { Draft } from "../types";

export function recordingSections(draft: Draft) {
  return [
    ...(draft.audioParts || []),
    ...(draft.audio?.size
      ? [
          {
            blob: draft.audio,
            startTimeMs: draft.audioStartMs || 0,
            durationMs: Math.max(
              0,
              (draft.report.durationMs || 0) - (draft.audioStartMs || 0),
            ),
            driveId: draft.report.rawAudioUrl,
          },
        ]
      : []),
  ];
}

// Large source files stay untouched. Only analysis copies are converted to mono PCM.
export async function* analysisSections(draft: Draft) {
  for (const section of recordingSections(draft)) {
    if (section.blob.size <= 8 * 1024 * 1024) {
      yield section;
      continue;
    }
    const context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(
        await section.blob.arrayBuffer(),
      );
      const rate = 16000;
      const secondsPerPart = 240;
      for (let start = 0; start < decoded.duration; start += secondsPerPart) {
        const seconds = Math.min(secondsPerPart, decoded.duration - start);
        const count = Math.floor(seconds * rate);
        const buffer = new ArrayBuffer(44 + count * 2);
        const view = new DataView(buffer);
        const text = (offset: number, value: string) =>
          [...value].forEach((c, i) =>
            view.setUint8(offset + i, c.charCodeAt(0)),
          );
        text(0, "RIFF");
        view.setUint32(4, 36 + count * 2, true);
        text(8, "WAVE");
        text(12, "fmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, rate, true);
        view.setUint32(28, rate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        text(36, "data");
        view.setUint32(40, count * 2, true);
        const channels = Array.from(
          { length: decoded.numberOfChannels },
          (_, i) => decoded.getChannelData(i),
        );
        for (let i = 0; i < count; i++) {
          const at = Math.min(
            decoded.length - 1,
            Math.floor((start + i / rate) * decoded.sampleRate),
          );
          const sample =
            channels.reduce((sum, channel) => sum + channel[at], 0) /
            channels.length;
          view.setInt16(
            44 + i * 2,
            Math.round(Math.max(-1, Math.min(1, sample)) * 32767),
            true,
          );
        }
        yield {
          blob: new Blob([buffer], { type: "audio/wav" }),
          startTimeMs: section.startTimeMs + start * 1000,
          durationMs: seconds * 1000,
        };
      }
    } catch {
      throw new Error(
        "Dieser große Audioabschnitt konnte auf dem Gerät nicht für die Auswertung aufgeteilt werden. Die Originalaufnahme bleibt erhalten und kann später erneut ausgewertet werden.",
      );
    } finally {
      await context.close();
    }
  }
}
