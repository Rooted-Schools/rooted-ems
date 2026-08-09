/**
 * Lead-source performance against playbook channel benchmarks (PB 24 v2.2
 * s17.2).
 *
 * The app already reported conversion by source. What it could not say is
 * whether a number is GOOD. Referral converting at 12% and digital converting
 * at 12% look identical in a table and mean opposite things: referral is
 * badly underperforming its 20% benchmark while digital is beating its 8% one.
 * Without the benchmark the table invites exactly the wrong budget decision.
 *
 * Honesty rules:
 *   - Sources with no playbook benchmark (website, staff, other) are reported
 *     with their conversion but explicitly NOT graded. Judging them against a
 *     borrowed benchmark would be inventing a standard.
 *   - Conversion is withheld below MIN_LEADS_FOR_RATE. Two leads and one
 *     application is not a 50% channel.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { benchmarkForSource, SOURCE_LABEL, type LeadSource } from "@/lib/lead-channels";

/** Below this, a conversion rate says more about luck than about the channel. */
export const MIN_LEADS_FOR_RATE = 10;

export type ChannelVerdict = "beating" | "meeting" | "below" | "not_benchmarked" | "insufficient_data";

export interface ChannelRoiRow {
  source: string;
  label: string;
  leads: number;
  converted: number;
  /** Null when there are too few leads to be meaningful. */
  conversionRate: number | null;
  /** Null when the playbook sets no benchmark for this source. */
  benchmark: number | null;
  verdict: ChannelVerdict;
}

export interface ChannelRoiResult {
  rows: ChannelRoiRow[];
  totalLeads: number;
  minLeadsForRate: number;
}

function verdictFor(
  rate: number | null,
  benchmark: number | null,
  leads: number
): ChannelVerdict {
  if (benchmark === null) return "not_benchmarked";
  if (leads < MIN_LEADS_FOR_RATE || rate === null) return "insufficient_data";
  // A channel within 2pp of benchmark is meeting it; treating 19.5% against a
  // 20% benchmark as a failure would generate noise, not insight.
  if (rate >= benchmark) return "beating";
  if (benchmark - rate <= 0.02) return "meeting";
  return "below";
}

export async function getChannelRoi(campusIds: string[] = []): Promise<ChannelRoiResult> {
  const supabase = createServiceRoleClient();

  const query = supabase.from("lead").select("source, application_id");
  const { data, error } = await (campusIds.length > 0
    ? query.in("campus_id", campusIds)
    : query);

  if (error) {
    console.error("[getChannelRoi]", error.message);
    return { rows: [], totalLeads: 0, minLeadsForRate: MIN_LEADS_FOR_RATE };
  }

  const leads = (data ?? []) as Array<{ source: string | null; application_id: string | null }>;

  const bySource = new Map<string, { leads: number; converted: number }>();
  for (const lead of leads) {
    const source = lead.source ?? "other";
    const entry = bySource.get(source) ?? { leads: 0, converted: 0 };
    entry.leads++;
    // Conversion is the real stitch to an application, not a stage label a
    // staff member may or may not have advanced.
    if (lead.application_id) entry.converted++;
    bySource.set(source, entry);
  }

  const rows: ChannelRoiRow[] = Array.from(bySource.entries())
    .map(([source, counts]) => {
      const benchmark = benchmarkForSource(source);
      const conversionRate =
        counts.leads >= MIN_LEADS_FOR_RATE ? counts.converted / counts.leads : null;
      return {
        source,
        label: SOURCE_LABEL[source as LeadSource] ?? source,
        leads: counts.leads,
        converted: counts.converted,
        conversionRate,
        benchmark: benchmark?.rate ?? null,
        verdict: verdictFor(conversionRate, benchmark?.rate ?? null, counts.leads),
      };
    })
    // Largest channels first: that is where a budget decision actually moves.
    .sort((a, b) => b.leads - a.leads);

  return {
    rows,
    totalLeads: leads.length,
    minLeadsForRate: MIN_LEADS_FOR_RATE,
  };
}
