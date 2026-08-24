import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import { bodyHasOutcome } from "@/lib/lead-call-outcomes";

// Re-exported for existing importers — the vocabulary itself now lives in
// lib/lead-call-outcomes.ts (dependency-free, so "use client" components can
// import it directly without pulling in next/headers via this module's
// createServerClient/createServiceRoleClient imports).
export { CALL_OUTCOMES, buildCallOutcomeBody, bodyHasOutcome, type CallOutcomeKey } from "@/lib/lead-call-outcomes";

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
  /** Every prospective student's grade for this family (from lead_student),
   *  low to high. A family can have more than one; entry_grade is only the
   *  primary. Empty when no grade is known. */
  student_grades: string[];
  pathway_interest: string | null;
  stage: string;
  source: string;
  assigned_to: string | null;
  next_follow_up_at: string | null;
  last_contact_at: string | null;
  created_at: string;
  /** True when the due next_follow_up_at was set by the structured "Call
   *  back later" outcome (see CALL_OUTCOMES below), not a generic manual
   *  follow-up date — only ever populated by getFollowUpQueue. */
  is_callback?: boolean;
}

export interface LeadDetail extends LeadRow {
  sms_consent: boolean;
  preferred_language: string;
  source_detail: string | null;
  zip: string | null;
  notes: string | null;
  application_id: string | null;
  converted_at: string | null;
  referral_code: string | null;
  referred_by_name: string | null;
  referral_count: number;
  referral_applied: number;
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
    student_grades: [],
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

  const leadRows = rows.map((row) => toLeadRow(row));
  const gradeMap = await getStudentGradesByLead(supabase, options?.campusId);
  return leadRows.map((r) => ({ ...r, student_grades: gradeMap.get(r.id) ?? [] }));
}

/**
 * Every prospective student's grade, grouped by family (lead), for a campus.
 * Built by scanning lead_student under RLS (which already scopes to the
 * caller's campuses). Filtering by an explicit list of lead ids would overflow
 * the request URL on a large pipeline, so we scope by campus via the embedded
 * lead relationship instead.
 */
async function getStudentGradesByLead(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  campusId?: string
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const rows: { lead_id: string; grade: string }[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    let q = campusId
      ? supabase.from("lead_student").select("lead_id, grade, lead:lead_id!inner(campus_id)").eq("lead.campus_id", campusId)
      : supabase.from("lead_student").select("lead_id, grade");
    const { data, error } = await q.range(from, from + 999);
    if (error) {
      console.error("[getStudentGradesByLead]", error.message);
      break;
    }
    rows.push(...((data ?? []) as unknown as { lead_id: string; grade: string }[]));
    if (!data || data.length < 1000) break;
  }
  for (const r of rows) {
    const arr = map.get(r.lead_id) ?? [];
    arr.push(String(r.grade));
    map.set(r.lead_id, arr);
  }
  for (const grades of map.values()) grades.sort((a, b) => Number(a) - Number(b));
  return map;
}

/**
 * Family/student headline counts for the recruitment page: how many
 * prospective students exist (student-level count) and how many families have
 * more than one, so staff can see a family may yield more than one application.
 */
export async function getLeadStudentSummary(
  campusId?: string
): Promise<{ prospective_students: number; families_multi_student: number }> {
  const supabase = await createServerClient();
  const map = await getStudentGradesByLead(supabase, campusId);
  let prospective = 0;
  let multi = 0;
  for (const grades of map.values()) {
    prospective += grades.length;
    if (grades.length > 1) multi += 1;
  }
  return { prospective_students: prospective, families_multi_student: multi };
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
  const rows = (data ?? []).map((row: Record<string, unknown>) => toLeadRow(row));
  if (rows.length === 0) return rows;

  // A due follow-up is specifically a "callback" when it was set by the
  // structured "Call back later" outcome — derived from each lead's most
  // recent call activity body, one batch query (no N+1), never a second
  // column that could drift from what was actually logged.
  const { data: callActivities, error: callError } = await supabase
    .from("lead_activity")
    .select("lead_id, body, created_at")
    .in("lead_id", rows.map((r) => r.id))
    .eq("activity_type", "call")
    .order("created_at", { ascending: false });

  if (callError) {
    console.error("[getFollowUpQueue] call activities", callError.message);
    return rows;
  }

  const latestCallBodyByLead = new Map<string, string | null>();
  for (const a of (callActivities ?? []) as { lead_id: string; body: string | null }[]) {
    if (!latestCallBodyByLead.has(a.lead_id)) latestCallBodyByLead.set(a.lead_id, a.body);
  }

  return rows.map((r) => ({
    ...r,
    is_callback: bodyHasOutcome(latestCallBodyByLead.get(r.id), "callback"),
  }));
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

export interface LeaderStripStats {
  newFamiliesThisWeek: number;
  contactsLoggedThisWeek: number;
}

/**
 * Today leader strip stats (staff/today/page.tsx) — real trailing-7-day
 * counts, scoped to campusIds (empty/undefined = org-wide). Uses the service
 * role client like the rest of Today's ad hoc stats, since this is a
 * leadership overview rather than an RLS-scoped list view.
 */
export async function getLeaderStripStats(campusIds?: string[]): Promise<LeaderStripStats> {
  const supabase = createServiceRoleClient();
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  let leadsQuery = supabase
    .from("lead")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sevenDaysAgoIso);
  if (campusIds && campusIds.length > 0) leadsQuery = leadsQuery.in("campus_id", campusIds);

  // lead_activity has no campus_id of its own — !inner join to lead makes the
  // joined campus_id filterable (same pattern as getRegistrationCompletion in
  // lib/queries/melt.ts). actor_id IS NOT NULL restricts to touches a staff
  // member actually logged, excluding automated drip sends and system notes.
  let contactsQuery = supabase
    .from("lead_activity")
    .select("id, lead:lead_id!inner (campus_id)", { count: "exact", head: true })
    .in("activity_type", ["call", "email", "note"])
    .not("actor_id", "is", null)
    .gte("created_at", sevenDaysAgoIso);
  if (campusIds && campusIds.length > 0) contactsQuery = contactsQuery.in("lead.campus_id", campusIds);

  const [leadsResult, contactsResult] = await Promise.all([leadsQuery, contactsQuery]);
  if (leadsResult.error) console.error("[getLeaderStripStats] leads", leadsResult.error.message);
  if (contactsResult.error) console.error("[getLeaderStripStats] contacts", contactsResult.error.message);

  return {
    newFamiliesThisWeek: leadsResult.count ?? 0,
    contactsLoggedThisWeek: contactsResult.count ?? 0,
  };
}

export interface JourneyStat {
  key: string;
  name: string;
  active: number;
  completed: number;
  exited: number;
}

/**
 * Per-journey enrollment counts for the recruitment page (LG-2). Journeys are
 * network-default (campus_id NULL) so counts are computed over the campus's
 * leads via the enrollment→lead join, honoring RLS.
 */
export async function getJourneyStats(campusId?: string): Promise<JourneyStat[]> {
  const supabase = await createServerClient();

  const { data: journeys } = await supabase
    .from("journey")
    .select("id, key, name")
    .eq("is_active", true);
  if (!journeys || journeys.length === 0) return [];

  const stats: JourneyStat[] = [];
  for (const j of journeys) {
    const countBy = async (status: string) => {
      let q = supabase
        .from("journey_enrollment")
        .select("id, lead:lead_id!inner (campus_id)", { count: "exact", head: true })
        .eq("journey_id", (j as Record<string, string>).id)
        .eq("status", status);
      if (campusId) q = q.eq("lead.campus_id", campusId);
      const { count } = await q;
      return count ?? 0;
    };
    const [active, completed, exited] = await Promise.all([
      countBy("active"),
      countBy("completed"),
      countBy("exited"),
    ]);
    if (active + completed + exited > 0) {
      stats.push({
        key: (j as Record<string, string>).key,
        name: (j as Record<string, string>).name,
        active,
        completed,
        exited,
      });
    }
  }
  return stats;
}

export async function getLeadDetail(leadId: string): Promise<LeadDetail | null> {
  const supabase = await createServerClient();

  const [{ data: lead, error }, { data: activities }, { data: referred }, { data: students }] = await Promise.all([
    supabase
      .from("lead")
      .select(
        `${LEAD_LIST_SELECT}, sms_consent, preferred_language, source_detail, zip, notes, application_id, converted_at, referral_code, referred_by:referred_by_lead_id (first_name, last_name)`
      )
      .eq("id", leadId)
      .single(),
    supabase
      .from("lead_activity")
      .select("id, activity_type, body, created_at, actor:actor_id (first_name, last_name)")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(100),
    // Families this lead referred, with whether each applied.
    supabase.from("lead").select("application_id").eq("referred_by_lead_id", leadId),
    // This family's prospective students (one row per grade).
    supabase.from("lead_student").select("grade").eq("lead_id", leadId),
  ]);

  if (error || !lead) {
    if (error) console.error("[getLeadDetail]", error.message);
    return null;
  }

  const row = lead as Record<string, unknown>;
  const referredRows = (referred ?? []) as { application_id: string | null }[];
  const referredBy = row.referred_by as Record<string, string> | null;
  return {
    ...toLeadRow(row),
    student_grades: ((students ?? []) as { grade: string }[])
      .map((s) => String(s.grade))
      .sort((a, b) => Number(a) - Number(b)),
    sms_consent: row.sms_consent === true,
    preferred_language: (row.preferred_language as string) ?? "en",
    source_detail: (row.source_detail as string | null) ?? null,
    zip: (row.zip as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    application_id: (row.application_id as string | null) ?? null,
    converted_at: (row.converted_at as string | null) ?? null,
    referral_code: (row.referral_code as string | null) ?? null,
    referred_by_name: referredBy ? `${referredBy.first_name ?? ""} ${referredBy.last_name ?? ""}`.trim() || null : null,
    referral_count: referredRows.length,
    referral_applied: referredRows.filter((r) => r.application_id).length,
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
