/**
 * Email delivery via the Resend REST API.
 *
 * Intentionally dependency-free: a plain `fetch` to https://api.resend.com/emails
 * with a Bearer token. If RESEND_API_KEY is not configured this module is a
 * silent no-op so local/dev environments work without a provider.
 *
 * Rule: never throw. An email failure must never break the calling operation
 * (same rule as lib/notify.ts).
 *
 * Open/click tracking (00045): when a caller passes `meta`, a confirmed send
 * is recorded in `email_event` keyed by the Resend message id, so the
 * webhook (app/api/webhooks/resend/route.ts) can later stamp delivery/open/
 * click against it. Requires migration 00045 — until it's applied this is a
 * silent, once-logged no-op, same shape as the RESEND_API_KEY-absent path.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

const FROM_ADDRESS =
  process.env.EMAIL_FROM ?? "Rooted Schools Enrollment <enroll@rootedschool.org>";

let warnedNotConfigured = false;
let warnedEmailEventMissing = false;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Per-campus inbox replies should route to (e.g. vancouver@rootedschool.org). */
  replyTo?: string;
  /** Extra SMTP headers (e.g. List-Unsubscribe on bulk sends). */
  headers?: Record<string, string>;
  /**
   * When provided and the send is confirmed, records a row in `email_event`
   * (migration 00045) so opens/clicks can be attributed back to a lead and a
   * send kind. Optional and purely additive — omit for sends that don't need
   * engagement tracking (most transactional family email).
   */
  meta?: {
    leadId?: string;
    /** 'journey_step' | 'campaign' | 'welcome' | 'reengagement' | 'one_off' */
    kind?: string;
  };
}

export interface SendEmailResult {
  ok: boolean;
  /** Resend's message id, when the provider confirmed the send. */
  id?: string;
  error?: string;
}

/** True when a Postgres error means "the table/relation doesn't exist yet". */
function isMissingTableError(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || /does not exist/i.test(error.message ?? "");
}

/**
 * Best-effort engagement record for a confirmed send. Never throws — a
 * missing migration or a DB blip must never fail the email that already
 * went out. Logs the "table not present" case exactly once per process.
 */
async function recordEmailEvent(input: {
  resendId: string;
  to: string;
  subject: string;
  leadId?: string;
  kind?: string;
}): Promise<void> {
  try {
    const { createServiceRoleClient } = await import("@rooted-ems/database/server");
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("email_event").insert({
      resend_id: input.resendId,
      to_email: input.to,
      lead_id: input.leadId ?? null,
      kind: input.kind ?? "one_off",
      subject: input.subject,
    });
    if (error) {
      if (isMissingTableError(error)) {
        if (!warnedEmailEventMissing) {
          console.debug(
            "[sendEmail] email_event table not present — open/click tracking disabled until migration 00045 is applied"
          );
          warnedEmailEventMissing = true;
        }
        return;
      }
      console.error("[sendEmail] email_event insert failed", error.message);
    }
  } catch (err) {
    console.error("[sendEmail] email_event insert threw", err instanceof Error ? err.message : err);
  }
}

/**
 * Whether Resend is configured in this environment. Mirrors isSmsConfigured()
 * in lib/sms.ts so staff-facing surfaces can report the real delivery state of
 * both channels instead of assuming either one is live.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Send a single email. Resolves `{ ok: false, error }` on any failure —
 * never throws, never rejects.
 */
export async function sendEmail({ to, subject, html, text, replyTo, headers, meta }: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (!warnedNotConfigured) {
      console.debug("[sendEmail] RESEND_API_KEY not set — email delivery disabled");
      warnedNotConfigured = true;
    }
    return { ok: false, error: "email not configured" };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [to],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: [replyTo] } : {}),
        ...(headers ? { headers } : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error = `Resend API error ${response.status}: ${detail.slice(0, 500)}`;
      console.error("[sendEmail]", error, { to, subject });
      return { ok: false, error };
    }

    const body = await response.json().catch(() => null);
    const id = body && typeof (body as { id?: unknown }).id === "string" ? (body as { id: string }).id : undefined;

    if (id && meta) {
      await recordEmailEvent({ resendId: id, to, subject, leadId: meta.leadId, kind: meta.kind });
    }

    return { ok: true, id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[sendEmail] request failed", error, { to, subject });
    return { ok: false, error };
  }
}
