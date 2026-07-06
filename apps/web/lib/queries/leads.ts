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

export async function getLeads(options?: {
  stage?: string;
  search?: string;
  limit?: number;
}): Promise<LeadRow[]> {
  const supabase = await createServerClient();

  let query = supabase
    .from("lead")
    .select(LEAD_LIST_SELECT)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 200);

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
    return [];
  }
  return (data ?? []).map((row: Record<string, unknown>) => toLeadRow(row));
}

/**
 * The exception queue: open leads whose follow-up date has arrived, ordered
 * oldest-first so the most overdue family is always on top.
 */
export async function getFollowUpQueue(): Promise<LeadRow[]> {
  const supabase = await createServerClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("lead")
    .select(LEAD_LIST_SELECT)
    .in("stage", ["new", "contacted", "engaged"])
    .lte("next_follow_up_at", nowIso)
    .order("next_follow_up_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("[getFollowUpQueue]", error.message);
    return [];
  }
  return (data ?? []).map((row: Record<string, unknown>) => toLeadRow(row));
}

export async function getLeadPipelineSummary(): Promise<LeadPipelineSummary> {
  const supabase = await createServerClient();
  const nowIso = new Date().toISOString();
  const quietCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: stageRows }, { count: dueCount }, { count: quietCount }] = await Promise.all([
    supabase.from("lead").select("stage"),
    supabase
      .from("lead")
      .select("id", { count: "exact", head: true })
      .in("stage", ["new", "contacted", "engaged"])
      .lte("next_follow_up_at", nowIso),
    supabase
      .from("lead")
      .select("id", { count: "exact", head: true })
      .in("stage", ["new", "contacted", "engaged"])
      .or(`last_contact_at.lt.${quietCutoff},and(last_contact_at.is.null,created_at.lt.${quietCutoff})`),
  ]);

  const stageCounts: Record<string, number> = {};
  for (const row of stageRows ?? []) {
    const stage = (row as Record<string, string>).stage;
    stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;
  }

  return {
    stage_counts: stageCounts,
    follow_up_due: dueCount ?? 0,
    gone_quiet: quietCount ?? 0,
  };
}

export async function getLeadDetail(leadId: string): Promise<LeadDetail | null> {
  const supabase = await createServerClient();

  const [{ data: lead, error }, { data: activities }] = await Promise.all([
    supabase
      .from("lead")
      .select(
        `${LEAD_LIST_SELECT}, sms_consent, preferred_language, source_detail, notes, application_id, converted_at`
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
