import crypto from "crypto";

/**
 * Scopes the public inquiry form's optional "tell us more" follow-up
 * (Step 2, submitted after Step 1 already created the lead) to the exact
 * lead a family just created in their own browser — never a general
 * update-any-lead endpoint.
 *
 * The token is an HMAC over the lead id. Step 1's response hands
 * `{ leadId, token }` to the client, which holds it only in component state
 * (never persisted). Step 2's server action recomputes the HMAC from the
 * lead id it's given and compares it against the token before any update —
 * a family can only ever prove ownership of the one lead id whose token
 * they were actually issued.
 *
 * Key material, in precedence order. Unlike lib/rate-limit.ts — where the
 * same env var only salts an IP hash and a known salt costs nothing — this
 * key is an AUTHORIZATION boundary, so it must never fall back to a literal
 * that ships in the repository. A published key would let anyone holding a
 * lead id mint a valid token for it.
 *
 *   1. INQUIRY_TOKEN_SECRET — a dedicated secret, if one is configured.
 *   2. CRON_SECRET — the secret this app already requires for cron auth.
 *   3. SUPABASE_SERVICE_ROLE_KEY — always present in any environment that
 *      can create a lead at all (createLeadFromInquiry goes through
 *      createServiceRoleClient), and never public. HMAC does not expose its
 *      key, so using it here does not weaken the key itself.
 *
 * With none of the three set, signing and verification both fail closed:
 * Step 1 still creates the lead and the family still gets the response
 * engine; only the optional Step 2 follow-up is unavailable. Silently
 * accepting forged tokens is never the safer default.
 */

function secret(): string | null {
  return (
    process.env.INQUIRY_TOKEN_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    null
  );
}

const HEX_64 = /^[0-9a-f]{64}$/i;

let warnedNoSecret = false;

function warnNoSecret(): void {
  if (warnedNoSecret) return;
  warnedNoSecret = true;
  console.error(
    "[inquiry-token] no signing key available (INQUIRY_TOKEN_SECRET / CRON_SECRET / SUPABASE_SERVICE_ROLE_KEY all unset) — " +
      "the optional Step 2 inquiry follow-up is disabled. Step 1 is unaffected."
  );
}

/** Returns "" when no key is configured — callers treat that as "no Step 2". */
export function signInquiryLeadToken(leadId: string): string {
  const key = secret();
  if (!key) {
    warnNoSecret();
    return "";
  }
  return crypto.createHmac("sha256", key).update(`inquiry-details:${leadId}`).digest("hex");
}

export function verifyInquiryLeadToken(leadId: string, token: string | null | undefined): boolean {
  if (!leadId || !token || !HEX_64.test(token)) return false;
  const expectedHex = signInquiryLeadToken(leadId);
  if (!expectedHex) return false; // no key — fail closed, never accept
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(token, "hex");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
