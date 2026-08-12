/**
 * Network overview — one row per active campus, for the CMO-level /staff/network
 * screen. Campus staff work a campus; the CMO answers for the network. This
 * module is the read side of that screen: it never mutates anything.
 *
 * DATA HONESTY rules this module follows (consistent with funnel.ts,
 * equity-funnel.ts, recruitment-intel.ts):
 *   - A metric with no real denominator returns null, never a fabricated 0.
 *     0 is a finding ("zero contacts logged this week"); null is a different
 *     finding ("cannot be computed right now").
 *   - Every sub-fetch is isolated. If one query fails, that fetch's fields
 *     render null/"—" with a logged error — the rest of the page still
 *     renders. A single flaky join must never crash the whole screen.
 *   - Any table this branch cannot guarantee exists (lottery_policy) is
 *     feature-detected via the 42P01 / PostgREST-relation-missing pattern
 *     already used in lib/email.ts and lib/inbound-email.ts, never assumed.
 *
 * Metric definitions (label precision matters more than richness):
 *   - leads_total: all-time lead count for the campus (mirrors the explicit
 *     all-time disclosure recruitment-intel.ts already uses for lead counts).
 *   - leads_new_7d: leads whose lead.created_at falls in the last 7 days.
 *   - contacts_7d ("Contacts (7d)"): STAFF-LOGGED call/sms/email activity in
 *     the last 7 days. lead_activity.actor_id is nullable — NULL means
 *     system/automation (see 00028_crm_leads.sql). This metric deliberately
 *     requires actor_id IS NOT NULL so an automated welcome send can't
 *     masquerade as staff outreach. Uses the same CONTACT_ACTIVITY_TYPES set
 *     (call/sms/email) as lib/mutations/leads.ts and recruitment-intel.ts —
 *     "note" is a staff annotation, not contact, under that established
 *     convention, so it is excluded here too despite being call-out in the
 *     original feature note; consistency with the codebase's one existing
 *     definition of "contact" beats introducing a second, looser one.
 *   - pct_first_touch_24h: of leads created in the last 30 days, the share
 *     whose EARLIEST call/sms/email activity (any actor — mirrors
 *     recruitment-intel.ts's getSpeedToFirstContactByCampus, which already
 *     treats automated first-touch as real speed-to-lead) landed within 24h
 *     of lead.created_at. Null with reason "No new leads" when the 30-day
 *     cohort is empty — never a fabricated 0%.
 *   - apps_total: post-draft (status != 'draft') application count. Scoped to
 *     the current cycle when this campus has a resolvable cycle start (same
 *     derivation as funnel.ts: earliest enrollment_window.open_date among
 *     this campus's windows in the current school year); otherwise all-time,
 *     and apps_scope discloses which.
 *   - seats: capacity_plan.total_seats / seats_registered summed for the
 *     current school year (falls back to all rows if no school year is
 *     marked current — same fallback funnel.ts uses).
 *   - next_event / next_window: soonest upcoming row, or null.
 *   - automation_ok: reduced from lib/queries/automation-health.ts. Cron
 *     heartbeats are recorded network-wide (setting table, campus_id null),
 *     not per campus, so this is a single network-level field, not a
 *     per-row one — the UI must display it once above the table, not imply
 *     a per-campus reading that doesn't exist.
 *   - policy_status: reads the `lottery_policy` table BY NAME (no import from
 *     lottery files — that module is owned by a concurrently-running agent
 *     on another branch). Migration 00047_lottery_policy.sql (status: draft
 *     | adopted | superseded, versioned per campus, at most one 'adopted'
 *     row per campus) landed in this working tree mid-build; the column
 *     names below match it, read only from the migration SQL, never from
 *     that agent's application code. It is explicitly APPLY MANUALLY per
 *     its own header comment, so the table may still be absent in any given
 *     environment — the 42P01/PostgREST-relation-missing feature-detect
 *     (mirroring lib/email.ts / lib/inbound-email.ts) stays load-bearing.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { getAutomationHealth } from "./automation-health";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mirrors lib/mutations/leads.ts CONTACT_ACTIVITY_TYPES / recruitment-intel.ts. */
const CONTACT_ACTIVITY_TYPES = new Set(["call", "sms", "email"]);

/**
 * True when a Postgres/PostgREST error means "the relation itself is
 * absent" — same check as lib/inbound-email.ts isMissingRelation, broader
 * than lib/email.ts's isMissingTableError (also catches the PostgREST
 * schema-cache codes a service-role client can surface).
 */
function isMissingRelation(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (code === "42P01" || code === "PGRST205" || code === "PGRST106") return true;
  return /does not exist|schema cache|could not find the table/i.test(error.message ?? "");
}

/** True when the error says a named column is absent — mirrors lib/queries/melt.ts isMissingColumn. */
function isMissingColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return /column .* does not exist/i.test(error.message ?? "");
}

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type ThresholdStatus = "ok" | "amber" | "red" | "unavailable";

export interface NextEvent {
  title: string;
  starts_at: string;
}

export interface NextWindow {
  name: string;
  status: string;
  open_date: string;
  close_date: string;
  /** Human label, e.g. "Open, closes Oct 26, 2026" or "Draft, opens Oct 26, 2026". */
  label: string;
}

export type PolicyStatusKind = "adopted" | "draft" | "none" | "unavailable";

export interface PolicyStatus {
  kind: PolicyStatusKind;
  version: string | null;
  date: string | null;
  label: string;
  /** True when this campus has no adopted policy and an enrollment window opens within 90 days. */
  amber: boolean;
}

export interface CampusNetworkRow {
  campus_id: string;
  campus_name: string;

  leads_total: number | null;
  leads_new_7d: number | null;

  /** "Contacts (7d)" — see file header for the exact definition. */
  contacts_7d: number | null;
  contacts_7d_amber: boolean;

  pct_first_touch_24h: number | null;
  pct_first_touch_24h_status: ThresholdStatus;
  /** Set when pct_first_touch_24h is null because the cohort was empty, not because a query failed. */
  pct_first_touch_24h_reason: string | null;

  apps_total: number | null;
  apps_scope: "current cycle" | "all-time";

  seats_total: number | null;
  seats_registered: number | null;

  next_event: NextEvent | null;
  next_window: NextWindow | null;

  policy_status: PolicyStatus;
}

export interface NetworkOverview {
  computedAt: string;
  /** Network-wide only — heartbeats are not recorded per campus. See file header. */
  automation: { ok: boolean; detail: string | null };
  rows: CampusNetworkRow[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function gradePct(pct: number | null): ThresholdStatus {
  if (pct === null) return "unavailable";
  if (pct < 25) return "red";
  if (pct < 50) return "amber";
  return "ok";
}

/* ------------------------------------------------------------------ */
/*  Main query                                                          */
/* ------------------------------------------------------------------ */

export async function getNetworkOverview(): Promise<NetworkOverview> {
  const supabase = createServiceRoleClient();
  const computedAt = new Date().toISOString();
  const now = Date.now();

  // ── Active campuses — the row set itself. A failure here means no rows
  // can be built at all; log and return an honest empty network. ──
  const { data: campusRows, error: campusError } = await supabase
    .from("campus")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (campusError) {
    console.error("[getNetworkOverview] campus", campusError.message);
  }
  const campuses = (campusRows ?? []) as Array<{ id: string; name: string }>;
  if (campuses.length === 0) {
    return { computedAt, automation: { ok: true, detail: null }, rows: [] };
  }
  const campusIds = campuses.map((c) => c.id);

  // ── Independent sub-fetches, in parallel. Each is checked for its own
  // error so one failing join degrades only the fields it feeds. ──
  const [
    schoolYearResult,
    leadsResult,
    activityResult,
    appsResult,
    windowResult,
    capacityResult,
    eventResult,
    policyResult,
    automationHealth,
  ] = await Promise.all([
    supabase.from("school_year").select("id, name").eq("is_current", true).maybeSingle(),
    supabase.from("lead").select("id, campus_id, created_at").in("campus_id", campusIds),
    supabase
      .from("lead_activity")
      .select("lead_id, activity_type, actor_id, created_at")
      .gte("created_at", new Date(now - 30 * DAY_MS).toISOString()),
    supabase
      .from("application")
      .select("id, campus_id, status, created_at")
      .in("campus_id", campusIds)
      .neq("status", "draft"),
    supabase
      .from("enrollment_window")
      .select("campus_id, school_year_id, name, status, open_date, close_date")
      .in("campus_id", campusIds),
    supabase.from("capacity_plan").select("campus_id, total_seats, seats_registered, school_year_id").in("campus_id", campusIds),
    supabase
      .from("event")
      .select("campus_id, title, starts_at")
      .in("campus_id", campusIds)
      .gte("starts_at", new Date(now).toISOString())
      .order("starts_at", { ascending: true }),
    (async () => {
      try {
        return await supabase
          .from("lottery_policy")
          .select("campus_id, version, status, adopted_date")
          .in("campus_id", campusIds);
      } catch (err) {
        return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
      }
    })(),
    getAutomationHealth().catch((err) => {
      console.error("[getNetworkOverview] automation health", err instanceof Error ? err.message : err);
      return null;
    }),
  ]);

  if (schoolYearResult.error) {
    console.error("[getNetworkOverview] school_year", schoolYearResult.error.message);
  }
  const schoolYearId = (schoolYearResult.data as { id?: string } | null)?.id ?? null;

  // ── Leads ──
  if (leadsResult.error) console.error("[getNetworkOverview] lead", leadsResult.error.message);
  const leadsOk = !leadsResult.error;
  const leads = (leadsResult.data ?? []) as Array<{ id: string; campus_id: string; created_at: string }>;
  const leadsById = new Map(leads.map((l) => [l.id, l]));

  // ── Activity (last 30 days), cross-referenced against the leads map ──
  if (activityResult.error) console.error("[getNetworkOverview] lead_activity", activityResult.error.message);
  const activityOk = !activityResult.error;
  const activity = (activityResult.data ?? []) as Array<{
    lead_id: string;
    activity_type: string;
    actor_id: string | null;
    created_at: string;
  }>;

  // First contact-type activity per lead (any actor — mirrors recruitment-intel.ts).
  const firstTouchByLead = new Map<string, number>();
  // Staff-logged (actor present) contact-type activity in the last 7 days, by campus.
  const contacts7dByCampus = new Map<string, number>();
  const sevenDaysAgo = now - 7 * DAY_MS;

  for (const row of activity) {
    if (!CONTACT_ACTIVITY_TYPES.has(row.activity_type)) continue;
    const t = new Date(row.created_at).getTime();

    const existingFirst = firstTouchByLead.get(row.lead_id);
    if (existingFirst === undefined || t < existingFirst) {
      firstTouchByLead.set(row.lead_id, t);
    }

    if (row.actor_id && t >= sevenDaysAgo) {
      const lead = leadsById.get(row.lead_id);
      if (lead) {
        contacts7dByCampus.set(lead.campus_id, (contacts7dByCampus.get(lead.campus_id) ?? 0) + 1);
      }
    }
  }

  // ── Applications, post-draft ──
  if (appsResult.error) console.error("[getNetworkOverview] application", appsResult.error.message);
  const appsOk = !appsResult.error;
  const apps = (appsResult.data ?? []) as Array<{ id: string; campus_id: string; created_at: string }>;

  // ── Enrollment windows — cycle start (current school year) + soonest upcoming ──
  if (windowResult.error) console.error("[getNetworkOverview] enrollment_window", windowResult.error.message);
  const windowsOk = !windowResult.error;
  const windows = (windowResult.data ?? []) as Array<{
    campus_id: string;
    school_year_id: string;
    name: string;
    status: string;
    open_date: string;
    close_date: string;
  }>;

  // Cycle start: earliest open_date among this campus's windows in the
  // current school year — same derivation funnel.ts uses for `lead`/`offer`,
  // which carry no school_year_id of their own.
  const cycleStartByCampus = new Map<string, string>();
  if (schoolYearId) {
    for (const w of windows) {
      if (w.school_year_id !== schoolYearId) continue;
      const existing = cycleStartByCampus.get(w.campus_id);
      if (!existing || w.open_date < existing) cycleStartByCampus.set(w.campus_id, w.open_date);
    }
  }

  // Next window: soonest open_date among windows not yet fully closed,
  // regardless of school year (a campus between cycles may have its next
  // window in the following year — still the honest "what's next").
  const nextWindowByCampus = new Map<string, (typeof windows)[number]>();
  const nowIso = new Date(now).toISOString();
  for (const w of windows) {
    if (w.close_date < nowIso) continue;
    const existing = nextWindowByCampus.get(w.campus_id);
    if (!existing || w.open_date < existing.open_date) nextWindowByCampus.set(w.campus_id, w);
  }

  // ── Capacity plan (current school year, falls back to all rows like funnel.ts) ──
  if (capacityResult.error) console.error("[getNetworkOverview] capacity_plan", capacityResult.error.message);
  const capacityOk = !capacityResult.error;
  const capacityRows = (capacityResult.data ?? []) as Array<{
    campus_id: string;
    total_seats: number | null;
    seats_registered: number | null;
    school_year_id: string;
  }>;
  const scopedCapacity = schoolYearId
    ? capacityRows.filter((r) => r.school_year_id === schoolYearId)
    : capacityRows;

  // ── Events — soonest upcoming per campus (already filtered/ordered by the DB) ──
  if (eventResult.error) console.error("[getNetworkOverview] event", eventResult.error.message);
  const eventsOk = !eventResult.error;
  const events = (eventResult.data ?? []) as Array<{ campus_id: string; title: string; starts_at: string }>;
  const nextEventByCampus = new Map<string, { title: string; starts_at: string }>();
  for (const e of events) {
    // events are ordered ascending by starts_at; first one seen per campus wins.
    if (!nextEventByCampus.has(e.campus_id)) nextEventByCampus.set(e.campus_id, e);
  }

  // ── Lottery policy (migration 00047_lottery_policy.sql) — feature-detected ──
  // status: 'draft' | 'adopted' | 'superseded'; at most one 'adopted' row per
  // campus (DB-enforced unique index), versioned per campus.
  const policyError = policyResult.error as { message?: string; code?: string } | null;
  const policyMissing = isMissingRelation(policyError) || isMissingColumn(policyError);
  if (policyError && !policyMissing) {
    console.error("[getNetworkOverview] lottery_policy", policyError.message);
  }
  const policyRowsByCampus = new Map<
    string,
    Array<{ version: number; status: string; adopted_date: string | null }>
  >();
  if (!policyError) {
    for (const row of (policyResult.data ?? []) as Array<{
      campus_id: string;
      version: number;
      status: string;
      adopted_date: string | null;
    }>) {
      const list = policyRowsByCampus.get(row.campus_id) ?? [];
      list.push({ version: row.version, status: row.status, adopted_date: row.adopted_date });
      policyRowsByCampus.set(row.campus_id, list);
    }
  }

  function withinNinetyDays(nextWindow: NextWindow | null): boolean {
    if (!nextWindow) return false;
    const openMs = new Date(nextWindow.open_date).getTime();
    return openMs - now <= 90 * DAY_MS;
  }

  function resolvePolicyStatus(campusId: string, nextWindow: NextWindow | null): PolicyStatus {
    if (policyMissing || policyError) {
      // Missing table (not-yet-applied migration) or any other read failure —
      // honest "—", never a fabricated "none".
      return { kind: "unavailable", version: null, date: null, label: "Not available yet", amber: false };
    }

    const rows = policyRowsByCampus.get(campusId) ?? [];
    const withinWindow = withinNinetyDays(nextWindow);

    // The DB guarantees at most one 'adopted' row per campus — that row is
    // the one that actually governs, regardless of what other draft/
    // superseded versions exist alongside it.
    const adopted = rows.find((r) => r.status === "adopted");
    if (adopted) {
      const label = `Adopted v${adopted.version}${
        adopted.adopted_date ? ` (${formatDate(adopted.adopted_date)})` : ""
      }`;
      return { kind: "adopted", version: String(adopted.version), date: adopted.adopted_date, label, amber: false };
    }

    // No adopted policy. The highest-version live draft (never a superseded
    // row, which is history, not something staff can still act on).
    const drafts = rows.filter((r) => r.status === "draft").sort((a, b) => b.version - a.version);
    if (drafts.length > 0) {
      const d = drafts[0];
      return {
        kind: "draft",
        version: String(d.version),
        date: null,
        label: `Draft v${d.version} — not yet adopted`,
        amber: withinWindow,
      };
    }

    return { kind: "none", version: null, date: null, label: "No policy on file", amber: withinWindow };
  }

  // ── Automation health, reduced to a single network-wide boolean+detail ──
  let automation: { ok: boolean; detail: string | null };
  if (!automationHealth) {
    automation = { ok: false, detail: "Automation health could not be checked." };
  } else {
    const flagged = automationHealth.filter((r) => r.status === "failed" || r.status === "overdue");
    automation =
      flagged.length === 0
        ? { ok: true, detail: null }
        : { ok: false, detail: flagged.map((r) => r.job.label).join(", ") };
  }

  // ── Assemble rows ──
  const rows: CampusNetworkRow[] = campuses.map((campus) => {
    const campusLeads = leads.filter((l) => l.campus_id === campus.id);
    const leadsTotal = leadsOk ? campusLeads.length : null;
    const leadsNew7d = leadsOk ? campusLeads.filter((l) => new Date(l.created_at).getTime() >= sevenDaysAgo).length : null;

    const contacts7d = leadsOk && activityOk ? contacts7dByCampus.get(campus.id) ?? 0 : null;
    const contacts7dAmber = contacts7d === 0 && (leadsTotal ?? 0) > 0;

    let pctFirstTouch24h: number | null = null;
    let pctFirstTouch24hReason: string | null = null;
    if (!leadsOk || !activityOk) {
      pctFirstTouch24hReason = "Could not compute";
    } else {
      const cohort = campusLeads.filter((l) => new Date(l.created_at).getTime() >= now - 30 * DAY_MS);
      if (cohort.length === 0) {
        pctFirstTouch24hReason = "No new leads";
      } else {
        const within24h = cohort.filter((l) => {
          const ft = firstTouchByLead.get(l.id);
          if (ft === undefined) return false;
          return ft - new Date(l.created_at).getTime() <= 24 * 60 * 60 * 1000;
        }).length;
        pctFirstTouch24h = Math.round((within24h / cohort.length) * 1000) / 10;
      }
    }

    let appsTotal: number | null = null;
    let appsScope: "current cycle" | "all-time" = "all-time";
    if (appsOk) {
      const cycleStart = windowsOk ? cycleStartByCampus.get(campus.id) : undefined;
      const campusApps = apps.filter((a) => a.campus_id === campus.id);
      if (cycleStart) {
        appsTotal = campusApps.filter((a) => a.created_at >= cycleStart).length;
        appsScope = "current cycle";
      } else {
        appsTotal = campusApps.length;
        appsScope = "all-time";
      }
    }

    let seatsTotal: number | null = null;
    let seatsRegistered: number | null = null;
    if (capacityOk) {
      const campusCapacity = scopedCapacity.filter((r) => r.campus_id === campus.id);
      seatsTotal = campusCapacity.reduce((sum, r) => sum + (r.total_seats ?? 0), 0);
      seatsRegistered = campusCapacity.reduce((sum, r) => sum + (r.seats_registered ?? 0), 0);
    }

    const nextEventRaw = eventsOk ? nextEventByCampus.get(campus.id) ?? null : null;
    const nextEvent: NextEvent | null = nextEventRaw
      ? { title: nextEventRaw.title, starts_at: nextEventRaw.starts_at }
      : null;

    const nextWindowRaw = windowsOk ? nextWindowByCampus.get(campus.id) ?? null : null;
    let nextWindow: NextWindow | null = null;
    if (nextWindowRaw) {
      const label =
        nextWindowRaw.status === "open"
          ? `Open, closes ${formatDate(nextWindowRaw.close_date)}`
          : `${capitalize(nextWindowRaw.status)}, opens ${formatDate(nextWindowRaw.open_date)}`;
      nextWindow = {
        name: nextWindowRaw.name,
        status: nextWindowRaw.status,
        open_date: nextWindowRaw.open_date,
        close_date: nextWindowRaw.close_date,
        label,
      };
    }

    const policyStatus = resolvePolicyStatus(campus.id, nextWindow);

    return {
      campus_id: campus.id,
      campus_name: campus.name,
      leads_total: leadsTotal,
      leads_new_7d: leadsNew7d,
      contacts_7d: contacts7d,
      contacts_7d_amber: contacts7dAmber,
      pct_first_touch_24h: pctFirstTouch24h,
      pct_first_touch_24h_status: gradePct(pctFirstTouch24h),
      pct_first_touch_24h_reason: pctFirstTouch24hReason,
      apps_total: appsTotal,
      apps_scope: appsScope,
      seats_total: seatsTotal,
      seats_registered: seatsRegistered,
      next_event: nextEvent,
      next_window: nextWindow,
      policy_status: policyStatus,
    };
  });

  return { computedAt, automation, rows };
}
