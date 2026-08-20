"use server";

import { requireMinRole } from "@/lib/auth/get-session";
import { createServiceRoleClient } from "@rooted-ems/database/server";

export interface LeadSyncSummary {
  unique_emails: number;
  to_insert: number;
  to_update: number;
  unchanged: number;
  in_app_not_in_sheet: number;
}

/**
 * Run the C.R. Neal lead sync on demand (the same job the weekly cron runs).
 * The sync itself lives in the `sync-leads` Edge Function, which holds the
 * Google service-account key and reads the [Active].Lead_Tracker tab. This
 * action just authorizes the caller (any system_admin), looks up the shared
 * sync token from the locked sync_config table, and invokes the function.
 */
export async function syncLeadsNow(): Promise<{ ok: boolean; summary?: LeadSyncSummary; error?: string }> {
  await requireMinRole("system_admin");

  const supabase = createServiceRoleClient();
  const { data: cfg, error: cfgErr } = await supabase
    .from("sync_config").select("sync_token").eq("id", 1).single();
  if (cfgErr || !cfg) return { ok: false, error: "Lead sync is not configured yet." };

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-leads`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.sync_token}` },
      body: JSON.stringify({ dryRun: false }),
    });
    const json = await res.json();
    if (!res.ok || json?.error) return { ok: false, error: json?.error ?? `Sync failed (${res.status}).` };
    return { ok: true, summary: json as LeadSyncSummary };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sync could not be reached." };
  }
}
