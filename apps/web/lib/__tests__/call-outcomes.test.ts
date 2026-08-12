/**
 * Structured call outcome helpers — the encode/decode pair that lets the
 * "Log a call" dialog (app/staff/recruitment/[id]/lead-detail-client.tsx)
 * store a structured outcome inside lead_activity.body as a readable prefix
 * ("[Reached] ...") and read it back out for the "wrong number" phone flag
 * and the follow-up queue's "callback due" grouping. No schema change, no
 * mocking needed — pure string logic.
 */
import { describe, it, expect } from "vitest";
import { CALL_OUTCOMES, buildCallOutcomeBody, bodyHasOutcome } from "@/lib/lead-call-outcomes";

describe("CALL_OUTCOMES", () => {
  it("has exactly the four outcomes the call log dialog offers", () => {
    expect(CALL_OUTCOMES.map((o) => o.key)).toEqual([
      "reached",
      "voicemail",
      "wrong_number",
      "callback",
    ]);
  });
});

describe("buildCallOutcomeBody", () => {
  it("prefixes the outcome label with no note", () => {
    expect(buildCallOutcomeBody("reached", "")).toBe("[Reached]");
  });

  it("prefixes the outcome label ahead of a trimmed note", () => {
    expect(buildCallOutcomeBody("reached", "  Spoke with mom, very interested.  ")).toBe(
      "[Reached] Spoke with mom, very interested."
    );
  });

  it("falls back to the raw key if it's ever passed an unknown outcome", () => {
    expect(buildCallOutcomeBody("mystery", "note")).toBe("[mystery] note");
  });

  it.each([
    ["voicemail", "Left voicemail"],
    ["wrong_number", "Wrong number"],
    ["callback", "Call back later"],
  ])("labels %s as \"%s\"", (key, label) => {
    expect(buildCallOutcomeBody(key, "")).toBe(`[${label}]`);
  });
});

describe("bodyHasOutcome", () => {
  it("matches a body built by buildCallOutcomeBody for the same outcome", () => {
    const body = buildCallOutcomeBody("wrong_number", "Disconnected tone.");
    expect(bodyHasOutcome(body, "wrong_number")).toBe(true);
  });

  it("does not match a different outcome's body", () => {
    const body = buildCallOutcomeBody("reached", "All good.");
    expect(bodyHasOutcome(body, "wrong_number")).toBe(false);
    expect(bodyHasOutcome(body, "callback")).toBe(false);
  });

  it("is false for null, undefined, and freeform legacy note bodies", () => {
    expect(bodyHasOutcome(null, "callback")).toBe(false);
    expect(bodyHasOutcome(undefined, "callback")).toBe(false);
    expect(bodyHasOutcome("Called, no answer.", "callback")).toBe(false);
  });
});
