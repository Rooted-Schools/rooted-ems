import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { eventRsvpConfirmation } from "@/lib/email-templates";
import { phoneDigits10 } from "@/lib/sms";

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

// ─── Check-in (migration 00037, additive — degrade when absent) ─────────

/** True when the error says a named column is absent — migration not yet applied, not a missing row. */
function isMissingColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return /column .* does not exist/i.test(error.message ?? "");
}

let warnedMissingCheckInColumn = false;
function warnMissingCheckInColumn(context: string): void {
  if (warnedMissingCheckInColumn) return;
  warnedMissingCheckInColumn = true;
  console.warn(
    `[${context}] event_rsvp.checked_in_at not present — migration 00037_event_rsvp_loop.sql has not been applied. Falling back to status-only attendance.`
  );
}

/**
 * Check a family in at the door: stamps checked_in_at (idempotent — only
 * the first tap sets it) and routes through setRsvpStatus so the lead
 * timeline entry and "engaged" stage nudge stay identical to a manual
 * Attended click. Never throws.
 *
 * Degrades honestly when checked_in_at isn't applied yet: still marks the
 * RSVP attended via setRsvpStatus, but reports `checked_in_at: null` so
 * the roster UI knows not to trust/display a live checked-in count.
 */
export async function checkInRsvp(
  rsvpId: string,
  actorId: string
): Promise<MutationResult<{ checked_in_at: string | null }>> {
  const supabase = await createServerClient();
  const nowIso = new Date().toISOString();

  const stamp = await supabase
    .from("event_rsvp")
    .update({ checked_in_at: nowIso } as never)
    .eq("id", rsvpId)
    .is("checked_in_at" as never, null);

  let checkedInAt: string | null = nowIso;
  if (stamp.error) {
    if (isMissingColumn(stamp.error)) {
      warnMissingCheckInColumn("checkInRsvp");
      checkedInAt = null;
    } else {
      console.error("[checkInRsvp]", stamp.error.message);
      return { data: null, error: "Failed to check in." };
    }
  }

  const statusResult = await setRsvpStatus(rsvpId, "attended", actorId);
  if (statusResult.error) return { data: null, error: statusResult.error };

  return { data: { checked_in_at: checkedInAt }, error: null };
}

export interface WalkInInput {
  event_id: string;
  /**
   * Kept for call-site compatibility and ignored — the lead is filed against
   * the campus that actually owns the event, read from the event row below.
   * A client-supplied campus here would have parked a walk-in family's lead
   * on a campus that had nothing to do with the event they walked into.
   */
  campus_id?: string;
  guardian_name: string;
  phone?: string;
}

/**
 * Staff-side walk-in quick-add from the event detail check-in roster: a
 * family who didn't pre-register shows up at the door. Creates (or would
 * create, via the existing staff lead mutation) the family's lead record
 * with source "event" — the same attribution rsvpToEvent gives a public
 * RSVP — and an event_rsvp row that is immediately marked attended, since a
 * walk-in is by definition present right now. Degrades the same way
 * checkInRsvp does when checked_in_at isn't applied yet.
 */
export async function addWalkInRsvp(
  input: WalkInInput,
  actorId: string
): Promise<MutationResult<{ id: string; checked_in_at: string | null }>> {
  const supabase = await createServerClient();

  if (!input.guardian_name?.trim()) {
    return { data: null, error: "Name is required." };
  }

  const { data: event } = await supabase
    .from("event")
    .select("id, title, campus_id")
    .eq("id", input.event_id)
    .single();
  if (!event) return { data: null, error: "Event not found." };

  const eventCampusId = (event.campus_id as string | null) ?? null;
  if (!eventCampusId) return { data: null, error: "This event has no campus on file." };

  const nameParts = input.guardian_name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? input.guardian_name.trim();
  const lastName = nameParts.slice(1).join(" ") || "(no last name)";

  const { createLeadByStaff } = await import("./leads");
  const leadResult = await createLeadByStaff(
    {
      campus_id: eventCampusId,
      first_name: firstName,
      last_name: lastName,
      phone: input.phone?.trim() || undefined,
      source: "event",
      source_detail: `Walk-in: ${event.title as string}`,
    },
    actorId
  );
  const leadId = leadResult.data?.id ?? null;

  const nowIso = new Date().toISOString();
  const baseRow = {
    event_id: input.event_id,
    lead_id: leadId,
    guardian_name: input.guardian_name.trim(),
    phone: input.phone?.trim() || null,
    party_size: 1,
    status: "attended",
  };

  const withStamp = await supabase
    .from("event_rsvp")
    .insert({ ...baseRow, checked_in_at: nowIso } as never)
    .select("id")
    .single();

  if (!withStamp.error) {
    if (leadId) {
      await supabase.from("lead_activity").insert({
        lead_id: leadId,
        activity_type: "note",
        body: `Walked in to ${event.title as string}.`,
        actor_id: actorId,
      });
    }
    return { data: { id: withStamp.data.id as string, checked_in_at: nowIso }, error: null };
  }

  if (isMissingColumn(withStamp.error)) {
    warnMissingCheckInColumn("addWalkInRsvp");
    const fallback = await supabase.from("event_rsvp").insert(baseRow).select("id").single();
    if (fallback.error) {
      console.error("[addWalkInRsvp]", fallback.error.message);
      return { data: null, error: "Failed to add walk-in." };
    }
    if (leadId) {
      await supabase.from("lead_activity").insert({
        lead_id: leadId,
        activity_type: "note",
        body: `Walked in to ${event.title as string}.`,
        actor_id: actorId,
      });
    }
    return { data: { id: fallback.data.id as string, checked_in_at: null }, error: null };
  }

  console.error("[addWalkInRsvp]", withStamp.error.message);
  return { data: null, error: "Failed to add walk-in." };
}

// ─── Public RSVP (response-engine entry, service role) ──

export interface RsvpInput {
  event_id: string;
  guardian_name: string;
  email?: string;
  phone?: string;
  party_size?: number;
  campus_id: string;
  /** TCPA opt-in from the RSVP form's checkbox. Defaults to no consent. */
  sms_consent?: boolean;
}

/**
 * Escape LIKE metacharacters before they reach an .ilike() filter. PostgREST
 * hands the pattern straight to SQL, so a "%" or "_" typed into a public form
 * would match addresses the family never entered — and could link their RSVP
 * to someone else's lead record.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
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

  const smsConsent = input.sms_consent === true;

  if (input.email) {
    const { data: existing } = await supabase
      .from("lead")
      .select("id")
      .eq("campus_id", event.campus_id)
      .ilike("email", escapeLikePattern(input.email.trim()))
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
        sms_consent: smsConsent,
        source: "event",
        source_detail: `RSVP: ${event.title}`,
        stage: "engaged", // an RSVP is a warmer signal than a raw inquiry
        next_follow_up_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    leadId = newLead?.id ?? null;
  } else if (smsConsent) {
    // Ticking the box on a returning family's RSVP is a fresh opt-in, so it
    // upgrades their lead. Leaving it unticked is NOT treated as a revocation
    // — consent is withdrawn by replying STOP (see lib/inbound-sms.ts), not by
    // an unchecked box on a form they may not have read.
    const { error: consentErr } = await supabase
      .from("lead")
      .update({ sms_consent: true })
      .eq("id", leadId);
    if (consentErr) console.error("[rsvpToEvent] sms consent", consentErr.message);
  }

  // Idempotent RSVP row.
  //
  // The (event_id, email) unique index does not cover a phone-only RSVP:
  // Postgres treats NULL emails as distinct, so the upsert has nothing to
  // conflict on and every resubmission inserted another row — inflating the
  // roster and the capacity count. Match those on the phone instead,
  // comparing normalized digits because the column holds whatever the family
  // typed.
  let existingPhoneRsvpId: string | null = null;
  const digits = input.email?.trim() ? null : phoneDigits10(input.phone);
  if (digits) {
    const { data: eventRsvps } = await supabase
      .from("event_rsvp")
      .select("id, phone")
      .eq("event_id", input.event_id);
    existingPhoneRsvpId =
      ((eventRsvps ?? []) as Array<{ id: string; phone: string | null }>).find(
        (row) => phoneDigits10(row.phone) === digits
      )?.id ?? null;
  }

  const rsvpRow = {
    event_id: input.event_id,
    lead_id: leadId,
    guardian_name: input.guardian_name.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    party_size: Math.max(1, Math.min(input.party_size ?? 1, 20)),
    status: "registered",
  };

  const { error: rsvpErr } = existingPhoneRsvpId
    ? await supabase.from("event_rsvp").update(rsvpRow).eq("id", existingPhoneRsvpId)
    : await supabase.from("event_rsvp").upsert(rsvpRow, { onConflict: "event_id,email" });

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
    // LG-2: an RSVP is engagement — exit the Push-to-Apply drip; the event
    // follow-up takes over from here.
    const { exitJourneys } = await import("./journeys");
    await exitJourneys(leadId, "rsvp");
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
