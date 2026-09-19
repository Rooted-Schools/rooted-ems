"use server";

import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { isInterestFocusKey } from "@/lib/lead-interest-survey";

/** Same shape the unsubscribe/survey links use. */
const TOKEN_RE = /^[0-9a-f-]{36}$/i;

// This is an unauthenticated write path: anyone holding a forwarded link
// can post to it. The token still scopes the write to one lead, but the
// text itself is unbounded user input that staff later read in the console,
// so cap it at a length a real answer never exceeds rather than storing
// whatever arrives.
const MAX_NAME = 100;
const MAX_NOTE = 1000;

/**
 * Records the family's one-question survey answer. This is the ONLY place
 * interest_focus is ever written — page.tsx's GET handler deliberately does
 * not touch the database (see the comment there), so an email security
 * gateway prefetching the survey links can never fabricate an answer. This
 * only runs on an explicit POST from the confirm screen's plain <form>, no
 * JavaScript required.
 *
 * Same anti-enumeration contract as submitInterestDetails below: an invalid
 * or unknown token silently no-ops and redirects to exactly the same place
 * a real one would, so this endpoint can never be used to test whether a
 * given token/lead exists. A rate-limit throttle behaves the same way —
 * it never surfaces to the caller, it just skips the write — for the same
 * reason: whether a request got throttled must not be observable either.
 */
export async function confirmInterestChoice(formData: FormData): Promise<void> {
  const token = formData.get("t");
  const choice = formData.get("c");

  // LG-0.4-style generous per-IP throttle: stops a script from replaying
  // this POST across many tokens, never a family re-clicking because the
  // page felt slow. Failure (including a throttled request) is silent by
  // design — see the redirect below, which happens unconditionally.
  const rl = await checkRateLimit("interest-survey-confirm", 10, 60);

  const tokenIsValid = typeof token === "string" && TOKEN_RE.test(token);
  const choiceIsValid = typeof choice === "string" && isInterestFocusKey(choice);

  if (rl.allowed && tokenIsValid && choiceIsValid) {
    // Narrowed (not just checked) so the writes below are typed as the
    // strings the validity checks above already confirmed them to be.
    const validToken = token as string;
    const validChoice = choice as string;

    const supabase = createServiceRoleClient();
    const { data: lead } = await supabase
      .from("lead")
      .select("id")
      .eq("survey_token", validToken)
      .maybeSingle();

    if (lead) {
      // Always write on a valid (token, choice) pair — re-picking the same
      // option or a different one both re-stamp answered_at, since a family
      // changing their mind later is legitimate, not an error.
      const { error } = await supabase
        .from("lead")
        .update({
          interest_focus: validChoice,
          interest_focus_answered_at: new Date().toISOString(),
          // Clear a stale "other" note when the family switches to a
          // different option, so it doesn't linger under the new choice.
          ...(validChoice === "other" ? {} : { interest_focus_other: null }),
        })
        .eq("id", lead.id);

      if (error) {
        // A real failure on a KNOWN, valid lead — a constraint violation or
        // connection blip, not the anti-enumeration silence below. This must
        // be visible somewhere or a broken write disappears with no trace.
        console.error("[confirmInterestChoice] update failed for lead", lead.id, error.message);
      }
    }
    // No `else`: an unknown token silently does nothing and falls through to
    // exactly the same redirect as a real one.
  }

  const params = new URLSearchParams();
  if (typeof token === "string") params.set("t", token);
  if (typeof choice === "string") params.set("c", choice);
  params.set("confirmed", "1");
  redirect(`/interest?${params.toString()}`);
}

/**
 * Records the optional follow-up details (scholar's first name, and the
 * "tell us more" free text when the family picked "other") after they've
 * already confirmed the one-question survey. The survey token is the only
 * capability here too — same as confirmInterestChoice above — so this never
 * trusts a lead id from the client.
 *
 * Silently no-ops on an invalid or unknown token and redirects back to the
 * same calm page either way, for the same reason confirmInterestChoice does:
 * this must never reveal whether a given token exists.
 */
export async function submitInterestDetails(formData: FormData): Promise<void> {
  const token = formData.get("t");
  const choice = formData.get("c");
  const studentFirstName = (formData.get("studentFirstName") as string | null)?.trim();
  const otherText = (formData.get("otherText") as string | null)?.trim();

  // Same generous per-IP throttle as confirmInterestChoice — this is a
  // second, separate public write on the same page.
  const rl = await checkRateLimit("interest-survey-details", 10, 60);

  const tokenIsValid = typeof token === "string" && TOKEN_RE.test(token);

  if (rl.allowed && tokenIsValid) {
    const validToken = token as string;
    const supabase = createServiceRoleClient();
    const { data: lead } = await supabase
      .from("lead")
      .select("id")
      .eq("survey_token", validToken)
      .maybeSingle();

    if (lead) {
      const patch: Record<string, string> = {};
      if (studentFirstName) patch.student_first_name = studentFirstName.slice(0, MAX_NAME);
      if (otherText) patch.interest_focus_other = otherText.slice(0, MAX_NOTE);
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("lead").update(patch).eq("id", lead.id);
        if (error) {
          // Same reasoning as confirmInterestChoice: a failure on a KNOWN,
          // valid lead must be visible, unlike the silent unknown-token path.
          console.error("[submitInterestDetails] update failed for lead", lead.id, error.message);
        }
      }
    }
  }

  const params = new URLSearchParams();
  if (typeof token === "string") params.set("t", token);
  if (typeof choice === "string") params.set("c", choice);
  params.set("confirmed", "1");
  params.set("saved", "1");
  redirect(`/interest?${params.toString()}`);
}
