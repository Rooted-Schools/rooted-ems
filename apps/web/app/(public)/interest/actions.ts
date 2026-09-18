"use server";

import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@rooted-ems/database/server";

/** Same shape the unsubscribe/survey links use — see page.tsx. */
const TOKEN_RE = /^[0-9a-f-]{36}$/i;

/**
 * Records the optional follow-up details (scholar's first name, and the
 * "tell us more" free text when the family picked "other") after they've
 * already answered the one-question survey. The survey token is the only
 * capability here too — same as the GET flow in page.tsx — so this never
 * trusts a lead id from the client.
 *
 * Silently no-ops on an invalid or unknown token and redirects back to the
 * same calm page either way, for the same reason page.tsx does: this must
 * never reveal whether a given token exists.
 */
export async function submitInterestDetails(formData: FormData): Promise<void> {
  const token = formData.get("t");
  const choice = formData.get("c");
  const studentFirstName = (formData.get("studentFirstName") as string | null)?.trim();
  const otherText = (formData.get("otherText") as string | null)?.trim();

  const tokenIsValid = typeof token === "string" && TOKEN_RE.test(token);

  if (tokenIsValid) {
    const supabase = createServiceRoleClient();
    const { data: lead } = await supabase
      .from("lead")
      .select("id")
      .eq("survey_token", token)
      .maybeSingle();

    if (lead) {
      const patch: Record<string, string> = {};
      if (studentFirstName) patch.student_first_name = studentFirstName;
      if (otherText) patch.interest_focus_other = otherText;
      if (Object.keys(patch).length > 0) {
        await supabase.from("lead").update(patch).eq("id", lead.id);
      }
    }
  }

  const params = new URLSearchParams();
  if (typeof token === "string") params.set("t", token);
  if (typeof choice === "string") params.set("c", choice);
  params.set("saved", "1");
  redirect(`/interest?${params.toString()}`);
}
