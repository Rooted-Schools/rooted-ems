/**
 * Delivery record contracts for automated family messages.
 *
 * Every milestone message a family gets (application received, offer extended,
 * waitlist result, registration steps) goes out through lib/notify.ts. Until
 * recently none of them wrote a communication_log row, so when a parent called
 * to say "we never got the offer email" the staff member on the phone had no
 * record the message had ever been attempted, and a provider failure existed
 * only as a console line.
 *
 * buildDeliveryLogRow shapes that record. Two properties matter enough to pin
 * down here:
 *   - it never claims more than the provider confirmed, and
 *   - it identifies the message by template, never by copying a subject or
 *     body that names the student into a table every staff member can read.
 */
import { describe, it, expect, vi } from "vitest";

// lib/notify.ts reaches the database, the mutations barrel, and both
// providers at import time. buildDeliveryLogRow itself is pure.
vi.mock("@rooted-ems/database/server", () => ({
  createServerClient: async () => ({}),
  createServiceRoleClient: () => ({}),
}));
vi.mock("@/lib/mutations", () => ({
  sendNotification: vi.fn(async () => ({ data: null, error: null })),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(async () => ({ ok: true })),
  SMS_NOT_CONFIGURED: "sms not configured",
}));

import { buildDeliveryLogRow } from "@/lib/notify";

const AT = "2027-03-01T10:00:00.000Z";

const OFFER_CONTEXT = {
  campusId: "campus-1",
  recipientUserId: "guardian-user-1",
  templateKey: "offerExtended",
};

describe("buildDeliveryLogRow", () => {
  it("records a confirmed send as sent, with the provider's message id", () => {
    const row = buildDeliveryLogRow({
      channel: "email",
      recipientAddress: "parent@example.com",
      logTag: "notifyFamilyOfOffer",
      context: OFFER_CONTEXT,
      ok: true,
      providerMessageId: "resend-abc",
      at: AT,
    });

    expect(row.status).toBe("sent");
    expect(row.sent_at).toBe(AT);
    expect(row.error_message).toBeNull();
    expect(row.external_id).toBe("resend-abc");
  });

  it("does not claim delivery for a message the provider merely accepted", () => {
    // Resend accepting a message is not a mailbox receiving it. delivered_at
    // belongs to the webhook; filling it here would tell a parent on the phone
    // that a message landed when all we know is that it was sent.
    const row = buildDeliveryLogRow({
      channel: "email",
      recipientAddress: "parent@example.com",
      logTag: "notifyFamilyOfOffer",
      context: OFFER_CONTEXT,
      ok: true,
      providerMessageId: "resend-abc",
      at: AT,
    });

    expect(row.delivered_at).toBeNull();
  });

  it("records a provider failure as failed, keeping the provider's own error", () => {
    const row = buildDeliveryLogRow({
      channel: "email",
      recipientAddress: "parent@example.com",
      logTag: "notifyFamilyOfOffer",
      context: OFFER_CONTEXT,
      ok: false,
      error: "Resend API error 422: invalid recipient",
      at: AT,
    });

    expect(row.status).toBe("failed");
    expect(row.sent_at).toBeNull();
    expect(row.external_id).toBeNull();
    expect(row.error_message).toBe("Resend API error 422: invalid recipient");
  });

  it("still states a reason when the provider gave none", () => {
    const row = buildDeliveryLogRow({
      channel: "email",
      recipientAddress: "parent@example.com",
      logTag: "notifyFamilyOfOffer",
      context: OFFER_CONTEXT,
      ok: false,
      at: AT,
    });

    expect(row.status).toBe("failed");
    expect(row.error_message).toBe("Delivery failed.");
  });

  it("identifies the message by template and never copies the rendered content", () => {
    const row = buildDeliveryLogRow({
      channel: "email",
      recipientAddress: "parent@example.com",
      logTag: "notifyFamilyOfOffer",
      context: OFFER_CONTEXT,
      ok: true,
      at: AT,
    });

    expect(row.subject).toBe("Automated email: offerExtended");
    expect(row.body).toContain("offerExtended");
    expect(row.body).toContain("notifyFamilyOfOffer");

    // The rendered subject of this template is "Seat offer for <name> at
    // <campus>". A student's name must not reach a row every staff member at
    // the campus can read — the same rule that took student names back out of
    // stored notification subjects.
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("Seat offer for");
    expect(serialized).not.toContain("Congratulations");
  });

  it("carries the campus and the recipient so staff can find the record", () => {
    const row = buildDeliveryLogRow({
      channel: "email",
      recipientAddress: "parent@example.com",
      logTag: "notifyFamilyOfOffer",
      context: OFFER_CONTEXT,
      ok: true,
      at: AT,
    });

    expect(row.campus_id).toBe("campus-1");
    expect(row.recipient_user_id).toBe("guardian-user-1");
    expect(row.recipient_address).toBe("parent@example.com");
    expect(row.channel).toBe("email");
  });

  it("records a null campus or recipient rather than inventing one", () => {
    // A lead has no portal account, and some sends resolve no campus. Null is
    // the honest value; a placeholder would file the record under a campus
    // nobody chose.
    const row = buildDeliveryLogRow({
      channel: "email",
      recipientAddress: "lead@example.com",
      logTag: "notifyLeadWelcome",
      context: { templateKey: "inquiryWelcome" },
      ok: true,
      at: AT,
    });

    expect(row.campus_id).toBeNull();
    expect(row.recipient_user_id).toBeNull();
  });

  it("logs a text against the phone it was sent to, on the sms channel", () => {
    const row = buildDeliveryLogRow({
      channel: "sms",
      recipientAddress: "+15035550142",
      logTag: "notifyFamilyOfOffer",
      context: { ...OFFER_CONTEXT, templateKey: "offerExtendedSms" },
      ok: true,
      at: AT,
    });

    expect(row.channel).toBe("sms");
    expect(row.recipient_address).toBe("+15035550142");
    expect(row.subject).toBe("Automated text message: offerExtendedSms");
    expect(row.external_id).toBeNull();
  });
});
