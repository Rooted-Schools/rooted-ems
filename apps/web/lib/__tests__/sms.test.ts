import { describe, expect, it } from "vitest";
import { normalizePhone, sendSms } from "@/lib/sms";

describe("normalizePhone", () => {
  it("normalizes US 10-digit formats to E.164", () => {
    expect(normalizePhone("(555) 555-0100")).toBe("+15555550100");
    expect(normalizePhone("555-555-0100")).toBe("+15555550100");
    expect(normalizePhone("5555550100")).toBe("+15555550100");
  });

  it("handles 11-digit with leading 1 and explicit +", () => {
    expect(normalizePhone("15555550100")).toBe("+15555550100");
    expect(normalizePhone("+1 555 555 0100")).toBe("+15555550100");
    expect(normalizePhone("+52 55 1234 5678")).toBe("+525512345678");
  });

  it("rejects unusable input", () => {
    expect(normalizePhone("555-0100")).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("sendSms", () => {
  it("no-ops safely when Twilio env vars are unset", async () => {
    const result = await sendSms({ to: "5555550100", body: "test" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("sms not configured");
  });
});
