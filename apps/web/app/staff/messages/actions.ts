"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@rooted-ems/database/server";

export async function markStaffNotificationsRead(notificationIds: string[]) {
  if (notificationIds.length === 0) return { error: null };

  const supabase = createServiceRoleClient();

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

  revalidatePath("/staff/messages");
  return { error: null };
}
