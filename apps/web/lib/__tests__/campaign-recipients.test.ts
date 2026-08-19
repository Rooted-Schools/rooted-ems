/**
 * Pure grouping + delivery-state helpers backing the campaign detail page
 * (app/staff/recruitment/campaigns/[id]). No mocking needed — see
 * lib/campaign-recipients.ts for why these stay dependency-free.
 */
import { describe, it, expect } from "vitest";
import {
  summarizeRecipientStatuses,
  recipientStatusLabel,
  resolveDeliveryState,
} from "@/lib/campaign-recipients";

describe("summarizeRecipientStatuses", () => {
  it("counts real rows by their actual status, not an assumed set", () => {
    const summary = summarizeRecipientStatuses([
      { status: "sent" },
      { status: "sent" },
      { status: "pending" },
      { status: "failed" },
    ]);
    expect(summary).toEqual({
      total: 4,
      byStatus: { sent: 2, pending: 1, failed: 1 },
    });
  });

  it("returns an honest zero for an empty campaign rather than omitting the shape", () => {
    expect(summarizeRecipientStatuses([])).toEqual({ total: 0, byStatus: {} });
  });

  it("counts a status it has never seen before instead of dropping it", () => {
    const summary = summarizeRecipientStatuses([{ status: "suppressed" }, { status: "bounced" }]);
    expect(summary).toEqual({ total: 2, byStatus: { suppressed: 1, bounced: 1 } });
  });
});

describe("recipientStatusLabel", () => {
  it("uses the known label for a known status", () => {
    expect(recipientStatusLabel("sent")).toBe("Sent");
    expect(recipientStatusLabel("pending")).toBe("Pending");
    expect(recipientStatusLabel("failed")).toBe("Failed");
    expect(recipientStatusLabel("suppressed")).toBe("Suppressed");
  });

  it("falls back to a capitalized raw status for anything unrecognized", () => {
    expect(recipientStatusLabel("bounced")).toBe("Bounced");
  });
});

describe("resolveDeliveryState", () => {
  it("reports pending recipients as not sent, regardless of any event", () => {
    expect(resolveDeliveryState("pending", { delivered_at: "2026-08-17T00:00:00Z", opened_at: null, clicked_at: null })).toEqual({
      kind: "not_sent",
    });
  });

  it("reports failed recipients as failed", () => {
    expect(resolveDeliveryState("failed", null)).toEqual({ kind: "failed" });
  });

  it("reports any other non-sent status by its own name, not a guessed bucket", () => {
    expect(resolveDeliveryState("suppressed", null)).toEqual({ kind: "skipped", status: "suppressed" });
  });

  it("reports a sent recipient with no matched event as sent-but-unrecorded, never a failure", () => {
    expect(resolveDeliveryState("sent", null)).toEqual({ kind: "sent_unrecorded" });
  });

  it("reports a sent recipient whose matched event has no timestamps as sent-but-unrecorded", () => {
    expect(
      resolveDeliveryState("sent", { delivered_at: null, opened_at: null, clicked_at: null })
    ).toEqual({ kind: "sent_unrecorded" });
  });

  it("reports delivered when only delivered_at is set", () => {
    expect(
      resolveDeliveryState("sent", { delivered_at: "2026-08-17T00:00:00Z", opened_at: null, clicked_at: null })
    ).toEqual({ kind: "delivered" });
  });

  it("prefers opened over delivered when both are set", () => {
    expect(
      resolveDeliveryState("sent", {
        delivered_at: "2026-08-17T00:00:00Z",
        opened_at: "2026-08-17T01:00:00Z",
        clicked_at: null,
      })
    ).toEqual({ kind: "opened" });
  });

  it("prefers clicked over opened and delivered when all three are set", () => {
    expect(
      resolveDeliveryState("sent", {
        delivered_at: "2026-08-17T00:00:00Z",
        opened_at: "2026-08-17T01:00:00Z",
        clicked_at: "2026-08-17T02:00:00Z",
      })
    ).toEqual({ kind: "clicked" });
  });
});
