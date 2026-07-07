import { createServerClient } from "@rooted-ems/database/server";

/**
 * Lead (CRM) queries. All use the user-scoped client: lead RLS restricts
 * rows to the staff member's campuses, so no explicit campus filtering is
 * needed here — the same pattern as the staff EMS queries.
 */

// ─── Types ─────────────────────────────────────────────

export interface LeadRow {
  id: string;
  campus_id: string;
  campus_name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  student_first_name: string | null;
  entry_grade: string | null;
  pathway_interest: string | null;
  stage: string;
  source: string;
  assigned_to: string | null;
  next_follow_up_at: string | null;
  last_contact_at: string | null;
  created_at: string;
}

export interface LeadDetail extends LeadRow {
  sms_consent: boolean;
  preferred_language: string;
  source_detail: string | null;
  zip: string | null;
  notes: string | null;
  application_id: string | null;
  converted_at: string | null;
  activities: LeadActivityRow[];
}

export interface LeadActivityRow {
  id: string;
  activity_type: string;
  body: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface LeadPipelineSummary {
  stage_counts: Record<string, number>;
  follow_up_due: number;
  gone_quiet: number;
}

const LEAD_LIST_SELECT = `
  id, campus_id, first_name, last_name, email, phone,
  student_first_name, entry_grade, pathway_interest,
  stage, source, assigned_to, next_follow_up_at, last_contact_at, created_at,
  campus:campus_id (name)
`;

function toLeadRow(row: Record<string, unknown>): LeadRow {
  const campus = row.campus as Record<string, string> | null;
  return {
    id: row.id as string,
    campus_id: row.campus_id as string,
    campus_name: campus?.name ?? "",
    first_name: row.first_name as string,
    last_name: row.last_name as string,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    student_first_name: (row.student_first_name as string | null) ?? null,
    entry_grade: (row.entry_grade as string | null) ?? null,
    pathway_interest: (row.pathway_interest as string | null) ?? null,
    stage: row.stage as string,
    source: row.source as string,
    assigned_to: (row.assigned_to as string | null) ?? null,
    next_follow_up_at: (row.next_follow_up_at as string | null) ?? null,
    last_contact_at: (row.last_contact_at as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

// ─── Queries ───────────────────────────────────────────

// PostgREST caps each request at 1,000 rows, so large pipelines (C.R. Neal
// imported 1,263 leads) must page. Client-side search/filtering stays instant
// at this scale; revisit with server-driven pagination past ~5,000 leads.
const LEAD_FETCH_MAX = 5000;
const PAGE = 1000;

export async function getLeads(options?: {
  stage?: string;
  search?: string;
  campusId?: string;
}): Promise<LeadRow[]> {
  const supabase = await createServerClient();
  const rows: Record<string, unknown>[] = [];

  for (let offset = 0; offset < LEAD_FETCH_MAX; offset += PAGE) {
    let query = supabase
      .from("lead")
      .select(LEAD_LIST_SELECT)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (options?.campusId) query = query.eq("campus_id", options.campusId);
    if (options?.stage && options.stage !== "all") {
      query = query.eq("stage", options.stage);
    }
    if (options?.search?.trim()) {
      const term = options.search.trim();
      query = query.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error("[getLeads]", error.message);
      break;
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  return rows.map((row) => toLeadRow(row));
}

/**
 * The exception queue: open leads whose follow-up date has arrived, ordered
 * oldest-first so the most overdue family is always on top.
 */
export async function getFollowUpQueue(campusId?: string): Promise<LeadRow[]> {
  const supabase = await createServerClient();
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("lead")
    .select(LEAD_LIST_SELECT)
    .in("stage", ["new", "contacted", "engaged"])
    .lte("next_follow_up_at", nowIso)
    .order("next_follow_up_at", { ascending: true })
    .limit(50);
  if (campusId) query = query.eq("campus_id", campusId);

  const { data, error } = await query;
  if (error) {
    console.error("[getFollowUpQueue]", error.message);
    return [];
  }
  return (data ?? []).map((row: Record<string, unknown>) => toLeadRow(row));
}

const ALL_STAGES = ["new", "contacted", "engaged", "applied", "closed"] as const;

export async function getLeadPipelineSummary(campusId?: string): Promise<LeadPipelineSummary> {
  const supabase = await createServerClient();
  const nowIso = new Date().toISOString();
  const quietCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Loosely typed on purpose: threading the exact PostgREST builder generics
  // through a conditional helper blows TS's instantiation-depth limit.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scoped = (q: any): any => (campusId ? q.eq("campus_id", campusId) : q);

  // Head counts per stage — counting via fetched rows silently caps at
  // PostgREST's 1,000-row limit and undercounts large pipelines.
  const stageCountQueries = ALL_STAGES.map((stage) =>
    scoped(
      supabase.from("lead").select("id", { count: "exact", head: true }).eq("stage", stage)
    )
  );

  const [dueResult, quietResult, ...stageResults] = await Promise.all([
    scoped(
      supabase
        .from("lead")
        .select("id", { count: "exact", head: true })
        .in("stage", ["new", "contacted", "engaged"])
        .lte("next_follow_up_at", nowIso)
    ),
    scoped(
      supabase
        .from("lead")
        .select("id", { count: "exact", head: true })
        .in("stage", ["new", "contacted", "engaged"])
        .or(`last_contact_at.lt.${quietCutoff},and(last_contact_at.is.null,created_at.lt.${quietCutoff})`)
    ),
    ...stageCountQueries,
  ]);

  const stageCounts: Record<string, number> = {};
  ALL_STAGES.forEach((stage, i) => {
    stageCounts[stage] = stageResults[i]?.count ?? 0;
  });

  return {
    stage_counts: stageCounts,
    follow_up_due: dueResult.count ?? 0,
    gone_quiet: quietResult.count ?? 0,
  };
}

export interface CampaignRow {
  id: string;
  name: string;
  template_key: string;
  audience_stage: string;
  status: string;
  daily_limit: number;
  total_recipients: number;
  sent_count: number;
  created_at: string;
  campus_name: string;
}

/** Recent campaigns for the recruitment page card (RLS scopes to campus). */
export async function getCampaigns(campusId?: string, limit = 10): Promise<CampaignRow[]> {
  const supabase = await createServerClient();
  let query = supabase
    .from("lead_campaign")
    .select(
      "id, name, template_key, audience_stage, status, daily_limit, total_recipients, sent_count, created_at, campus:campus_id (name)"
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (campusId) query = query.eq("campus_id", campusId);
  const { data, error } = await query;
  if (error) {
    console.error("[getCampaigns]", error.message);
    return [];
  }
  return (data ?? []).map((row: Record<string, unknown>) => {
    const campus = row.campus as Record<string, string> | null;
    return {
      id: row.id as string,
      name: row.name as string,
      template_key: row.template_key as string,
      audience_stage: row.audience_stage as string,
      status: row.status as string,
      daily_limit: row.daily_limit as number,
      total_recipients: row.total_recipients as number,
      sent_count: row.sent_count as number,
      created_at: row.created_at as string,
      campus_name: campus?.name ?? "",
    };
  });
}

export async function getLeadDetail(leadId: string): Promise<LeadDetail | null> {
  const supabase = await createServerClient();

  const [{ data: lead, error }, { data: activities }] = await Promise.all([
    supabase
      .from("lead")
      .select(
        `${LEAD_LIST_SELECT}, sms_consent, preferred_language, source_detail, zip, notes, application_id, converted_at`
      )
      .eq("id", leadId)
      .single(),
    supabase
      .from("lead_activity")
      .select("id, activity_type, body, created_at, actor:actor_id (first_name, last_name)")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (error || !lead) {
    if (error) console.error("[getLeadDetail]", error.message);
    return null;
  }

  const row = lead as Record<string, unknown>;
  return {
    ...toLeadRow(row),
    sms_consent: row.sms_consent === true,
    preferred_language: (row.preferred_language as string) ?? "en",
    source_detail: (row.source_detail as string | null) ?? null,
    zip: (row.zip as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    application_id: (row.application_id as string | null) ?? null,
    converted_at: (row.converted_at as string | null) ?? null,
    activities: (activities ?? []).map((a: Record<string, unknown>) => {
      const actor = a.actor as Record<string, string> | null;
      return {
        id: a.id as string,
        activity_type: a.activity_type as string,
        body: (a.body as string | null) ?? null,
        actor_name: actor ? `${actor.first_name ?? ""} ${actor.last_name ?? ""}`.trim() || null : null,
        created_at: a.created_at as string,
      };
    }),
  };
}
