import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Draft } from "../types";

const storage = vi.hoisted(() => ({
  data: new Map<string, any>(),
  failWrites: false,
}));
vi.mock("idb-keyval", () => {
  const checkWrite = () => {
    if (storage.failWrites)
      throw new DOMException("Full", "QuotaExceededError");
  };
  return {
    createStore: () => ({}),
    get: async (key: string) => storage.data.get(key),
    set: async (key: string, value: unknown) => {
      checkWrite();
      storage.data.set(key, value);
    },
    setMany: async (values: [string, unknown][]) => {
      checkWrite();
      for (const [key, value] of values) storage.data.set(key, value);
    },
    del: async (key: string) => {
      storage.data.delete(key);
    },
    delMany: async (keys: string[]) => {
      for (const key of keys) storage.data.delete(key);
    },
    entries: async () => [...storage.data.entries()],
    keys: async () => [...storage.data.keys()],
    getMany: async (keys: string[]) => keys.map((key) => storage.data.get(key)),
    update: async (key: string, fn: (value: unknown) => unknown) => {
      checkWrite();
      storage.data.set(key, fn(storage.data.get(key)));
    },
  };
});
import {
  appendRecordingChunk,
  beginRecordingSession,
  deleteDraft,
  getDraft,
  listDrafts,
  putDraft,
} from "./local";
const draft = (id: string): Draft => ({
  report: { id, date: "2026-09-10", title: id, summary: "", rooms: [] },
  photos: [],
});
beforeEach(() => {
  storage.data.clear();
  storage.failWrites = false;
});

describe("durable recording drafts", () => {
  it("preserves an old single-slot draft when another recording starts", async () => {
    storage.data.set("u:draft", {
      ...draft("old"),
      audio: new Blob(["original"]),
    });
    await putDraft("u", draft("new"));
    expect((await getDraft("u"))?.report.id).toBe("new");
    expect(await (await getDraft("u", "old"))?.audio?.text()).toBe("original");
    expect(await listDrafts("u")).toHaveLength(2);
    expect(storage.data.has("u:draft")).toBe(false);
  });

  it("assembles persisted chunks by numeric sequence after a page interruption", async () => {
    await putDraft("u", draft("r"));
    await appendRecordingChunk(
      "u",
      "r",
      10,
      new Blob(["last"], { type: "audio/mp4" }),
      3000,
    );
    await appendRecordingChunk(
      "u",
      "r",
      2,
      new Blob(["middle"], { type: "audio/mp4" }),
      2000,
    );
    await appendRecordingChunk(
      "u",
      "r",
      0,
      new Blob(["first"], { type: "audio/mp4" }),
      1000,
    );
    // Photo/title snapshots must not erase audio that was already committed.
    await putDraft("u", {
      ...draft("r"),
      photos: [{ id: "p", blob: new Blob(["photo"]), relativeTimeMs: 1500 }],
    });
    const recovered = await getDraft("u", "r");
    expect(await recovered?.audio?.text()).toBe("firstmiddlelast");
    expect(recovered?.audio?.type).toBe("audio/mp4");
    expect(recovered?.report.durationMs).toBe(3000);
    expect(recovered?.photos).toHaveLength(1);
  });

  it("surfaces quota failures while preserving every previously committed chunk", async () => {
    await putDraft("u", draft("r"));
    await appendRecordingChunk("u", "r", 0, new Blob(["safe"]), 1000);
    storage.failWrites = true;
    await expect(
      appendRecordingChunk("u", "r", 1, new Blob(["pending"]), 2000),
    ).rejects.toMatchObject({ name: "QuotaExceededError" });
    await expect(putDraft("u", draft("other"))).rejects.toMatchObject({
      name: "QuotaExceededError",
    });
    expect(await (await getDraft("u", "r"))?.audio?.text()).toBe("safe");
    expect((await getDraft("u"))?.report.id).toBe("r");
    storage.failWrites = false;
    await appendRecordingChunk("u", "r", 1, new Blob(["pending"]), 2000);
    expect(await (await getDraft("u", "r"))?.audio?.text()).toBe("safepending");
  });

  it("lists recovery summaries with duration without assembling audio", async () => {
    await putDraft("u", draft("r"));
    await appendRecordingChunk("u", "r", 0, new Blob(["speech"]), 2500);
    const summaries = await listDrafts("u", { includeAudio: false });
    expect(summaries[0].audio).toBeUndefined();
    expect(summaries[0].report.durationMs).toBe(2500);
  });

  it("uses a complete final snapshot when a journal chunk could not be committed", async () => {
    await putDraft("u", draft("r"));
    await appendRecordingChunk("u", "r", 0, new Blob(["first"]), 1000);
    await putDraft("u", { ...draft("r"), audio: new Blob(["firstlast"]) });
    expect(await (await getDraft("u", "r"))?.audio?.text()).toBe("firstlast");
  });

  it("deletes only the selected recording and its chunks, preserving other users and drafts", async () => {
    await putDraft("u", draft("old"));
    await appendRecordingChunk("u", "old", 0, new Blob(["old"]), 1000);
    await putDraft("u", draft("current"));
    await appendRecordingChunk("u", "current", 0, new Blob(["current"]), 1000);
    await putDraft("other", draft("old"));
    await deleteDraft("u", "old");
    expect(await getDraft("u", "old")).toBeUndefined();
    expect((await getDraft("u"))?.report.id).toBe("current");
    expect(await (await getDraft("u"))?.audio?.text()).toBe("current");
    expect(await getDraft("other", "old")).toBeDefined();
    expect(
      [...storage.data.keys()].some((key) =>
        key.startsWith("u:audio-chunk:old:"),
      ),
    ).toBe(false);
  });

  it("does not replace a newer migrated snapshot with legacy data", async () => {
    await putDraft("u", { ...draft("r"), audio: new Blob(["new"]) });
    storage.data.set("u:draft", { ...draft("r"), audio: new Blob(["old"]) });
    expect(await (await getDraft("u"))?.audio?.text()).toBe("new");
  });
});

describe("resuming a recording", () => {
  it("keeps the previous container and recovers only the new session journal", async () => {
    await putDraft("u", {
      ...draft("resume"),
      audio: new Blob(["old-container"]),
      report: { ...draft("resume").report, durationMs: 2000 },
    });
    await appendRecordingChunk(
      "u",
      "resume",
      0,
      new Blob(["old-container"]),
      2000,
    );
    const first = (await getDraft("u", "resume"))!;
    const session = await beginRecordingSession("u", first);
    expect(await session.draft.audioParts![0].blob.text()).toBe(
      "old-container",
    );
    expect((await getDraft("u", "resume"))!.audio).toBeUndefined();
    await appendRecordingChunk(
      "u",
      "resume",
      session.sequence,
      new Blob(["new-container"]),
      3500,
    );
    const recovered = (await getDraft("u", "resume"))!;
    expect(await recovered.audio!.text()).toBe("new-container");
    expect(await recovered.audioParts![0].blob.text()).toBe("old-container");
    expect(recovered.audioStartMs).toBe(2000);
    expect(recovered.report.durationMs).toBe(3500);
  });
  it("does not replace the old recording when archiving fails", async () => {
    const old = { ...draft("r"), audio: new Blob(["safe"]) };
    await putDraft("u", old);
    storage.failWrites = true;
    await expect(beginRecordingSession("u", old)).rejects.toThrow();
    expect(await (await getDraft("u", "r"))!.audio!.text()).toBe("safe");
  });
});

it("recovers all 100 immediately saved photos with the original audio after reopening", async () => {
  let d: Draft = { ...draft("hundred"), audio: new Blob(["voice"]) };
  for (let i = 0; i < 100; i++) {
    d = {
      ...d,
      photos: [
        ...d.photos,
        {
          id: `p-${i}`,
          blob: new Blob([`photo-${i}`]),
          relativeTimeMs: i * 1000,
        },
      ],
    };
    await putDraft("u", d);
  }
  const restored = (await getDraft("u", "hundred"))!;
  expect(restored.photos).toHaveLength(100);
  expect(await restored.photos[99].blob.text()).toBe("photo-99");
  expect(await restored.audio!.text()).toBe("voice");
});
