import { describe, expect, it } from "vitest";
import {
  extractTicketSemantics,
  intentionObjectAlignment,
} from "./ticketSemantics.js";

describe("extractTicketSemantics", () => {
  it("expands structured CRM phone update into embedding query with intentions and objects", () => {
    const raw = `Urgency: medium
Team: CRM
Summary: customer phone number need to be updated
Description: user reported wrong number in CRM`;

    const sem = extractTicketSemantics(raw);
    expect(sem.useAlignment).toBe(true);
    expect(sem.embeddingQuery.toLowerCase()).toContain("update");
    expect(sem.embeddingQuery.toLowerCase()).toContain("phone");
    expect(sem.intentionFamilies).toContain("update");
    expect(sem.objectTerms.some((t) => t.includes("phone"))).toBe(true);
  });
});

describe("intentionObjectAlignment", () => {
  it("ranks updating-phone SOP higher than debug/PII when ticket wants update", () => {
    const raw = `Urgency: low
Team: CRM
Summary: customer phone number need to be updated
Description: fix it`;

    const sem = extractTicketSemantics(raw);

    const updatePhone = intentionObjectAlignment(
      sem,
      "SOPs- Updating Client Phone Numbers in the Production",
      "Steps to update phone fields in production CRM.",
    );
    const piiLogs = intentionObjectAlignment(
      sem,
      "SOPs - Debugging and PII Logs",
      "How to read logs; phone numbers may appear in PII audit trails.",
    );
    const password = intentionObjectAlignment(
      sem,
      "SOPs- EZ Bot Password Reset",
      "Reset user password via EZ Bot flow; unrelated to CRM phone fields.",
    );

    expect(updatePhone).toBeGreaterThan(piiLogs);
    expect(piiLogs).toBeGreaterThan(password);
  });
});
