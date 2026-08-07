import { createServerClient } from "@rooted-ems/database/server";

/**
 * Recruitment intelligence — speed-to-lead and per-grade funnel arithmetic.
 *
 * Honesty notes:
 *  - "Contact-type" activity is call/sms/email, matching the exact set
 *    lib/mutations/leads.ts:CONTACT_ACTIVITY_TYPES uses to decide when a
 *    touchpoint counts as real contact (and to stamp lead.last_contact_at).
 *    "note", "inquiry", "stage_change", "reengagement", and "converted" are
 *    never contact — a staff note or an automated re-engagement nudge is not
 *    the same as reaching the family.
 *  - Leads with no contact activity are reported as their own honest count,
 *    never folded into a median that would understate real response time.
 *  - "Applicants needed" per grade is only computed when a genuinely
 *    completed school year exists with real data for that exact
 *    campus+grade. The conversion rate underneath it is applicant→enrolled
 *    (leads that became an application, then enrolled) — NOT lead→enrolled;
 *    a raw lead who never applied contributes to neither side of the ratio.
 *    No industry-average or assumed rate is ever used; absent real history,
 *    the column renders "—".
 */

const PAGE = 1000;
const MAX_ROWS = 20000;

// Mirrors lib/mutations/leads.ts CONTACT_ACTIVITY_TYPES — the source of
// truth for what counts as a real touchpoint vs. a note or system event.
const CONTACT_ACTIVITY_TYPES = ["call", "sms", "email"] as const;

// Mirrors lib/queries/recruitment-analytics.ts ENROLLED_STATUSES.
const ENROLLED_STATUSES = ["registered", "enrolled"];

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

// ─── Speed to first contact, per campus ─────────────────

export interface SpeedToContactRow {
  campus_id: string;
  campus_name: string;
  /** Leads with at least one logged contact-type (call/sms/email) activity. */
  contacted_sample: number;
  /** Median hours from lead.created_at to first contact activity; null if no sample. */
  median_hours_to_first_contact: number | null;
  /** Leads with zero contact activity logged, ever. */
  never_contacted: number;
}

/**
 * Per-campus speed-to-first-contact. Unlike the network-wide "speed to first
 * call" card (recruitment-analytics.ts, call-only), this counts any real
 * contact type and breaks results out per campus so a slow campus can't hide
 * behind a fast one in the network average.
 */
export interface SpeedToContactResult {
  rows: SpeedToContactRow[];
  /** True if the leads or activity paging hit MAX_ROWS and stopped short of the true total. */
  truncated: boolean;
}

export async function getSpeedToFirstContactByCampus(
  campusIds?: string[]
): Promise<SpeedToContactResult> {
  const supabase = await createServerClient();

  let campusQuery = supabase.from("campus").select("id, name").order("name");
  if (campusIds && campusIds.length > 0) campusQuery = campusQuery.in("id", campusIds);
  const { data: campusRows, error: campusError } = await campusQuery;
  if (campusError) {
    console.error("[getSpeedToFirstContactByCampus] campus", campusError.message);
    return { rows: [], truncated: false };
  }
  const campuses = (campusRows ?? []) as { id: string; name: string }[];
  if (campuses.length === 0) return { rows: [], truncated: false };

  let truncated = false;

  // 1) Page all leads in scope: id, campus_id, created_at.
  const leads: { id: string; campus_id: string; created_at: string }[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    let q = supabase
      .from("lead")
      .select("id, campus_id, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (campusIds && campusIds.length > 0) q = q.in("campus_id", campusIds);
    const { data, error } = await q;
    if (error) {
      console.error("[getSpeedToFirstContactByCampus] leads", error.message);
      break;
    }
    leads.push(...((data ?? []) as { id: string; campus_id: string; created_at: string }[]));
    if (!data || data.length < PAGE) break;
    if (offset + PAGE >= MAX_ROWS) {
      console.error("[getSpeedToFirstContactByCampus] leads truncated at MAX_ROWS", MAX_ROWS);
      truncated = true;
    }
  }

  // 2) Page all contact-type activities in scope, earliest first, and keep
  // only the first one per lead.
  const firstContactByLead = new Map<string, number>();
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const { data, error } = await supabase
      .from("lead_activity")
      .select("lead_id, created_at")
      .in("activity_type", [...CONTACT_ACTIVITY_TYPES])
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error("[getSpeedToFirstContactByCampus] activity", error.message);
      break;
    }
    for (const row of (data ?? []) as { lead_id: string; created_at: string }[]) {
      if (!firstContactByLead.has(row.lead_id)) {
        firstContactByLead.set(row.lead_id, new Date(row.created_at).getTime());
      }
    }
    if (!data || data.length < PAGE) break;
    if (offset + PAGE >= MAX_ROWS) {
      console.error("[getSpeedToFirstContactByCampus] activity truncated at MAX_ROWS", MAX_ROWS);
      truncated = true;
    }
  }

  const leadsByCampus = new Map<string, typeof leads>();
  for (const lead of leads) {
    const list = leadsByCampus.get(lead.campus_id) ?? [];
    list.push(lead);
    leadsByCampus.set(lead.campus_id, list);
  }

  const rows = campuses.map((campus) => {
    const campusLeads = leadsByCampus.get(campus.id) ?? [];
    const hours: number[] = [];
    let neverContacted = 0;
    for (const lead of campusLeads) {
      const contactedAt = firstContactByLead.get(lead.id);
      if (contactedAt === undefined) {
        neverContacted++;
        continue;
      }
      const h = (contactedAt - new Date(lead.created_at).getTime()) / (1000 * 60 * 60);
      if (h >= 0) hours.push(h);
      else neverContacted++; // guard against clock skew producing a negative gap
    }
    hours.sort((a, b) => a - b);
    const med = median(hours);
    return {
      campus_id: campus.id,
      campus_name: campus.name,
      contacted_sample: hours.length,
      median_hours_to_first_contact: med === null ? null : Math.round(med * 10) / 10,
      never_contacted: neverContacted,
    };
  });

  return { rows, truncated };
}

// ─── Funnel arithmetic per campus + grade ───────────────

const GRADE_ORDER = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

function gradeSortIndex(grade: string): number {
  if (grade === "ungraded") return GRADE_ORDER.length + 1;
  const idx = GRADE_ORDER.indexOf(grade);
  return idx === -1 ? GRADE_ORDER.length : idx;
}

function gradeLabel(grade: string): string {
  if (grade === "ungraded") return "Ungraded";
  return grade === "K" ? "Kindergarten" : `Grade ${grade}`;
}

export interface GradeFunnelRow {
  campus_id: string;
  campus_name: string;
  grade: string;
  grade_label: string;
  /** capacity_plan.total_seats for this campus+grade this school year; null = no plan entered. */
  total_seats: number | null;
  /** Count of leads targeting this campus+grade (all-time; leads carry no school-year field). */
  leads_held: number;
  /** Applications this school year, campus+grade, status != draft. */
  applications_submitted: number;
  /**
   * Only set when a completed historical cycle has real applicant→enrolled
   * data for this exact campus+grade. This is APPLICANTS needed, not leads —
   * the underlying rate is enrolled ÷ (leads that became applications), so
   * sizing outreach off raw lead volume against this number would overshoot.
   */
  applicants_needed: number | null;
}

export interface GradeFunnelTable {
  school_year_name: string | null;
  rows: GradeFunnelRow[];
  /** True if any row lacks applicants_needed — drives the footnote. */
  has_missing_applicants_needed: boolean;
  /** True if the leads or applications paging hit MAX_ROWS and stopped short of the true total. */
  truncated: boolean;
}

/**
 * Per-campus, per-grade seat/lead/application arithmetic for the current
 * school year. "Applicants needed" is left null (rendered "—" by the
 * caller) unless a real completed enrollment cycle exists to derive an
 * applicant→enrolled conversion rate from — see the module doc comment.
 */
export async function getGradeFunnelTable(campusIds?: string[]): Promise<GradeFunnelTable> {
  const supabase = await createServerClient();

  const { data: currentYear, error: yearError } = await supabase
    .from("school_year")
    .select("id, name")
    .eq("is_current", true)
    .maybeSingle();
  if (yearError) console.error("[getGradeFunnelTable] school_year", yearError.message);
  if (!currentYear) {
    return { school_year_name: null, rows: [], has_missing_applicants_needed: false, truncated: false };
  }
  const currentYearId = currentYear.id as string;

  let campusQuery = supabase.from("campus").select("id, name").order("name");
  if (campusIds && campusIds.length > 0) campusQuery = campusQuery.in("id", campusIds);
  const { data: campusRows, error: campusError } = await campusQuery;
  if (campusError) {
    console.error("[getGradeFunnelTable] campus", campusError.message);
    return { school_year_name: currentYear.name as string, rows: [], has_missing_applicants_needed: false, truncated: false };
  }
  const campuses = (campusRows ?? []) as { id: string; name: string }[];
  if (campuses.length === 0) {
    return { school_year_name: currentYear.name as string, rows: [], has_missing_applicants_needed: false, truncated: false };
  }
  const campusIdSet = new Set(campuses.map((c) => c.id));
  const campusNameById = new Map(campuses.map((c) => [c.id, c.name]));

  // 1) Seats: capacity_plan for the current year, joined to grade_level.grade.
  let planQuery = supabase
    .from("capacity_plan")
    .select("campus_id, total_seats, grade_level:grade_level_id (grade)")
    .eq("school_year_id", currentYearId);
  if (campusIds && campusIds.length > 0) planQuery = planQuery.in("campus_id", campusIds);
  const { data: planRows, error: planError } = await planQuery;
  if (planError) console.error("[getGradeFunnelTable] capacity_plan", planError.message);

  const seatsByKey = new Map<string, number>();
  for (const row of (planRows ?? []) as Record<string, unknown>[]) {
    const gl = row.grade_level as { grade: string } | null;
    if (!gl?.grade) continue;
    seatsByKey.set(`${row.campus_id}|${gl.grade}`, (row.total_seats as number) ?? 0);
  }

  // 2) Leads held: all-time count per campus+entry_grade (leads carry no
  // school-year field, so this is a standing pipeline count, not year-scoped).
  const leadsByKey = new Map<string, number>();
  let truncated = false;
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    let q = supabase
      .from("lead")
      .select("campus_id, entry_grade")
      .range(offset, offset + PAGE - 1);
    if (campusIds && campusIds.length > 0) q = q.in("campus_id", campusIds);
    const { data, error } = await q;
    if (error) {
      console.error("[getGradeFunnelTable] leads", error.message);
      break;
    }
    for (const row of (data ?? []) as { campus_id: string; entry_grade: string | null }[]) {
      const grade = row.entry_grade || "ungraded";
      const key = `${row.campus_id}|${grade}`;
      leadsByKey.set(key, (leadsByKey.get(key) ?? 0) + 1);
    }
    if (!data || data.length < PAGE) break;
    if (offset + PAGE >= MAX_ROWS) {
      console.error("[getGradeFunnelTable] leads truncated at MAX_ROWS", MAX_ROWS);
      truncated = true;
    }
  }

  // 3) Applications submitted this school year, campus+grade, status != draft.
  const appsByKey = new Map<string, number>();
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    let q = supabase
      .from("application")
      .select("campus_id, status, grade_level:grade_level_id (grade, school_year_id)")
      .neq("status", "draft")
      .range(offset, offset + PAGE - 1);
    if (campusIds && campusIds.length > 0) q = q.in("campus_id", campusIds);
    const { data, error } = await q;
    if (error) {
      console.error("[getGradeFunnelTable] application", error.message);
      break;
    }
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const gl = row.grade_level as { grade: string; school_year_id: string } | null;
      if (!gl || gl.school_year_id !== currentYearId) continue;
      const key = `${row.campus_id}|${gl.grade}`;
      appsByKey.set(key, (appsByKey.get(key) ?? 0) + 1);
    }
    if (!data || data.length < PAGE) break;
    if (offset + PAGE >= MAX_ROWS) {
      console.error("[getGradeFunnelTable] application truncated at MAX_ROWS", MAX_ROWS);
      truncated = true;
    }
  }

  // 4) Applicants needed — only from a genuinely completed prior school year with
  // real lead→enrolled conversion data for the exact campus+grade.
  const applicantsNeededByKey = new Map<string, number>();
  const { data: historicalYear, error: historicalError } = await supabase
    .from("school_year")
    .select("id")
    .eq("is_current", false)
    .lt("end_date", new Date().toISOString())
    .order("end_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (historicalError) console.error("[getGradeFunnelTable] historical school_year", historicalError.message);

  if (historicalYear) {
    const historicalYearId = historicalYear.id as string;

    const convertedLeads: { campus_id: string; application_id: string }[] = [];
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
      let q = supabase
        .from("lead")
        .select("campus_id, application_id")
        .not("application_id", "is", null)
        .range(offset, offset + PAGE - 1);
      if (campusIds && campusIds.length > 0) q = q.in("campus_id", campusIds);
      const { data, error } = await q;
      if (error) {
        console.error("[getGradeFunnelTable] converted leads", error.message);
        break;
      }
      convertedLeads.push(
        ...((data ?? []) as { campus_id: string; application_id: string }[])
      );
      if (!data || data.length < PAGE) break;
    }

    const appIds = convertedLeads.map((l) => l.application_id);
    const appById = new Map<string, { status: string; grade: string; school_year_id: string }>();
    for (let i = 0; i < appIds.length; i += PAGE) {
      const batch = appIds.slice(i, i + PAGE);
      const { data, error } = await supabase
        .from("application")
        .select("id, status, grade_level:grade_level_id (grade, school_year_id)")
        .in("id", batch);
      if (error) {
        console.error("[getGradeFunnelTable] historical applications", error.message);
        continue;
      }
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        const gl = row.grade_level as { grade: string; school_year_id: string } | null;
        if (!gl) continue;
        appById.set(row.id as string, {
          status: row.status as string,
          grade: gl.grade,
          school_year_id: gl.school_year_id,
        });
      }
    }

    const cohortByKey = new Map<string, { leads: number; enrolled: number }>();
    for (const lead of convertedLeads) {
      const app = appById.get(lead.application_id);
      if (!app || app.school_year_id !== historicalYearId) continue;
      const key = `${lead.campus_id}|${app.grade}`;
      const rec = cohortByKey.get(key) ?? { leads: 0, enrolled: 0 };
      rec.leads++;
      if (ENROLLED_STATUSES.includes(app.status)) rec.enrolled++;
      cohortByKey.set(key, rec);
    }

    for (const [key, rec] of cohortByKey) {
      if (rec.leads === 0 || rec.enrolled === 0) continue; // no real conversion signal
      const rate = rec.enrolled / rec.leads;
      const seats = seatsByKey.get(key);
      if (seats == null || seats <= 0) continue; // no current-year seat target to size against
      applicantsNeededByKey.set(key, Math.ceil(seats / rate));
    }
  }

  // 5) Union rows across seats, leads, and applications so nothing drops silently.
  const allKeys = new Set<string>([
    ...seatsByKey.keys(),
    ...leadsByKey.keys(),
    ...appsByKey.keys(),
  ]);

  const rows: GradeFunnelRow[] = [];
  for (const key of allKeys) {
    const sep = key.indexOf("|");
    const campus_id = key.slice(0, sep);
    const grade = key.slice(sep + 1);
    if (!campusIdSet.has(campus_id)) continue;
    rows.push({
      campus_id,
      campus_name: campusNameById.get(campus_id) ?? "",
      grade,
      grade_label: gradeLabel(grade),
      total_seats: seatsByKey.has(key) ? (seatsByKey.get(key) as number) : null,
      leads_held: leadsByKey.get(key) ?? 0,
      applications_submitted: appsByKey.get(key) ?? 0,
      applicants_needed: applicantsNeededByKey.get(key) ?? null,
    });
  }

  rows.sort((a, b) => {
    const campusCmp = a.campus_name.localeCompare(b.campus_name);
    if (campusCmp !== 0) return campusCmp;
    return gradeSortIndex(a.grade) - gradeSortIndex(b.grade);
  });

  return {
    school_year_name: currentYear.name as string,
    rows,
    has_missing_applicants_needed: rows.some((r) => r.applicants_needed === null),
    truncated,
  };
}
