"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { requireStaffSession } from "@/lib/auth/get-session";

export async function markStaffNotificationsRead(notificationIds: string[]) {
  if (notificationIds.length === 0) return { error: null };

  const session = await requireStaffSession();

  // Service role client for the write; user_id filter ensures ownership scoping
  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("notification")
    .update({ is_read: true, read_at: now })
    .in("id", notificationIds)
    .eq("user_id", session.user_id)
    .eq("is_read", false);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/staff/messages");
  revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
  return { error: null };
}

/**
 * Mark every unread staff-context notification read for the calling user.
 *
 * "Mark all read" in the bell used to pass only the ~10 ids the dropdown had
 * loaded, so the badge kept a count the user had no way to clear. This clears
 * the same set the badge counts.
 *
 * The link filter mirrors applyContextFilter in lib/queries/family.ts: a
 * dual-role user (staff who is also a guardian on an application) must not
 * have their family notifications marked read from the staff bell.
 */
export async function markAllStaffNotificationsRead() {
  const session = await requireStaffSession();

  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("notification")
    .update({ is_read: true, read_at: now })
    .eq("user_id", session.user_id)
    .eq("is_read", false)
    .or("link.is.null,link.like./staff%");

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/staff/messages");
  revalidatePath("/staff/dashboard");
  revalidatePath("/staff/today");
  return { error: null };
}
