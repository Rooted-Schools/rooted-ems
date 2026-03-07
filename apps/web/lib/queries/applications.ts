import { createServerClient } from "@rooted-ems/database/server";

// ─── Types ─────────────────────────────────────────────
export interface ApplicationRow {
  id: string;
  student_name: string;
  guardian_name: string;
  grade: string;
  campus_name: string;
  campus_id: string;
  status: string;
  submitted_at: string | null;
  updated_at: string;
}

export interface ApplicationDetail extends ApplicationRow {
  student_id: string;
  guardian_id: string;
  guardian_email: string | null;
  guardian_phone: string | null;
  enrollment_window_id: string;
  enrollment_window_name: string;
  grade_level_id: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  has_sibling_enrolled: boolean;
  locked_at: string | null;
  offer_id: string | null;
  offer_expires_at: string | null;
  documents: DocumentRow[];
  timeline: TimelineEntry[];
  notes: NoteRow[];
  tags: string[];
}

export interface DocumentRow {
  id: string;
  document_type: string;
  file_name: string;
  storage_path: string;
  status: string;
  created_at: string;
  verified_at: string | null;
}

export interface TimelineEntry {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by_name: string | null;
  reason: string | null;
  created_at: string;
}

export interface NoteRow {
  id: string;
  content: string;
  is_internal: boolean;
  created_by_name: string;
  created_at: string;
}

export interface ApplicationStats {
  total: number;
  submitted: number;
  needs_info: number;
  verified: number;
  offered: number;
  accepted: number;
  waitlisted: number;
  registered: number;
  draft: number;
}

export interface PipelineStage {
  label: string;
  status: string;
  count: number;
  color: string;
}

// ─── Queries ─────────────────────────────────────────────

/**
 * Fetch paginated application list with student/guardian names.
 * Staff view: campus-scoped via RLS.
 */
export async function getStaffApplications(opts?: {
  campusId?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: ApplicationRow[]; count: number }> {
  const supabase = await createServerClient();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  // Build query — joins application with student, guardian, campus, grade_level
  let query = supabase
    .from("application")
    .select(
      `
      id,
      status,
      submitted_at,
      updated_at,
      campus_id,
      student:student_id (first_name, last_name),
      guardian:guardian_id (first_name, last_name),
      campus:campus_id (name),
      grade_level:grade_level_id (grade)
    `,
      { count: "exact" }
    )
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (opts?.campusId) {
    query = query.eq("campus_id", opts.campusId);
  }

  if (opts?.status && opts.status !== "all") {
    query = query.eq("status", opts.status);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("[getStaffApplications]", error.message);
    return { data: [], count: 0 };
  }

  const rows: ApplicationRow[] = (data ?? []).map((row: Record<string, unknown>) => {
    const student = row.student as Record<string, string> | null;
    const guardian = row.guardian as Record<string, string> | null;
    const campus = row.campus as Record<string, string> | null;
    const grade = row.grade_level as Record<string, string> | null;

    return {
      id: row.id as string,
      student_name: student
        ? `${student.first_name} ${student.last_name}`
        : "Unknown Student",
      guardian_name: guardian
        ? `${guardian.first_name} ${guardian.last_name}`
        : "Unknown Guardian",
      grade: (grade?.grade as string) ?? "",
      campus_name: (campus?.name as string) ?? "",
      campus_id: row.campus_id as string,
      status: row.status as string,
      submitted_at: row.submitted_at as string | null,
      updated_at: row.updated_at as string,
    };
  });

  return { data: rows, count: count ?? 0 };
}

/**
 * Fetch application status counts for dashboard stats and pipeline.
 */
export async function getApplicationStats(
  campusId?: string
): Promise<ApplicationStats> {
  const supabase = await createServerClient();

  let query = supabase
    .from("application")
    .select("status", { count: "exact" });

  if (campusId) {
    query = query.eq("campus_id", campusId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getApplicationStats]", error.message);
    return {
      total: 0,
      submitted: 0,
      needs_info: 0,
      verified: 0,
      offered: 0,
      accepted: 0,
      waitlisted: 0,
      registered: 0,
      draft: 0,
    };
  }

  const counts: Record<string, number> = {};
  (data ?? []).forEach((row: Record<string, unknown>) => {
    const s = row.status as string;
    counts[s] = (counts[s] || 0) + 1;
  });

  const total = (data ?? []).length;

  return {
    total,
    submitted: counts["submitted"] ?? 0,
    needs_info: counts["needs_info"] ?? 0,
    verified: counts["verified"] ?? 0,
    offered: counts["offered"] ?? 0,
    accepted: counts["accepted"] ?? 0,
    waitlisted: counts["waitlisted"] ?? 0,
    registered: counts["registered"] ?? 0,
    draft: counts["draft"] ?? 0,
  };
}

/**
 * Build pipeline stages from stats for the dashboard bar chart.
 */
export function buildPipeline(stats: ApplicationStats): PipelineStage[] {
  return [
    { label: "Draft", status: "draft", count: stats.draft, color: "bg-gray-200" },
    { label: "Submitted", status: "submitted", count: stats.submitted, color: "bg-blue-400" },
    { label: "Needs Info", status: "needs_info", count: stats.needs_info, color: "bg-amber-400" },
    { label: "Verified", status: "verified", count: stats.verified, color: "bg-emerald-400" },
    { label: "Offered", status: "offered", count: stats.offered, color: "bg-green-500" },
    { label: "Accepted", status: "accepted", count: stats.accepted, color: "bg-green-600" },
    { label: "Waitlisted", status: "waitlisted", count: stats.waitlisted, color: "bg-yellow-500" },
    { label: "Registered", status: "registered", count: stats.registered, color: "bg-rooted-green" },
  ];
}

/**
 * Fetch single application detail with related data.
 */
export async function getApplicationDetail(
  applicationId: string
): Promise<ApplicationDetail | null> {
  const supabase = await createServerClient();

  const { data: app, error } = await supabase
    .from("application")
    .select(
      `
      *,
      student:student_id (*),
      guardian:guardian_id (*),
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      enrollment_window:enrollment_window_id (name)
    `
    )
    .eq("id", applicationId)
    .single();

  if (error || !app) {
    console.error("[getApplicationDetail]", error?.message);
    return null;
  }

  // Fetch documents
  const { data: docs } = await supabase
    .from("document")
    .select("id, document_type, file_name, storage_path, status, created_at, verified_at")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });

  // Fetch timeline (status history)
  const { data: history } = await supabase
    .from("application_status_history")
    .select(
      `
      id, from_status, to_status, reason, created_at,
      changed_by:changed_by (first_name, last_name)
    `
    )
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });

  // Fetch notes
  const { data: notes } = await supabase
    .from("note")
    .select(
      `
      id, content, is_internal, created_at,
      author:created_by (first_name, last_name)
    `
    )
    .eq("entity_type", "application")
    .eq("entity_id", applicationId)
    .order("created_at", { ascending: false });

  // Fetch tags
  const { data: tagRows } = await supabase
    .from("application_tag")
    .select("tag:tag_id (name)")
    .eq("application_id", applicationId);

  // Fetch pending offer (if any)
  const { data: pendingOffer } = await supabase
    .from("offer")
    .select("id, expires_at")
    .eq("application_id", applicationId)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();

  const student = app.student as Record<string, string> | null;
  const guardian = app.guardian as Record<string, string> | null;
  const campus = app.campus as Record<string, string> | null;
  const grade = app.grade_level as Record<string, string> | null;
  const window = app.enrollment_window as Record<string, string> | null;

  return {
    id: app.id,
    student_id: app.student_id,
    student_name: student
      ? `${student.first_name} ${student.last_name}`
      : "Unknown",
    guardian_id: app.guardian_id,
    guardian_name: guardian
      ? `${guardian.first_name} ${guardian.last_name}`
      : "Unknown",
    guardian_email: (guardian?.email as string) ?? null,
    guardian_phone: (guardian?.phone as string) ?? null,
    grade: (grade?.grade as string) ?? "",
    campus_name: (campus?.name as string) ?? "",
    campus_id: app.campus_id,
    enrollment_window_id: app.enrollment_window_id,
    enrollment_window_name: (window?.name as string) ?? "",
    grade_level_id: app.grade_level_id,
    status: app.status,
    submitted_at: app.submitted_at,
    updated_at: app.updated_at,
    created_at: app.created_at,
    reviewed_by: app.reviewed_by,
    reviewed_at: app.reviewed_at,
    review_notes: app.review_notes,
    has_sibling_enrolled: app.has_sibling_enrolled,
    locked_at: app.locked_at,
    offer_id: pendingOffer?.id ?? null,
    offer_expires_at: pendingOffer?.expires_at ?? null,
    documents: (docs ?? []).map((d: Record<string, unknown>) => ({
      id: d.id as string,
      document_type: d.document_type as string,
      file_name: d.file_name as string,
      storage_path: (d.storage_path as string) ?? "",
      status: d.status as string,
      created_at: d.created_at as string,
      verified_at: d.verified_at as string | null,
    })),
    timeline: (history ?? []).map((h: Record<string, unknown>) => {
      const changer = h.changed_by as Record<string, string> | null;
      return {
        id: h.id as string,
        from_status: h.from_status as string | null,
        to_status: h.to_status as string,
        changed_by_name: changer
          ? `${changer.first_name} ${changer.last_name}`
          : null,
        reason: h.reason as string | null,
        created_at: h.created_at as string,
      };
    }),
    notes: (notes ?? []).map((n: Record<string, unknown>) => {
      const author = n.author as Record<string, string> | null;
      return {
        id: n.id as string,
        content: n.content as string,
        is_internal: n.is_internal as boolean,
        created_by_name: author
          ? `${author.first_name} ${author.last_name}`
          : "System",
        created_at: n.created_at as string,
      };
    }),
    tags: (tagRows ?? []).map((t: Record<string, unknown>) => {
      const tag = t.tag as Record<string, string> | null;
      return tag?.name ?? "";
    }).filter(Boolean),
  };
}

// ─── Types for draft editing ───────────────────────────

export interface DraftApplicationData {
  id: string;
  status: string;
  campus_id: string;
  enrollment_window_id: string;
  grade_level_id: string;
  grade: string;
  has_sibling_enrolled: boolean;
  source: string | null;
  // Student
  student: {
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
    date_of_birth: string | null;
    gender: string | null;
    race_ethnicity: string[] | null;
    primary_language: string | null;
    home_language: string | null;
    previous_school_name: string | null;
    previous_school_phone: string | null;
    has_iep: boolean;
    has_504: boolean;
    special_services_notes: string | null;
    emergency_contact_1_name: string | null;
    emergency_contact_1_phone: string | null;
    emergency_contact_1_relationship: string | null;
  };
  // Guardian
  guardian: {
    first_name: string;
    last_name: string;
    relationship: string;
    email: string | null;
    phone: string | null;
    phone_secondary: string | null;
    employer: string | null;
    sms_consent: boolean;
  };
  // Household
  household: {
    address_line1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  // Application answers (EAV)
  answers: Record<string, string>;
}

/**
 * Fetch draft application data for the edit form.
 */
export async function getDraftApplicationForEdit(
  applicationId: string
): Promise<DraftApplicationData | null> {
  const supabase = await createServerClient();

  const { data: app, error } = await supabase
    .from("application")
    .select(
      `
      id, status, campus_id, enrollment_window_id, grade_level_id,
      has_sibling_enrolled, source,
      student:student_id (
        first_name, middle_name, last_name, suffix,
        date_of_birth, gender, race_ethnicity, primary_language, home_language,
        previous_school_name, previous_school_phone,
        has_iep, has_504, special_services_notes,
        emergency_contact_1_name, emergency_contact_1_phone, emergency_contact_1_relationship
      ),
      guardian:guardian_id (
        first_name, last_name, relationship, email, phone,
        phone_secondary, employer, sms_consent, household_id
      ),
      grade_level:grade_level_id (grade)
    `
    )
    .eq("id", applicationId)
    .single();

  if (error || !app) {
    console.error("[getDraftApplicationForEdit]", error?.message);
    return null;
  }

  if (app.status !== "draft") return null;

  const student = app.student as unknown as Record<string, unknown> | null;
  const guardian = app.guardian as unknown as Record<string, unknown> | null;
  const grade = app.grade_level as unknown as Record<string, string> | null;

  // Fetch household
  const householdId = guardian?.household_id as string | undefined;
  let household = { address_line1: null, city: null, state: null, zip: null } as {
    address_line1: string | null; city: string | null; state: string | null; zip: string | null;
  };
  if (householdId) {
    const { data: hh } = await supabase
      .from("household")
      .select("address_line1, city, state, zip")
      .eq("id", householdId)
      .single();
    if (hh) household = hh as typeof household;
  }

  // Fetch application answers
  const { data: answerRows } = await supabase
    .from("application_answer")
    .select("field_key, value")
    .eq("application_id", applicationId);

  const answers: Record<string, string> = {};
  for (const row of answerRows ?? []) {
    const r = row as Record<string, unknown>;
    try {
      answers[r.field_key as string] = JSON.parse(r.value as string);
    } catch {
      answers[r.field_key as string] = r.value as string;
    }
  }

  return {
    id: app.id,
    status: app.status,
    campus_id: app.campus_id,
    enrollment_window_id: app.enrollment_window_id,
    grade_level_id: app.grade_level_id,
    grade: grade?.grade ?? "",
    has_sibling_enrolled: app.has_sibling_enrolled ?? false,
    source: app.source ?? null,
    student: {
      first_name: (student?.first_name as string) ?? "",
      middle_name: (student?.middle_name as string) ?? null,
      last_name: (student?.last_name as string) ?? "",
      suffix: (student?.suffix as string) ?? null,
      date_of_birth: (student?.date_of_birth as string) ?? null,
      gender: (student?.gender as string) ?? null,
      race_ethnicity: (student?.race_ethnicity as string[]) ?? null,
      primary_language: (student?.primary_language as string) ?? null,
      home_language: (student?.home_language as string) ?? null,
      previous_school_name: (student?.previous_school_name as string) ?? null,
      previous_school_phone: (student?.previous_school_phone as string) ?? null,
      has_iep: (student?.has_iep as boolean) ?? false,
      has_504: (student?.has_504 as boolean) ?? false,
      special_services_notes: (student?.special_services_notes as string) ?? null,
      emergency_contact_1_name: (student?.emergency_contact_1_name as string) ?? null,
      emergency_contact_1_phone: (student?.emergency_contact_1_phone as string) ?? null,
      emergency_contact_1_relationship: (student?.emergency_contact_1_relationship as string) ?? null,
    },
    guardian: {
      first_name: (guardian?.first_name as string) ?? "",
      last_name: (guardian?.last_name as string) ?? "",
      relationship: (guardian?.relationship as string) ?? "",
      email: (guardian?.email as string) ?? null,
      phone: (guardian?.phone as string) ?? null,
      phone_secondary: (guardian?.phone_secondary as string) ?? null,
      employer: (guardian?.employer as string) ?? null,
      sms_consent: (guardian?.sms_consent as boolean) ?? false,
    },
    household,
    answers,
  };
}

/**
 * Fetch applications for a specific family user.
 */
export async function getFamilyApplications(
  userId: string
): Promise<ApplicationRow[]> {
  const supabase = await createServerClient();

  // Family sees applications linked through their guardian record
  // First find guardian IDs for this user
  const { data: guardians } = await supabase
    .from("guardian")
    .select("id")
    .eq("user_id", userId);

  if (!guardians || guardians.length === 0) return [];

  const guardianIds = guardians.map((g: Record<string, string>) => g.id);

  const { data, error } = await supabase
    .from("application")
    .select(
      `
      id, status, submitted_at, updated_at, campus_id,
      student:student_id (first_name, last_name),
      guardian:guardian_id (first_name, last_name),
      campus:campus_id (name),
      grade_level:grade_level_id (grade)
    `
    )
    .in("guardian_id", guardianIds)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[getFamilyApplications]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const student = row.student as Record<string, string> | null;
    const guardian = row.guardian as Record<string, string> | null;
    const campus = row.campus as Record<string, string> | null;
    const grade = row.grade_level as Record<string, string> | null;

    return {
      id: row.id as string,
      student_name: student
        ? `${student.first_name} ${student.last_name}`
        : "Unknown",
      guardian_name: guardian
        ? `${guardian.first_name} ${guardian.last_name}`
        : "Unknown",
      grade: (grade?.grade as string) ?? "",
      campus_name: (campus?.name as string) ?? "",
      campus_id: row.campus_id as string,
      status: row.status as string,
      submitted_at: row.submitted_at as string | null,
      updated_at: row.updated_at as string,
    };
  });
}
