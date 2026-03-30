"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";

export async function staffUpdateCapacity(
  planId: string,
  totalSeats: number
): Promise<{ error: string | null }> {
  try {
    const session = await requireStaffSession();
    const supabase = createServiceRoleClient();

    // Verify the capacity plan belongs to a campus the user can access
    const accessibleCampusIds = getAccessibleCampusIds(session);
    const { data: plan } = await supabase
      .from("capacity_plan")
      .select("campus_id")
      .eq("id", planId)
      .single();

    if (!plan || (accessibleCampusIds.length > 0 && !accessibleCampusIds.includes(plan.campus_id))) {
      return { error: "You do not have access to modify this capacity plan." };
    }

    const { error } = await supabase
      .from("capacity_plan")
      .update({ total_seats: totalSeats })
      .eq("id", planId);

    if (error) return { error: error.message };
    revalidatePath("/staff/seats");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/reports");
    return { error: null };
  } catch {
    return { error: "Failed to update capacity" };
  }
}
