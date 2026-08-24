import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import romApi from "./rom";

const { post, put } = vi.hoisted(() => ({
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  default: { post, put, get: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/services/socket", () => ({
  default: { connected: true, connect: vi.fn() },
}));

function startHeaders(): Record<string, string> {
  const start = post.mock.calls.find(([url]) => url === "/roms/upload/start");
  return start?.[2]?.headers ?? {};
}

describe("romApi.uploadRoms", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    post.mockReset();
    put.mockReset();
    post.mockResolvedValue({ data: { upload_id: "u-1" } });
    put.mockResolvedValue({ data: { received: 1, total: 1 } });
  });

  it("targets a rom folder through the start headers", async () => {
    const results = await romApi.uploadRoms({
      platformId: 3,
      romId: 42,
      folder: "hack/v2",
      filesToUpload: [new File(["abc"], "fix.ips")],
    });

    expect(results[0].status).toBe("fulfilled");
    expect(startHeaders()).toMatchObject({
      "X-Upload-Platform": "3",
      "X-Upload-Filename": "fix.ips",
      "X-Upload-Rom-Id": "42",
      "X-Upload-Folder": "hack/v2",
    });
    expect(post).toHaveBeenCalledWith(
      "/roms/upload/u-1/complete",
      null,
      expect.anything(),
    );
  });

  it("leaves the rom headers out of a platform upload", async () => {
    await romApi.uploadRoms({
      platformId: 3,
      filesToUpload: [new File(["abc"], "game.zip")],
    });

    const headers = startHeaders();
    expect(headers["X-Upload-Rom-Id"]).toBeUndefined();
    expect(headers["X-Upload-Folder"]).toBeUndefined();
  });

  it("treats an empty folder as the rom root", async () => {
    await romApi.uploadRoms({
      platformId: 3,
      romId: 42,
      folder: "",
      filesToUpload: [new File(["abc"], "readme.txt")],
    });

    expect(startHeaders()["X-Upload-Rom-Id"]).toBe("42");
    expect(startHeaders()["X-Upload-Folder"]).toBeUndefined();
  });
});
