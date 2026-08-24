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

function startBody(): Record<string, unknown> {
  const start = post.mock.calls.find(([url]) => url === "/roms/upload/start");
  return start?.[1] ?? {};
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
    expect(startBody()).toEqual({
      platform_id: 3,
      filename: "fix.ips",
      total_size: 3,
      total_chunks: 1,
      rom_id: 42,
      folder: "hack/v2",
    });
    expect(post).toHaveBeenCalledWith(
      "/roms/upload/u-1/complete",
      null,
      expect.anything(),
    );
  });

  it("leaves the rom fields out of a platform upload", async () => {
    await romApi.uploadRoms({
      platformId: 3,
      filesToUpload: [new File(["abc"], "game.zip")],
    });

    expect(startBody()).toEqual({
      platform_id: 3,
      filename: "game.zip",
      total_size: 3,
      total_chunks: 1,
    });
  });

  it("treats an empty folder as the rom root", async () => {
    await romApi.uploadRoms({
      platformId: 3,
      romId: 42,
      folder: "",
      filesToUpload: [new File(["abc"], "readme.txt")],
    });

    expect(startBody()).toMatchObject({ rom_id: 42 });
    expect(startBody()).not.toHaveProperty("folder");
  });
});
