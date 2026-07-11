import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { suppressEmail } from "@/lib/email-compliance";

/**
 * Resend webhook receiver (LG-0.1 + groundwork for LG-2 engagement).
 *
 * Handles delivery-health events — email.bounced and email.complained go
 * straight to the suppression list so no bulk sender ever emails that
 * address again. (LG-2 will extend this to email.opened / email.clicked
 * for journey branching.)
 *
 * Security: Resend signs webhooks with the Svix scheme. Verification is
 * implemented dependency-free below. Env-gated on RESEND_WEBHOOK_SECRET —
 * without it the endpoint refuses everything (fail closed).
 */

function verifySvix(secret: string, id: string, timestamp: string, payload: string, signatureHeader: string): boolean {
  try {
    // Secret format: whsec_<base64 key>
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const signedContent = `${id}.${timestamp}.${payload}`;
    const expected = crypto.createHmac("sha256", key).update(signedContent).digest("base64");
    // Header may carry multiple space-separated "v1,<sig>" entries.
    return signatureHeader.split(" ").some((part) => {
      const sig = part.split(",")[1];
      return (
        !!sig &&
        sig.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
      );
    });
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const id = request.headers.get("svix-id") ?? "";
  const timestamp = request.headers.get("svix-timestamp") ?? "";
  const signature = request.headers.get("svix-signature") ?? "";
  const payload = await request.text();

  if (!id || !timestamp || !signature || !verifySvix(secret, id, timestamp, payload, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Reject stale deliveries (replay protection, 5-minute window).
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) {
    return NextResponse.json({ error: "Stale timestamp" }, { status: 401 });
  }

  let event: { type?: string; data?: { to?: string[]; bounce?: { subType?: string } } };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const recipients = event.data?.to ?? [];

  if (event.type === "email.bounced") {
    // Suppress hard bounces; soft bounces (full mailbox etc.) get grace.
    const subType = event.data?.bounce?.subType ?? "";
    const isHard = !/mailboxfull|messagetoolarge|contentrejected|attachmentrejected/i.test(subType);
    if (isHard) {
      for (const to of recipients) await suppressEmail(to, "bounce", subType || "hard bounce");
    }
  } else if (event.type === "email.complained") {
    for (const to of recipients) await suppressEmail(to, "complaint", "recipient marked as spam");
  }
  // Other event types acknowledged silently (LG-2 will consume opens/clicks).

  return NextResponse.json({ ok: true });
}
