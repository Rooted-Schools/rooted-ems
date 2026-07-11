import { createServiceRoleClient } from "@rooted-ems/database/server";

/**
 * Email compliance helpers (LG-0.1).
 *
 * Two suppression layers, checked by every BULK sender (campaigns,
 * re-engagement, journeys). Transactional enrollment mail (offer made,
 * document rejected, …) is exempt by design — a family that applied needs
 * those regardless of marketing preferences.
 *
 *  1. lead.unsubscribed_at — the family clicked unsubscribe.
 *  2. email_suppression   — the provider told us the address hard-bounced
 *     or the recipient marked spam. Address-level, cross-lead.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://enroll.rootedschool.org";

// Re-exported so senders import the placeholder + URL builder together.
export { UNSUB_PLACEHOLDER } from "./email-templates";

export function unsubscribeUrl(token: string): string {
  return `${APP_URL}/unsubscribe?t=${token}`;
}

/** Batch suppression lookup — returns the subset of emails that must NOT be sent to. */
export async function getSuppressedEmails(emails: string[]): Promise<Set<string>> {
  const suppressed = new Set<string>();
  const unique = [...new Set(emails.map((e) => e.toLowerCase()).filter(Boolean))];
  if (unique.length === 0) return suppressed;

  const supabase = createServiceRoleClient();
  for (let i = 0; i < unique.length; i += 500) {
    const { data, error } = await supabase
      .from("email_suppression")
      .select("email")
      .in("email", unique.slice(i, i + 500));
    if (error) {
      console.error("[getSuppressedEmails]", error.message);
      // Fail open on the LOOKUP (a DB blip shouldn't halt a campaign),
      // but log loudly — suppression is a compliance control.
      continue;
    }
    for (const row of data ?? []) suppressed.add((row as { email: string }).email);
  }
  return suppressed;
}

/** Record a provider bounce/complaint and annotate any matching leads. */
export async function suppressEmail(
  email: string,
  reason: "bounce" | "complaint" | "manual",
  detail?: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  const normalized = email.toLowerCase().trim();
  if (!normalized) return;

  await supabase
    .from("email_suppression")
    .upsert({ email: normalized, reason, detail: detail ?? null }, { onConflict: "email" });

  // Annotate matching lead timelines so staff see why outreach stopped.
  const { data: leads } = await supabase
    .from("lead")
    .select("id")
    .ilike("email", normalized)
    .limit(50);
  for (const lead of leads ?? []) {
    await supabase.from("lead_activity").insert({
      lead_id: (lead as { id: string }).id,
      activity_type: "note",
      body:
        reason === "bounce"
          ? "Email address bounced — automated email stopped. Verify the address with the family."
          : reason === "complaint"
            ? "Recipient marked an email as spam — automated email stopped."
            : `Email suppressed (${detail ?? "manual"}).`,
    });
  }
}
