/**
 * Twilio inbound-webhook signature verification.
 *
 * Deliberately NOT in lib/sms.ts. That module exports `isSmsConfigured()`,
 * which staff pages call to tell the truth about whether texting is live —
 * and one of those pages (app/staff/settings/page.tsx) declares
 * `runtime = "edge"`. The edge runtime has no Node `crypto`, so a top-level
 * crypto import anywhere in lib/sms.ts's module graph fails the build for
 * every edge page that touches it. Signature verification is a Node-only
 * webhook concern with exactly one production consumer
 * (app/api/webhooks/twilio/route.ts), so it lives here instead and
 * lib/sms.ts stays edge-safe.
 */

import crypto from "crypto";

/**
 * Verify Twilio's `X-Twilio-Signature` on an inbound webhook request.
 *
 * Twilio's scheme, exactly as documented: take the full URL Twilio was
 * configured to call (including any query string), append every POST
 * parameter as `key + value` in ascending key order, HMAC-SHA1 the result
 * with the account's auth token, and base64 the digest.
 *
 * Two things matter for correctness. The URL must be the PUBLIC one Twilio
 * dialed, not whatever host header reached the process behind a proxy — the
 * caller builds it from NEXT_PUBLIC_APP_URL. And the comparison is
 * timing-safe, because this signature is the only thing standing between the
 * webhook and anyone who can guess the path.
 *
 * Returns false rather than throwing on any malformed input: an unparseable
 * signature is a failed signature.
 */
export function verifyTwilioSignature({
  url,
  params,
  signature,
  authToken,
}: {
  url: string;
  params: Record<string, string>;
  signature: string;
  authToken: string;
}): boolean {
  try {
    if (!signature || !authToken) return false;

    const payload = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], url);

    const expected = crypto.createHmac("sha1", authToken).update(payload, "utf8").digest("base64");

    const provided = Buffer.from(signature, "utf8");
    const computed = Buffer.from(expected, "utf8");
    if (provided.length !== computed.length) return false;
    return crypto.timingSafeEqual(provided, computed);
  } catch {
    return false;
  }
}
