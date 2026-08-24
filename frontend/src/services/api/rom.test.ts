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

function startCall(): { body: unknown; headers: Record<string, string> } {
  const start = post.mock.calls.find(([url]) => url === "/roms/upload/start");
  return { body: start?.[1], headers: start?.[2]?.headers ?? {} };
}

describe("romApi.uploadRoms", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    post.mockReset();
    put.mockReset();
    post.mockResolvedValue({ data: { upload_id: "u-1" } });
    put.mockResolvedValue({ data: { received: 1, total: 1 } });
  });

  it("targets a rom folder through the start payload", async () => {
    const results = await romApi.uploadRoms({
      platformId: 3,
      romId: 42,
      folder: "hack/v2",
      filesToUpload: [new File(["abc"], "fix.ips")],
    });

    expect(results[0].status).toBe("fulfilled");
    expect(startCall().headers).toMatchObject({
      "X-Upload-Platform": "3",
      "X-Upload-Filename": "fix.ips",
    });
    expect(startCall().body).toEqual({ rom_id: 42, folder: "hack/v2" });
    expect(post).toHaveBeenCalledWith(
      "/roms/upload/u-1/complete",
      null,
      expect.anything(),
    );
  });

  it("sends no body for a platform upload", async () => {
    await romApi.uploadRoms({
      platformId: 3,
      filesToUpload: [new File(["abc"], "game.zip")],
    });

    expect(startCall().body).toBeNull();
    expect(startCall().headers["X-Upload-Filename"]).toBe("game.zip");
  });

  it("treats an empty folder as the rom root", async () => {
    await romApi.uploadRoms({
      platformId: 3,
      romId: 42,
      folder: "",
      filesToUpload: [new File(["abc"], "readme.txt")],
    });

    expect(startCall().body).toEqual({ rom_id: 42 });
  });
});
