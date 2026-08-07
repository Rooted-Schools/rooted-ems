import crypto from "crypto";

/**
 * Scopes the public inquiry form's optional "tell us more" follow-up
 * (Step 2, submitted after Step 1 already created the lead) to the exact
 * lead a family just created in their own browser — never a general
 * update-any-lead endpoint.
 *
 * The token is an HMAC over the lead id, signed with the same server
 * secret `checkRateLimit` already uses to hash IPs (see lib/rate-limit.ts).
 * Step 1's response hands `{ leadId, token }` to the client, which holds it
 * only in component state (never persisted). Step 2's server action
 * recomputes the HMAC from the lead id it's given and compares it against
 * the token before any update — a family can only ever prove ownership of
 * the one lead id whose token they were actually issued.
 */

function secret(): string {
  return process.env.CRON_SECRET ?? "rooted-rl";
}

const HEX_64 = /^[0-9a-f]{64}$/i;

export function signInquiryLeadToken(leadId: string): string {
  return crypto.createHmac("sha256", secret()).update(`inquiry-details:${leadId}`).digest("hex");
}

export function verifyInquiryLeadToken(leadId: string, token: string | null | undefined): boolean {
  if (!leadId || !token || !HEX_64.test(token)) return false;
  const expected = Buffer.from(signInquiryLeadToken(leadId), "hex");
  const actual = Buffer.from(token, "hex");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
