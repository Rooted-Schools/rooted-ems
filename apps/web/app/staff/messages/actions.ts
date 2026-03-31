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
  return { error: null };
}
