/**
 * Twilio inbound-message webhook — the entry point for family text replies.
 *
 * ── One-time setup in the Twilio console (done by hand; this repo never
 *    holds Twilio credentials) ────────────────────────────────────────────
 *
 *   1. Twilio Console → Phone Numbers → Manage → Active numbers → select the
 *      number in TWILIO_FROM_NUMBER.
 *   2. Under "Messaging", set:
 *        A MESSAGE COMES IN → Webhook
 *        URL    → https://<NEXT_PUBLIC_APP_URL>/api/webhooks/twilio
 *        Method → HTTP POST
 *      Leave the "Primary handler fails" fallback URL empty unless a second
 *      environment is being used as a backstop.
 *   3. Save. No new credentials are required: the signature on every delivery
 *      is verified with the TWILIO_AUTH_TOKEN this app already has.
 *
 *   The URL entered above must match NEXT_PUBLIC_APP_URL + this path exactly,
 *   scheme and host included. Twilio signs the URL it dialed, so a mismatch
 *   (http vs https, a trailing slash, an apex vs www host) makes every
 *   delivery fail signature verification and return 403.
 *
 * ── Behavior ──────────────────────────────────────────────────────────────
 *
 *   - No Twilio configuration in this environment → 404. There is no such
 *     endpoint here, and saying so is more honest than a 403 that implies one.
 *   - Bad or missing X-Twilio-Signature → 403, nothing read, nothing written.
 *   - Anything past the signature check → 200 with empty TwiML. Twilio treats
 *     a non-2xx as a delivery failure and retries, and treats any TwiML body
 *     with a <Message> as an auto-reply to the family. We want neither: staff
 *     answer these texts, not a robot.
 *
 *   No rate limiting: every legitimate request here is signed by Twilio, and
 *   throttling by IP would only ever punish a genuine burst from Twilio's own
 *   egress ranges. The signature is the gate.
 */

import { type NextRequest } from "next/server";
import { handleInboundSms } from "@/lib/inbound-sms";
import { isSmsConfigured } from "@/lib/sms";
import { verifyTwilioSignature } from "@/lib/twilio-signature";

export const dynamic = "force-dynamic";

/** Empty TwiML: acknowledged, no auto-reply. */
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml(): Response {
  return new Response(EMPTY_TWIML, {
    status: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

/**
 * The public URL Twilio signed. Built from NEXT_PUBLIC_APP_URL rather than the
 * incoming request's host, because behind Vercel's proxy the request host is
 * not necessarily the hostname the webhook was configured with.
 */
let warnedNoBaseUrl = false;

/**
 * Same production default lib/notify.ts:27 uses. An empty base produced a
 * relative signing URL that could never match what Twilio signed, so an unset
 * NEXT_PUBLIC_APP_URL rejected every legitimate delivery. Falling back to the
 * real production host makes the common deployment work; the warning below
 * still fires so a genuinely different host gets configured rather than
 * silently mis-signing.
 */
const DEFAULT_APP_URL = "https://enroll.rootedschool.org";

function publicUrl(request: NextRequest): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (!configured && !warnedNoBaseUrl) {
    warnedNoBaseUrl = true;
    console.error(
      `[twilio webhook] NEXT_PUBLIC_APP_URL is not set — falling back to ${DEFAULT_APP_URL} to reconstruct the signed URL. Deliveries will be rejected if the webhook was configured against a different host.`
    );
  }
  const base = configured || DEFAULT_APP_URL;
  const { pathname, search } = request.nextUrl;
  return `${base}${pathname}${search}`;
}

export async function POST(request: NextRequest) {
  if (!isSmsConfigured()) {
    return new Response("Not found", { status: 404 });
  }

  const signature = request.headers.get("x-twilio-signature") ?? "";
  if (!signature) {
    return new Response("Forbidden", { status: 403 });
  }

  // Read the raw body once, then parse it ourselves: the signature is computed
  // over the parameters as sent, so the same parse must feed both the check
  // and the handler.
  const params: Record<string, string> = {};
  try {
    const raw = await request.text();
    for (const [key, value] of new URLSearchParams(raw)) params[key] = value;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const valid = verifyTwilioSignature({
    url: publicUrl(request),
    params,
    signature,
    authToken: process.env.TWILIO_AUTH_TOKEN as string,
  });
  if (!valid) {
    console.warn("[twilio webhook] signature verification failed", {
      messageSid: params.MessageSid ?? null,
    });
    return new Response("Forbidden", { status: 403 });
  }

  const from = params.From ?? "";
  const body = params.Body ?? "";
  const messageSid = params.MessageSid ?? "";

  // A delivery missing the fields that identify it can't be processed or
  // deduped. Acknowledge it so Twilio stops retrying, and log what arrived.
  if (!from || !messageSid) {
    console.warn("[twilio webhook] delivery missing From or MessageSid — acknowledged, not processed", {
      keys: Object.keys(params),
    });
    return twiml();
  }

  // handleInboundSms never throws; the try is belt-and-braces so that a
  // failure inside it still produces a 200 rather than a retry storm.
  try {
    await handleInboundSms({ from, body, messageSid });
  } catch (err) {
    console.error("[twilio webhook] handler failed", err, { messageSid });
  }

  return twiml();
}
