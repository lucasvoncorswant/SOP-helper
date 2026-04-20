import { describe, expect, it } from "vitest";
import { normalizeTicketTextForEmbedding } from "./ticketText.js";

describe("normalizeTicketTextForEmbedding", () => {
  it("returns plain text for unstructured messages", () => {
    expect(normalizeTicketTextForEmbedding("How do I reset a password?")).toBe(
      "How do I reset a password?",
    );
  });

  it("strips Slack user mentions", () => {
    expect(
      normalizeTicketTextForEmbedding("Hello <@U123ABC> please help"),
    ).toBe("Hello  please help");
  });

  it("extracts structured fields when Request Tech Support style", () => {
    const raw = `Request Tech Support
Thank you boilerplate here
Urgency: high
Team: CRM
Summary: Batch failed
Description: 504 timeout batch_id=abc
Reporter: someone
Timestamp: today`;

    const out = normalizeTicketTextForEmbedding(raw);
    expect(out).toContain("Urgency: high");
    expect(out).toContain("Team: CRM");
    expect(out).toContain("Summary: Batch failed");
    expect(out).toContain("Description:");
    expect(out).toContain("504");
    expect(out).not.toContain("Thank you boilerplate");
  });

  it("detects structured ticket via Urgency/Summary/Description headers", () => {
    const raw = `Urgency: low
Summary: Test
Description: Something broke`;

    const out = normalizeTicketTextForEmbedding(raw);
    expect(out).toContain("Summary: Test");
    expect(out).toContain("Description:");
  });
});
