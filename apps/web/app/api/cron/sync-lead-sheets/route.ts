import { NextResponse, type NextRequest } from "next/server";
import { recordCronRun } from "@/lib/cron-heartbeat";
import { syncLeadSheets } from "@/lib/lead-sync";
import { syncTablingEvents } from "@/lib/event-sync";

/**
 * Cron endpoint that syncs the campus Google Sheets interest forms into the
 * lead pipeline daily. New rows submitted within the freshness window get
 * the full response engine; older stragglers import quietly. See
 * lib/lead-sync.ts for the rules and the per-campus sheet config.
 *
 * Runs daily (vercel.json, 14:00 UTC ≈ early morning US) so overnight
 * submissions are in the follow-up queue before recruiters start their day.
 * Staff can also trigger it anytime from /staff/recruitment → Sync sheets.
 *
 * Authentication: CRON_SECRET via Authorization header as "Bearer <secret>".
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [summary, tabling] = await Promise.all([syncLeadSheets(), syncTablingEvents()]);
  console.log(
    `[cron/sync-lead-sheets] leads: checked ${summary.checked}, added ${summary.added}, welcomed ${summary.welcomed}, updated ${summary.updated}, duplicates ${summary.duplicates}; ` +
      `tabling: confirmed ${tabling.confirmed}, added ${tabling.added}, updated ${tabling.updated}`,
    [...summary.errors.slice(0, 3), ...tabling.errors.slice(0, 3)]
  );
  await recordCronRun("sync-lead-sheets", {
    leads_checked: summary.checked,
    leads_added: summary.added,
    leads_welcomed: summary.welcomed,
    leads_updated: summary.updated,
    leads_duplicates: summary.duplicates,
    tabling_confirmed: tabling.confirmed,
    tabling_added: tabling.added,
    tabling_updated: tabling.updated,
  });
  return NextResponse.json({ leads: summary, tabling, timestamp: new Date().toISOString() });
}
