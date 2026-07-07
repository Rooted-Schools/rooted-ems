import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { eventRsvpConfirmation } from "@/lib/email-templates";

export const EVENT_TYPES = ["info_session", "open_house", "tour", "other"] as const;

export interface CreateEventInput {
  campus_id: string;
  title: string;
  description?: string;
  event_type?: string;
  location?: string;
  starts_at: string; // ISO
  ends_at?: string;
  capacity?: number | null;
  is_published?: boolean;
}

// ─── Staff event management (RLS-scoped) ───────────────

export async function createEvent(
  input: CreateEventInput,
  actorId: string
): Promise<MutationResult<{ id: string }>> {
  const supabase = await createServerClient();

  if (!input.title?.trim() || !input.campus_id || !input.starts_at) {
    return { data: null, error: "Title, campus, and date are required." };
  }

  const { data, error } = await supabase
    .from("event")
    .insert({
      campus_id: input.campus_id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      event_type: input.event_type ?? "info_session",
      location: input.location?.trim() || null,
      starts_at: input.starts_at,
      ends_at: input.ends_at || null,
      capacity: input.capacity ?? null,
      is_published: input.is_published ?? true,
      created_by: actorId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[createEvent]", error.message);
    return { data: null, error: "Failed to create the event." };
  }

  await logAuditEvent({
    table_name: "event",
    record_id: data.id,
    action: AuditAction.Create,
    actor_id: actorId,
    campus_id: input.campus_id,
    new_data: { title: input.title, starts_at: input.starts_at },
  });

  return { data: { id: data.id }, error: null };
}

export async function updateEvent(
  eventId: string,
  input: Partial<CreateEventInput>
): Promise<MutationResult> {
  const supabase = await createServerClient();
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (v !== undefined) updates[k] = v;
  if (Object.keys(updates).length === 0) return { data: null, error: null };

  const { error } = await supabase.from("event").update(updates).eq("id", eventId);
  if (error) {
    console.error("[updateEvent]", error.message);
    return { data: null, error: "Failed to update the event." };
  }
  return { data: null, error: null };
}

/**
 * Mark a family's attendance from the roster. Attendance is the signal the
 * funnel and any attended/no-show follow-up campaign read from; it also
 * lands on the linked lead's timeline.
 */
export async function setRsvpStatus(
  rsvpId: string,
  status: "registered" | "attended" | "no_show" | "cancelled",
  actorId: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  const { data: rsvp } = await supabase
    .from("event_rsvp")
    .select("lead_id, guardian_name, event:event_id (title)")
    .eq("id", rsvpId)
    .single();

  const { error } = await supabase
    .from("event_rsvp")
    .update({ status })
    .eq("id", rsvpId);
  if (error) {
    console.error("[setRsvpStatus]", error.message);
    return { data: null, error: "Failed to update attendance." };
  }

  if (rsvp?.lead_id && (status === "attended" || status === "no_show")) {
    const eventTitle = (rsvp.event as unknown as { title?: string } | null)?.title ?? "an event";
    await supabase.from("lead_activity").insert({
      lead_id: rsvp.lead_id,
      activity_type: "note",
      body: status === "attended" ? `Attended ${eventTitle}.` : `Registered for ${eventTitle} but did not attend.`,
      actor_id: actorId,
    });
    // Attending is a strong engagement signal — nudge the stage forward.
    if (status === "attended") {
      await supabase
        .from("lead")
        .update({ stage: "engaged" })
        .eq("id", rsvp.lead_id)
        .in("stage", ["new", "contacted"]);
    }
  }

  return { data: null, error: null };
}

// ─── Public RSVP (response-engine entry, service role) ──

export interface RsvpInput {
  event_id: string;
  guardian_name: string;
  email?: string;
  phone?: string;
  party_size?: number;
  campus_id: string;
}

/**
 * Public RSVP. Links to (or creates) the family's lead record with
 * source=event so the family enters the pipeline, sends a bilingual
 * confirmation, and is idempotent per (event, email).
 */
export async function rsvpToEvent(input: RsvpInput): Promise<MutationResult> {
  const supabase = createServiceRoleClient();

  if (!input.guardian_name?.trim() || !input.event_id) {
    return { data: null, error: "Your name is required." };
  }
  if (!input.email?.trim() && !input.phone?.trim()) {
    return { data: null, error: "An email or phone is required so we can confirm." };
  }

  const { data: event } = await supabase
    .from("event")
    .select("id, title, starts_at, ends_at, location, campus_id, is_published, capacity, campus:campus_id (name, email)")
    .eq("id", input.event_id)
    .single();
  if (!event || !event.is_published) {
    return { data: null, error: "This event is no longer open for registration." };
  }

  // Capacity guard (registered seats vs. capacity)
  if (event.capacity != null) {
    const { count } = await supabase
      .from("event_rsvp")
      .select("id", { count: "exact", head: true })
      .eq("event_id", input.event_id)
      .neq("status", "cancelled");
    if ((count ?? 0) >= event.capacity) {
      return { data: null, error: "This event is full. Please reply to be added to a future date." };
    }
  }

  // Match or create the family's lead (source=event).
  let leadId: string | null = null;
  const nameParts = input.guardian_name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? input.guardian_name.trim();
  const lastName = nameParts.slice(1).join(" ") || "(no last name)";

  if (input.email) {
    const { data: existing } = await supabase
      .from("lead")
      .select("id")
      .eq("campus_id", event.campus_id)
      .ilike("email", input.email.trim())
      .limit(1);
    leadId = (existing?.[0] as Record<string, string> | undefined)?.id ?? null;
  }
  if (!leadId) {
    const { data: newLead } = await supabase
      .from("lead")
      .insert({
        campus_id: event.campus_id,
        first_name: firstName,
        last_name: lastName,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        source: "event",
        source_detail: `RSVP: ${event.title}`,
        stage: "engaged", // an RSVP is a warmer signal than a raw inquiry
        next_follow_up_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    leadId = newLead?.id ?? null;
  }

  // Idempotent RSVP row
  const { error: rsvpErr } = await supabase
    .from("event_rsvp")
    .upsert(
      {
        event_id: input.event_id,
        lead_id: leadId,
        guardian_name: input.guardian_name.trim(),
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        party_size: Math.max(1, Math.min(input.party_size ?? 1, 20)),
        status: "registered",
      },
      { onConflict: "event_id,email" }
    );
  if (rsvpErr) {
    console.error("[rsvpToEvent]", rsvpErr.message);
    return { data: null, error: "Something went wrong. Please try again." };
  }

  if (leadId) {
    await supabase.from("lead_activity").insert({
      lead_id: leadId,
      activity_type: "note",
      body: `RSVP'd to ${event.title}.`,
    });
  }

  // Confirmation email (guarded)
  if (input.email) {
    const campus = event.campus as unknown as { name: string; email: string | null } | null;
    const whenText = new Date(event.starts_at as string).toLocaleString("en-US", {
      weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    await sendEmail({
      to: input.email.trim(),
      ...eventRsvpConfirmation({
        guardianFirstName: firstName,
        campusName: campus?.name ?? "our school",
        eventTitle: event.title as string,
        whenText,
        location: (event.location as string) || undefined,
      }),
      replyTo: campus?.email ?? undefined,
    }).catch((err) => console.error("[rsvpToEvent] email", err));
  }

  return { data: null, error: null };
}
