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
}

export interface EventDetail extends EventRow {
  description: string | null;
  rsvps: RsvpRow[];
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

export async function getEventDetail(eventId: string): Promise<EventDetail | null> {
  const supabase = await createServerClient();

  const [{ data: event, error }, { data: rsvps }] = await Promise.all([
    supabase
      .from("event")
      .select("id, campus_id, title, description, event_type, location, starts_at, ends_at, capacity, is_published, campus:campus_id (name)")
      .eq("id", eventId)
      .single(),
    supabase
      .from("event_rsvp")
      .select("id, lead_id, guardian_name, email, phone, party_size, status, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true }),
  ]);

  if (error || !event) {
    if (error) console.error("[getEventDetail]", error.message);
    return null;
  }

  const roster = (rsvps ?? []) as RsvpRow[];
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
    rsvps: roster,
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
