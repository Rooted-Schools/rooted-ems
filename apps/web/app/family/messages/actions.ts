"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@rooted-ems/database/server";
import { handleInboundEmail } from "@/lib/inbound-email";

/**
 * Let a family send a message to their school from inside the portal. The
 * messages page used to be a read-only inbox, so a family had no way to reach
 * the school without leaving the system (a pilot tester flagged this).
 *
 * The message rides the SAME pipeline that already handles email replies from
 * families: handleInboundEmail matches the sender by email to their guardian
 * record, resolves the campus from their most recent application, stores the
 * message in inbound_email, notifies campus staff, and forwards it to the
 * campus inbox. Staff read it in /staff/communications/inbound, exactly where
 * email replies land. Nothing leaves the system.
 */
export async function sendMessageToSchool(input: { subject: string; body: string }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!user.email) return { error: "Your account has no email on file to send from." };

  const body = input.body.trim();
  if (!body) return { error: "Please write a message before sending." };
  const subject = input.subject.trim().slice(0, 200) || "Message from a family";

  // A synthetic providerId marks the portal origin and lets the pipeline
  // dedupe if the submit is retried (each send is unique by design).
  const outcome = await handleInboundEmail({
    fromEmail: user.email,
    subject: `[Portal] ${subject}`,
    text: body,
    providerId: `portal:${user.id}:${Date.now()}`,
  });

  // stored OR notified means the school will see it. Only when neither
  // happened did the send truly fail.
  if (!outcome.stored && !outcome.notified) {
    return { error: "We could not send your message. Please try again." };
  }

  revalidatePath("/family/messages");
  return { error: null };
}

export async function markNotificationsRead(notificationIds: string[]) {
  if (notificationIds.length === 0) return { error: null };

  const supabase = await createServerClient();

  // Auth check — only mark notifications belonging to the current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("notification")
    .update({ is_read: true, read_at: now })
    .in("id", notificationIds)
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/family/messages");
  revalidatePath("/family/dashboard");
  return { error: null };
}
