import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import { notifyLeadWelcome, notifyStaffNewLead } from "@/lib/notify";

// ─── Types ─────────────────────────────────────────────

export const LEAD_STAGES = ["new", "contacted", "engaged", "applied", "closed"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_SOURCES = [
  "website",
  "event",
  "referral",
  "qr",
  "ad",
  "walk_in",
  "staff",
  "other",
] as const;

export interface CreateLeadInput {
  campus_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  sms_consent?: boolean;
  preferred_language?: string;
  student_first_name?: string;
  entry_grade?: string;
  pathway_interest?: string;
  source?: string;
  source_detail?: string;
  notes?: string;
  /** Set when this lead arrived via another family's referral link. */
  referred_by_lead_id?: string;
}

// ─── Public inquiry (response engine entry point) ──────

/**
 * Create a lead from the public inquiry form and fire the response engine:
 * warm welcome to the family (email + consented SMS), in-app routing to
 * campus staff, and a next-day follow-up date so the lead lands in the
 * recruitment queue immediately.
 *
 * Service role: the submitter has no session. Callers (the server action)
 * are responsible for anti-abuse checks before invoking.
 */
export async function createLeadFromInquiry(
  input: CreateLeadInput
): Promise<MutationResult<{ id: string }>> {
  const supabase = createServiceRoleClient();

  if (!input.first_name?.trim() || !input.last_name?.trim() || !input.campus_id) {
    return { data: null, error: "Name and campus are required." };
  }
  if (!input.email?.trim() && !input.phone?.trim()) {
    return { data: null, error: "An email or phone number is required so we can reach you." };
  }

  // Soft dedupe: an open lead with the same email at the same campus gets a
  // new activity entry instead of a duplicate record — repeat inquiries are
  // interest signals, not new families.
  if (input.email) {
    const { data: existing } = await supabase
      .from("lead")
      .select("id")
      .eq("campus_id", input.campus_id)
      .ilike("email", input.email.trim())
      .is("application_id", null)
      .neq("stage", "closed")
      .limit(1);
    const existingId = (existing?.[0] as Record<string, string> | undefined)?.id;
    if (existingId) {
      await supabase.from("lead_activity").insert({
        lead_id: existingId,
        activity_type: "inquiry",
        body: "Family submitted the inquiry form again.",
      });
      await supabase
        .from("lead")
        .update({ next_follow_up_at: new Date().toISOString() })
        .eq("id", existingId);
      return { data: { id: existingId }, error: null };
    }
  }

  const nextDay = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: lead, error } = await supabase
    .from("lead")
    .insert({
      campus_id: input.campus_id,
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      sms_consent: input.sms_consent ?? false,
      preferred_language: input.preferred_language ?? "en",
      student_first_name: input.student_first_name?.trim() || null,
      entry_grade: input.entry_grade || null,
      pathway_interest: input.pathway_interest || null,
      source: input.source ?? "website",
      source_detail: input.source_detail || null,
      referred_by_lead_id: input.referred_by_lead_id || null,
      stage: "new",
      next_follow_up_at: nextDay,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[createLeadFromInquiry]", error.message);
    return { data: null, error: "Something went wrong. Please try again." };
  }

  await supabase.from("lead_activity").insert({
    lead_id: lead.id,
    activity_type: "inquiry",
    body: `Inquiry submitted via ${input.source ?? "website"}.`,
  });

  // Credit the referrer on their own timeline so staff see the chain.
  if (input.referred_by_lead_id) {
    const { data: referrer } = await supabase
      .from("lead")
      .select("first_name, last_name")
      .eq("id", input.referred_by_lead_id)
      .single();
    await supabase.from("lead_activity").insert({
      lead_id: input.referred_by_lead_id,
      activity_type: "note",
      body: `Referred a new family: ${input.first_name.trim()} ${input.last_name.trim()}.`,
    });
    if (referrer) {
      await supabase.from("lead_activity").insert({
        lead_id: lead.id,
        activity_type: "note",
        body: `Referred by ${referrer.first_name} ${referrer.last_name}.`,
      });
    }
  }

  const leadName = `${input.first_name.trim()} ${input.last_name.trim()}`;

  // Response engine — guarded: notification failures never lose the lead.
  await Promise.all([
    notifyLeadWelcome({
      lead: {
        first_name: input.first_name.trim(),
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        sms_consent: input.sms_consent ?? false,
      },
      campusId: input.campus_id,
    }),
    notifyStaffNewLead({
      campusId: input.campus_id,
      leadId: lead.id,
      leadName,
      source: input.source ?? "website",
    }),
  ]).catch((err) => console.error("[createLeadFromInquiry] notify failed", err));

  return { data: { id: lead.id }, error: null };
}

// ─── Staff mutations (RLS-scoped) ──────────────────────

/** Staff adds a lead manually (walk-in, phone call, event sign-up sheet). */
export async function createLeadByStaff(
  input: CreateLeadInput,
  actorId: string
): Promise<MutationResult<{ id: string }>> {
  const supabase = await createServerClient();

  if (!input.first_name?.trim() || !input.last_name?.trim() || !input.campus_id) {
    return { data: null, error: "Name and campus are required." };
  }

  const { data: lead, error } = await supabase
    .from("lead")
    .insert({
      campus_id: input.campus_id,
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      sms_consent: input.sms_consent ?? false,
      preferred_language: input.preferred_language ?? "en",
      student_first_name: input.student_first_name?.trim() || null,
      entry_grade: input.entry_grade || null,
      pathway_interest: input.pathway_interest || null,
      source: input.source ?? "staff",
      source_detail: input.source_detail || null,
      notes: input.notes || null,
      stage: "new",
      assigned_to: actorId,
      next_follow_up_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[createLeadByStaff]", error.message);
    return { data: null, error: "Failed to create lead." };
  }

  await supabase.from("lead_activity").insert({
    lead_id: lead.id,
    activity_type: "note",
    body: "Lead added by staff.",
    actor_id: actorId,
  });

  return { data: { id: lead.id }, error: null };
}

const CONTACT_ACTIVITY_TYPES = new Set(["call", "sms", "email"]);

/**
 * Log a touchpoint on a lead. Contact-type activities (call/sms/email)
 * update last_contact_at and auto-advance brand-new leads to "contacted" —
 * the pipeline reflects reality without staff micro-managing stages.
 */
export async function logLeadActivity(
  leadId: string,
  activityType: string,
  body: string,
  actorId: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  const { error } = await supabase.from("lead_activity").insert({
    lead_id: leadId,
    activity_type: activityType,
    body,
    actor_id: actorId,
  });

  if (error) {
    console.error("[logLeadActivity]", error.message);
    return { data: null, error: "Failed to log activity." };
  }

  if (CONTACT_ACTIVITY_TYPES.has(activityType)) {
    const now = new Date().toISOString();
    await supabase
      .from("lead")
      .update({ last_contact_at: now })
      .eq("id", leadId);
    await supabase
      .from("lead")
      .update({ stage: "contacted" })
      .eq("id", leadId)
      .eq("stage", "new");
  }

  return { data: null, error: null };
}

export interface UpdateLeadInput {
  stage?: LeadStage;
  assigned_to?: string | null;
  next_follow_up_at?: string | null;
  pathway_interest?: string | null;
  entry_grade?: string | null;
  notes?: string | null;
  email?: string | null;
  phone?: string | null;
  sms_consent?: boolean;
  preferred_language?: string;
}

export async function updateLead(
  leadId: string,
  input: UpdateLeadInput,
  actorId: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  // Read current stage first so stage changes land in the timeline.
  const { data: current } = await supabase
    .from("lead")
    .select("stage, campus_id")
    .eq("id", leadId)
    .single();

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) updates[key] = value;
  }
  if (Object.keys(updates).length === 0) return { data: null, error: null };

  const { error } = await supabase.from("lead").update(updates).eq("id", leadId);
  if (error) {
    console.error("[updateLead]", error.message);
    return { data: null, error: "Failed to update lead." };
  }

  if (input.stage && current && input.stage !== current.stage) {
    await supabase.from("lead_activity").insert({
      lead_id: leadId,
      activity_type: "stage_change",
      body: `Stage changed from ${current.stage} to ${input.stage}.`,
      actor_id: actorId,
    });
    await logAuditEvent({
      table_name: "lead",
      record_id: leadId,
      action: AuditAction.StatusChange,
      actor_id: actorId,
      campus_id: (current.campus_id as string) ?? null,
      old_data: { stage: current.stage },
      new_data: { stage: input.stage },
    });
  }

  return { data: null, error: null };
}

/**
 * Permanently delete a lead (activities and campaign enrollments cascade).
 * Converted leads are protected — deleting them would erase the recruitment
 * attribution their application carries; close them instead.
 */
export async function deleteLead(
  leadId: string,
  actorId: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  const { data: lead } = await supabase
    .from("lead")
    .select("id, campus_id, first_name, last_name, email, application_id")
    .eq("id", leadId)
    .single();

  if (!lead) return { data: null, error: "Lead not found." };
  if (lead.application_id) {
    return {
      data: null,
      error: "This family applied — their lead carries attribution data. Set the stage to Closed instead of deleting.",
    };
  }

  const { error } = await supabase.from("lead").delete().eq("id", leadId);
  if (error) {
    console.error("[deleteLead]", error.message);
    return { data: null, error: "Failed to delete the lead." };
  }

  await logAuditEvent({
    table_name: "lead",
    record_id: leadId,
    action: AuditAction.Delete,
    actor_id: actorId,
    campus_id: (lead.campus_id as string) ?? null,
    old_data: {
      name: `${lead.first_name} ${lead.last_name}`,
      email: lead.email,
    },
  });

  return { data: null, error: null };
}

// ─── Referral codes ────────────────────────────────────

/** URL-safe, unambiguous alphabet (no 0/O/1/I) for short shareable codes. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(seed: number): string {
  let code = "";
  let n = seed;
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[n % CODE_ALPHABET.length];
    n = Math.floor(n / CODE_ALPHABET.length) + (i + 1) * 7;
  }
  return code;
}

/**
 * Return a lead's referral code, generating one on first request. Codes are
 * created lazily (not backfilled onto 1,300 rows) — a family only needs one
 * the moment staff want to share their link.
 */
export async function ensureReferralCode(
  leadId: string
): Promise<MutationResult<{ code: string }>> {
  const supabase = await createServerClient();

  const { data: lead } = await supabase
    .from("lead")
    .select("referral_code, created_at")
    .eq("id", leadId)
    .single();
  if (!lead) return { data: null, error: "Lead not found." };
  if (lead.referral_code) return { data: { code: lead.referral_code as string }, error: null };

  // Derive a stable-ish seed, retry on the (rare) unique collision.
  const base = new Date((lead.created_at as string) ?? Date.now()).getTime();
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode(base + attempt * 104729);
    const { error } = await supabase
      .from("lead")
      .update({ referral_code: code })
      .eq("id", leadId)
      .is("referral_code", null);
    if (!error) {
      const { data: check } = await supabase
        .from("lead")
        .select("referral_code")
        .eq("id", leadId)
        .single();
      if (check?.referral_code) return { data: { code: check.referral_code as string }, error: null };
    }
  }
  return { data: null, error: "Could not generate a referral code." };
}

// ─── Conversion stitch ─────────────────────────────────

/**
 * The attribution stitch: when an application is submitted, find an open
 * lead with the same guardian email at the same campus and mark it
 * converted. Automatic — no staff work — and it's what lets Rooted trace a
 * flyer, event, or referral all the way to an enrolled student.
 *
 * Service role (runs inside submit flows with no staff session). Never
 * throws; a missed stitch must never affect the application.
 */
export async function stitchLeadToApplication(
  applicationId: string,
  guardianEmail: string | null,
  campusId: string | null
): Promise<void> {
  try {
    if (!guardianEmail || !campusId) return;
    const supabase = createServiceRoleClient();

    const { data: candidates } = await supabase
      .from("lead")
      .select("id")
      .eq("campus_id", campusId)
      .ilike("email", guardianEmail)
      .is("application_id", null)
      .neq("stage", "closed")
      .limit(1);

    const leadId = (candidates?.[0] as Record<string, string> | undefined)?.id;
    if (!leadId) return;

    const now = new Date().toISOString();
    await supabase
      .from("lead")
      .update({
        application_id: applicationId,
        stage: "applied",
        converted_at: now,
        next_follow_up_at: null,
      })
      .eq("id", leadId);

    await supabase.from("lead_activity").insert({
      lead_id: leadId,
      activity_type: "converted",
      body: "Family submitted an application — lead converted.",
    });
  } catch (err) {
    console.error("[stitchLeadToApplication]", err);
  }
}
