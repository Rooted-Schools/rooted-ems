import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";

export interface EventRow {
  id: string;
  campus_id: string;
  campus_name: string;
  title: string;
  event_type: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  is_published: boolean;
  registered: number;
  attended: number;
}

export interface RsvpRow {
  id: string;
  lead_id: string | null;
  guardian_name: string;
  email: string | null;
  phone: string | null;
  party_size: number;
  status: string;
  created_at: string;
  /** Migration 00037. Null when not checked in, or when the column isn't applied yet — see checkInAvailable. */
  checked_in_at: string | null;
}

export interface EventDetail extends EventRow {
  description: string | null;
  rsvps: RsvpRow[];
  /** Count of rsvps with checked_in_at set. 0 (honestly) when checkInAvailable is false. */
  checked_in: number;
  /**
   * False when event_rsvp.checked_in_at (migration 00037) has not been
   * applied to this database yet. The staff UI must hide the check-in
   * roster/count rather than show a fabricated 0, per data-honesty rule.
   */
  checkInAvailable: boolean;
}

export interface PublicEvent {
  id: string;
  campus_name: string;
  title: string;
  description: string | null;
  event_type: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  campus_id: string;
  is_full: boolean;
}

// ─── Staff (RLS-scoped) ────────────────────────────────

export async function getStaffEvents(campusId?: string): Promise<EventRow[]> {
  const supabase = await createServerClient();

  let q = supabase
    .from("event")
    .select("id, campus_id, title, event_type, location, starts_at, ends_at, capacity, is_published, campus:campus_id (name)")
    .order("starts_at", { ascending: false })
    .limit(100);
  if (campusId) q = q.eq("campus_id", campusId);
  const { data, error } = await q;
  if (error) {
    console.error("[getStaffEvents]", error.message);
    return [];
  }
  const events = data ?? [];
  if (events.length === 0) return [];

  // RSVP counts per event in one grouped pass.
  const ids = events.map((e: Record<string, unknown>) => e.id as string);
  const { data: rsvps } = await supabase
    .from("event_rsvp")
    .select("event_id, status")
    .in("event_id", ids);
  const counts = new Map<string, { registered: number; attended: number }>();
  for (const r of rsvps ?? []) {
    const row = r as Record<string, string>;
    const c = counts.get(row.event_id) ?? { registered: 0, attended: 0 };
    if (row.status !== "cancelled") c.registered++;
    if (row.status === "attended") c.attended++;
    counts.set(row.event_id, c);
  }

  return events.map((e: Record<string, unknown>) => {
    const campus = e.campus as Record<string, string> | null;
    const c = counts.get(e.id as string) ?? { registered: 0, attended: 0 };
    return {
      id: e.id as string,
      campus_id: e.campus_id as string,
      campus_name: campus?.name ?? "",
      title: e.title as string,
      event_type: e.event_type as string,
      location: (e.location as string | null) ?? null,
      starts_at: e.starts_at as string,
      ends_at: (e.ends_at as string | null) ?? null,
      capacity: (e.capacity as number | null) ?? null,
      is_published: e.is_published === true,
      registered: c.registered,
      attended: c.attended,
    };
  });
}

/** True when the error says a named column is absent — migration not yet applied, not a missing row. */
function isMissingColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return /column .* does not exist/i.test(error.message ?? "");
}

let warnedMissingCheckInColumn = false;
function warnMissingCheckInColumn(): void {
  if (warnedMissingCheckInColumn) return;
  warnedMissingCheckInColumn = true;
  console.warn(
    "[getEventDetail] event_rsvp.checked_in_at not present — migration 00037_event_rsvp_loop.sql has not been applied. Check-in roster is hidden until it runs."
  );
}

export async function getEventDetail(eventId: string): Promise<EventDetail | null> {
  const supabase = await createServerClient();

  const eventPromise = supabase
    .from("event")
    .select("id, campus_id, title, description, event_type, location, starts_at, ends_at, capacity, is_published, campus:campus_id (name)")
    .eq("id", eventId)
    .single();

  // checked_in_at is additive (migration 00037) — try with it first, and
  // fall back to the pre-migration column set if it isn't there yet rather
  // than letting the whole roster query fail.
  let checkInAvailable = true;
  let rsvpQuery = await supabase
    .from("event_rsvp")
    .select("id, lead_id, guardian_name, email, phone, party_size, status, created_at, checked_in_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (rsvpQuery.error && isMissingColumn(rsvpQuery.error)) {
    warnMissingCheckInColumn();
    checkInAvailable = false;
    rsvpQuery = (await supabase
      .from("event_rsvp")
      .select("id, lead_id, guardian_name, email, phone, party_size, status, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true })) as typeof rsvpQuery;
  }

  const { data: event, error } = await eventPromise;
  const { data: rsvps, error: rsvpError } = rsvpQuery;

  if (error || !event) {
    if (error) console.error("[getEventDetail]", error.message);
    return null;
  }
  if (rsvpError) {
    console.error("[getEventDetail] rsvps", rsvpError.message);
  }

  const roster: RsvpRow[] = ((rsvps ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    lead_id: (r.lead_id as string | null) ?? null,
    guardian_name: r.guardian_name as string,
    email: (r.email as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    party_size: r.party_size as number,
    status: r.status as string,
    created_at: r.created_at as string,
    checked_in_at: checkInAvailable ? ((r.checked_in_at as string | null) ?? null) : null,
  }));
  const campus = event.campus as unknown as Record<string, string> | null;
  return {
    id: event.id as string,
    campus_id: event.campus_id as string,
    campus_name: campus?.name ?? "",
    title: event.title as string,
    description: (event.description as string | null) ?? null,
    event_type: event.event_type as string,
    location: (event.location as string | null) ?? null,
    starts_at: event.starts_at as string,
    ends_at: (event.ends_at as string | null) ?? null,
    capacity: (event.capacity as number | null) ?? null,
    is_published: event.is_published === true,
    registered: roster.filter((r) => r.status !== "cancelled").length,
    attended: roster.filter((r) => r.status === "attended").length,
    checked_in: checkInAvailable ? roster.filter((r) => r.checked_in_at != null).length : 0,
    checkInAvailable,
    rsvps: roster,
  };
}

export interface NextEventRow {
  id: string;
  title: string;
  starts_at: string;
  campus_name: string;
}

/**
 * The single nearest upcoming event across the scoped campuses — powers the
 * Today leader strip's "Next event" chip. Any staff-visible event counts
 * (not just is_published, which only gates the public events page) since
 * this is an internal surface. Empty campusIds means org-wide.
 */
export async function getNextUpcomingEvent(campusIds?: string[]): Promise<NextEventRow | null> {
  const supabase = await createServerClient();
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("event")
    .select("id, title, starts_at, campus:campus_id (name)")
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(1);
  if (campusIds && campusIds.length > 0) query = query.in("campus_id", campusIds);

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("[getNextUpcomingEvent]", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const campus = row.campus as Record<string, string> | null;
  return {
    id: row.id as string,
    title: row.title as string,
    starts_at: row.starts_at as string,
    campus_name: campus?.name ?? "",
  };
}

// ─── Public (service role — unauthenticated pages) ─────

export async function getUpcomingPublicEvents(): Promise<PublicEvent[]> {
  const supabase = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data } = await supabase
    .from("event")
    .select("id, campus_id, title, description, event_type, location, starts_at, ends_at, capacity, campus:campus_id (name)")
    .eq("is_published", true)
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(50);

  const events = data ?? [];
  if (events.length === 0) return [];

  const ids = events.map((e: Record<string, unknown>) => e.id as string);
  const { data: rsvps } = await supabase
    .from("event_rsvp")
    .select("event_id, status")
    .in("event_id", ids);
  const active = new Map<string, number>();
  for (const r of rsvps ?? []) {
    const row = r as Record<string, string>;
    if (row.status !== "cancelled") active.set(row.event_id, (active.get(row.event_id) ?? 0) + 1);
  }

  return events.map((e: Record<string, unknown>) => {
    const campus = e.campus as Record<string, string> | null;
    const cap = e.capacity as number | null;
    return {
      id: e.id as string,
      campus_id: e.campus_id as string,
      campus_name: campus?.name ?? "",
      title: e.title as string,
      description: (e.description as string | null) ?? null,
      event_type: e.event_type as string,
      location: (e.location as string | null) ?? null,
      starts_at: e.starts_at as string,
      ends_at: (e.ends_at as string | null) ?? null,
      is_full: cap != null && (active.get(e.id as string) ?? 0) >= cap,
    };
  });
}

export async function getPublicEvent(eventId: string): Promise<PublicEvent | null> {
  const events = await getUpcomingPublicEvents();
  return events.find((e) => e.id === eventId) ?? null;
}
