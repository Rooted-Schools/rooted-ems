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
 *
 * Two-way email (00046) — the INBOUND_REPLY_ADDRESS choke point:
 *
 * Today, every family-facing send that threads a campus inbox (lib/notify.ts
 * emailGuardian → resolveCampus().email) sets Reply-To directly to that
 * campus's real mailbox. A parent's reply goes straight there and this app
 * never sees it.
 *
 * INBOUND_REPLY_ADDRESS turns that around at exactly one point: when the env
 * var is set AND a caller passes a (truthy) `replyTo`, the Reply-To actually
 * sent is INBOUND_REPLY_ADDRESS instead of the caller's value. Replies then
 * land on Resend's inbound webhook (app/api/webhooks/resend/route.ts →
 * lib/inbound-email.ts), which records the reply on the family's timeline,
 * alerts campus staff in-app, AND forwards a full copy to the campus's real
 * inbox with the parent's address as the forward's Reply-To — so a human at
 * the campus still gets it and can just hit reply to talk to the family
 * directly. See lib/inbound-email.ts for that side.
 *
 * `preserveReplyTo` is the escape hatch from this same choke point: the
 * inbound-email forward itself calls sendEmail with replyTo set to the
 * parent's own address, and that value must NOT be swapped to
 * INBOUND_REPLY_ADDRESS (a forward whose reply-to routed back into the
 * inbound pipeline would create a loop and defeat the point of forwarding).
 * No other caller should ever need this flag.
 *
 * Unset INBOUND_REPLY_ADDRESS = the swap never fires = exactly today's
 * behavior (Reply-To = campus inbox, unchanged). This is the only change
 * this migration makes to lib/email.ts.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

const FROM_ADDRESS =
  process.env.EMAIL_FROM ?? "Rooted Schools Enrollment <enroll@rootedschool.org>";

/**
 * When set, this becomes the Reply-To on every send that would otherwise
 * carry a campus inbox as Reply-To — see the file header comment above.
 * May be a bare address ("inbound@rootedschool.org") or, per the `from`
 * field's documented "Name <addr>" format, a display-name form
 * ("Rooted Schools <inbound@rootedschool.org>"). Resend's API reference does
 * not explicitly confirm display-name support on `reply_to` the way it does
 * for `from`, so either form is accepted here as-is and passed straight
 * through rather than guessed at or reformatted.
 */
const INBOUND_REPLY_ADDRESS = process.env.INBOUND_REPLY_ADDRESS || undefined;

let warnedNotConfigured = false;
let warnedEmailEventMissing = false;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Per-campus inbox replies should route to (e.g. vancouver@rootedschool.org). */
  replyTo?: string;
  /**
   * Skip the INBOUND_REPLY_ADDRESS choke-point swap for this send (see file
   * header). Only the inbound-email forward (lib/inbound-email.ts) should
   * ever set this — everyone else wants the swap to apply when configured.
   */
  preserveReplyTo?: boolean;
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

/** Extract the bare address from "Name <addr>" or return the trimmed input. */
function bareAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

/**
 * Reduce a recipient address to just its domain for logging, e.g.
 * "jane@example.com" -> "…@example.com". Mirrors the phone-number redaction
 * in lib/sms.ts (see the comment there): the address itself is family PII,
 * and subjects on family email routinely embed a student's first name, so
 * neither belongs in a server log even on a failed send.
 */
function redactedRecipient(address: string): string {
  const bare = bareAddress(address);
  const at = bare.lastIndexOf("@");
  return at === -1 ? "…" : `…@${bare.slice(at + 1)}`;
}

/**
 * True when `email` is one of this app's own sending addresses
 * (FROM_ADDRESS or INBOUND_REPLY_ADDRESS), compared as bare addresses,
 * case-insensitive. Used by the inbound-email loop guard
 * (lib/inbound-email.ts): a reply that appears to come FROM one of our own
 * addresses is a forward loop, never a real family, and must never be
 * processed as one.
 */
export function isOwnSendingAddress(email: string | undefined | null): boolean {
  if (!email) return false;
  const candidate = bareAddress(email);
  const ownAddresses = [FROM_ADDRESS, INBOUND_REPLY_ADDRESS].filter(
    (v): v is string => Boolean(v)
  );
  return ownAddresses.some((own) => bareAddress(own) === candidate);
}

/**
 * Send a single email. Resolves `{ ok: false, error }` on any failure —
 * never throws, never rejects.
 */
export async function sendEmail({ to, subject, html, text, replyTo, preserveReplyTo, headers, meta }: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (!warnedNotConfigured) {
      console.debug("[sendEmail] RESEND_API_KEY not set — email delivery disabled");
      warnedNotConfigured = true;
    }
    return { ok: false, error: "email not configured" };
  }

  // The one INBOUND_REPLY_ADDRESS choke point (see file header). Only swaps
  // a Reply-To that was actually going to be sent — a caller with no
  // replyTo at all is unaffected either way.
  const effectiveReplyTo =
    replyTo && INBOUND_REPLY_ADDRESS && !preserveReplyTo ? INBOUND_REPLY_ADDRESS : replyTo;

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
        ...(effectiveReplyTo ? { reply_to: [effectiveReplyTo] } : {}),
        ...(headers ? { headers } : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error = `Resend API error ${response.status}: ${detail.slice(0, 500)}`;
      console.error("[sendEmail]", error, { to: redactedRecipient(to) });
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
    console.error("[sendEmail] request failed", error, { to: redactedRecipient(to) });
    return { ok: false, error };
  }
}
