import { afterEach, describe, expect, it } from "vitest";
import { isSmsConfigured, normalizePhone, sendSms, SMS_NOT_CONFIGURED } from "@/lib/sms";

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
    expect(result.error).toBe(SMS_NOT_CONFIGURED);
  });
});

describe("isSmsConfigured", () => {
  const TWILIO_VARS = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"] as const;

  afterEach(() => {
    for (const key of TWILIO_VARS) delete process.env[key];
  });

  function setAll() {
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "token_test";
    process.env.TWILIO_FROM_NUMBER = "+15555550100";
  }

  it("is false when nothing is set", () => {
    expect(isSmsConfigured()).toBe(false);
  });

  it("is true only when all three credentials are present", () => {
    setAll();
    expect(isSmsConfigured()).toBe(true);
  });

  // A half-configured provider must read as "not connected" — otherwise staff
  // are told a text went out that Twilio would have rejected at send time.
  it.each(TWILIO_VARS)("is false when %s is missing", (missing) => {
    setAll();
    delete process.env[missing];
    expect(isSmsConfigured()).toBe(false);
  });

  // Guards the .env.example drift that kept SMS silently off: the sending
  // number is TWILIO_FROM_NUMBER, not TWILIO_PHONE_NUMBER.
  it("does not accept TWILIO_PHONE_NUMBER as the sending number", () => {
    setAll();
    delete process.env.TWILIO_FROM_NUMBER;
    process.env.TWILIO_PHONE_NUMBER = "+15555550100";
    expect(isSmsConfigured()).toBe(false);
    delete process.env.TWILIO_PHONE_NUMBER;
  });
});
