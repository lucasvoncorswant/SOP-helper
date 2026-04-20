import { describe, expect, it } from "vitest";
import {
  keywordSimilarity,
  normalizeCosineForBlend,
  tokenizeForKeyword,
} from "./keyword.js";

describe("keywordSimilarity", () => {
  it("returns 1 for identical token sets", () => {
    const s = "reset password SSO login failure";
    expect(keywordSimilarity(s, s)).toBe(1);
  });

  it("returns 0 when there is no overlap", () => {
    expect(
      keywordSimilarity("apple banana", "xyz abc def"),
    ).toBe(0);
  });

  it("scores partial overlap between query and document", () => {
    const q = "database connection timeout error";
    const d =
      "Title: DB\n\nWhen you see a connection timeout error, check the database pool.";
    const k = keywordSimilarity(q, d);
    expect(k).toBeGreaterThan(0.2);
    expect(k).toBeLessThan(1);
  });
});

describe("normalizeCosineForBlend", () => {
  it("maps cosine -1..1 to 0..1", () => {
    expect(normalizeCosineForBlend(-1)).toBe(0);
    expect(normalizeCosineForBlend(0)).toBe(0.5);
    expect(normalizeCosineForBlend(1)).toBe(1);
  });
});

describe("tokenizeForKeyword", () => {
  it("drops stopwords and short tokens", () => {
    expect(tokenizeForKeyword("the a an")).toEqual([]);
  });
});
