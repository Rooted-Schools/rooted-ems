"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@rooted-ems/database/server";
import { requireStaffSession } from "@/lib/auth/get-session";
import {
  createLeadByStaff,
  logLeadActivity,
  updateLead,
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
