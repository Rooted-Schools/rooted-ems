"use server";

import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/auth/get-session";
import { createServiceRoleClient } from "@rooted-ems/database/server";

export const FEEDBACK_CATEGORIES = ["Bug", "Confusing", "Idea", "Working well"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/**
 * Record a pilot feedback entry as a `note` row (entity_type "pilot_feedback").
 * There is no natural parent record for a standalone feedback item, so
 * entity_id is the author's own user id — `note.entity_id` is a bare NOT NULL
 * UUID column with no foreign key, so this is a safe, always-valid value.
 * campus_id is left null on purpose: pilot feedback is meant to be read
 * across campuses (the RLS note_staff policy already grants every staff
 * member read/write on null-campus rows), so scoping it to the author's
 * campus would just make it harder for Tim, Lalah, and Steven to see each
 * other's notes.
 *
 * The category and optional "where" context are folded into the note body
 * as a leading structured tag (e.g. "[Bug] (Recruitment follow-up queue) …")
 * rather than new columns, per the no-migration constraint. The feed page
 * parses the tag back out for display.
 */
export async function submitPilotFeedback(input: {
  category: string;
  where?: string;
  body: string;
}): Promise<{ error: string | null }> {
  const session = await requireStaffSession();

  const category = input.category as FeedbackCategory;
  if (!FEEDBACK_CATEGORIES.includes(category)) {
    return { error: "Choose a valid category." };
  }

  const body = input.body.trim();
  if (!body) {
    return { error: "Feedback can't be empty." };
  }

  const where = input.where?.trim();
  const tag = where ? `[${category}] (${where})` : `[${category}]`;
  const content = `${tag} ${body}`;

  // Write directly with the service-role client and the session we already
  // validated above. The generic createNote helper re-authenticated with its
  // own auth.getUser() round-trip, which returned null in the server-action
  // context and made every submission fail before the insert was ever
  // attempted. requireStaffSession already proved who this is, so both
  // entity_id and created_by come from that session.
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("note").insert({
    entity_type: "pilot_feedback",
    entity_id: session.user_id,
    content,
    is_internal: true,
    created_by: session.user_id,
  });

  if (error) {
    // Pilot feedback is how Tim and Lalah tell us what is broken, so a failure
    // here has to say what happened rather than send them away with nothing.
    console.error("[submitPilotFeedback]", error.message);
    return { error: `Could not save your feedback: ${error.message}` };
  }

  revalidatePath("/staff/feedback");
  return { error: null };
}
