"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@rooted-ems/database/server";

export async function markNotificationsRead(notificationIds: string[]) {
  if (notificationIds.length === 0) return { error: null };

  const supabase = await createServerClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("notification")
    .update({ is_read: true, read_at: now })
    .in("id", notificationIds)
    .eq("is_read", false);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/family/messages");
  revalidatePath("/family/dashboard");
  return { error: null };
}
