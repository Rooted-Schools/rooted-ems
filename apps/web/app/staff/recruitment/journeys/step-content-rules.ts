/**
 * Journey step content rules — pure, no database, no session, no React.
 *
 * These are the rules that decide whether a staff edit to a nurture journey
 * email is allowed to be written. They live on their own so the server
 * mutation (lib/mutations/journeys.ts) and the editor UI
 * ([id]/journey-detail-client.tsx) enforce the exact same thing, and so they
 * can be tested without standing up Supabase.
 *
 * The server is the enforcement point. The client imports these only to show
 * the same message before a round trip; it is never the gate.
 */

/** The only template whose wording lives in the database and is therefore editable. */
export const EDITABLE_TEMPLATE_KEY = "custom";

export const SUBJECT_MAX_LENGTH = 200;
export const BODY_MAX_LENGTH = 4000;

export interface JourneyStepContentInput {
  subject?: string | null;
  bodyEn?: string | null;
  bodyEs?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

/** Trimmed, non-null form of an edit. What actually gets merged into the payload. */
export interface JourneyStepContentValues {
  subject: string;
  bodyEn: string;
  bodyEs: string;
  ctaLabel: string;
  ctaUrl: string;
}

export type StepContentValidation =
  | { ok: true; values: JourneyStepContentValues }
  | { ok: false; error: string };

/**
 * True only for the one template key whose text is stored in journey_step.payload.
 * Every other key ("reintroduction", "event_invite", "deadline") is a built-in
 * whose wording is written in lib/email-templates.ts.
 */
export function isEditableTemplateKey(templateKey: string): boolean {
  return templateKey === EDITABLE_TEMPLATE_KEY;
}

/**
 * The refusal message for a step that cannot be edited here, or null when it
 * can be. Deliberately explicit about WHERE the wording lives, because the
 * alternative a staff member would otherwise assume is "the field is broken."
 * We never convert a built-in step to a custom one to make it editable: that
 * would silently replace a template every campus shares with one campus's copy.
 */
export function refusalForTemplateKey(templateKey: string): string | null {
  if (isEditableTemplateKey(templateKey)) return null;
  return `This step uses the built-in "${templateKey}" template. Its wording lives in the application code, not in the database, so it cannot be edited here. A developer has to change it.`;
}

export function normalizeStepContent(input: JourneyStepContentInput): JourneyStepContentValues {
  return {
    subject: (input.subject ?? "").trim(),
    bodyEn: (input.bodyEn ?? "").trim(),
    bodyEs: (input.bodyEs ?? "").trim(),
    ctaLabel: (input.ctaLabel ?? "").trim(),
    ctaUrl: (input.ctaUrl ?? "").trim(),
  };
}

/**
 * Every content rule, in one place, in the order a staff member would hit them.
 *
 * Spanish is required even though renderCampaignEmail tolerates a blank one:
 * the renderer falls back to the English paragraphs for the Spanish half of
 * the email, so a blank Spanish body does not produce a shorter email, it
 * produces an email that tells a Spanish-reading family the same thing twice
 * in a language they may not read. That is a silent failure, so it is blocked
 * at the edit rather than discovered at the send.
 *
 * The link rule is deliberately narrow: https only. Anything else, including
 * javascript: and data:, is refused rather than sanitized, because this URL
 * is written into an anchor href in a real email.
 */
export function validateStepContent(input: JourneyStepContentInput): StepContentValidation {
  const values = normalizeStepContent(input);

  if (values.subject.length > SUBJECT_MAX_LENGTH) {
    return {
      ok: false,
      error: `The subject is ${values.subject.length} characters. Keep it to ${SUBJECT_MAX_LENGTH} or fewer.`,
    };
  }

  if (!values.bodyEn) {
    return { ok: false, error: "The English message cannot be empty." };
  }
  if (!values.bodyEs) {
    return {
      ok: false,
      error:
        "The Spanish message cannot be empty. Every journey email carries both languages, so a blank Spanish half sends Spanish-reading families the English text instead.",
    };
  }

  if (values.bodyEn.length > BODY_MAX_LENGTH) {
    return {
      ok: false,
      error: `The English message is ${values.bodyEn.length} characters. Keep it to ${BODY_MAX_LENGTH} or fewer.`,
    };
  }
  if (values.bodyEs.length > BODY_MAX_LENGTH) {
    return {
      ok: false,
      error: `The Spanish message is ${values.bodyEs.length} characters. Keep it to ${BODY_MAX_LENGTH} or fewer.`,
    };
  }

  if (values.ctaLabel && !values.ctaUrl) {
    return { ok: false, error: "The button needs a link. Add a button URL, or clear the button label." };
  }
  if (values.ctaUrl && !values.ctaLabel) {
    return { ok: false, error: "The button needs a label. Add a button label, or clear the button URL." };
  }
  if (values.ctaUrl && !values.ctaUrl.startsWith("https://")) {
    return { ok: false, error: "The button URL has to start with https:// ." };
  }

  return { ok: true, values };
}

/**
 * Merge validated content into the step's existing payload.
 *
 * Merge, not replace: journey_step.payload is a free-form jsonb column and
 * anything in it that this editor does not know about (a key some other
 * feature writes, a key added later) survives the edit untouched.
 *
 * The two deletions are intentional, not sloppiness. Clearing the subject
 * field means "go back to the template's own default subject," which
 * renderCampaignEmail produces when payload.subject is absent; clearing both
 * button fields means "no button." Writing empty strings instead would leave
 * an empty subject line and, for the button, a labelled link to nowhere.
 */
export function mergeStepPayload(
  existing: Record<string, unknown> | null | undefined,
  values: JourneyStepContentValues
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(existing ?? {}) };

  if (values.subject) next.subject = values.subject;
  else delete next.subject;

  next.bodyEn = values.bodyEn;
  next.bodyEs = values.bodyEs;

  if (values.ctaLabel && values.ctaUrl) {
    next.ctaLabel = values.ctaLabel;
    next.ctaUrl = values.ctaUrl;
  } else {
    delete next.ctaLabel;
    delete next.ctaUrl;
  }

  return next;
}
