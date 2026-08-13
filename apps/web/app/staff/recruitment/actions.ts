"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import {
  requireStaffSession,
  requireMinRole,
  requireRoleOnCampus,
} from "@/lib/auth/get-session";
import {
  createLeadByStaff,
  logLeadActivity,
  updateLead,
  deleteLead,
  createCampaign,
  cancelCampaign,
  sendCampaignTest,
  type CreateLeadInput,
  type UpdateLeadInput,
  type CreateCampaignInput,
} from "@/lib/mutations";
import type { CampaignPayload, CampaignTemplateKey } from "@/lib/email-templates";

/**
 * Every action here used to guard on requireStaffSession alone and then hand
 * the mutation whatever leadId / eventId / rsvpId / campaignId the client
 * posted, plus a client-supplied actorId. Two things follow from that:
 *
 *   1. Campus scope rested entirely on RLS in the mutation layer. That is a
 *      real backstop today, but it is one refactor to a service-role client
 *      away from being no protection at all, and it is invisible at the call
 *      site. Each action now resolves the record's OWN campus and gates on
 *      enrollment_staff for that campus.
 *   2. actorId was never checked. Whoever the client named is who appeared on
 *      the lead timeline, the audit row, and `created_by`. It now comes from
 *      the session in every case; the parameters stay in the signatures so
 *      existing call sites keep compiling, and are ignored.
 *
 * Campus lookups run on the service-role client deliberately: resolving the
 * campus through RLS would return nothing for exactly the records this check
 * exists to refuse, and "no row" must not read as "allowed".
 */

/** Resolve a lead's campus. Null when the lead does not exist. */
async function leadCampus(leadId: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("lead").select("campus_id").eq("id", leadId).single();
  return (data?.campus_id as string | null) ?? null;
}

/** Resolve an event's campus. Null when the event does not exist. */
async function eventCampus(eventId: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("event").select("campus_id").eq("id", eventId).single();
  return (data?.campus_id as string | null) ?? null;
}

/** Resolve an RSVP's campus through its event. Null when either is missing. */
async function rsvpCampus(rsvpId: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("event_rsvp")
    .select("event:event_id (campus_id)")
    .eq("id", rsvpId)
    .single();
  return (data?.event as unknown as { campus_id: string } | null)?.campus_id ?? null;
}

/** Resolve a campaign's campus. Null when the campaign does not exist. */
async function campaignCampus(campaignId: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("lead_campaign")
    .select("campus_id")
    .eq("id", campaignId)
    .single();
  return (data?.campus_id as string | null) ?? null;
}

export async function staffCreateLead(input: CreateLeadInput, _actorId?: string) {
  const session = await requireRoleOnCampus(input.campus_id, "enrollment_staff");
  const result = await createLeadByStaff(input, session.user_id);
  if (!result.error) revalidatePath("/staff/recruitment");
  return result;
}

export async function staffLogLeadActivity(
  leadId: string,
  activityType: string,
  body: string,
  _actorId?: string
) {
  const session = await requireRoleOnCampus(await leadCampus(leadId), "enrollment_staff");
  const result = await logLeadActivity(leadId, activityType, body, session.user_id);
  if (!result.error) {
    revalidatePath("/staff/recruitment");
    revalidatePath(`/staff/recruitment/${leadId}`);
  }
  return result;
}

export async function staffUpdateLead(
  leadId: string,
  input: UpdateLeadInput,
  _actorId?: string
) {
  const session = await requireRoleOnCampus(await leadCampus(leadId), "enrollment_staff");
  const result = await updateLead(leadId, input, session.user_id);
  if (!result.error) {
    revalidatePath("/staff/recruitment");
    revalidatePath(`/staff/recruitment/${leadId}`);
  }
  return result;
}

/**
 * On-demand pull of the campus Google Sheets interest forms — same engine
 * the daily 14:00 UTC cron runs. It writes across every configured campus at
 * once, so no single campus's role can authorize it: enrollment_manager
 * (anywhere) is the bar. The sync only ever adds new families, so running it
 * twice is still harmless.
 */
export async function staffSyncLeadSheets() {
  await requireMinRole("enrollment_manager");
  const { syncLeadSheets } = await import("@/lib/lead-sync");
  const summary = await syncLeadSheets();
  if (summary.added > 0 || summary.updated > 0) revalidatePath("/staff/recruitment");
  return summary;
}

export async function staffDeleteLead(leadId: string, _actorId?: string) {
  const session = await requireRoleOnCampus(await leadCampus(leadId), "enrollment_staff");
  const result = await deleteLead(leadId, session.user_id);
  if (!result.error) revalidatePath("/staff/recruitment");
  return result;
}

// ─── Capture Kit: tagged link + QR (LG-1) ──────────────

/**
 * Build a source-tagged inquiry link and a downloadable QR code for it.
 * Staff put the link on a school-website page or the QR on a flyer/yard
 * sign; every lead that arrives is tagged with `src` so the funnel
 * dashboard shows which placement produced it.
 *
 * No record is read or written and the campus short code is public, so this
 * stays at staff level.
 */
export async function staffGenerateCaptureLink(
  campusShortCode: string,
  sourceTag: string
) {
  await requireStaffSession();
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://enroll.rootedschool.org";
  const tag = (sourceTag || "flyer").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 60).toLowerCase();
  const params = new URLSearchParams({ src: tag });
  if (campusShortCode) params.set("campus", campusShortCode);
  const url = `${base}/inquire?${params.toString()}`;
  const embedTag = `<script src="${base}/embed/inquiry?campus=${encodeURIComponent(campusShortCode)}&src=${encodeURIComponent(tag)}" async></script>`;

  // Server-side QR (data URL — allowed by img-src 'self' data:). PNG so it
  // drops straight into print materials.
  const QRCode = (await import("qrcode")).default;
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 600,
    margin: 2,
    color: { dark: "#22281F", light: "#FFFFFF" },
  });

  return { url, embedTag, qrDataUrl };
}

// ─── Referral codes ───────────────────────────────────

export async function staffGetReferralLink(leadId: string) {
  await requireRoleOnCampus(await leadCampus(leadId), "enrollment_staff");
  const { ensureReferralCode } = await import("@/lib/mutations");
  const result = await ensureReferralCode(leadId);
  if (!result.error) revalidatePath(`/staff/recruitment/${leadId}`);
  return result;
}

// ─── Events ───────────────────────────────────────────

export async function staffCreateEvent(
  input: import("@/lib/mutations").CreateEventInput,
  _actorId?: string
) {
  const session = await requireRoleOnCampus(input.campus_id, "enrollment_staff");
  const { createEvent } = await import("@/lib/mutations");
  const result = await createEvent(input, session.user_id);
  if (!result.error) revalidatePath("/staff/recruitment/events");
  return result;
}

export async function staffSetRsvpStatus(
  rsvpId: string,
  eventId: string,
  status: "registered" | "attended" | "no_show" | "cancelled",
  _actorId?: string
) {
  const session = await requireRoleOnCampus(await rsvpCampus(rsvpId), "enrollment_staff");
  const { setRsvpStatus } = await import("@/lib/mutations");
  const result = await setRsvpStatus(rsvpId, status, session.user_id);
  if (!result.error) revalidatePath(`/staff/recruitment/events/${eventId}`);
  return result;
}

/**
 * Network-wide tabling sync, same reasoning as staffSyncLeadSheets: it writes
 * events across every configured campus, so it is gated at
 * enrollment_manager rather than on any one campus.
 */
export async function staffSyncTablingEvents() {
  await requireMinRole("enrollment_manager");
  const { syncTablingEvents } = await import("@/lib/event-sync");
  const summary = await syncTablingEvents();
  if (summary.added > 0 || summary.updated > 0) revalidatePath("/staff/recruitment/events");
  return summary;
}

export async function staffTogglePublish(eventId: string, isPublished: boolean) {
  await requireRoleOnCampus(await eventCampus(eventId), "enrollment_staff");
  const { updateEvent } = await import("@/lib/mutations");
  const result = await updateEvent(eventId, { is_published: isPublished });
  if (!result.error) {
    revalidatePath("/staff/recruitment/events");
    revalidatePath(`/staff/recruitment/events/${eventId}`);
  }
  return result;
}

/** One-tap check-in from the event detail roster. Not yet in the mutations
 *  barrel (lib/mutations/index.ts is off-limits to this change), so pulled
 *  directly from lib/mutations/events. */
export async function staffCheckInRsvp(rsvpId: string, eventId: string, _actorId?: string) {
  const session = await requireRoleOnCampus(await rsvpCampus(rsvpId), "enrollment_staff");
  const { checkInRsvp } = await import("@/lib/mutations/events");
  const result = await checkInRsvp(rsvpId, session.user_id);
  if (!result.error) revalidatePath(`/staff/recruitment/events/${eventId}`);
  return result;
}

/** Walk-in quick-add from the event detail check-in roster. */
export async function staffAddWalkIn(
  input: import("@/lib/mutations/events").WalkInInput,
  _actorId?: string
) {
  // The event's campus decides, not input.campus_id — addWalkInRsvp reads the
  // campus off the event row for the same reason.
  const session = await requireRoleOnCampus(
    await eventCampus(input.event_id),
    "enrollment_staff"
  );
  const { addWalkInRsvp } = await import("@/lib/mutations/events");
  const result = await addWalkInRsvp(input, session.user_id);
  if (!result.error) revalidatePath(`/staff/recruitment/events/${input.event_id}`);
  return result;
}

// ─── Campaigns ────────────────────────────────────────

const AUDIENCE_STAGE_SETS: Record<string, string[]> = {
  open: ["new", "contacted", "engaged"],
  new: ["new"],
  contacted: ["contacted"],
  engaged: ["engaged"],
};

/** Live audience count for the campaign wizard (emailable leads only). */
export async function staffCountAudience(campusId: string, audienceStage: string) {
  await requireRoleOnCampus(campusId, "enrollment_staff");
  const stages = AUDIENCE_STAGE_SETS[audienceStage] ?? [];
  const supabase = await createServerClient();
  const { count } = await supabase
    .from("lead")
    .select("id", { count: "exact", head: true })
    .eq("campus_id", campusId)
    .in("stage", stages)
    .not("email", "is", null);
  return count ?? 0;
}

export async function staffCreateCampaign(input: CreateCampaignInput, _actorId?: string) {
  const session = await requireRoleOnCampus(input.campus_id, "enrollment_staff");
  const result = await createCampaign(input, session.user_id);
  if (!result.error) revalidatePath("/staff/recruitment");
  return result;
}

export async function staffCancelCampaign(campaignId: string, _actorId?: string) {
  const session = await requireRoleOnCampus(
    await campaignCampus(campaignId),
    "enrollment_staff"
  );
  const result = await cancelCampaign(campaignId, session.user_id);
  if (!result.error) revalidatePath("/staff/recruitment");
  return result;
}

/** Send the template to the logged-in staff member's own inbox. */
export async function staffSendCampaignTest(
  templateKey: CampaignTemplateKey,
  payload: CampaignPayload,
  campusName: string
) {
  const session = await requireStaffSession();
  if (!session.email) return { data: null, error: "Could not find your email address." };
  return sendCampaignTest(templateKey, payload, campusName, session.email);
}
