"use server";

import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/auth/get-session";
import { createNote } from "@/lib/mutations/notes";

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

  const result = await createNote({
    entity_type: "pilot_feedback",
    entity_id: session.user_id,
    content,
    is_internal: true,
  });

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath("/staff/feedback");
  return { error: null };
}
