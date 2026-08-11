import { createServerClient } from "@rooted-ems/database/server";
import { renderCampaignEmail, CAMPAIGN_TEMPLATES, type CampaignPayload, type CampaignTemplateKey } from "@/lib/email-templates";
import { getSuppressedEmails } from "@/lib/email-compliance";

/**
 * Nurture journey management queries (LG-2 management UI). Owner complaint
 * this answers: "Nurture Journeys still doesn't allow me to do anything" —
 * the recruitment card listed counts with nothing clickable. These queries
 * back /staff/recruitment/journeys (list + detail + roster + enroll search).
 *
 * All user-scoped (createServerClient / RLS) — journey RLS already allows
 * network-default templates (campus_id NULL) to every staff member and
 * campus-specific ones only to staff with access to that campus; enrollment
 * RLS is scoped through the enrolled lead's campus_id the same way.
 */

// ─── Types ─────────────────────────────────────────────

export interface JourneySummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_active: boolean;
  campus_id: string | null;
  /** null for a network-default template (visible/used at every campus). */
  campus_name: string | null;
  active: number;
  completed: number;
  exited: number;
}

export interface JourneyStepPreview {
  id: string;
  step_order: number;
  delay_days: number;
  /** Human-honest delay label: "2 days after enrollment" / "5 days after step 1". */
  delay_label: string;
  template_key: string;
  template_label: string;
  subject: string | null;
  /** Rendered plain-text body via the real renderCampaignEmail — same function the send cron uses. */
  preview_text: string | null;
  /** Set when template_key isn't a recognized CampaignTemplateKey — preview couldn't be rendered honestly. */
  preview_unavailable: boolean;
}

export interface JourneyDetail {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_active: boolean;
  campus_id: string | null;
  campus_name: string | null;
  steps: JourneyStepPreview[];
  active: number;
  completed: number;
  exited: number;
}

export interface JourneyEnrollmentRow {
  id: string;
  lead_id: string;
  family_name: string;
  campus_name: string;
  status: "active" | "completed" | "exited";
  current_step: number;
  total_steps: number;
  next_step_at: string | null;
  enrolled_at: string;
  ended_at: string | null;
  exit_reason: string | null;
  /**
   * Whether any journey_step email to this lead has a recorded open/click
   * (migration 00045). False means "no evidence" — that's either a real
   * non-open or the migration isn't applied yet; the roster UI never shows
   * a negative "unopened" chip, only a positive one when evidence exists.
   */
  opened: boolean;
  clicked: boolean;
}

export interface EnrollableLead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  campus_id: string;
  campus_name: string;
  stage: string;
}

// ─── Helpers ────────────────────────────────────────────

function delayLabel(stepOrder: number, delayDays: number): string {
  const days = `${delayDays} day${delayDays === 1 ? "" : "s"}`;
  return stepOrder === 1 ? `${days} after enrollment` : `${days} after step ${stepOrder - 1}`;
}

const CAMPAIGN_TEMPLATE_KEYS = new Set(Object.keys(CAMPAIGN_TEMPLATES));

function isCampaignTemplateKey(key: string): key is CampaignTemplateKey {
  return CAMPAIGN_TEMPLATE_KEYS.has(key);
}

/** True when a Postgres error means "the table/relation doesn't exist yet" — same check as lib/email.ts. */
function isMissingEmailEventTable(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || /does not exist/i.test(error.message ?? "");
}

// ─── Queries ───────────────────────────────────────────

/**
 * Every journey the caller can see (both active and paused), with real
 * enrollment counts. `campusId` scopes the counts to that campus's leads
 * only — the journey list itself always includes network-default templates
 * plus campus-specific ones the caller has access to (RLS-enforced).
 */
export async function getJourneys(campusId?: string): Promise<JourneySummary[]> {
  const supabase = await createServerClient();

  const { data: journeys, error } = await supabase
    .from("journey")
    .select("id, key, name, description, is_active, campus_id, campus:campus_id (name)")
    .order("name", { ascending: true });

  if (error) {
    console.error("[getJourneys]", error.message);
    return [];
  }

  const rows: JourneySummary[] = [];
  for (const j of journeys ?? []) {
    const journey = j as Record<string, unknown>;
    const campus = journey.campus as Record<string, string> | null;
    const journeyId = journey.id as string;

    const countBy = async (status: string) => {
      let q = supabase
        .from("journey_enrollment")
        .select("id, lead:lead_id!inner (campus_id)", { count: "exact", head: true })
        .eq("journey_id", journeyId)
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

    rows.push({
      id: journeyId,
      key: journey.key as string,
      name: journey.name as string,
      description: (journey.description as string | null) ?? null,
      is_active: journey.is_active === true,
      campus_id: (journey.campus_id as string | null) ?? null,
      campus_name: campus?.name ?? null,
      active,
      completed,
      exited,
    });
  }
  return rows;
}

/** Count of currently-paused journeys visible to the caller — powers the honest paused note on the automated-messages page. */
export async function getPausedJourneyCount(): Promise<number> {
  const supabase = await createServerClient();
  const { count, error } = await supabase
    .from("journey")
    .select("id", { count: "exact", head: true })
    .eq("is_active", false);
  if (error) {
    console.error("[getPausedJourneyCount]", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function getJourneyDetail(journeyId: string): Promise<JourneyDetail | null> {
  const supabase = await createServerClient();

  const [{ data: journey, error }, { data: steps, error: stepsError }] = await Promise.all([
    supabase
      .from("journey")
      .select("id, key, name, description, is_active, campus_id, campus:campus_id (name)")
      .eq("id", journeyId)
      .maybeSingle(),
    supabase
      .from("journey_step")
      .select("id, step_order, delay_days, template_key, payload")
      .eq("journey_id", journeyId)
      .order("step_order", { ascending: true }),
  ]);

  if (error) console.error("[getJourneyDetail] journey", error.message);
  if (stepsError) console.error("[getJourneyDetail] steps", stepsError.message);
  if (!journey) return null;

  const row = journey as Record<string, unknown>;
  const campus = row.campus as Record<string, string> | null;
  // Preview renders with the journey's own campus name when it's campus-specific;
  // network-default templates fall back to the same generic label the send
  // cron itself uses (app/api/cron/run-journeys/route.ts), so the preview
  // never invents a campus name the real send wouldn't use either.
  const previewCampusName = campus?.name ?? "your school";

  const stepRows: JourneyStepPreview[] = (steps ?? []).map((s: Record<string, unknown>) => {
    const templateKey = s.template_key as string;
    const stepOrder = s.step_order as number;
    if (!isCampaignTemplateKey(templateKey)) {
      return {
        id: s.id as string,
        step_order: stepOrder,
        delay_days: s.delay_days as number,
        delay_label: delayLabel(stepOrder, s.delay_days as number),
        template_key: templateKey,
        template_label: templateKey,
        subject: null,
        preview_text: null,
        preview_unavailable: true,
      };
    }
    const rendered = renderCampaignEmail(templateKey, (s.payload ?? {}) as CampaignPayload, previewCampusName);
    return {
      id: s.id as string,
      step_order: stepOrder,
      delay_days: s.delay_days as number,
      delay_label: delayLabel(stepOrder, s.delay_days as number),
      template_key: templateKey,
      template_label: CAMPAIGN_TEMPLATES[templateKey].label,
      subject: rendered.subject,
      preview_text: rendered.text,
      preview_unavailable: false,
    };
  });

  const countBy = async (status: string) => {
    const { count } = await supabase
      .from("journey_enrollment")
      .select("id", { count: "exact", head: true })
      .eq("journey_id", journeyId)
      .eq("status", status);
    return count ?? 0;
  };
  const [active, completed, exited] = await Promise.all([
    countBy("active"),
    countBy("completed"),
    countBy("exited"),
  ]);

  return {
    id: row.id as string,
    key: row.key as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    is_active: row.is_active === true,
    campus_id: (row.campus_id as string | null) ?? null,
    campus_name: campus?.name ?? null,
    steps: stepRows,
    active,
    completed,
    exited,
  };
}

/** Full enrollment roster for a journey, newest-enrolled first. RLS-scoped through the enrolled lead's campus. */
export async function getJourneyRoster(journeyId: string): Promise<JourneyEnrollmentRow[]> {
  const supabase = await createServerClient();

  const [{ data: enrollments, error }, { count: stepCount }] = await Promise.all([
    supabase
      .from("journey_enrollment")
      .select(
        "id, lead_id, current_step, status, next_step_at, enrolled_at, ended_at, exit_reason, lead:lead_id (first_name, last_name, campus:campus_id (name))"
      )
      .eq("journey_id", journeyId)
      .order("enrolled_at", { ascending: false }),
    supabase
      .from("journey_step")
      .select("id", { count: "exact", head: true })
      .eq("journey_id", journeyId),
  ]);

  if (error) {
    console.error("[getJourneyRoster]", error.message);
    return [];
  }

  // Open/click evidence (migration 00045): any journey_step send to this
  // lead that recorded an open or click. Degrades to "no evidence" for every
  // row — never a hard failure — when the migration isn't applied yet or the
  // lookup errors for any other reason.
  const leadIds = [...new Set((enrollments ?? []).map((e: Record<string, unknown>) => e.lead_id as string))];
  const openedSet = new Set<string>();
  const clickedSet = new Set<string>();
  if (leadIds.length > 0) {
    const { data: events, error: eventsError } = await supabase
      .from("email_event")
      .select("lead_id, opened_at, clicked_at")
      .eq("kind", "journey_step")
      .in("lead_id", leadIds);

    if (eventsError) {
      if (!isMissingEmailEventTable(eventsError)) {
        console.error("[getJourneyRoster] email_event lookup failed", eventsError.message);
      }
    } else {
      for (const row of events ?? []) {
        const r = row as { lead_id: string | null; opened_at: string | null; clicked_at: string | null };
        if (!r.lead_id) continue;
        if (r.opened_at) openedSet.add(r.lead_id);
        if (r.clicked_at) clickedSet.add(r.lead_id);
      }
    }
  }

  const totalSteps = stepCount ?? 0;
  return (enrollments ?? []).map((e: Record<string, unknown>) => {
    const lead = e.lead as Record<string, unknown> | null;
    const campus = lead?.campus as Record<string, string> | null;
    const leadId = e.lead_id as string;
    return {
      id: e.id as string,
      lead_id: leadId,
      family_name: lead ? `${(lead.first_name as string) ?? ""} ${(lead.last_name as string) ?? ""}`.trim() : "Unknown family",
      campus_name: campus?.name ?? "Unknown campus",
      status: e.status as "active" | "completed" | "exited",
      current_step: e.current_step as number,
      total_steps: totalSteps,
      next_step_at: e.status === "active" ? ((e.next_step_at as string | null) ?? null) : null,
      enrolled_at: e.enrolled_at as string,
      ended_at: (e.ended_at as string | null) ?? null,
      exit_reason: (e.exit_reason as string | null) ?? null,
      opened: openedSet.has(leadId),
      clicked: clickedSet.has(leadId),
    };
  });
}

/**
 * Candidate leads for the "Enroll families" dialog: campus-scoped by RLS
 * (plus an explicit campus filter when supplied), with an email on file, not
 * unsubscribed, not on the suppression list, and not already enrolled in
 * THIS journey (any status — re-enrolling a completed/exited lead is a
 * silent no-op in enrollLeadInJourneyById, so excluding them up front keeps
 * "selected" honest).
 */
export async function getEnrollableLeads(
  journeyId: string,
  options?: { search?: string; campusId?: string }
): Promise<EnrollableLead[]> {
  const supabase = await createServerClient();

  const { data: existing } = await supabase
    .from("journey_enrollment")
    .select("lead_id")
    .eq("journey_id", journeyId);
  const alreadyIds = new Set((existing ?? []).map((r: Record<string, unknown>) => r.lead_id as string));

  let query = supabase
    .from("lead")
    .select("id, first_name, last_name, email, campus_id, stage, campus:campus_id (name)")
    .not("email", "is", null)
    .is("unsubscribed_at", null)
    .order("last_name", { ascending: true })
    .limit(200);

  if (options?.campusId) query = query.eq("campus_id", options.campusId);
  if (options?.search?.trim()) {
    const term = options.search.trim();
    query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[getEnrollableLeads]", error.message);
    return [];
  }

  const candidates = (data ?? []).filter((row: Record<string, unknown>) => !alreadyIds.has(row.id as string));
  const emails = candidates.map((row: Record<string, unknown>) => (row.email as string) ?? "");
  const suppressed = await getSuppressedEmails(emails);

  return candidates
    .filter((row: Record<string, unknown>) => !suppressed.has(((row.email as string) ?? "").toLowerCase()))
    .map((row: Record<string, unknown>) => {
      const campus = row.campus as Record<string, string> | null;
      return {
        id: row.id as string,
        first_name: row.first_name as string,
        last_name: row.last_name as string,
        email: row.email as string,
        campus_id: row.campus_id as string,
        campus_name: campus?.name ?? "",
        stage: row.stage as string,
      };
    });
}
