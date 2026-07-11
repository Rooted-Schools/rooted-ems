import { createServerClient } from "@rooted-ems/database/server";

/**
 * Recruitment funnel analytics — the board-facing view of the lead pipeline.
 *
 * Honesty notes baked into the shape here:
 *  - Most leads are the July 2026 bulk import with no activity, so any
 *    velocity/response metric is reported with its denominator (the subset
 *    that actually has a logged staff contact), never as a rate over all
 *    leads that would read as near-zero and mislead.
 *  - The lead→enrolled funnel is traced through lead.application_id into the
 *    real application status, so downstream counts are exact, not inferred.
 *
 * All reads are RLS-scoped; pass a campusId to narrow, omit for the network
 * roll-up (CMO admins only).
 */

export interface FunnelStage {
  label: string;
  count: number;
  /** Share of total leads, 0–100. */
  pct: number;
}

export interface SourceRow {
  source: string;
  leads: number;
  applied: number;
  /** applied / leads, 0–100. */
  conversion: number;
}

export interface RecruitmentFunnel {
  total_leads: number;
  stage_counts: Record<string, number>;
  funnel: FunnelStage[];
  by_source: SourceRow[];
  top_zips: { zip: string; count: number }[];
  by_pathway: { pathway: string; count: number }[];
  weekly_new: { week: string; count: number }[];
  /** LG-2 cost tracking: total ad spend (dollars) and cost per enrolled student. */
  spend: {
    total_dollars: number;
    cost_per_enrolled: number | null;
  };
  response: {
    /** Leads with at least one logged staff call. */
    contacted_sample: number;
    /** Median hours from lead creation to first staff call, null if no sample. */
    median_hours_to_first_call: number | null;
    /** Of that sample, share contacted within 3 days, 0–100. */
    within_3_days_pct: number | null;
  };
}

const APPLIED_STAGES = ["applied"];
// Application statuses that mean the family reached each downstream milestone.
const OFFERED_STATUSES = ["offered", "accepted", "placement_review", "registered", "enrolled"];
const ACCEPTED_STATUSES = ["accepted", "placement_review", "registered", "enrolled"];
const ENROLLED_STATUSES = ["registered", "enrolled"];

const PAGE = 1000;

interface LeadLite {
  source: string;
  stage: string;
  created_at: string;
  zip: string | null;
  pathway_interest: string | null;
  application_id: string | null;
}

export async function getRecruitmentFunnel(campusId?: string): Promise<RecruitmentFunnel> {
  const supabase = await createServerClient();

  // 1) Page all leads for the scope (past PostgREST's 1k cap).
  const leads: LeadLite[] = [];
  for (let offset = 0; offset < 20000; offset += PAGE) {
    let q = supabase
      .from("lead")
      .select("source, stage, created_at, zip, pathway_interest, application_id")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (campusId) q = q.eq("campus_id", campusId);
    const { data, error } = await q;
    if (error) {
      console.error("[getRecruitmentFunnel] leads", error.message);
      break;
    }
    leads.push(...((data ?? []) as LeadLite[]));
    if (!data || data.length < PAGE) break;
  }

  const total = leads.length;

  // 2) Stage + source + reach aggregations (single pass).
  const stageCounts: Record<string, number> = {};
  const sourceAgg: Record<string, { leads: number; applied: number }> = {};
  const zipAgg: Record<string, number> = {};
  const pathwayAgg: Record<string, number> = {};
  const weekAgg: Record<string, number> = {};
  const appliedAppIds: string[] = [];

  for (const l of leads) {
    stageCounts[l.stage] = (stageCounts[l.stage] ?? 0) + 1;

    const src = l.source || "other";
    sourceAgg[src] ??= { leads: 0, applied: 0 };
    sourceAgg[src].leads++;

    const isApplied = !!l.application_id || APPLIED_STAGES.includes(l.stage);
    if (isApplied) {
      sourceAgg[src].applied++;
      if (l.application_id) appliedAppIds.push(l.application_id);
    }

    if (l.zip) zipAgg[l.zip] = (zipAgg[l.zip] ?? 0) + 1;
    if (l.pathway_interest) pathwayAgg[l.pathway_interest] = (pathwayAgg[l.pathway_interest] ?? 0) + 1;

    // ISO week bucket (Monday) for the last-8-weeks momentum chart.
    const d = new Date(l.created_at);
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    weekAgg[monday.toISOString().slice(0, 10)] = (weekAgg[monday.toISOString().slice(0, 10)] ?? 0) + 1;
  }

  const appliedTotal = Object.values(sourceAgg).reduce((s, v) => s + v.applied, 0);

  // 3) Trace the downstream funnel through real application statuses.
  let offered = 0;
  let accepted = 0;
  let enrolled = 0;
  for (let i = 0; i < appliedAppIds.length; i += PAGE) {
    const batch = appliedAppIds.slice(i, i + PAGE);
    const { data } = await supabase.from("application").select("status").in("id", batch);
    for (const row of data ?? []) {
      const s = (row as { status: string }).status;
      if (OFFERED_STATUSES.includes(s)) offered++;
      if (ACCEPTED_STATUSES.includes(s)) accepted++;
      if (ENROLLED_STATUSES.includes(s)) enrolled++;
    }
  }

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
  const funnel: FunnelStage[] = [
    { label: "Leads", count: total, pct: 100 },
    { label: "Applied", count: appliedTotal, pct: pct(appliedTotal) },
    { label: "Offered", count: offered, pct: pct(offered) },
    { label: "Accepted", count: accepted, pct: pct(accepted) },
    { label: "Enrolled", count: enrolled, pct: pct(enrolled) },
  ];

  const by_source: SourceRow[] = Object.entries(sourceAgg)
    .map(([source, v]) => ({
      source,
      leads: v.leads,
      applied: v.applied,
      conversion: v.leads > 0 ? Math.round((v.applied / v.leads) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.leads - a.leads);

  const top_zips = Object.entries(zipAgg)
    .map(([zip, count]) => ({ zip, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const by_pathway = Object.entries(pathwayAgg)
    .map(([pathway, count]) => ({ pathway, count }))
    .sort((a, b) => b.count - a.count);

  const weekly_new = Object.entries(weekAgg)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8)
    .map(([week, count]) => ({ week, count }));

  // 4) Response speed — only over leads with a logged staff call, denominator shown.
  const response = await computeResponseSpeed(supabase, campusId);

  // 5) Cost per enrolled (LG-2): total recorded ad spend / enrolled-from-leads.
  let spendQuery = supabase.from("channel_spend").select("amount_cents");
  if (campusId) spendQuery = spendQuery.eq("campus_id", campusId);
  const { data: spendRows } = await spendQuery;
  const totalCents = (spendRows ?? []).reduce(
    (sum, r) => sum + ((r as { amount_cents: number }).amount_cents ?? 0),
    0
  );
  const spend = {
    total_dollars: Math.round(totalCents) / 100,
    cost_per_enrolled: enrolled > 0 && totalCents > 0 ? Math.round(totalCents / enrolled) / 100 : null,
  };

  return {
    total_leads: total,
    stage_counts: stageCounts,
    funnel,
    by_source,
    top_zips,
    by_pathway,
    weekly_new,
    spend,
    response,
  };
}

async function computeResponseSpeed(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  campusId?: string
): Promise<RecruitmentFunnel["response"]> {
  // First staff call per lead, joined to the lead's creation time.
  let q = supabase
    .from("lead_activity")
    .select("lead_id, created_at, lead:lead_id (created_at, campus_id)")
    .eq("activity_type", "call")
    .order("created_at", { ascending: true })
    .limit(2000);
  const { data, error } = await q;
  if (error) {
    console.error("[computeResponseSpeed]", error.message);
    return { contacted_sample: 0, median_hours_to_first_call: null, within_3_days_pct: null };
  }

  const firstCallByLead = new Map<string, { call: number; created: number }>();
  for (const row of data ?? []) {
    const r = row as unknown as {
      lead_id: string;
      created_at: string;
      lead: { created_at: string; campus_id: string } | null;
    };
    if (!r.lead) continue;
    if (campusId && r.lead.campus_id !== campusId) continue;
    if (firstCallByLead.has(r.lead_id)) continue; // ordered asc → first wins
    firstCallByLead.set(r.lead_id, {
      call: new Date(r.created_at).getTime(),
      created: new Date(r.lead.created_at).getTime(),
    });
  }

  const hours = [...firstCallByLead.values()]
    .map((v) => (v.call - v.created) / (1000 * 60 * 60))
    .filter((h) => h >= 0)
    .sort((a, b) => a - b);

  if (hours.length === 0) {
    return { contacted_sample: 0, median_hours_to_first_call: null, within_3_days_pct: null };
  }
  const median = hours[Math.floor(hours.length / 2)];
  const within3 = hours.filter((h) => h <= 72).length;
  return {
    contacted_sample: hours.length,
    median_hours_to_first_call: Math.round(median * 10) / 10,
    within_3_days_pct: Math.round((within3 / hours.length) * 1000) / 10,
  };
}
