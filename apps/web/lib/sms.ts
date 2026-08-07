/**
 * SMS delivery via the Twilio REST API.
 *
 * Intentionally dependency-free (same philosophy as lib/email.ts): a plain
 * `fetch` to the Twilio Messages endpoint with Basic auth. When the TWILIO_*
 * environment variables are not configured this module is a silent no-op so
 * local/dev environments work without a provider.
 *
 * Rule: never throw. An SMS failure must never break the calling operation
 * (same rule as lib/notify.ts and lib/email.ts).
 *
 * Consent rule: callers must only pass numbers whose guardian has
 * sms_consent = true. This module trusts its callers on consent; the
 * gate lives in lib/notify.ts where guardian records are resolved.
 */

// No Node built-ins in this module, on purpose. `isSmsConfigured()` below is
// called from app/staff/settings/page.tsx, which runs on the edge runtime —
// a top-level `crypto` import here fails that page's build. Twilio signature
// verification therefore lives in lib/twilio-signature.ts, imported only by
// the Node-runtime webhook route.

const SEND_TIMEOUT_MS = 10_000;

let warnedNotConfigured = false;

/**
 * The single sentinel every caller checks to tell "no provider configured"
 * apart from a real send failure. Exported so nobody has to string-match a
 * literal that could drift.
 */
export const SMS_NOT_CONFIGURED = "sms not configured";

/**
 * Whether Twilio credentials are present in this environment. The three vars
 * are all-or-nothing: a partial set is treated as not configured, because a
 * half-configured provider fails at send time instead of at boot.
 *
 * Callers use this to tell staff the truth ("SMS is not connected") rather
 * than reporting a text that never left the process.
 */
export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
  );
}

export interface SendSmsInput {
  /** E.164 or US 10-digit; normalized best-effort before sending. */
  to: string;
  body: string;
}

export interface SendSmsResult {
  ok: boolean;
  error?: string;
}

/**
 * Normalize a phone number toward E.164. US-centric on purpose: all three
 * campuses are US schools and families enter numbers in US formats.
 * Returns null when the input can't plausibly be a phone number.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    const rest = digits.slice(1).replace(/\D/g, "");
    return rest.length >= 10 ? `+${rest}` : null;
  }
  const bare = digits.replace(/\D/g, "");
  if (bare.length === 10) return `+1${bare}`;
  if (bare.length === 11 && bare.startsWith("1")) return `+${bare}`;
  return null;
}

/**
 * The last 10 digits of a phone number, or null when there aren't 10.
 *
 * Inbound Twilio numbers always arrive in E.164 ("+15555550100"), but the
 * same number may be stored on a guardian or lead row in whatever format the
 * family typed it: "(555) 555-0100", "555-555-0100", "1 555 555 0100". The
 * last 10 digits are the stable identity across all of those, so inbound
 * matching compares on this and nothing else.
 *
 * Caveat, stated rather than hidden: for a non-US number this drops the
 * country code, so two numbers from different countries sharing a 10-digit
 * tail would compare equal. Both sides of the comparison use the same rule,
 * and all three campuses are US schools, so this is the right trade today.
 */
export function phoneDigits10(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/**
 * Send a single SMS. Resolves `{ ok: false, error }` on any failure —
 * never throws, never rejects.
 */
export async function sendSms({ to, body }: SendSmsInput): Promise<SendSmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  // Checked inline rather than via isSmsConfigured() so TypeScript narrows
  // all three to string for the request below.
  if (!accountSid || !authToken || !fromNumber) {
    if (!warnedNotConfigured) {
      console.debug("[sendSms] TWILIO_* env vars not set — SMS delivery disabled");
      warnedNotConfigured = true;
    }
    return { ok: false, error: SMS_NOT_CONFIGURED };
  }

  const normalized = normalizePhone(to);
  if (!normalized) {
    return { ok: false, error: `unusable phone number` };
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: normalized,
          From: fromNumber,
          Body: body,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error = `Twilio API error ${response.status}: ${detail.slice(0, 300)}`;
      // Log the destination only partially — phone numbers are family PII.
      console.error("[sendSms]", error, { to: `…${normalized.slice(-4)}` });
      return { ok: false, error };
    }

    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[sendSms] request failed", error, { to: `…${(normalizePhone(to) ?? "").slice(-4)}` });
    return { ok: false, error };
  }
}
