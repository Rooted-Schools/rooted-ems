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
  staffId: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  const { error } = await supabase.from("contact_log").insert({
    inquiry_id: inquiryId,
    staff_id: staffId,
    channel,
    direction: "outbound",
    notes: notes?.trim() || null,
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
 * Creates the household, guardian, student, guardian_student link,
 * and application records using inquiry data.
 */
export async function convertInquiryToApplication(
  inquiryId: string,
  enrollmentWindowId: string,
  gradeLeveId: string,
  staffUserId: string
): Promise<MutationResult<{ applicationId: string }>> {
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

  if (inquiry.status === "applied") {
    return { data: null, error: "Inquiry already converted." };
  }

  const campusId = inquiry.campus_id;
  if (!campusId) {
    return { data: null, error: "Inquiry has no campus assigned." };
  }

  // Parse guardian name into first/last
  const guardianParts = (inquiry.guardian_name ?? "").trim().split(/\s+/);
  const guardianFirst = guardianParts[0] || "Unknown";
  const guardianLast = guardianParts.slice(1).join(" ") || "Unknown";

  // 1. Create household (no family user link)
  const { data: household, error: hhErr } = await supabase
    .from("household")
    .insert({ user_id: null })
    .select("id")
    .single();

  if (hhErr || !household) {
    console.error("[convertInquiry] household", hhErr?.message);
    return { data: null, error: "Failed to create household." };
  }

  // 2. Create guardian
  const { data: guardian, error: gErr } = await supabase
    .from("guardian")
    .insert({
      household_id: household.id,
      first_name: guardianFirst,
      last_name: guardianLast,
      relationship: "parent",
      email: inquiry.guardian_email ?? null,
      phone: inquiry.guardian_phone ?? null,
      is_primary: true,
    })
    .select("id")
    .single();

  if (gErr || !guardian) {
    console.error("[convertInquiry] guardian", gErr?.message);
    return { data: null, error: "Failed to create guardian." };
  }

  // 3. Create student
  const { data: student, error: sErr } = await supabase
    .from("student")
    .insert({
      household_id: household.id,
      first_name: inquiry.student_first_name,
      last_name: inquiry.student_last_name,
    })
    .select("id")
    .single();

  if (sErr || !student) {
    console.error("[convertInquiry] student", sErr?.message);
    return { data: null, error: "Failed to create student." };
  }

  // 4. Link guardian to student
  await supabase.from("guardian_student").insert({
    guardian_id: guardian.id,
    student_id: student.id,
    relationship: "parent",
    is_legal_guardian: true,
  });

  // 5. Create draft application
  const { data: app, error: aErr } = await supabase
    .from("application")
    .insert({
      enrollment_window_id: enrollmentWindowId,
      student_id: student.id,
      campus_id: campusId,
      grade_level_id: gradeLeveId,
      guardian_id: guardian.id,
      status: "draft",
      source: inquiry.source ?? "inquiry_conversion",
      assigned_staff_id: staffUserId,
    })
    .select("id")
    .single();

  if (aErr || !app) {
    console.error("[convertInquiry] application", aErr?.message);
    return { data: null, error: "Failed to create application." };
  }

  // 6. Mark inquiry as applied and link to the student
  await supabase
    .from("inquiry")
    .update({ status: "applied" })
    .eq("id", inquiryId);

  // 7. Log the conversion as a contact event
  await supabase.from("contact_log").insert({
    inquiry_id: inquiryId,
    application_id: app.id,
    student_id: student.id,
    staff_id: staffUserId,
    channel: "other",
    direction: "outbound",
    subject: "Converted inquiry to application",
    notes: `Created draft application ${app.id} from inquiry.`,
  });

  return { data: { applicationId: app.id }, error: null };
}
