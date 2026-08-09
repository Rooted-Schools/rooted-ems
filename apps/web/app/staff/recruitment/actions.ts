"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@rooted-ems/database/server";
import { requireStaffSession } from "@/lib/auth/get-session";
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

export async function staffCreateLead(input: CreateLeadInput, actorId: string) {
  await requireStaffSession();
  const result = await createLeadByStaff(input, actorId);
  if (!result.error) revalidatePath("/staff/recruitment");
  return result;
}

export async function staffLogLeadActivity(
  leadId: string,
  activityType: string,
  body: string,
  actorId: string
) {
  await requireStaffSession();
  const result = await logLeadActivity(leadId, activityType, body, actorId);
  if (!result.error) {
    revalidatePath("/staff/recruitment");
    revalidatePath(`/staff/recruitment/${leadId}`);
  }
  return result;
}

export async function staffUpdateLead(leadId: string, input: UpdateLeadInput, actorId: string) {
  await requireStaffSession();
  const result = await updateLead(leadId, input, actorId);
  if (!result.error) {
    revalidatePath("/staff/recruitment");
    revalidatePath(`/staff/recruitment/${leadId}`);
  }
  return result;
}

/**
 * On-demand pull of the campus Google Sheets interest forms — same engine
 * the daily 14:00 UTC cron runs. Any staff member can trigger it; the sync
 * only ever adds new families, so running it twice is harmless.
 */
export async function staffSyncLeadSheets() {
  await requireStaffSession();
  const { syncLeadSheets } = await import("@/lib/lead-sync");
  const summary = await syncLeadSheets();
  if (summary.added > 0 || summary.updated > 0) revalidatePath("/staff/recruitment");
  return summary;
}

export async function staffDeleteLead(leadId: string, actorId: string) {
  await requireStaffSession();
  const result = await deleteLead(leadId, actorId);
  if (!result.error) revalidatePath("/staff/recruitment");
  return result;
}

// ─── Capture Kit: tagged link + QR (LG-1) ──────────────

/**
 * Build a source-tagged inquiry link and a downloadable QR code for it.
 * Staff put the link on a school-website page or the QR on a flyer/yard
 * sign; every lead that arrives is tagged with `src` so the funnel
 * dashboard shows which placement produced it.
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
  await requireStaffSession();
  const { ensureReferralCode } = await import("@/lib/mutations");
  const result = await ensureReferralCode(leadId);
  if (!result.error) revalidatePath(`/staff/recruitment/${leadId}`);
  return result;
}

// ─── Events ───────────────────────────────────────────

export async function staffCreateEvent(input: import("@/lib/mutations").CreateEventInput, actorId: string) {
  await requireStaffSession();
  const { createEvent } = await import("@/lib/mutations");
  const result = await createEvent(input, actorId);
  if (!result.error) revalidatePath("/staff/recruitment/events");
  return result;
}

export async function staffSetRsvpStatus(
  rsvpId: string,
  eventId: string,
  status: "registered" | "attended" | "no_show" | "cancelled",
  actorId: string
) {
  await requireStaffSession();
  const { setRsvpStatus } = await import("@/lib/mutations");
  const result = await setRsvpStatus(rsvpId, status, actorId);
  if (!result.error) revalidatePath(`/staff/recruitment/events/${eventId}`);
  return result;
}

export async function staffSyncTablingEvents() {
  await requireStaffSession();
  const { syncTablingEvents } = await import("@/lib/event-sync");
  const summary = await syncTablingEvents();
  if (summary.added > 0 || summary.updated > 0) revalidatePath("/staff/recruitment/events");
  return summary;
}

export async function staffTogglePublish(eventId: string, isPublished: boolean) {
  await requireStaffSession();
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
export async function staffCheckInRsvp(rsvpId: string, eventId: string, actorId: string) {
  await requireStaffSession();
  const { checkInRsvp } = await import("@/lib/mutations/events");
  const result = await checkInRsvp(rsvpId, actorId);
  if (!result.error) revalidatePath(`/staff/recruitment/events/${eventId}`);
  return result;
}

/** Walk-in quick-add from the event detail check-in roster. */
export async function staffAddWalkIn(
  input: import("@/lib/mutations/events").WalkInInput,
  actorId: string
) {
  await requireStaffSession();
  const { addWalkInRsvp } = await import("@/lib/mutations/events");
  const result = await addWalkInRsvp(input, actorId);
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
  await requireStaffSession();
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

export async function staffCreateCampaign(input: CreateCampaignInput, actorId: string) {
  await requireStaffSession();
  const result = await createCampaign(input, actorId);
  if (!result.error) revalidatePath("/staff/recruitment");
  return result;
}

export async function staffCancelCampaign(campaignId: string, actorId: string) {
  await requireStaffSession();
  const result = await cancelCampaign(campaignId, actorId);
  if (!result.error) revalidatePath("/staff/recruitment");
  return result;
}

/** Send the template to the logged-in staff member's own inbox. */
export async function staffSendCampaignTest(
  templateKey: CampaignTemplateKey,
  payload: CampaignPayload,
  campusName: string
) {
  await requireStaffSession();
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { data: null, error: "Could not find your email address." };
  return sendCampaignTest(templateKey, payload, campusName, user.email);
}
