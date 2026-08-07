import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import { formatRelativeTime } from "./utils";
import { getGradeLabel } from "@/lib/application-helpers";

// ─── Document Types ─────────────────────────────────────

export interface FamilyDocumentRow {
  id: string;
  document_type: string;
  file_name: string;
  status: string;
  file_size: number | null;
  storage_path: string;
  created_at: string;
  verified_at: string | null;
  application_id: string | null;
  student_name: string;
  rejection_reason: string | null;
}

export interface FamilyMessageRow {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
  time_ago: string;
}

// ─── Types ─────────────────────────────────────────────

export interface FamilyNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  created_at: string;
  read: boolean;
  type: string;
}

export interface EnrollmentWindowInfo {
  id: string;
  name: string;
  campus_name: string;
  campus_id: string;
  open_date: string;
  close_date: string;
  status: string;
  is_open: boolean;
  days_remaining: number | null;
}

export interface FamilyAppSummary {
  id: string;
  student_name: string;
  grade: string;
  grade_label: string;
  campus_name: string;
  status: string;
  submitted_at: string | null;
  updated_at: string;
  next_step: string | null;
}

export interface WaitlistStanding {
  /** Effective place in line: rank among still-active entries, 1-based. */
  position: number;
  /** Total active entries on the same waitlist. */
  total: number;
  /**
   * Real movement since the earliest recorded waitlist_position_history row
   * for this application — never inferred. Null when fewer than 2 history
   * rows exist yet (nothing honest to compare against) or the position has
   * not actually improved. See getWaitlistHistory / recordWaitlistPositionHistory.
   */
  movedFrom: { position: number; asOf: string } | null;
}

export interface FamilyJourneyCard {
  id: string;
  /** Empty string when the application (e.g. an early draft) has no student yet. */
  student_name: string;
  grade: string;
  campus_name: string;
  status: string;
  submitted_at: string | null;
  updated_at: string;
  /** Pending seat offer awaiting a family response, if any. */
  pending_offer: {
    id: string;
    expires_at: string;
    days_remaining: number;
    is_urgent: boolean; // <= 3 days remaining
  } | null;
  /** True once the application has reached registered/enrolled. */
  registration_complete: boolean;
  /** Live waitlist standing when the application is waitlisted, else null. */
  waitlist_standing: WaitlistStanding | null;
  /** Campus contact number, when set (campus.phone) — powers the family-facing help line. */
  campus_phone: string | null;
}

/**
 * Compute the effective waitlist standing for a set of applications.
 *
 * `position_number` is never renumbered when entries leave the list (rows are
 * soft-removed via `removed_at`), so the raw number overstates a family's
 * place in line. The honest number is the rank among still-active entries.
 *
 * Uses the service-role client because ranking requires counting OTHER
 * families' rows, which family RLS rightly forbids. Callers must pass only
 * application IDs already proven to belong to the requesting user (i.e. IDs
 * returned by an RLS-scoped query) — only rank and total are ever returned,
 * never other families' data.
 */
export async function getWaitlistStandings(
  applicationIds: string[]
): Promise<Map<string, WaitlistStanding>> {
  const standings = new Map<string, WaitlistStanding>();
  if (applicationIds.length === 0) return standings;

  const supabase = createServiceRoleClient();

  const { data: mine, error } = await supabase
    .from("waitlist_position")
    .select("application_id, waitlist_id, position_number")
    .in("application_id", applicationIds)
    .is("removed_at", null);

  if (error) {
    console.error("[getWaitlistStandings]", error.message);
    return standings;
  }
  if (!mine || mine.length === 0) return standings;

  const waitlistIds = [...new Set(mine.map((m: Record<string, unknown>) => m.waitlist_id as string))];

  const { data: active, error: activeError } = await supabase
    .from("waitlist_position")
    .select("waitlist_id, position_number")
    .in("waitlist_id", waitlistIds)
    .is("removed_at", null);

  if (activeError) {
    console.error("[getWaitlistStandings] active", activeError.message);
    return standings;
  }

  // Group active position numbers by waitlist for rank computation
  const byWaitlist = new Map<string, number[]>();
  for (const row of active ?? []) {
    const r = row as Record<string, unknown>;
    const wid = r.waitlist_id as string;
    const list = byWaitlist.get(wid) ?? [];
    list.push(r.position_number as number);
    byWaitlist.set(wid, list);
  }

  // Batch-fetch the history ledger for the "moved up from N" line. Never
  // fabricated: a movedFrom is only ever set below when at least 2 rows
  // exist for the application AND the position genuinely improved.
  const { data: historyRows, error: historyError } = await supabase
    .from("waitlist_position_history")
    .select("application_id, position_number, changed_at")
    .in("application_id", applicationIds)
    .order("changed_at", { ascending: true });

  if (historyError) {
    console.error("[getWaitlistStandings] history", historyError.message);
  }

  const historyByApp = new Map<string, Array<{ position_number: number; changed_at: string }>>();
  for (const row of historyRows ?? []) {
    const r = row as Record<string, unknown>;
    const appId = r.application_id as string;
    const list = historyByApp.get(appId) ?? [];
    list.push({ position_number: r.position_number as number, changed_at: r.changed_at as string });
    historyByApp.set(appId, list);
  }

  for (const row of mine) {
    const r = row as Record<string, unknown>;
    const numbers = byWaitlist.get(r.waitlist_id as string) ?? [];
    const myNumber = r.position_number as number;
    const rank = numbers.filter((n) => n < myNumber).length + 1;

    let movedFrom: WaitlistStanding["movedFrom"] = null;
    const hist = historyByApp.get(r.application_id as string) ?? [];
    if (hist.length >= 2) {
      const first = hist[0];
      const last = hist[hist.length - 1];
      if (last.position_number < first.position_number) {
        movedFrom = { position: first.position_number, asOf: last.changed_at };
      }
    }

    standings.set(r.application_id as string, { position: rank, total: numbers.length, movedFrom });
  }

  return standings;
}

/**
 * Full ordered history of waitlist position changes for ONE application —
 * the raw ledger (supabase/migrations/00034_waitlist_position_history.sql)
 * that getWaitlistStandings uses internally to compute `movedFrom`. Exposed
 * separately for any surface that wants the full sequence of changes rather
 * than just a from/to summary.
 *
 * Service-role, same contract as getWaitlistStandings: callers must pass
 * only an application id already proven to belong to the requesting user.
 */
export interface WaitlistHistoryEntry {
  position_number: number;
  change_type: string;
  changed_at: string;
}

export async function getWaitlistHistory(applicationId: string): Promise<WaitlistHistoryEntry[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("waitlist_position_history")
    .select("position_number, change_type, changed_at")
    .eq("application_id", applicationId)
    .order("changed_at", { ascending: true });

  if (error) {
    console.error("[getWaitlistHistory]", error.message);
    return [];
  }
  return (data ?? []) as WaitlistHistoryEntry[];
}

export interface RegistrationSummary {
  completed: number;
  total: number;
  /** Required items still outstanding, with a plain-language hint. */
  outstanding: { name: string; hint: string }[];
}

/** Registration item statuses that count as "done" (mirrors the packet UI + nudge cron). */
const REG_DONE_STATUSES = new Set(["submitted", "verified", "skipped"]);

/**
 * Outstanding required registration items for ONE application, for the family
 * home's primary "Your turn: N documents" card.
 *
 * Service-role (packet/enrollment rows aren't family-RLS-readable), so callers
 * MUST pass an application id already proven to belong to the requesting user —
 * same contract as getWaitlistStandings. Returns null when there's no packet.
 */
export async function getRegistrationSummary(
  applicationId: string
): Promise<RegistrationSummary | null> {
  const supabase = createServiceRoleClient();

  const { data: enrollment } = await supabase
    .from("enrollment")
    .select("id, campus_id, school_year_id")
    .eq("application_id", applicationId)
    .maybeSingle();
  if (!enrollment) return null;

  const [{ data: items }, { data: requirements }] = await Promise.all([
    supabase
      .from("registration_item")
      .select("item_type, status")
      .eq("enrollment_id", enrollment.id as string),
    supabase
      .from("packet_requirement")
      .select("item_type, name, description")
      .eq("campus_id", enrollment.campus_id as string)
      .eq("school_year_id", enrollment.school_year_id as string)
      .eq("is_required", true)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  const reqs = (requirements ?? []) as Array<{ item_type: string; name: string; description: string | null }>;
  if (reqs.length === 0) return null;

  const doneTypes = new Set(
    ((items ?? []) as Array<{ item_type: string; status: string }>)
      .filter((i) => REG_DONE_STATUSES.has(i.status))
      .map((i) => i.item_type)
  );

  const outstanding = reqs
    .filter((r) => !doneTypes.has(r.item_type))
    .map((r) => ({ name: r.name, hint: r.description ?? "" }));

  return {
    completed: reqs.length - outstanding.length,
    total: reqs.length,
    outstanding,
  };
}

// ─── Queries ─────────────────────────────────────────────

/**
 * Per-application journey data for the family dashboard cards.
 *
 * Uses the user-scoped server client: RLS (app_family / offer_family /
 * student_own) restricts rows to the authenticated guardian's household, so
 * no service-role access is needed for this family-facing read. Two queries
 * total — applications with joins, then pending offers for those apps.
 */
export async function getFamilyJourneyCards(): Promise<FamilyJourneyCard[]> {
  const supabase = await createServerClient();

  const { data: apps, error } = await supabase
    .from("application")
    .select(
      `
      id, status, submitted_at, updated_at,
      student:student_id (first_name, last_name),
      campus:campus_id (name, phone),
      grade_level:grade_level_id (grade)
    `
    )
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[getFamilyJourneyCards]", error.message);
    return [];
  }
  if (!apps || apps.length === 0) return [];

  const appIds = apps.map((a: Record<string, unknown>) => a.id as string);

  const { data: offers, error: offerError } = await supabase
    .from("offer")
    .select("id, application_id, expires_at")
    .in("application_id", appIds)
    .eq("status", "pending");

  if (offerError) {
    console.error("[getFamilyJourneyCards] offers", offerError.message);
  }

  // Live standings for any waitlisted applications (app IDs are RLS-proven above)
  const waitlistedIds = apps
    .filter((a: Record<string, unknown>) => a.status === "waitlisted")
    .map((a: Record<string, unknown>) => a.id as string);
  const standings = await getWaitlistStandings(waitlistedIds);

  const now = Date.now();
  const offerByApp = new Map<string, FamilyJourneyCard["pending_offer"]>();
  for (const o of offers ?? []) {
    const row = o as Record<string, unknown>;
    const expiry = row.expires_at ? new Date(row.expires_at as string).getTime() : null;
    const daysRemaining =
      expiry != null ? Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))) : 0;
    offerByApp.set(row.application_id as string, {
      id: row.id as string,
      expires_at: row.expires_at as string,
      days_remaining: daysRemaining,
      is_urgent: daysRemaining <= 3,
    });
  }

  return apps.map((row: Record<string, unknown>) => {
    const student = row.student as Record<string, string> | null;
    const campus = row.campus as Record<string, string> | null;
    const grade = row.grade_level as Record<string, string> | null;
    const status = row.status as string;

    return {
      id: row.id as string,
      student_name: student
        ? `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim()
        : "",
      grade: (grade?.grade as string) ?? "",
      campus_name: campus?.name ?? "",
      status,
      submitted_at: row.submitted_at as string | null,
      updated_at: row.updated_at as string,
      pending_offer: offerByApp.get(row.id as string) ?? null,
      registration_complete: status === "registered" || status === "enrolled",
      waitlist_standing: standings.get(row.id as string) ?? null,
      campus_phone: (campus?.phone as string | undefined) ?? null,
    };
  });
}

/**
 * Fetch notifications for a family user.
 */
export async function getFamilyNotifications(
  userId: string,
  limit: number = 10
): Promise<FamilyNotification[]> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("notification")
    .select("id, title, body, created_at, read_at, is_read")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getFamilyNotifications]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    title: (row.title as string) ?? "",
    message: (row.body as string) ?? "",
    time: formatRelativeTime(row.created_at as string),
    created_at: (row.created_at as string) ?? "",
    read: (row.is_read as boolean) ?? false,
    type: "info",
  }));
}

/**
 * Fetch active and upcoming enrollment windows.
 * Families see windows that are currently open or opening soon.
 */
export async function getActiveEnrollmentWindows(
  campusId?: string
): Promise<EnrollmentWindowInfo[]> {
  const supabase = createServiceRoleClient();
  const now = new Date();
  const nowIso = now.toISOString();

  // Get windows that haven't closed yet
  let query = supabase
    .from("enrollment_window")
    .select(
      `
      id, name, open_date, close_date, status,
      campus:campus_id (id, name)
    `
    )
    .gte("close_date", nowIso)
    .eq("status", "open")
    .order("open_date", { ascending: true });

  if (campusId) {
    query = query.eq("campus_id", campusId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getActiveEnrollmentWindows]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const campus = row.campus as Record<string, string> | null;
    const openDate = new Date(row.open_date as string);
    const closeDate = new Date(row.close_date as string);
    const isOpen = now >= openDate && now <= closeDate;

    let daysRemaining: number | null = null;
    if (isOpen) {
      daysRemaining = Math.ceil(
        (closeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    return {
      id: row.id as string,
      name: (row.name as string) ?? "Enrollment Window",
      campus_name: campus?.name ?? "",
      campus_id: campus?.id ?? "",
      open_date: openDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      close_date: closeDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      status: (row.status as string) ?? "",
      is_open: isOpen,
      days_remaining: daysRemaining,
    };
  });
}

/**
 * Fetch family's applications for their dashboard summary.
 * Lighter than the full getFamilyApplications — just what the dashboard needs.
 */
export async function getFamilyDashboardApps(
  userId: string
): Promise<FamilyAppSummary[]> {
  const supabase = createServiceRoleClient();

  // Find guardian records for this user
  const { data: guardians } = await supabase
    .from("guardian")
    .select("id")
    .eq("user_id", userId);

  if (!guardians || guardians.length === 0) return [];

  const guardianIds = guardians.map((g: Record<string, string>) => g.id);

  const { data, error } = await supabase
    .from("application")
    .select(
      `
      id, status, submitted_at, updated_at,
      student:student_id (first_name, last_name),
      campus:campus_id (name),
      grade_level:grade_level_id (grade)
    `
    )
    .in("guardian_id", guardianIds)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[getFamilyDashboardApps]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const student = row.student as Record<string, string> | null;
    const campus = row.campus as Record<string, string> | null;
    const grade = row.grade_level as Record<string, string> | null;

    const gradeCode = (grade?.grade as string) ?? "";
    const status = row.status as string;

    // Derive a helpful next-step hint based on current status
    const nextStepMap: Record<string, string> = {
      draft: "Complete and submit your application.",
      submitted: "Your application is being reviewed.",
      needs_info: "Additional information or documents are needed.",
      verified: "Your application has been verified and is ready for lottery.",
      offered: "You have received an offer — please respond before it expires.",
      waitlisted: "You are on the waitlist. We will notify you if a seat opens.",
    };

    return {
      id: row.id as string,
      student_name: student
        ? `${student.first_name} ${student.last_name}`
        : "Unknown Student",
      grade: gradeCode,
      grade_label: gradeCode ? `Grade ${gradeCode}` : "",
      campus_name: campus?.name ?? "",
      status,
      submitted_at: row.submitted_at as string | null,
      updated_at: row.updated_at as string,
      next_step: nextStepMap[status] ?? null,
    };
  });
}

/**
 * Fetch all documents across a family user's applications.
 */
export async function getFamilyDocuments(
  userId: string
): Promise<FamilyDocumentRow[]> {
  const supabase = createServiceRoleClient();

  // Find guardian IDs for this user
  const { data: guardians } = await supabase
    .from("guardian")
    .select("id")
    .eq("user_id", userId);

  if (!guardians || guardians.length === 0) return [];

  const guardianIds = guardians.map((g: Record<string, string>) => g.id);

  // Get application IDs for these guardians
  const { data: apps } = await supabase
    .from("application")
    .select("id, student:student_id (first_name, last_name)")
    .in("guardian_id", guardianIds);

  if (!apps || apps.length === 0) return [];

  const appIds = apps.map((a: Record<string, unknown>) => a.id as string);
  const appStudentMap: Record<string, string> = {};
  for (const a of apps) {
    const app = a as Record<string, unknown>;
    const student = app.student as Record<string, string> | null;
    appStudentMap[app.id as string] = student
      ? `${student.first_name} ${student.last_name}`
      : "Unknown";
  }

  // Fetch documents for these applications
  const { data: docs, error } = await supabase
    .from("document")
    .select("id, document_type, file_name, file_size, storage_path, status, created_at, verified_at, application_id, rejection_reason")
    .in("application_id", appIds)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getFamilyDocuments]", error.message);
    return [];
  }

  return (docs ?? []).map((d: Record<string, unknown>) => ({
    id: d.id as string,
    document_type: d.document_type as string,
    file_name: d.file_name as string,
    status: d.status as string,
    file_size: d.file_size as number | null,
    storage_path: (d.storage_path as string) ?? "",
    created_at: d.created_at as string,
    verified_at: d.verified_at as string | null,
    application_id: d.application_id as string | null,
    student_name: appStudentMap[d.application_id as string] ?? "Unknown",
    rejection_reason: (d.rejection_reason as string) ?? null,
  }));
}

/**
 * Which portal a notification belongs to. The notification table is shared
 * and a user can hold both roles at once (staff who are also parents of
 * applicants — including every test account). The link prefix is the
 * audience signal: family-facing notifications link into /family/*, staff
 * ones into /staff/*. Each portal's bell and messages page must only show
 * its own context — otherwise a staff bell can route staff into the family
 * portal (and vice versa).
 */
export type NotificationContext = "staff" | "family";

function applyContextFilter<Q extends { or(filters: string): Q }>(
  query: Q,
  context?: NotificationContext
): Q {
  if (context === "staff") return query.or("link.is.null,link.like./staff%");
  if (context === "family") return query.or("link.is.null,link.like./family%");
  return query;
}

/**
 * Fetch messages (notifications) for a user, scoped to one portal context.
 */
export async function getFamilyMessages(
  userId: string,
  limit: number = 50,
  context?: NotificationContext
): Promise<FamilyMessageRow[]> {
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("notification")
    .select("id, title, body, link, is_read, created_at")
    .eq("user_id", userId);
  query = applyContextFilter(query, context);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getFamilyMessages]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    title: row.title as string,
    body: (row.body as string) ?? null,
    link: (row.link as string) ?? null,
    is_read: (row.is_read as boolean) ?? false,
    created_at: row.created_at as string,
    time_ago: formatRelativeTime(row.created_at as string),
  }));
}

/**
 * Unread notification count with the same context filter as
 * getFamilyMessages, so a portal's badge always matches its list.
 */
export async function getUnreadNotificationCount(
  userId: string,
  context: NotificationContext
): Promise<number> {
  const supabase = createServiceRoleClient();
  let query = supabase
    .from("notification")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  query = applyContextFilter(query, context);
  const { count, error } = await query;
  if (error) {
    console.error("[getUnreadNotificationCount]", error.message);
    return 0;
  }
  return count ?? 0;
}

// ─── Offer Types & Queries ───────────────────────────────

export interface FamilyOfferDetail {
  id: string;
  status: string;
  offered_at: string;
  expires_at: string;
  days_remaining: number | null;
  hours_remaining: number | null;
  is_expired: boolean;
  is_urgent: boolean; // true when < 72 hours remain
  student_name: string;
  grade: string;
  campus_name: string;
  campus_id: string;
  grade_level_id: string;
  application_id: string;
  guardian_id: string;
}

export interface FamilyPendingOffer {
  id: string;
  student_name: string;
  grade: string;
  campus_name: string;
  expires_at: string;
  days_remaining: number | null;
  is_urgent: boolean;
  application_id: string;
}

/**
 * Fetch a single offer for a family user, verifying ownership via guardian.
 * Returns null if the offer doesn't exist or doesn't belong to this user.
 */
export async function getFamilyOfferDetail(
  offerId: string,
  userId: string
): Promise<FamilyOfferDetail | null> {
  const supabase = createServiceRoleClient();

  // Find guardian IDs for this user
  const { data: guardians } = await supabase
    .from("guardian")
    .select("id")
    .eq("user_id", userId);

  if (!guardians || guardians.length === 0) return null;
  const guardianIds = guardians.map((g: Record<string, string>) => g.id);

  // Fetch the offer, verifying it belongs to this family via application.guardian_id
  const { data: offer, error } = await supabase
    .from("offer")
    .select(`
      id, status, offered_at, expires_at,
      campus_id, grade_level_id,
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      application:application_id (
        id, guardian_id,
        student:student_id (first_name, last_name)
      )
    `)
    .eq("id", offerId)
    .single();

  if (error || !offer) return null;

  const app = offer.application as unknown as Record<string, unknown> | null;
  const guardianId = app?.guardian_id as string | null;

  // Ownership check — ensure this offer belongs to the authenticated family
  if (!guardianId || !guardianIds.includes(guardianId)) return null;

  const student = app?.student as Record<string, string> | null;
  const campus = offer.campus as unknown as Record<string, string> | null;
  const grade = offer.grade_level as unknown as Record<string, string> | null;

  const now = Date.now();
  const expiry = offer.expires_at ? new Date(offer.expires_at as string).getTime() : null;
  const msRemaining = expiry ? expiry - now : null;
  const hoursRemaining = msRemaining != null ? Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60))) : null;
  const daysRemaining = msRemaining != null ? Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24))) : null;
  const isExpired = msRemaining != null ? msRemaining <= 0 : false;
  const isUrgent = daysRemaining != null ? daysRemaining <= 3 && !isExpired : false;

  return {
    id: offer.id as string,
    status: offer.status as string,
    offered_at: offer.offered_at as string,
    expires_at: offer.expires_at as string,
    days_remaining: daysRemaining,
    hours_remaining: hoursRemaining,
    is_expired: isExpired,
    is_urgent: isUrgent,
    student_name: student ? `${student.first_name} ${student.last_name}` : "Your student",
    grade: grade?.grade ? `Grade ${grade.grade}` : "",
    campus_name: campus?.name ?? "",
    campus_id: offer.campus_id as string,
    grade_level_id: offer.grade_level_id as string,
    application_id: app?.id as string,
    guardian_id: guardianId,
  };
}

/**
 * Fetch all pending offers for a family user.
 */
export async function getFamilyPendingOffers(
  userId: string
): Promise<FamilyPendingOffer[]> {
  const supabase = createServiceRoleClient();

  const { data: guardians } = await supabase
    .from("guardian")
    .select("id")
    .eq("user_id", userId);

  if (!guardians || guardians.length === 0) return [];
  const guardianIds = guardians.map((g: Record<string, string>) => g.id);

  const { data: apps } = await supabase
    .from("application")
    .select("id")
    .in("guardian_id", guardianIds);

  if (!apps || apps.length === 0) return [];
  const appIds = apps.map((a: Record<string, unknown>) => a.id as string);

  const { data, error } = await supabase
    .from("offer")
    .select(`
      id, status, expires_at,
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      application:application_id (
        id,
        student:student_id (first_name, last_name)
      )
    `)
    .in("application_id", appIds)
    .eq("status", "pending")
    .order("expires_at", { ascending: true });

  if (error || !data) return [];

  const now = Date.now();

  return data.map((row: Record<string, unknown>) => {
    const app = row.application as unknown as Record<string, unknown> | null;
    const student = app?.student as Record<string, string> | null;
    const campus = row.campus as unknown as Record<string, string> | null;
    const grade = row.grade_level as unknown as Record<string, string> | null;
    const expiry = row.expires_at ? new Date(row.expires_at as string).getTime() : null;
    const msRemaining = expiry ? expiry - now : null;
    const daysRemaining = msRemaining != null ? Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24))) : null;

    return {
      id: row.id as string,
      student_name: student ? `${student.first_name} ${student.last_name}` : "Your student",
      grade: grade?.grade ? `Grade ${grade.grade}` : "",
      campus_name: campus?.name ?? "",
      expires_at: row.expires_at as string,
      days_remaining: daysRemaining,
      is_urgent: daysRemaining != null && daysRemaining <= 3,
      application_id: app?.id as string,
    };
  });
}

// ─── Household Inheritance (returning families) ──────────

/**
 * A returning family's existing household + their own guardian record on it,
 * for prefilling a SECOND (or later) child's application instead of
 * re-collecting — and re-duplicating — the same guardian/household data.
 * See lib/mutations/applications.ts (createApplication), which independently
 * re-resolves the household/guardian by user_id server-side and is the
 * actual source of truth for linking vs. creating; this query only powers
 * the new-application form's prefill.
 *
 * Read-only, RLS-scoped (household_own / guardian_own already restrict both
 * tables to rows the caller's own user_id owns) — no service-role escalation
 * needed.
 */
export interface ExistingHouseholdInfo {
  household_id: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  primary_language: string | null;
  guardian: {
    first_name: string;
    last_name: string;
    relationship: string;
    email: string | null;
    phone: string | null;
    sms_consent: boolean;
  } | null;
}

export async function getExistingHouseholdForUser(
  userId: string
): Promise<ExistingHouseholdInfo | null> {
  const supabase = await createServerClient();

  const { data: household, error } = await supabase
    .from("household")
    .select("id, address_line1, address_line2, city, state, zip, primary_language")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error || !household) return null;

  const { data: guardian } = await supabase
    .from("guardian")
    .select("first_name, last_name, relationship, email, phone, sms_consent")
    .eq("household_id", household.id as string)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  const g = guardian as Record<string, unknown> | null;

  return {
    household_id: household.id as string,
    address_line1: (household.address_line1 as string) ?? null,
    address_line2: (household.address_line2 as string) ?? null,
    city: (household.city as string) ?? null,
    state: (household.state as string) ?? null,
    zip: (household.zip as string) ?? null,
    primary_language: (household.primary_language as string) ?? null,
    guardian: g
      ? {
          first_name: g.first_name as string,
          last_name: g.last_name as string,
          relationship: g.relationship as string,
          email: (g.email as string) ?? null,
          phone: (g.phone as string) ?? null,
          sms_consent: (g.sms_consent as boolean) ?? false,
        }
      : null,
  };
}

// ─── Lottery Result Types & Query ────────────────────────

export interface LotteryOutcome {
  hasResult: boolean;
  studentFirstName: string;
  campusName: string;
  isSelected: boolean;
  gradeLabel: string;
  totalApplicants: number;
  totalSeats: number;
  tierLabel: string;
  randomNumber: number | null;
  seedFingerprint: string | null;
  executedAt: string | null;
  waitlist: WaitlistStanding | null;
}

const DEFAULT_TIER_LABEL = "Sibling enrolled at campus";

/**
 * Defensively pull tier labels out of a rule set's priority_tiers JSONB.
 * Falls back to the single sibling-priority label when the array is
 * missing, empty, or malformed. Mirrors the extraction used in
 * app/(public)/how-the-lottery-works/page.tsx.
 */
function extractTierLabels(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [DEFAULT_TIER_LABEL];
  const labels = raw
    .map((item) => {
      const label = (item as Record<string, unknown> | null)?.label;
      return typeof label === "string" && label.trim() ? label : null;
    })
    .filter((label): label is string => label !== null);
  return labels.length > 0 ? labels : [DEFAULT_TIER_LABEL];
}

/**
 * Fetch a family's lottery result for a single application.
 *
 * Ownership is proven FIRST via the RLS user client — the application read
 * is scoped to the guardian's household by RLS (same pattern as every other
 * family query in this file). Only once that row comes back do we escalate
 * to the service-role client to read the lottery snapshot/run, because that
 * read needs cross-table access (rule set tiers, other waitlist entries)
 * that family RLS rightly forbids. If the RLS read returns nothing — the
 * application doesn't exist, or belongs to another family — we return null
 * and never touch service-role data. Fails closed.
 */
export async function getLotteryOutcome(applicationId: string): Promise<LotteryOutcome | null> {
  const supabase = await createServerClient();

  const { data: app, error } = await supabase
    .from("application")
    .select(
      `
      id, campus_id, status,
      student:student_id (first_name),
      campus:campus_id (name)
    `
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (error || !app) return null; // ownership fails closed

  const student = app.student as unknown as Record<string, string> | null;
  const campus = app.campus as unknown as Record<string, string> | null;
  const studentFirstName = student?.first_name ?? "";
  const campusName = campus?.name ?? "";

  const service = createServiceRoleClient();

  const { data: snapshot, error: snapshotError } = await service
    .from("lottery_entry_snapshot")
    .select("id, lottery_run_id, priority_tier, random_number, is_selected, application_id")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (snapshotError) {
    console.error("[getLotteryOutcome] snapshot", snapshotError.message);
  }

  if (!snapshot) {
    return {
      hasResult: false,
      studentFirstName,
      campusName,
      isSelected: false,
      gradeLabel: "",
      totalApplicants: 0,
      totalSeats: 0,
      tierLabel: "",
      randomNumber: null,
      seedFingerprint: null,
      executedAt: null,
      waitlist: null,
    };
  }

  const { data: run, error: runError } = await service
    .from("lottery_run")
    .select(
      `
      id, executed_at, random_seed, total_applicants, total_seats, lottery_rule_set_id,
      grade_level:grade_level_id (grade)
    `
    )
    .eq("id", snapshot.lottery_run_id as string)
    .maybeSingle();

  if (runError) {
    console.error("[getLotteryOutcome] run", runError.message);
  }

  const runRow = run as Record<string, unknown> | null;
  const runGrade = runRow?.grade_level as unknown as Record<string, string> | null;
  const gradeLabel = runGrade?.grade ? getGradeLabel(runGrade.grade) : "";

  let tierLabels: string[] = [DEFAULT_TIER_LABEL];
  if (runRow?.lottery_rule_set_id) {
    const { data: ruleSet } = await service
      .from("lottery_rule_set")
      .select("priority_tiers")
      .eq("id", runRow.lottery_rule_set_id as string)
      .maybeSingle();
    tierLabels = extractTierLabels((ruleSet as Record<string, unknown> | null)?.priority_tiers);
  }

  const tierIndex = snapshot.priority_tier as number;
  const tierLabel =
    tierIndex >= 0 && tierIndex < tierLabels.length ? tierLabels[tierIndex] : "General pool";

  const isSelected = snapshot.is_selected as boolean;
  const randomSeed = runRow?.random_seed as string | null;

  let waitlist: WaitlistStanding | null = null;
  if (!isSelected) {
    const standings = await getWaitlistStandings([applicationId]);
    waitlist = standings.get(applicationId) ?? null;
  }

  return {
    hasResult: true,
    studentFirstName,
    campusName,
    isSelected,
    gradeLabel,
    totalApplicants: (runRow?.total_applicants as number) ?? 0,
    totalSeats: (runRow?.total_seats as number) ?? 0,
    tierLabel,
    randomNumber: (snapshot.random_number as number) ?? null,
    seedFingerprint: randomSeed ? randomSeed.slice(0, 8) : null,
    executedAt: (runRow?.executed_at as string) ?? null,
    waitlist,
  };
}
