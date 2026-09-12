"use server";

import { createServerClient } from "@rooted-ems/database/server";
import { requireMinRole, getAccessibleCampusIds } from "@/lib/auth/get-session";
import { getCampusLogoAbsoluteUrl } from "@/lib/campus-identity";
import { sendEmail } from "@/lib/email";
import { findNotificationTestTemplate } from "@/lib/notification-test-emails";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://enroll.rootedschool.org";

/**
 * Send the logged-in staff member a preview of one automated notification
 * email, rendered with the selected campus's real branding/contact and
 * representative sample data (see lib/notification-test-emails.ts).
 *
 * Deliberately NOT recorded to email_event / communication_log — this goes to
 * the staff member, not a family, so it must never appear in delivery stats or
 * the communications log. Mirrors the campaign "send test" path.
 */
export async function sendNotificationTestEmail(
  templateKey: string,
  campusId: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireMinRole("enrollment_manager");
  if (!session.email) return { ok: false, error: "Your account has no email address on file." };

  // Only a campus this staff member can actually access — same gate the rest
  // of the console uses. (A CMO-level admin holds every campus id here.)
  const accessible = getAccessibleCampusIds(session);
  if (accessible.length > 0 && !accessible.includes(campusId)) {
    return { ok: false, error: "You don't have access to that campus." };
  }

  const template = findNotificationTestTemplate(templateKey);
  if (!template) return { ok: false, error: "Unknown email template." };

  const supabase = await createServerClient();
  const { data: campus, error } = await supabase
    .from("campus")
    .select("name, email, phone, short_code, timezone")
    .eq("id", campusId)
    .maybeSingle();

  if (error || !campus) return { ok: false, error: "Could not load that campus." };

  const rendered = template.build({
    campusName: (campus.name as string) ?? "your school",
    campusLogoUrl: getCampusLogoAbsoluteUrl(campus.short_code as string | null, APP_URL),
    campusEmail: (campus.email as string | null) ?? null,
    campusPhone: (campus.phone as string | null) ?? null,
    timeZone: (campus.timezone as string | null) ?? null,
  });

  const result = await sendEmail({
    to: session.email,
    subject: `[TEST] ${rendered.subject}`,
    html: rendered.html,
    text: rendered.text,
    // No `meta`: a preview to staff must never land in email_event or the
    // communications log.
  });

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.error === "email not configured"
          ? "Email isn't configured in this environment."
          : "The test send failed. Check the email provider configuration.",
    };
  }
  return { ok: true };
}
