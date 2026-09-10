vi.mock("../src/lib/analysisMedia", () => ({
  prepareAnalysisPhotos: async (_audio: Blob, photos: unknown[]) => photos,
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Draft } from "../src/types";
const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as any },
  root: vi.fn(),
  create: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  putDraft: vi.fn(),
  putLocal: vi.fn(),
  save: vi.fn(),
  token: vi.fn(),
}));
vi.mock("../src/lib/firebase", () => ({ auth: mocks.auth }));
vi.mock("../src/lib/driveSettings", () => ({ getRootFolder: mocks.root }));
vi.mock("../src/lib/reports", () => ({
  uid: () => {
    if (!mocks.auth.currentUser) throw new Error("Bitte zuerst anmelden.");
    return mocks.auth.currentUser.uid;
  },
  saveReport: mocks.save,
}));
vi.mock("../src/lib/local", () => ({
  putDraft: mocks.putDraft,
  putLocal: mocks.putLocal,
}));
vi.mock("../src/lib/drive", () => ({
  createSubFolder: mocks.create,
  uploadFileToFolder: mocks.upload,
  downloadDriveFile: mocks.download,
}));
import {
  analyzeDraft,
  backupDraft,
  restoreDraft,
  syncReport,
} from "../src/lib/workflow";

function draft(): Draft {
  return {
    report: {
      id: "one",
      title: "Begehung",
      date: "2026-09-10T00:00:00Z",
      summary: "",
      rooms: [],
    },
    audio: new Blob(["audio"], { type: "audio/webm" }),
    photos: ["a", "b", "c"].map((id) => ({
      id,
      blob: new Blob(["image"], { type: "image/jpeg" }),
      relativeTimeMs: 2000,
    })),
  };
}
function switchAccount() {
  mocks.auth.currentUser = { uid: "other-user", getIdToken: mocks.token };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  mocks.auth.currentUser = { uid: "original-user", getIdToken: mocks.token };
  mocks.root.mockResolvedValue("root");
  mocks.create.mockResolvedValue("folder");
  mocks.upload.mockImplementation(async (_blob, name) => name);
  mocks.download.mockResolvedValue(new Blob(["download"]));
  mocks.token.mockResolvedValue("firebase-token");
  mocks.putDraft.mockResolvedValue(undefined);
  mocks.putLocal.mockResolvedValue(undefined);
  mocks.save.mockResolvedValue(null);
});
describe("upload checkpoints and account ownership", () => {
  it("checkpoints each media upload locally without repeated Firestore waits", async () => {
    const value = draft();
    await backupDraft(value, "drive-token", vi.fn());
    expect(mocks.upload).toHaveBeenCalledTimes(4);
    expect(mocks.putDraft).toHaveBeenCalledTimes(6); // folder, audio, 3 photos, final metadata
    expect(mocks.putLocal).toHaveBeenCalledTimes(6);
    expect(
      mocks.putLocal.mock.calls.every(([owner]) => owner === "original-user"),
    ).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(value.report.photos?.every((photo) => photo.driveId)).toBe(true);
    await syncReport(value.report, "drive-token");
    expect(mocks.save).toHaveBeenCalledOnce();
  });
  it("uses checkpointed IDs on retry after a later upload fails", async () => {
    const value = draft();
    mocks.upload
      .mockResolvedValueOnce("saved-audio")
      .mockResolvedValueOnce("saved-photo-a")
      .mockRejectedValueOnce(new Error("Offline"));
    await expect(backupDraft(value, "drive-token", vi.fn())).rejects.toThrow(
      "Offline",
    );
    expect(value.report.rawAudioUrl).toBe("saved-audio");
    expect(value.report.photos?.[0].driveId).toBe("saved-photo-a");
    mocks.upload.mockClear();
    await backupDraft(value, "drive-token", vi.fn());
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.upload.mock.calls.map((call) => call[1])).toEqual([
      "b.jpg",
      "c.jpg",
    ]);
  });
  it("stops before creating a folder when the account changes during root lookup", async () => {
    mocks.root.mockImplementation(async () => {
      switchAccount();
      return "root";
    });
    await expect(backupDraft(draft(), "drive-token", vi.fn())).rejects.toThrow(
      "Konto hat sich geändert",
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.putDraft).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not write a checkpoint under another account after an upload", async () => {
    const value = draft();
    value.report.driveFolderId = "folder";
    mocks.upload.mockImplementationOnce(async () => {
      switchAccount();
      return "audio";
    });
    await expect(backupDraft(value, "drive-token", vi.fn())).rejects.toThrow(
      "Konto hat sich geändert",
    );
    expect(mocks.putDraft).not.toHaveBeenCalled();
    expect(mocks.putLocal).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("stops after an in-flight original-account IDB write if sign-out occurs", async () => {
    const value = draft();
    mocks.putDraft.mockImplementationOnce(async () => {
      mocks.auth.currentUser = null;
    });
    await expect(backupDraft(value, "drive-token", vi.fn())).rejects.toThrow(
      "Konto hat sich geändert",
    );
    expect(mocks.putDraft).toHaveBeenCalledWith("original-user", value);
    expect(mocks.putLocal).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("stops sync before JSON or Firebase if the account changes during Markdown upload", async () => {
    const value = draft().report;
    value.driveFolderId = "folder";
    mocks.upload.mockImplementationOnce(async () => {
      switchAccount();
      return "markdown";
    });
    await expect(syncReport(value, "drive-token")).rejects.toThrow(
      "Konto hat sich geändert",
    );
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.putLocal).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("discards analysis responses when a different account is active", async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => {
      switchAccount();
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetch);
    await expect(analyzeDraft(draft())).rejects.toThrow(
      "Konto hat sich geändert",
    );
    expect(
      (fetch.mock.calls[0][1].headers as Record<string, string>).Authorization,
    ).toBe("Bearer firebase-token");
  });
  it("does not start analysis if the account switches during token refresh", async () => {
    mocks.token.mockImplementationOnce(async () => {
      switchAccount();
      return "old-token";
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(analyzeDraft(draft())).rejects.toThrow(
      "Konto hat sich geändert",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not download or return photos after account changes during audio restore", async () => {
    const value = draft().report;
    value.rawAudioUrl = "audio";
    value.photos = [{ id: "one", driveId: "photo", relativeTimeMs: 2000 }];
    mocks.download.mockImplementationOnce(async () => {
      switchAccount();
      return new Blob(["audio"]);
    });
    await expect(restoreDraft(value, "drive-token")).rejects.toThrow(
      "Konto hat sich geändert",
    );
    expect(mocks.download).toHaveBeenCalledOnce();
  });
});
