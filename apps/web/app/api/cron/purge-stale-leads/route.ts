import { createServiceRoleClient } from "@rooted-ems/database/server";
import { NextResponse, type NextRequest } from "next/server";
import { recordCronRun } from "@/lib/cron-heartbeat";
import { AuditAction, logAuditEvent } from "@/lib/audit";

/**
 * Data-retention cron (LG-0.5): never-converted leads are marketing PII
 * with a defined lifecycle, not a forever archive.
 *
 * Policy: a lead is purged when ALL of the following hold —
 *   - never converted (no application_id, never reached 'applied')
 *   - RETENTION_MONTHS with no activity (created + last contact + reengagement
 *     all older than the window)
 * Deletion cascades activities and campaign enrollments. A single audit row
 * records the count per campus (never the identities — that's the point).
 *
 * Runs monthly (vercel.json, 1st of the month). Capped per run so a first
 * execution years from now can't lock the table.
 */

const RETENTION_MONTHS = 24;
const RUN_CAP = 500;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
  const cutoffIso = cutoff.toISOString();

  const { data: stale, error } = await supabase
    .from("lead")
    .select("id, campus_id")
    .is("application_id", null)
    .neq("stage", "applied")
    .lt("created_at", cutoffIso)
    .or(`last_contact_at.is.null,last_contact_at.lt.${cutoffIso}`)
    .or(`reengaged_at.is.null,reengaged_at.lt.${cutoffIso}`)
    .limit(RUN_CAP);

  if (error) {
    console.error("[cron/purge-stale-leads] fetch", error.message);
    await recordCronRun("purge-stale-leads", undefined, true);
    return NextResponse.json({ error: "Failed to fetch stale leads." }, { status: 500 });
  }

  const byCampus = new Map<string, number>();
  for (const lead of stale ?? []) {
    const { error: delErr } = await supabase.from("lead").delete().eq("id", lead.id as string);
    if (!delErr) {
      const c = lead.campus_id as string;
      byCampus.set(c, (byCampus.get(c) ?? 0) + 1);
    }
  }

  const purged = [...byCampus.values()].reduce((a, b) => a + b, 0);
  for (const [campusId, count] of byCampus) {
    await logAuditEvent({
      table_name: "lead",
      record_id: campusId,
      action: AuditAction.Delete,
      actor_id: null,
      campus_id: campusId,
      metadata: { retention_purge: true, count, retention_months: RETENTION_MONTHS },
    });
  }

  console.log(`[cron/purge-stale-leads] purged ${purged} leads older than ${RETENTION_MONTHS} months`);
  await recordCronRun("purge-stale-leads", { purged });
  return NextResponse.json({ purged, timestamp: new Date().toISOString() });
}
