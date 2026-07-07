import { NextResponse, type NextRequest } from "next/server";
import { syncLeadSheets } from "@/lib/lead-sync";

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

  const summary = await syncLeadSheets();
  console.log(
    `[cron/sync-lead-sheets] checked ${summary.checked}, added ${summary.added}, welcomed ${summary.welcomed}, errors ${summary.errors.length}`,
    summary.errors.slice(0, 5)
  );

  return NextResponse.json({ ...summary, timestamp: new Date().toISOString() });
}
