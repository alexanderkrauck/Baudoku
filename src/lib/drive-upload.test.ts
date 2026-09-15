import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./session", () => ({
  rememberToken: vi.fn(),
  driveToken: () => "token",
}));
import { uploadFileToFolder } from "./drive";
afterEach(() => vi.unstubAllGlobals());
describe("resumable uploads", () => {
  it("continues at the server-confirmed byte after an interrupted request", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { Location: "https://www.googleapis.com/upload/session" },
        }),
      )
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 308,
          headers: { Range: "bytes=0-4194303" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "saved" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);
    const blob = new Blob([new Uint8Array(6 * 1024 * 1024)]);
    expect(
      await uploadFileToFolder(
        blob,
        "audio.webm",
        "audio/webm",
        "folder",
        "token",
      ),
    ).toBe("saved");
    expect(fetch.mock.calls[2][1].headers["Content-Range"]).toBe(
      `bytes */${blob.size}`,
    );
    expect(fetch.mock.calls[3][1].headers["Content-Range"]).toBe(
      `bytes 4194304-${blob.size - 1}/${blob.size}`,
    );
  });
  it("does not retry indefinitely when Drive acknowledges no progress", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 308 }));
    fetch.mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { Location: "https://www.googleapis.com/upload/session" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      uploadFileToFolder(
        new Blob([new Uint8Array(6 * 1024 * 1024)]),
        "a",
        "audio/webm",
        "folder",
        "token",
      ),
    ).rejects.toThrow("ohne Fortschritt");
    expect(fetch).toHaveBeenCalledTimes(5);
  });
});
