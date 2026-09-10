import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  data: new Map<string, any>(),
  setDoc: vi.fn(),
  snapshot: null as any,
}));
vi.mock("idb-keyval", () => ({
  createStore: () => ({}),
  get: async (key: string) => structuredClone(mocks.data.get(key)),
  set: async (key: string, value: unknown) => {
    mocks.data.set(key, structuredClone(value));
  },
  del: async (key: string) => {
    mocks.data.delete(key);
  },
  entries: async () => structuredClone([...mocks.data.entries()]),
  update: async (key: string, fn: (value: unknown) => unknown) => {
    mocks.data.set(key, structuredClone(fn(mocks.data.get(key))));
  },
}));
vi.mock("./firebase", () => ({ auth: { currentUser: { uid: "u1" } }, db: {} }));
vi.mock("./session", () => ({ errorMessage: (error: Error) => error.message }));
vi.mock("firebase/firestore", () => ({
  doc: () => ({}),
  collection: () => ({}),
  setDoc: mocks.setDoc,
  onSnapshot: (_: unknown, __: unknown, callback: unknown) => {
    mocks.snapshot = callback;
    return () => {};
  },
}));
import { saveReport, watchReports } from "./reports";
import { getLocal, putLocal, acceptRemoteReport } from "./local";
import type { ReportData } from "../types";
const report: ReportData = {
  id: "r1",
  title: "First",
  date: "2026-09-10",
  summary: "",
  rooms: [],
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => {
  mocks.data.clear();
  mocks.setDoc.mockReset();
});
describe("Local-first report persistence", () => {
  it("publishes local saves even when Firestore refuses the write", async () => {
    mocks.setDoc.mockRejectedValue(new Error("Denied"));
    const observed = vi.fn();
    const stop = watchReports(observed, vi.fn());
    expect(await saveReport(report)).toBe("Denied");
    await flush();
    expect(observed).toHaveBeenLastCalledWith(
      [expect.objectContaining({ title: "First" })],
      ["r1"],
    );
    stop();
  });
  it("does not replace a newer edit with an older network acknowledgement", async () => {
    let completeFirst!: () => void;
    let completeSecond!: () => void;
    mocks.setDoc
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            completeFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            completeSecond = resolve;
          }),
      );
    const first = saveReport(report);
    await flush();
    const second = saveReport({ ...report, title: "Newer edit" });
    await flush();
    completeFirst();
    await first;
    expect(await getLocal("u1", "r1")).toMatchObject({
      report: { title: "Newer edit" },
      dirty: true,
    });
    completeSecond();
    await second;
    expect(await getLocal("u1", "r1")).toMatchObject({
      report: { title: "Newer edit" },
      dirty: false,
    });
  });
  it("keeps newer clean local data when a stale remote snapshot arrives", async () => {
    await putLocal(
      "u1",
      { ...report, updatedAt: "2026-09-10T10:00:00Z", title: "Recent" },
      false,
    );
    await acceptRemoteReport("u1", {
      ...report,
      updatedAt: "2026-09-10T09:00:00Z",
    });
    expect(await getLocal("u1", "r1")).toMatchObject({
      report: { title: "Recent" },
    });
  });
  it("stops publishing local changes after unsubscribe", async () => {
    const observed = vi.fn();
    const stop = watchReports(observed, vi.fn());
    await flush();
    stop();
    observed.mockClear();
    await putLocal("u1", report);
    await flush();
    expect(observed).not.toHaveBeenCalled();
  });
});
