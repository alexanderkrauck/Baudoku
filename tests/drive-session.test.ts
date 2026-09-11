import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: "owner-a" } as { uid: string } | null },
  popup: vi.fn(),
}));
vi.mock("../src/lib/firebase", () => ({ auth: mocks.auth, provider: {} }));
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: { credentialFromResult: () => ({ accessToken: "new" }) },
  reauthenticateWithPopup: mocks.popup,
  signInWithPopup: mocks.popup,
}));
let receiver: (event: { data: unknown }) => void;
let messages: any[];
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-10T10:00:00Z"));
  mocks.auth.currentUser = { uid: "owner-a" };
  mocks.popup.mockClear();
  messages = [];
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      set onmessage(value: typeof receiver) {
        receiver = value;
      }
      postMessage(data: unknown) {
        messages.push(data);
      }
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("Drive authorization reuse", () => {
  it("restores existing authorization without opening a login popup", async () => {
    const expiresAt = Date.now() + 100000;
    sessionStorage.setItem(
      "baudoku:drive-session",
      JSON.stringify({ owner: "owner-a", token: "cached", expiresAt }),
    );
    const api = await import("../src/lib/session");
    expect(api.driveToken()).toBe("cached");
    api.requestDriveSession();
    expect(mocks.popup).not.toHaveBeenCalled();
    expect(messages).toEqual([]);
  });
  it("accepts a valid same-account tab token without extending its expiry", async () => {
    const api = await import("../src/lib/session");
    const expiresAt = Date.now() + 1000;
    api.requestDriveSession();
    expect(messages[0]).toEqual({ type: "request", owner: "owner-a" });
    receiver({
      data: {
        type: "session",
        owner: "owner-a",
        session: { owner: "owner-a", token: "shared", expiresAt },
      },
    });
    expect(api.driveToken()).toBe("shared");
    vi.advanceTimersByTime(1001);
    expect(api.driveToken()).toBeNull();
    expect(mocks.popup).not.toHaveBeenCalled();
  });
  it("rejects another account and forged long-lived tokens", async () => {
    const api = await import("../src/lib/session");
    receiver({
      data: {
        type: "session",
        owner: "owner-b",
        session: {
          owner: "owner-b",
          token: "private",
          expiresAt: Date.now() + 1000,
        },
      },
    });
    expect(api.driveToken()).toBeNull();
    receiver({
      data: {
        type: "session",
        owner: "owner-a",
        session: {
          owner: "owner-a",
          token: "bad",
          expiresAt: Date.now() + 3600000,
        },
      },
    });
    expect(api.driveToken()).toBeNull();
  });
  it("does not invalidate a replacement token from a stale clear event", async () => {
    const api = await import("../src/lib/session");
    api.rememberToken("new");
    receiver({ data: { type: "clear", owner: "owner-a", token: "old" } });
    expect(api.driveToken()).toBe("new");
    receiver({ data: { type: "clear", owner: "owner-a", token: "new" } });
    expect(api.driveToken()).toBeNull();
  });
  it("never reuses authorization after an account switch", async () => {
    const api = await import("../src/lib/session");
    api.rememberToken("private");
    mocks.auth.currentUser = { uid: "owner-b" };
    expect(api.driveToken()).toBeNull();
  });
});
