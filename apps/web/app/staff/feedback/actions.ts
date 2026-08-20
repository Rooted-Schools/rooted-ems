"use server";

import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/auth/get-session";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { FEEDBACK_CATEGORIES, type FeedbackCategory } from "./feedback-constants";

/**
 * Pilot feedback lives in its own `pilot_feedback` table (see migration 00053)
 * rather than the generic `note` table, so it can carry a status, an optional
 * screenshot, and a thread of staff replies. Every write here goes through the
 * service-role client after requireStaffSession has proven who the actor is;
 * the table's RLS is a second line of defense, not the primary gate.
 *
 * NOTE: every export in this "use server" file must be an async server action.
 * The category list and its type deliberately live in ./feedback-constants so
 * a client component can import them without corrupting the action wiring.
 */

export async function submitPilotFeedback(input: {
  category: string;
  where?: string;
  body: string;
  screenshotPath?: string;
  campusId?: string | null;
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

  const where = input.where?.trim() || null;
  const screenshotPath = input.screenshotPath?.trim() || null;
  const campusId = input.campusId || null;

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("pilot_feedback").insert({
    author_id: session.user_id,
    campus_id: campusId,
    category,
    context: where,
    body,
    screenshot_path: screenshotPath,
  });

  if (error) {
    console.error("[submitPilotFeedback]", error.message);
    return { error: `Could not save your feedback: ${error.message}` };
  }

  revalidatePath("/staff/feedback");
  return { error: null };
}

/**
 * Add a staff reply to a feedback item. Any staff member can weigh in — the
 * point of the thread is a shared triage conversation.
 */
export async function replyToFeedback(input: {
  feedbackId: string;
  body: string;
}): Promise<{ error: string | null }> {
  const session = await requireStaffSession();

  const body = input.body.trim();
  if (!body) {
    return { error: "Reply can't be empty." };
  }
  if (!input.feedbackId) {
    return { error: "Missing the feedback item." };
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("pilot_feedback_reply").insert({
    feedback_id: input.feedbackId,
    author_id: session.user_id,
    body,
  });

  if (error) {
    console.error("[replyToFeedback]", error.message);
    return { error: `Could not save your reply: ${error.message}` };
  }

  revalidatePath("/staff/feedback");
  return { error: null };
}

/**
 * Flip a feedback item between open and resolved. Records who resolved it and
 * when; clears both when reopened so a stale resolver name never lingers.
 */
export async function setFeedbackResolved(input: {
  feedbackId: string;
  resolved: boolean;
}): Promise<{ error: string | null }> {
  const session = await requireStaffSession();

  if (!input.feedbackId) {
    return { error: "Missing the feedback item." };
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("pilot_feedback")
    .update(
      input.resolved
        ? { status: "resolved", resolved_by: session.user_id, resolved_at: new Date().toISOString() }
        : { status: "open", resolved_by: null, resolved_at: null }
    )
    .eq("id", input.feedbackId);

  if (error) {
    console.error("[setFeedbackResolved]", error.message);
    return { error: `Could not update the status: ${error.message}` };
  }

  revalidatePath("/staff/feedback");
  return { error: null };
}
