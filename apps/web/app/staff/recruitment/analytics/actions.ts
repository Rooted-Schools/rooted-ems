"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@rooted-ems/database/server";
import { requireStaffSession } from "@/lib/auth/get-session";

/**
 * Record ad spend for a campus/channel/month (LG-2 cost tracking). Feeds
 * cost-per-enrolled on the funnel dashboard — the number the board asks for.
 */
export async function staffRecordSpend(input: {
  campus_id: string;
  channel: string;
  amount_dollars: number;
  period_month: string; // YYYY-MM
  note?: string;
}) {
  const session = await requireStaffSession();
  const supabase = await createServerClient();

  const cents = Math.round((input.amount_dollars || 0) * 100);
  if (!input.campus_id || cents <= 0) {
    return { error: "Enter a campus and a dollar amount." };
  }

  const { error } = await supabase.from("channel_spend").insert({
    campus_id: input.campus_id,
    channel: input.channel?.slice(0, 40) || "ads",
    amount_cents: cents,
    period_month: `${input.period_month}-01`,
    note: input.note?.slice(0, 200) || null,
    created_by: session.user_id,
  });

  if (error) {
    console.error("[staffRecordSpend]", error.message);
    return { error: "Failed to record spend." };
  }
  revalidatePath("/staff/recruitment/analytics");
  return { error: null };
}
