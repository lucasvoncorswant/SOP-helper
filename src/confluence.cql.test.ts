import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("buildSopSearchCql", () => {
  beforeEach(() => {
    vi.stubEnv("CONFLUENCE_SOP_CQL", 'label = "sop" and type = page');
    vi.stubEnv("CONFLUENCE_SOP_ROOT_PAGE_IDS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns base CQL when no root page ids", async () => {
    const { buildSopSearchCql } = await import("./confluence.js");
    expect(buildSopSearchCql()).toBe('label = "sop" and type = page');
  });

  it("adds single-folder ancestor scope", async () => {
    vi.stubEnv("CONFLUENCE_SOP_ROOT_PAGE_IDS", "5357142043");
    const { buildSopSearchCql } = await import("./confluence.js");
    expect(buildSopSearchCql()).toBe(
      '(label = "sop" and type = page) and (ancestor = 5357142043 or id = 5357142043)',
    );
  });

  it("adds multiple root scopes with or", async () => {
    vi.stubEnv("CONFLUENCE_SOP_ROOT_PAGE_IDS", "111,222");
    const { buildSopSearchCql } = await import("./confluence.js");
    expect(buildSopSearchCql()).toBe(
      '(label = "sop" and type = page) and ((ancestor = 111 or id = 111) or (ancestor = 222 or id = 222))',
    );
  });
});
