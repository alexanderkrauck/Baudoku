import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportToMarkdown } from "../src/lib/markdown";
import type { ReportData } from "../src/types";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  save: vi.fn(),
  create: vi.fn(),
  root: vi.fn(),
}));
vi.mock("../src/lib/driveSettings", () => ({ getRootFolder: mocks.root }));
vi.mock("../src/lib/firebase", () => ({
  auth: { currentUser: { uid: "test-user" } },
}));
vi.mock("../src/lib/reports", () => ({
  saveReport: mocks.save,
  uid: () => "test-user",
}));
vi.mock("../src/lib/local", () => ({ putDraft: vi.fn(), putLocal: vi.fn() }));
vi.mock("../src/lib/drive", () => ({
  createSubFolder: mocks.create,
  uploadFileToFolder: mocks.upload,
  downloadDriveFile: vi.fn(),
}));
import { syncReport } from "../src/lib/workflow";

function report(): ReportData {
  return {
    id: "report-1",
    date: "2026-09-10T10:00:00Z",
    title: "Begehung *Keller*",
    summary: "Kein <Schimmel>.",
    durationMs: 65000,
    rawAudioUrl: "audio-1",
    rooms: [
      {
        name: "Keller",
        summary: "Mauer fertig.",
        transcription: "Text\n```\n<script>literal</script>",
        tags: ["Fortschritt"],
        startTimeMs: 1000,
        endTimeMs: 61000,
        photoIds: ["one"],
      },
    ],
    photos: [
      { id: "one", driveId: "drive-one", relativeTimeMs: 3000 },
      { id: "two", driveId: "drive-two", relativeTimeMs: null },
      { id: "unsaved", relativeTimeMs: 10000 },
    ],
  };
}
describe("Markdown report export", () => {
  it("includes readable room sections, tags, time ranges, private media links and unassigned photos", () => {
    const markdown = reportToMarkdown(report());
    expect(markdown).toContain("# Begehung \\*Keller\\*");
    expect(markdown).toContain("Kein &lt;Schimmel&gt;\\.");
    expect(markdown).toContain("## 1. Keller");
    expect(markdown).toContain("Tags: Fortschritt");
    expect(markdown).toContain("Audioabschnitt: 00:00:01 – 00:01:01");
    expect(markdown).toContain(
      "[Originalaufnahme in Google Drive](https://drive.google.com/file/d/audio-1/view)",
    );
    expect(markdown).toContain(
      "[one](https://drive.google.com/file/d/drive-one/view) · 00:00:03",
    );
    expect(markdown).toContain("## Nicht zugeordnete Fotos");
    expect(markdown).toContain(
      "[two](https://drive.google.com/file/d/drive-two/view) · Aufnahmezeit unbekannt",
    );
    expect(markdown).toContain("unsaved (noch nicht in Drive gesichert)");
  });
  it("preserves the verbatim transcript even when it contains Markdown fences", () => {
    const markdown = reportToMarkdown(report());
    expect(markdown).toContain(
      "````text\nText\n```\n<script>literal</script>\n````",
    );
  });
  it("supports legacy photo URLs and prevents duplicate photo output", () => {
    const legacy = report();
    delete legacy.photos;
    legacy.rawPhotoUrls = ["old-drive"];
    legacy.rooms[0].photoIds = [];
    legacy.rooms[0].photoUrls = ["old-drive"];
    expect(reportToMarkdown(legacy)).toContain(
      "https://drive.google.com/file/d/old-drive/view",
    );
    expect(reportToMarkdown(legacy)).not.toContain("Nicht zugeordnete Fotos");
  });
  it("does not allow titles or photo IDs to inject Markdown links", () => {
    const value = report();
    value.title = "First\n# Injected";
    value.photos![0].id = "[bad](javascript:alert(1))";
    value.photos![0].driveId = "abc)/evil";
    const markdown = reportToMarkdown(value);
    expect(markdown).toContain("# First \\# Injected");
    expect(markdown).not.toContain("[bad](javascript:alert(1))");
    expect(markdown).toContain("abc%29%2Fevil");
  });
});
describe("Drive Markdown and JSON synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.save.mockResolvedValue(null);
    mocks.create.mockResolvedValue("folder-1");
    mocks.root.mockResolvedValue("root-1");
    mocks.upload.mockImplementation(
      async (_blob, name, _mime, _folder, _token, existingId) =>
        existingId || (name === "bericht.md" ? "markdown-1" : "json-1"),
    );
  });
  it("writes Markdown first and includes its ID in the JSON export", async () => {
    const value = report();
    value.rooms[0].defects = [
      { id: "one", description: "Riss", status: "done" },
      { id: "two", description: "Tür", status: "open" },
    ];
    const result = await syncReport(value, "drive-token");
    expect(mocks.upload.mock.calls.map((call) => call[1])).toEqual([
      "bericht.md",
      "bericht_daten.json",
    ]);
    expect(await mocks.upload.mock.calls[0][0].text()).toContain("# Begehung");
    const json = JSON.parse(await mocks.upload.mock.calls[1][0].text());
    expect(json.rooms[0].defects).toEqual(value.rooms[0].defects);
    expect(await mocks.upload.mock.calls[0][0].text()).toContain(
      "| Riss | Erledigt |",
    );
    expect(mocks.save.mock.calls[0][0].rooms[0].defects).toEqual(
      value.rooms[0].defects,
    );
    expect(json.driveMarkdownId).toBe("markdown-1");
    expect(json.driveSyncedAt).toBeDefined();
    expect(result.report).toMatchObject({
      driveFolderId: "folder-1",
      driveMarkdownId: "markdown-1",
      driveReportId: "json-1",
    });
    expect(result.warning).toBe(null);
  });
  it("passes existing file IDs for Drive PATCH and returns Firebase warnings", async () => {
    const value = {
      ...report(),
      driveFolderId: "existing-folder",
      driveMarkdownId: "existing-md",
      driveReportId: "existing-json",
    };
    mocks.save.mockResolvedValue("Firebase offline");
    const result = await syncReport(value, "drive-token");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.upload.mock.calls.map((call) => call[5])).toEqual([
      "existing-md",
      "existing-json",
    ]);
    expect(result.warning).toBe("Firebase offline");
  });
  it("retains a completed Markdown upload ID when JSON fails, so retry updates the same file", async () => {
    const value = report();
    mocks.upload
      .mockResolvedValueOnce("markdown-1")
      .mockRejectedValueOnce(new Error("Network lost"));
    await expect(syncReport(value, "drive-token")).rejects.toThrow(
      "Network lost",
    );
    expect(value.driveMarkdownId).toBe("markdown-1");
    expect(value.driveFolderId).toBe("folder-1");
    expect(value.driveSyncedAt).toBeUndefined();
    await syncReport(value, "drive-token");
    expect(mocks.upload.mock.calls[2][5]).toBe("markdown-1");
    expect(mocks.create).toHaveBeenCalledOnce();
  });
});
