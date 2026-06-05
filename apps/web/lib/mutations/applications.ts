import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import { isValidTransition, type ApplicationStatusValue } from "@rooted-ems/utils";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import { requireStaffSession } from "@/lib/auth/get-session";
import {
  notifyFamilyApplicationReceived,
  notifyFamilyApplicationVerified,
  notifyFamilyNeedsInfo,
  notifyFamilyApplicationWaitlisted,
  notifyStaffNewApplication,
} from "@/lib/notify";

// ─── EAV Answer Key Allowlist ───────────────────────────
// Only these keys may be written to application_answer. Any key not present
// here is silently dropped before the insert/upsert to prevent EAV flooding.
const ALLOWED_ANSWER_KEYS = new Set([
  "has_sibling_at_school",
  "sibling_name",
  "data_sharing_consent",
  "agree_terms",
  "e_signature_name",
  "e_signature_date",
  "guardian_relationship_other",
]);

// ─── Types ─────────────────────────────────────────────

export interface MutationResult<T = null> {
  data: T | null;
  error: string | null;
}

export interface CreateApplicationInput {
  enrollment_window_id: string;
  campus_id: string;
  grade_level_id: string;
  // Student
  student_first_name: string;
  student_middle_name?: string;
  student_last_name: string;
  student_preferred_name?: string;
  student_suffix?: string;
  student_date_of_birth?: string;
  student_gender?: string;
  student_race_ethnicity?: string[];
  student_primary_language?: string;
  student_home_language?: string;
  student_previous_school?: string;
  student_previous_school_phone?: string;
  student_has_iep?: boolean;
  student_has_504?: boolean;
  student_special_services_notes?: string;
  // Guardian
  guardian_first_name: string;
  guardian_last_name: string;
  guardian_relationship: string;
  guardian_email: string;
  guardian_phone: string;
  guardian_phone_secondary?: string;
  guardian_employer?: string;
  guardian_occupation?: string;
  guardian_preferred_contact_method?: string;
  guardian_preferred_language?: string;
  guardian_sms_consent?: boolean;
  // Household
  address_line1?: string;
  city?: string;
  state?: string;
  zip?: string;
  // Emergency contact
  emergency_contact_1_name?: string;
  emergency_contact_1_phone?: string;
  emergency_contact_1_relationship?: string;
  // Meta
  has_sibling_enrolled?: boolean;
  sibling_name?: string;
  source?: string;
  // Application answers (EAV for fields without DB columns)
  answers?: Record<string, string | boolean>;
}

export interface UpdateApplicationInput {
  application_id: string;
  // Student fields (all optional for partial update)
  student_first_name?: string;
  student_middle_name?: string;
  student_last_name?: string;
  student_preferred_name?: string;
  student_suffix?: string;
  student_date_of_birth?: string;
  student_gender?: string;
  student_race_ethnicity?: string[];
  student_primary_language?: string;
  student_home_language?: string;
  student_previous_school?: string;
  student_previous_school_phone?: string;
  student_has_iep?: boolean;
  student_has_504?: boolean;
  student_special_services_notes?: string;
  // Guardian fields
  guardian_first_name?: string;
  guardian_last_name?: string;
  guardian_relationship?: string;
  guardian_email?: string;
  guardian_phone?: string;
  guardian_phone_secondary?: string;
  guardian_employer?: string;
  guardian_occupation?: string;
  guardian_preferred_contact_method?: string;
  guardian_preferred_language?: string;
  guardian_sms_consent?: boolean;
  // Household fields
  address_line1?: string;
  city?: string;
  state?: string;
  zip?: string;
  // Emergency contact
  emergency_contact_1_name?: string;
  emergency_contact_1_phone?: string;
  emergency_contact_1_relationship?: string;
  // Application fields
  has_sibling_enrolled?: boolean;
  sibling_name?: string;
  source?: string;
  // Application answers (EAV for fields without DB columns)
  answers?: Record<string, string | boolean>;
}

// ─── Create Application (Draft) ────────────────────────

/**
 * Create a new draft application. Creates household, guardian, student
 * records if they don't exist, then the application record.
 * Returns the new application ID.
 */
export async function createApplication(
  input: CreateApplicationInput
): Promise<MutationResult<{ id: string }>> {
  // Use the anon client only to verify the session — it reads cookies reliably.
  const authClient = await createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Use the service role client for all writes so RLS never blocks a
  // legitimate Server Action. The auth check above already confirms identity.
  const supabase = createServiceRoleClient();

  // 1. Upsert user_profile
  await supabase.from("user_profile").upsert(
    {
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    },
    { onConflict: "id" }
  );

  // 2. Find or create household
  const { data: existingHousehold } = await supabase
    .from("household")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  let householdId: string;
  if (existingHousehold) {
    householdId = existingHousehold.id;
    // Update address if provided
    if (input.address_line1) {
      await supabase
        .from("household")
        .update({
          address_line1: input.address_line1,
          city: input.city,
          state: input.state,
          zip: input.zip,
        })
        .eq("id", householdId);
    }
  } else {
    const { data: newHousehold, error: hhErr } = await supabase
      .from("household")
      .insert({
        user_id: user.id,
        address_line1: input.address_line1 ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        zip: input.zip ?? null,
      })
      .select("id")
      .single();

    if (hhErr || !newHousehold) {
      console.error("[createApplication] household", hhErr?.message);
      return { data: null, error: "Failed to create household" };
    }
    householdId = newHousehold.id;
  }

  // 3. Create guardian
  const { data: guardian, error: gErr } = await supabase
    .from("guardian")
    .insert({
      household_id: householdId,
      user_id: user.id,
      first_name: input.guardian_first_name,
      last_name: input.guardian_last_name,
      relationship: input.guardian_relationship,
      email: input.guardian_email,
      phone: input.guardian_phone,
      phone_secondary: input.guardian_phone_secondary ?? null,
      employer: input.guardian_employer ?? null,
      occupation: input.guardian_occupation ?? null,
      preferred_contact_method: input.guardian_preferred_contact_method ?? null,
      preferred_language: input.guardian_preferred_language ?? null,
      sms_consent: input.guardian_sms_consent ?? false,
      is_primary: true,
    })
    .select("id")
    .single();

  if (gErr || !guardian) {
    console.error("[createApplication] guardian", gErr?.message);
    return { data: null, error: "Failed to create guardian record" };
  }

  // 4. Create student
  const { data: student, error: sErr } = await supabase
    .from("student")
    .insert({
      household_id: householdId,
      first_name: input.student_first_name,
      middle_name: input.student_middle_name ?? null,
      last_name: input.student_last_name,
      preferred_name: input.student_preferred_name ?? null,
      suffix: input.student_suffix ?? null,
      date_of_birth: input.student_date_of_birth ?? null,
      gender: input.student_gender ?? null,
      race_ethnicity: input.student_race_ethnicity && input.student_race_ethnicity.length > 0
        ? input.student_race_ethnicity
        : null,
      primary_language: input.student_primary_language ?? null,
      home_language: input.student_home_language ?? null,
      previous_school_name: input.student_previous_school ?? null,
      previous_school_phone: input.student_previous_school_phone ?? null,
      has_iep: input.student_has_iep ?? false,
      has_504: input.student_has_504 ?? false,
      special_services_notes: input.student_special_services_notes ?? null,
      emergency_contact_1_name: input.emergency_contact_1_name ?? null,
      emergency_contact_1_phone: input.emergency_contact_1_phone ?? null,
      emergency_contact_1_relationship:
        input.emergency_contact_1_relationship ?? null,
    })
    .select("id")
    .single();

  if (sErr || !student) {
    console.error("[createApplication] student", sErr?.message);
    return { data: null, error: "Failed to create student record" };
  }

  // 5. Link guardian to student
  await supabase.from("guardian_student").insert({
    guardian_id: guardian.id,
    student_id: student.id,
    relationship: input.guardian_relationship,
    is_legal_guardian: true,
  });

  // 6. Create application (draft)
  const { data: app, error: aErr } = await supabase
    .from("application")
    .insert({
      enrollment_window_id: input.enrollment_window_id,
      student_id: student.id,
      campus_id: input.campus_id,
      grade_level_id: input.grade_level_id,
      guardian_id: guardian.id,
      status: "draft",
      has_sibling_enrolled: input.has_sibling_enrolled ?? false,
      source: input.source ?? null,
    })
    .select("id")
    .single();

  if (aErr || !app) {
    console.error("[createApplication] application", aErr?.message);
    return { data: null, error: "Failed to create application" };
  }

  // 7. Save application answers (EAV fields)
  const answers = input.answers ?? {};
  if (input.sibling_name) answers.sibling_name = input.sibling_name;

  const safeAnswers = Object.entries(answers)
    .filter(([key, v]) => ALLOWED_ANSWER_KEYS.has(key) && v !== "" && v !== undefined);

  if (safeAnswers.length > 50) {
    return { data: null, error: "Too many answer fields." };
  }

  const answerRows = safeAnswers.map(([key, value]) => ({
    application_id: app.id,
    field_key: key,
    value: JSON.stringify(value),
  }));

  if (answerRows.length > 0) {
    await supabase.from("application_answer").insert(answerRows);
  }

  return { data: { id: app.id }, error: null };
}

// ─── Update Draft Application ──────────────────────────

/**
 * Update a draft application's related records (student, guardian, household).
 * Only works if application status is 'draft'.
 */
export async function updateApplication(
  input: UpdateApplicationInput
): Promise<MutationResult> {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const supabase = createServiceRoleClient();

  // Verify the calling user owns this application
  const { data: appCheck } = await supabase
    .from("application")
    .select("id, guardian:guardian_id (user_id)")
    .eq("id", input.application_id)
    .single();
  const appGuardian = appCheck?.guardian as unknown as { user_id: string } | null;
  if (!appGuardian || appGuardian.user_id !== user.id) {
    return { data: null, error: "Not authorized" };
  }

  // Fetch current application to get student_id, guardian_id
  const { data: app, error: appErr } = await supabase
    .from("application")
    .select("id, status, student_id, guardian_id, campus_id")
    .eq("id", input.application_id)
    .single();

  if (appErr || !app) {
    return { data: null, error: "Application not found" };
  }

  if (app.status !== "draft") {
    return { data: null, error: "Only draft applications can be edited" };
  }

  // Update student
  const studentUpdates: Record<string, unknown> = {};
  if (input.student_first_name !== undefined)
    studentUpdates.first_name = input.student_first_name;
  if (input.student_middle_name !== undefined)
    studentUpdates.middle_name = input.student_middle_name;
  if (input.student_last_name !== undefined)
    studentUpdates.last_name = input.student_last_name;
  if (input.student_suffix !== undefined)
    studentUpdates.suffix = input.student_suffix;
  if (input.student_date_of_birth !== undefined)
    studentUpdates.date_of_birth = input.student_date_of_birth;
  if (input.student_gender !== undefined)
    studentUpdates.gender = input.student_gender;
  if (input.student_preferred_name !== undefined)
    studentUpdates.preferred_name = input.student_preferred_name;
  if (input.student_race_ethnicity !== undefined)
    studentUpdates.race_ethnicity = input.student_race_ethnicity;
  if (input.student_primary_language !== undefined)
    studentUpdates.primary_language = input.student_primary_language;
  if (input.student_home_language !== undefined)
    studentUpdates.home_language = input.student_home_language;
  if (input.student_previous_school !== undefined)
    studentUpdates.previous_school_name = input.student_previous_school;
  if (input.student_previous_school_phone !== undefined)
    studentUpdates.previous_school_phone = input.student_previous_school_phone;
  if (input.student_has_iep !== undefined)
    studentUpdates.has_iep = input.student_has_iep;
  if (input.student_has_504 !== undefined)
    studentUpdates.has_504 = input.student_has_504;
  if (input.student_special_services_notes !== undefined)
    studentUpdates.special_services_notes =
      input.student_special_services_notes;
  if (input.emergency_contact_1_name !== undefined)
    studentUpdates.emergency_contact_1_name = input.emergency_contact_1_name;
  if (input.emergency_contact_1_phone !== undefined)
    studentUpdates.emergency_contact_1_phone = input.emergency_contact_1_phone;
  if (input.emergency_contact_1_relationship !== undefined)
    studentUpdates.emergency_contact_1_relationship =
      input.emergency_contact_1_relationship;

  if (Object.keys(studentUpdates).length > 0) {
    const { error: sErr } = await supabase
      .from("student")
      .update(studentUpdates)
      .eq("id", app.student_id);
    if (sErr) {
      console.error("[updateApplication] student", sErr.message);
      return { data: null, error: "Failed to update student" };
    }
  }

  // Update guardian
  const guardianUpdates: Record<string, unknown> = {};
  if (input.guardian_first_name !== undefined)
    guardianUpdates.first_name = input.guardian_first_name;
  if (input.guardian_last_name !== undefined)
    guardianUpdates.last_name = input.guardian_last_name;
  if (input.guardian_relationship !== undefined)
    guardianUpdates.relationship = input.guardian_relationship;
  if (input.guardian_email !== undefined)
    guardianUpdates.email = input.guardian_email;
  if (input.guardian_phone !== undefined)
    guardianUpdates.phone = input.guardian_phone;
  if (input.guardian_phone_secondary !== undefined)
    guardianUpdates.phone_secondary = input.guardian_phone_secondary;
  if (input.guardian_employer !== undefined)
    guardianUpdates.employer = input.guardian_employer;
  if (input.guardian_occupation !== undefined)
    guardianUpdates.occupation = input.guardian_occupation;
  if (input.guardian_preferred_contact_method !== undefined)
    guardianUpdates.preferred_contact_method = input.guardian_preferred_contact_method;
  if (input.guardian_preferred_language !== undefined)
    guardianUpdates.preferred_language = input.guardian_preferred_language;
  if (input.guardian_sms_consent !== undefined)
    guardianUpdates.sms_consent = input.guardian_sms_consent;

  if (Object.keys(guardianUpdates).length > 0) {
    const { error: gErr } = await supabase
      .from("guardian")
      .update(guardianUpdates)
      .eq("id", app.guardian_id);
    if (gErr) {
      console.error("[updateApplication] guardian", gErr.message);
      return { data: null, error: "Failed to update guardian" };
    }
  }

  // Update household address
  const hhUpdates: Record<string, unknown> = {};
  if (input.address_line1 !== undefined)
    hhUpdates.address_line1 = input.address_line1;
  if (input.city !== undefined) hhUpdates.city = input.city;
  if (input.state !== undefined) hhUpdates.state = input.state;
  if (input.zip !== undefined) hhUpdates.zip = input.zip;

  if (Object.keys(hhUpdates).length > 0) {
    // Get household_id from guardian
    const { data: g } = await supabase
      .from("guardian")
      .select("household_id")
      .eq("id", app.guardian_id)
      .single();

    if (g) {
      const { error: hhErr } = await supabase.from("household").update(hhUpdates).eq("id", g.household_id);
      if (hhErr) {
        console.error("[updateApplication] household", hhErr.message);
        return { data: null, error: "Failed to update address" };
      }
    }
  }

  // Update application-level fields
  const appUpdates: Record<string, unknown> = {};
  if (input.has_sibling_enrolled !== undefined)
    appUpdates.has_sibling_enrolled = input.has_sibling_enrolled;
  if (input.source !== undefined)
    appUpdates.source = input.source;

  if (Object.keys(appUpdates).length > 0) {
    await supabase
      .from("application")
      .update(appUpdates)
      .eq("id", input.application_id);
  }

  // Upsert application answers (EAV fields)
  const answers = input.answers ?? {};
  if (input.sibling_name !== undefined) answers.sibling_name = input.sibling_name;

  const safeAnswers = Object.entries(answers)
    .filter(([key, v]) => ALLOWED_ANSWER_KEYS.has(key) && v !== undefined);

  if (safeAnswers.length > 50) {
    return { data: null, error: "Too many answer fields." };
  }

  const answerRows = safeAnswers.map(([key, value]) => ({
    application_id: input.application_id,
    field_key: key,
    value: JSON.stringify(value),
  }));

  if (answerRows.length > 0) {
    await supabase
      .from("application_answer")
      .upsert(answerRows, { onConflict: "application_id,field_key" });
  }

  return { data: null, error: null };
}

// ─── Submit Application ────────────────────────────────

/**
 * Submit a draft application. Sets status to 'submitted',
 * locks the application, and records timestamp.
 */
export async function submitApplication(
  applicationId: string
): Promise<MutationResult> {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Verify the calling user owns this application
  const serviceClient = createServiceRoleClient();
  const { data: appCheck } = await serviceClient
    .from("application")
    .select("id, guardian:guardian_id (user_id)")
    .eq("id", applicationId)
    .single();
  const appGuardian = appCheck?.guardian as unknown as { user_id: string } | null;
  if (!appGuardian || appGuardian.user_id !== user.id) {
    return { data: null, error: "Not authorized" };
  }

  const supabase = serviceClient;

  // Verify application is draft and belongs to user
  const { data: app } = await supabase
    .from("application")
    .select("id, status")
    .eq("id", applicationId)
    .single();

  if (!app) return { data: null, error: "Application not found" };
  if (app.status !== "draft") {
    return { data: null, error: "Only draft applications can be submitted" };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("application")
    .update({
      status: "submitted",
      submitted_at: now,
      locked_at: now,
    })
    .eq("id", applicationId);

  if (error) {
    console.error("[submitApplication]", error.message);
    return { data: null, error: "Failed to submit application" };
  }

  return { data: null, error: null };
}

// ─── Withdraw Application ──────────────────────────────

/**
 * Withdraw an application. Can be done by family (own app) or staff.
 */
export async function withdrawApplication(
  applicationId: string,
  reason?: string
): Promise<MutationResult> {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Verify the calling user owns this application
  const serviceClient = createServiceRoleClient();
  const { data: appCheck } = await serviceClient
    .from("application")
    .select("id, guardian:guardian_id (user_id)")
    .eq("id", applicationId)
    .single();
  const appGuardian = appCheck?.guardian as unknown as { user_id: string } | null;
  if (!appGuardian || appGuardian.user_id !== user.id) {
    return { data: null, error: "Not authorized" };
  }

  const supabase = serviceClient;

  const { data: app } = await supabase
    .from("application")
    .select("id, status")
    .eq("id", applicationId)
    .single();

  if (!app) return { data: null, error: "Application not found" };

  const withdrawableStatuses = [
    "draft",
    "submitted",
    "needs_info",
    "verified",
    "lottery_assigned",
    "waitlisted",
  ];
  if (!withdrawableStatuses.includes(app.status)) {
    return { data: null, error: `Cannot withdraw an application with status "${app.status}"` };
  }

  const { error } = await supabase
    .from("application")
    .update({
      status: "withdrawn",
      review_notes: reason ?? null,
    })
    .eq("id", applicationId);

  if (error) {
    console.error("[withdrawApplication]", error.message);
    return { data: null, error: "Failed to withdraw application" };
  }

  return { data: null, error: null };
}

// ─── Staff Create Application (on behalf of family) ────

/**
 * Staff creates an application on behalf of a family that cannot
 * apply online. Creates household, guardian, student, and application.
 * No family user account required.
 */
export async function staffCreateApplication(
  input: CreateApplicationInput & { created_by_staff: string },
  options?: { autoSubmit?: boolean }
): Promise<MutationResult<{ id: string; student_id: string; guardian_id: string }>> {
  await requireStaffSession();
  const supabase = createServiceRoleClient();

  // 1. Create household (no family user link)
  const { data: household, error: hhErr } = await supabase
    .from("household")
    .insert({
      user_id: null,
      address_line1: input.address_line1 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      zip: input.zip ?? null,
    })
    .select("id")
    .single();

  if (hhErr || !household) {
    console.error("[staffCreateApplication] household", hhErr?.message);
    return { data: null, error: "Failed to create household" };
  }

  // 2. Create guardian
  const { data: guardian, error: gErr } = await supabase
    .from("guardian")
    .insert({
      household_id: household.id,
      first_name: input.guardian_first_name,
      last_name: input.guardian_last_name,
      relationship: input.guardian_relationship,
      email: input.guardian_email,
      phone: input.guardian_phone,
      phone_secondary: input.guardian_phone_secondary ?? null,
      employer: input.guardian_employer ?? null,
      occupation: input.guardian_occupation ?? null,
      preferred_contact_method: input.guardian_preferred_contact_method ?? null,
      preferred_language: input.guardian_preferred_language ?? null,
      sms_consent: input.guardian_sms_consent ?? false,
      is_primary: true,
    })
    .select("id")
    .single();

  if (gErr || !guardian) {
    console.error("[staffCreateApplication] guardian", gErr?.message);
    return { data: null, error: "Failed to create guardian record" };
  }

  // 3. Create student
  const { data: student, error: sErr } = await supabase
    .from("student")
    .insert({
      household_id: household.id,
      first_name: input.student_first_name,
      middle_name: input.student_middle_name ?? null,
      last_name: input.student_last_name,
      preferred_name: input.student_preferred_name ?? null,
      suffix: input.student_suffix ?? null,
      date_of_birth: input.student_date_of_birth ?? null,
      gender: input.student_gender ?? null,
      race_ethnicity:
        input.student_race_ethnicity && input.student_race_ethnicity.length > 0
          ? input.student_race_ethnicity
          : null,
      primary_language: input.student_primary_language ?? null,
      home_language: input.student_home_language ?? null,
      previous_school_name: input.student_previous_school ?? null,
      previous_school_phone: input.student_previous_school_phone ?? null,
      has_iep: input.student_has_iep ?? false,
      has_504: input.student_has_504 ?? false,
      special_services_notes: input.student_special_services_notes ?? null,
      emergency_contact_1_name: input.emergency_contact_1_name ?? null,
      emergency_contact_1_phone: input.emergency_contact_1_phone ?? null,
      emergency_contact_1_relationship: input.emergency_contact_1_relationship ?? null,
    })
    .select("id")
    .single();

  if (sErr || !student) {
    console.error("[staffCreateApplication] student", sErr?.message);
    return { data: null, error: "Failed to create student record" };
  }

  // 4. Link guardian to student
  await supabase.from("guardian_student").insert({
    guardian_id: guardian.id,
    student_id: student.id,
    relationship: input.guardian_relationship,
    is_legal_guardian: true,
  });

  // 5. Create application
  const now = new Date().toISOString();
  const status = options?.autoSubmit ? "submitted" : "draft";
  const { data: app, error: aErr } = await supabase
    .from("application")
    .insert({
      enrollment_window_id: input.enrollment_window_id,
      student_id: student.id,
      campus_id: input.campus_id,
      grade_level_id: input.grade_level_id,
      guardian_id: guardian.id,
      status,
      submitted_at: options?.autoSubmit ? now : null,
      locked_at: options?.autoSubmit ? now : null,
      has_sibling_enrolled: input.has_sibling_enrolled ?? false,
      source: input.source ?? "staff_entry",
      assigned_staff_id: input.created_by_staff,
    })
    .select("id")
    .single();

  if (aErr || !app) {
    console.error("[staffCreateApplication] application", aErr?.message);
    return { data: null, error: "Failed to create application" };
  }

  // 6. Save application answers (EAV fields)
  const answers = input.answers ?? {};
  if (input.sibling_name) answers.sibling_name = input.sibling_name;

  const safeAnswers = Object.entries(answers)
    .filter(([key, v]) => ALLOWED_ANSWER_KEYS.has(key) && v !== "" && v !== undefined);

  if (safeAnswers.length > 50) {
    return { data: null, error: "Too many answer fields." };
  }

  const answerRows = safeAnswers.map(([key, value]) => ({
    application_id: app.id,
    field_key: key,
    value: JSON.stringify(value),
  }));

  if (answerRows.length > 0) {
    await supabase.from("application_answer").insert(answerRows);
  }

  return {
    data: { id: app.id, student_id: student.id, guardian_id: guardian.id },
    error: null,
  };
}

// ─── Staff Fast-Track Enroll (skip lottery/offer) ──────

/**
 * Staff creates an application AND enrolls the student in one step.
 * Used when a family can't apply online and the school has open seats.
 * Creates: household → guardian → student → application (registered) →
 *   offer (auto-accepted) → enrollment → registration packet.
 */
export async function staffFastTrackEnroll(
  input: CreateApplicationInput & { created_by_staff: string }
): Promise<MutationResult<{ application_id: string; enrollment_id: string }>> {
  await requireStaffSession();
  const supabase = createServiceRoleClient();

  // 1. Create the application (auto-submitted)
  const appResult = await staffCreateApplication(input, { autoSubmit: true });
  if (appResult.error || !appResult.data) {
    return { data: null, error: appResult.error ?? "Failed to create application" };
  }

  const { id: applicationId, student_id, guardian_id } = appResult.data;

  // 2. Auto-verify the application
  await supabase
    .from("application")
    .update({
      status: "verified",
      reviewed_by: input.created_by_staff,
      reviewed_at: new Date().toISOString(),
      review_notes: "Fast-track enrollment by staff.",
    })
    .eq("id", applicationId);

  // 3. Get school_year_id from enrollment window
  const { data: ew } = await supabase
    .from("enrollment_window")
    .select("school_year_id")
    .eq("id", input.enrollment_window_id)
    .single();

  const schoolYearId = ew?.school_year_id;
  if (!schoolYearId) {
    return { data: null, error: "Enrollment window not found or has no school year." };
  }

  // 4. Create offer (auto-accepted)
  const offerNow = new Date().toISOString();
  const { data: offer, error: offerError } = await supabase
    .from("offer")
    .insert({
      application_id: applicationId,
      campus_id: input.campus_id,
      grade_level_id: input.grade_level_id,
      status: "accepted",
      offered_at: offerNow,
      expires_at: offerNow,
      offered_by: input.created_by_staff,
      responded_at: offerNow,
    })
    .select("id")
    .single();

  if (offerError || !offer) {
    console.error("[staffFastTrackEnroll] offer insert", offerError?.message);
    return { data: null, error: "Failed to create offer record." };
  }

  // 5. Create acceptance record
  if (offer) {
    await supabase.from("acceptance").insert({
      offer_id: offer.id,
      application_id: applicationId,
      accepted_by: guardian_id,
      accepted_at: offerNow,
    });
  }

  // 6. Update application to "accepted" (createEnrollment below will set to "registered")
  await supabase
    .from("application")
    .update({ status: "accepted", updated_at: offerNow })
    .eq("id", applicationId);

  // 7. Create enrollment
  const { createEnrollment } = await import("./enrollment");
  const enrollResult = await createEnrollment({
    student_id,
    campus_id: input.campus_id,
    grade_level_id: input.grade_level_id,
    school_year_id: schoolYearId,
    acceptance_id: offer.id,
    application_id: applicationId,
  });

  if (enrollResult.error || !enrollResult.data) {
    return { data: null, error: enrollResult.error ?? "Failed to create enrollment" };
  }

  // 8. Initialize registration packet
  const { initializeRegistrationPacket } = await import("./registration");
  await initializeRegistrationPacket({
    enrollment_id: enrollResult.data.id,
    campus_id: input.campus_id,
    school_year_id: schoolYearId,
  });

  return {
    data: {
      application_id: applicationId,
      enrollment_id: enrollResult.data.id,
    },
    error: null,
  };
}

// ─── Update Application Status (Staff) ─────────────────

/**
 * Change application status. Staff only.
 *
 * Enforces the state machine — only valid transitions are allowed.
 * The database trigger (fn_track_status_change) also records every
 * status change in application_status_history automatically.
 * We additionally write to audit_event here for cross-entity audit trail.
 */
export async function updateApplicationStatus(
  applicationId: string,
  newStatus: string,
  reason?: string
): Promise<MutationResult> {
  const authClient = await createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const supabase = createServiceRoleClient();

  const { data: app } = await supabase
    .from("application")
    .select("id, status, campus_id")
    .eq("id", applicationId)
    .single();

  if (!app) return { data: null, error: "Application not found" };

  // ── State machine validation ───────────────────────────────────────────────
  // Replaces the old manual validTransitions table which was incomplete
  // (missing withdrawn, declined, expired terminal states and draft→submitted).
  const transition = isValidTransition(
    app.status as ApplicationStatusValue,
    newStatus as ApplicationStatusValue
  );

  if (!transition.allowed) {
    return { data: null, error: transition.reason ?? "Invalid status transition" };
  }

  // ── Build update payload ───────────────────────────────────────────────────
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    status: newStatus,
    updated_at: now,
  };

  if (newStatus === "verified" || newStatus === "needs_info") {
    updates.reviewed_by = user.id;
    updates.reviewed_at = now;
    if (reason) updates.review_notes = reason;
  }

  const { error } = await supabase
    .from("application")
    .update(updates)
    .eq("id", applicationId);

  if (error) {
    console.error("[updateApplicationStatus]", error.message);
    return { data: null, error: "Failed to update status" };
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  // Belt-and-suspenders: DB trigger also writes to application_status_history.
  // This writes to audit_event for cross-entity querying.
  await logAuditEvent({
    table_name: "application",
    record_id: applicationId,
    action: AuditAction.StatusChange,
    actor_id: user.id,
    campus_id: app.campus_id as string ?? null,
    old_data: { status: app.status },
    new_data: { status: newStatus },
    metadata: reason ? { reason } : undefined,
  });

  // Fire family notification based on new status — fire and forget
  const campusId = app.campus_id as string | undefined;
  if (newStatus === "submitted") {
    notifyFamilyApplicationReceived({ applicationId, campusId }).catch(() => {});
    if (campusId) notifyStaffNewApplication({ campusId, applicationId }).catch(() => {});
  } else if (newStatus === "verified") {
    notifyFamilyApplicationVerified({ applicationId, campusId }).catch(() => {});
  } else if (newStatus === "needs_info") {
    notifyFamilyNeedsInfo({
      applicationId,
      applicationIdForLink: applicationId,
      message: reason,
      campusId,
    }).catch(() => {});
  } else if (newStatus === "waitlisted") {
    notifyFamilyApplicationWaitlisted({ applicationId, campusId }).catch(() => {});
  }

  return { data: null, error: null };
}
