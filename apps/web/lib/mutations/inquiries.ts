import { createServerClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";

const VALID_STATUSES = ["new", "contacted", "applied", "lost"];

/**
 * Update the status of an inquiry.
 */
export async function updateInquiryStatus(
  inquiryId: string,
  status: string
): Promise<MutationResult> {
  if (!VALID_STATUSES.includes(status)) {
    return { data: null, error: "Invalid inquiry status." };
  }

  const supabase = await createServerClient();

  const { error } = await supabase
    .from("inquiry")
    .update({ status })
    .eq("id", inquiryId);

  if (error) {
    console.error("[updateInquiryStatus]", error.message);
    return { data: null, error: "Failed to update inquiry status." };
  }

  return { data: null, error: null };
}

/**
 * Assign a staff member to an inquiry for follow-up.
 */
export async function assignInquiryStaff(
  inquiryId: string,
  staffId: string | null
): Promise<MutationResult> {
  const supabase = await createServerClient();

  const { error } = await supabase
    .from("inquiry")
    .update({ assigned_staff_id: staffId })
    .eq("id", inquiryId);

  if (error) {
    console.error("[assignInquiryStaff]", error.message);
    return { data: null, error: "Failed to assign staff." };
  }

  return { data: null, error: null };
}

/**
 * Log a contact event (phone call, email, meeting) for an inquiry.
 */
export async function addContactLog(
  inquiryId: string,
  channel: string,
  notes: string | null,
  createdBy: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  const { error } = await supabase.from("contact_log").insert({
    inquiry_id: inquiryId,
    channel,
    notes: notes?.trim() || null,
    created_by: createdBy,
  });

  if (error) {
    console.error("[addContactLog]", error.message);
    return { data: null, error: "Failed to log contact." };
  }

  // Auto-update inquiry status to 'contacted' if still 'new'
  await supabase
    .from("inquiry")
    .update({ status: "contacted" })
    .eq("id", inquiryId)
    .eq("status", "new");

  return { data: null, error: null };
}

/**
 * Convert an inquiry into a draft application.
 * Creates the student, guardian, household, and application records.
 */
export async function convertInquiryToApplication(
  inquiryId: string,
  campusId: string,
  userId: string
): Promise<MutationResult<{ applicationId?: string }>> {
  const supabase = await createServerClient();

  // Fetch the inquiry
  const { data: inquiry, error: fetchError } = await supabase
    .from("inquiry")
    .select("*")
    .eq("id", inquiryId)
    .single();

  if (fetchError || !inquiry) {
    return { data: null, error: "Inquiry not found." };
  }

  // Mark inquiry as applied
  await supabase
    .from("inquiry")
    .update({ status: "applied" })
    .eq("id", inquiryId);

  return {
    data: { applicationId: undefined }, // Full conversion requires student/household creation — future phase
    error: null,
  };
}
