import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("chunkPageText", () => {
  beforeEach(() => {
    vi.stubEnv("CHUNK_SIZE_CHARS", "80");
    vi.stubEnv("CHUNK_OVERLAP_CHARS", "10");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns empty array for blank text", async () => {
    const { chunkPageText } = await import("./chunk.js");
    expect(chunkPageText("p1", "   ")).toEqual([]);
  });

  it("splits long text into chunks with indices", async () => {
    const { chunkPageText } = await import("./chunk.js");
    const body = "a".repeat(200);
    const chunks = chunkPageText("page-9", body);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].pageId).toBe("page-9");
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[1].chunkIndex).toBe(1);
    expect(chunks.every((c) => c.text.length <= 80)).toBe(true);
  });
});
