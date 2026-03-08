"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@rooted-ems/database/server";

export async function staffUpdateCapacity(
  planId: string,
  totalSeats: number
): Promise<{ error: string | null }> {
  try {
    const supabase = await createServerClient();

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
