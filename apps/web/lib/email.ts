/**
 * Email delivery via the Resend REST API.
 *
 * Intentionally dependency-free: a plain `fetch` to https://api.resend.com/emails
 * with a Bearer token. If RESEND_API_KEY is not configured this module is a
 * silent no-op so local/dev environments work without a provider.
 *
 * Rule: never throw. An email failure must never break the calling operation
 * (same rule as lib/notify.ts).
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

const FROM_ADDRESS =
  process.env.EMAIL_FROM ?? "Rooted Schools Enrollment <enroll@rootedschool.org>";

let warnedNotConfigured = false;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  ok: boolean;
  error?: string;
}

/**
 * Send a single email. Resolves `{ ok: false, error }` on any failure —
 * never throws, never rejects.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<SendEmailResult> {
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
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error = `Resend API error ${response.status}: ${detail.slice(0, 500)}`;
      console.error("[sendEmail]", error, { to, subject });
      return { ok: false, error };
    }

    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[sendEmail] request failed", error, { to, subject });
    return { ok: false, error };
  }
}
