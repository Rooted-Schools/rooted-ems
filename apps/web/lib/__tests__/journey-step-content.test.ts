/**
 * Journey step content rules.
 *
 * These rules stand between a staff member and an email that real families
 * receive automatically, so the tests are written from the failure direction:
 * for each rule, prove the bad input is REFUSED and that the message a staff
 * member reads explains the actual problem. A rule that silently repairs bad
 * input instead of refusing it is the failure mode being guarded against here,
 * because the repair is what ships to families.
 */
import { describe, it, expect } from "vitest";
import {
  validateStepContent,
  mergeStepPayload,
  normalizeStepContent,
  isEditableTemplateKey,
  refusalForTemplateKey,
  SUBJECT_MAX_LENGTH,
  BODY_MAX_LENGTH,
  type JourneyStepContentInput,
} from "@/app/staff/recruitment/journeys/step-content-rules";

/** A valid edit. Each test breaks exactly one thing about it. */
function goodInput(overrides: Partial<JourneyStepContentInput> = {}): JourneyStepContentInput {
  return {
    subject: "Your seat is still waiting",
    bodyEn: "We are holding your seat.\n\nRegister by Friday to keep it.",
    bodyEs: "Estamos reservando su lugar.\n\nRegistrese antes del viernes.",
    ctaLabel: "Finish registration",
    ctaUrl: "https://enroll.rootedschool.org/registration",
    ...overrides,
  };
}

describe("validateStepContent", () => {
  it("accepts a complete bilingual step with a button", () => {
    const result = validateStepContent(goodInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.values.bodyEn).toContain("holding your seat");
      expect(result.values.ctaUrl).toBe("https://enroll.rootedschool.org/registration");
    }
  });

  it("accepts a step with no button at all", () => {
    const result = validateStepContent(goodInput({ ctaLabel: "", ctaUrl: "" }));
    expect(result.ok).toBe(true);
  });

  it("accepts a blank subject, which falls back to the template default", () => {
    const result = validateStepContent(goodInput({ subject: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values.subject).toBe("");
  });

  // ── Spanish is required ────────────────────────────────

  it("rejects a blank Spanish body", () => {
    const result = validateStepContent(goodInput({ bodyEs: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Spanish message cannot be empty/i);
  });

  it("rejects a Spanish body that is only whitespace", () => {
    const result = validateStepContent(goodInput({ bodyEs: "   \n\n\t  " }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Spanish/i);
  });

  it("rejects a missing Spanish body when the key is absent entirely", () => {
    const result = validateStepContent({ bodyEn: "English only." });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Spanish/i);
  });

  it("says WHY Spanish matters, so the message is actionable", () => {
    const result = validateStepContent(goodInput({ bodyEs: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/English text/i);
  });

  // ── English is required ────────────────────────────────

  it("rejects a blank English body", () => {
    const result = validateStepContent(goodInput({ bodyEn: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/English message cannot be empty/i);
  });

  it("rejects an English body that is only whitespace", () => {
    const result = validateStepContent(goodInput({ bodyEn: "\n   \n" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/English/i);
  });

  // ── Length ceilings ────────────────────────────────────

  it("accepts a subject at exactly the ceiling", () => {
    const result = validateStepContent(goodInput({ subject: "s".repeat(SUBJECT_MAX_LENGTH) }));
    expect(result.ok).toBe(true);
  });

  it("rejects a subject one character over the ceiling", () => {
    const result = validateStepContent(goodInput({ subject: "s".repeat(SUBJECT_MAX_LENGTH + 1) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(new RegExp(`${SUBJECT_MAX_LENGTH}`));
  });

  it("accepts an English body at exactly the ceiling", () => {
    const result = validateStepContent(goodInput({ bodyEn: "e".repeat(BODY_MAX_LENGTH) }));
    expect(result.ok).toBe(true);
  });

  it("rejects an English body one character over the ceiling", () => {
    const result = validateStepContent(goodInput({ bodyEn: "e".repeat(BODY_MAX_LENGTH + 1) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/English message is/i);
  });

  it("rejects a Spanish body one character over the ceiling", () => {
    const result = validateStepContent(goodInput({ bodyEs: "e".repeat(BODY_MAX_LENGTH + 1) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Spanish message is/i);
  });

  it("measures length after trimming, so trailing whitespace alone never blocks a save", () => {
    const result = validateStepContent(
      goodInput({ bodyEn: `${"e".repeat(BODY_MAX_LENGTH)}          ` })
    );
    expect(result.ok).toBe(true);
  });

  // ── Button label and URL travel together ───────────────

  it("rejects a button label with no URL", () => {
    const result = validateStepContent(goodInput({ ctaUrl: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/needs a link/i);
  });

  it("rejects a button URL with no label", () => {
    const result = validateStepContent(goodInput({ ctaLabel: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/needs a label/i);
  });

  it("treats a whitespace-only label as absent rather than as a label", () => {
    const result = validateStepContent(goodInput({ ctaLabel: "   " }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/needs a label/i);
  });

  // ── Only https links ───────────────────────────────────

  it("rejects a javascript: button URL", () => {
    const result = validateStepContent(goodInput({ ctaUrl: "javascript:alert(1)" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/https:\/\//);
  });

  it("rejects a plain http:// button URL", () => {
    const result = validateStepContent(goodInput({ ctaUrl: "http://enroll.rootedschool.org" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a data: button URL", () => {
    const result = validateStepContent(goodInput({ ctaUrl: "data:text/html,<script>alert(1)</script>" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a mailto: button URL", () => {
    const result = validateStepContent(goodInput({ ctaUrl: "mailto:enroll@rootedschool.org" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a relative button URL", () => {
    const result = validateStepContent(goodInput({ ctaUrl: "/registration" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a scheme hidden behind leading whitespace, because the URL is trimmed first", () => {
    const result = validateStepContent(goodInput({ ctaUrl: "   javascript:alert(1)" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/https:\/\//);
  });

  it("accepts a leading-whitespace https URL and stores it trimmed", () => {
    const result = validateStepContent(goodInput({ ctaUrl: "  https://enroll.rootedschool.org  " }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values.ctaUrl).toBe("https://enroll.rootedschool.org");
  });
});

describe("template editability", () => {
  it("treats only 'custom' as editable", () => {
    expect(isEditableTemplateKey("custom")).toBe(true);
    expect(isEditableTemplateKey("reintroduction")).toBe(false);
    expect(isEditableTemplateKey("event_invite")).toBe(false);
    expect(isEditableTemplateKey("deadline")).toBe(false);
    expect(isEditableTemplateKey("")).toBe(false);
  });

  it("refuses a built-in template and names it in the refusal", () => {
    const refusal = refusalForTemplateKey("reintroduction");
    expect(refusal).not.toBeNull();
    expect(refusal).toContain("reintroduction");
  });

  it("explains that a built-in template's wording lives in code, not in the database", () => {
    const refusal = refusalForTemplateKey("reintroduction") ?? "";
    expect(refusal).toMatch(/code/i);
    expect(refusal).toMatch(/cannot be edited here/i);
  });

  it("does not refuse a custom step", () => {
    expect(refusalForTemplateKey("custom")).toBeNull();
  });

  it("refuses an unrecognized template key rather than assuming it is editable", () => {
    expect(refusalForTemplateKey("something_new")).not.toBeNull();
  });
});

describe("normalizeStepContent", () => {
  it("trims every field and turns null or missing into an empty string", () => {
    const values = normalizeStepContent({
      subject: "  Hello  ",
      bodyEn: "  En  ",
      bodyEs: null,
      ctaUrl: "  https://example.org  ",
    });
    expect(values).toEqual({
      subject: "Hello",
      bodyEn: "En",
      bodyEs: "",
      ctaLabel: "",
      ctaUrl: "https://example.org",
    });
  });
});

describe("mergeStepPayload", () => {
  const values = {
    subject: "New subject",
    bodyEn: "New English",
    bodyEs: "Nuevo espanol",
    ctaLabel: "Apply",
    ctaUrl: "https://enroll.rootedschool.org",
  };

  it("keeps payload keys this editor does not know about", () => {
    const merged = mergeStepPayload({ someFutureKey: "keep me", bodyEn: "old" }, values);
    expect(merged.someFutureKey).toBe("keep me");
    expect(merged.bodyEn).toBe("New English");
  });

  it("writes all five known fields when they are all present", () => {
    const merged = mergeStepPayload({}, values);
    expect(merged).toEqual({
      subject: "New subject",
      bodyEn: "New English",
      bodyEs: "Nuevo espanol",
      ctaLabel: "Apply",
      ctaUrl: "https://enroll.rootedschool.org",
    });
  });

  it("removes the subject key when the subject is cleared, so the template default applies", () => {
    const merged = mergeStepPayload({ subject: "old subject" }, { ...values, subject: "" });
    expect("subject" in merged).toBe(false);
  });

  it("removes both button keys when the button is cleared, leaving no orphan link", () => {
    const merged = mergeStepPayload(
      { ctaLabel: "old", ctaUrl: "https://old.example.org" },
      { ...values, ctaLabel: "", ctaUrl: "" }
    );
    expect("ctaLabel" in merged).toBe(false);
    expect("ctaUrl" in merged).toBe(false);
  });

  it("handles a null existing payload", () => {
    const merged = mergeStepPayload(null, values);
    expect(merged.bodyEs).toBe("Nuevo espanol");
  });

  it("does not mutate the existing payload object", () => {
    const existing = { bodyEn: "old", someFutureKey: 1 };
    mergeStepPayload(existing, values);
    expect(existing.bodyEn).toBe("old");
  });
});
