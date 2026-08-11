import { describe, it, expect } from "vitest";
import { AUTOMATED_MESSAGES, FUNNEL_STAGE_ORDER, _internal } from "../automated-messages";

describe("AUTOMATED_MESSAGES registry", () => {
  it("has at least one entry", () => {
    expect(AUTOMATED_MESSAGES.length).toBeGreaterThan(0);
  });

  it("every key is unique", () => {
    const keys = AUTOMATED_MESSAGES.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every entry declares a funnel stage in FUNNEL_STAGE_ORDER", () => {
    for (const entry of AUTOMATED_MESSAGES) {
      expect(FUNNEL_STAGE_ORDER).toContain(entry.funnelStage);
    }
  });

  it("every entry has a non-empty trigger sentence", () => {
    for (const entry of AUTOMATED_MESSAGES) {
      expect(entry.trigger.trim().length).toBeGreaterThan(0);
    }
  });

  it("every entry declares at least one channel", () => {
    for (const entry of AUTOMATED_MESSAGES) {
      expect(entry.channels.length).toBeGreaterThan(0);
    }
  });

  it("every entry claiming the email channel renders non-empty subject/text", () => {
    for (const entry of AUTOMATED_MESSAGES) {
      if (!entry.channels.includes("email")) continue;
      expect(entry.renderEmail, `${entry.key} claims "email" but has no renderEmail`).toBeTypeOf("function");
      const rendered = entry.renderEmail!();
      expect(rendered.subject.trim().length, `${entry.key} subject`).toBeGreaterThan(0);
      expect(rendered.text.trim().length, `${entry.key} text body`).toBeGreaterThan(0);
      expect(rendered.html.trim().length, `${entry.key} html body`).toBeGreaterThan(0);
    }
  });

  it("every entry claiming the sms channel renders a non-empty body", () => {
    for (const entry of AUTOMATED_MESSAGES) {
      if (!entry.channels.includes("sms")) continue;
      expect(entry.renderSms, `${entry.key} claims "sms" but has no renderSms`).toBeTypeOf("function");
      const rendered = entry.renderSms!();
      expect(rendered.trim().length, `${entry.key} sms body`).toBeGreaterThan(0);
    }
  });

  it("email bodies include both an English and a Spanish section", () => {
    // Every real bilingual template in lib/email-templates.ts separates its
    // English and Spanish sections with a "----------" divider (see
    // renderEmail() there) — a template that lost its Spanish half would
    // still pass the non-empty check above but fail this one.
    for (const entry of AUTOMATED_MESSAGES) {
      if (!entry.channels.includes("email")) continue;
      const rendered = entry.renderEmail!();
      expect(rendered.text, `${entry.key} should contain the EN/ES divider`).toContain("----------");
    }
  });
});

describe("registrationNudge SMS transcription", () => {
  it("matches lib/nudge-copy.ts's registrationNudgeSms exactly", () => {
    // This is the one SMS transcription in lib/automated-messages.ts we can
    // mechanically guarantee against drift, because lib/nudge-copy.ts
    // exports its SMS body as a real, importable function. Every other SMS
    // entry is copied by hand from an inline string in lib/notify.ts or the
    // event-followups cron route, which have no exported function to diff
    // against.
    expect(_internal.smsRegistrationNudge()).toBe(_internal.realRegistrationNudgeSms());
  });
});
