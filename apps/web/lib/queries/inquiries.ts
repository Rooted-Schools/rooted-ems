import { createServerClient } from "@rooted-ems/database/server";

// ─── Types ─────────────────────────────────────────────

export interface InquiryRow {
  id: string;
  student_first_name: string;
  student_last_name: string;
  grade_applying: string;
  guardian_name: string;
  guardian_email: string | null;
  guardian_phone: string | null;
  source: string;
  notes: string | null;
  status: string;
  campus_name: string | null;
  campus_id: string | null;
  assigned_staff_name: string | null;
  assigned_staff_id: string | null;
  created_at: string;
}

export interface InquiryStats {
  total: number;
  new: number;
  contacted: number;
  applied: number;
  lost: number;
}

export interface InquiryDetail extends InquiryRow {
  contact_logs: ContactLogRow[];
}

export interface ContactLogRow {
  id: string;
  channel: string;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
}

// ─── Queries ─────────────────────────────────────────────

/**
 * Fetch inquiries for staff, with optional filters.
 */
export async function getStaffInquiries(
  campusIds?: string[],
  filters?: { status?: string; limit?: number }
): Promise<InquiryRow[]> {
  const supabase = await createServerClient();
  const limit = filters?.limit ?? 100;

  let query = supabase
    .from("inquiry")
    .select(
      `
      id, student_first_name, student_last_name, grade_applying,
      guardian_name, guardian_email, guardian_phone, source, notes,
      status, campus_id, created_at, assigned_staff_id,
      campus:campus_id (name),
      assigned_staff:assigned_staff_id (full_name)
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (campusIds && campusIds.length > 0) {
    query = query.in("campus_id", campusIds);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getStaffInquiries]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const campus = row.campus as Record<string, string> | null;
    const staff = row.assigned_staff as Record<string, string> | null;
    return {
      id: row.id as string,
      student_first_name: row.student_first_name as string,
      student_last_name: row.student_last_name as string,
      grade_applying: row.grade_applying as string,
      guardian_name: row.guardian_name as string,
      guardian_email: (row.guardian_email as string) ?? null,
      guardian_phone: (row.guardian_phone as string) ?? null,
      source: row.source as string,
      notes: (row.notes as string) ?? null,
      status: row.status as string,
      campus_name: campus?.name ?? null,
      campus_id: (row.campus_id as string) ?? null,
      assigned_staff_name: staff?.full_name ?? null,
      assigned_staff_id: (row.assigned_staff_id as string) ?? null,
      created_at: row.created_at as string,
    };
  });
}

/**
 * Fetch inquiry counts by status for KPI cards.
 */
export async function getInquiryStats(
  campusIds?: string[]
): Promise<InquiryStats> {
  const supabase = await createServerClient();

  let query = supabase.from("inquiry").select("status");

  if (campusIds && campusIds.length > 0) {
    query = query.in("campus_id", campusIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getInquiryStats]", error.message);
    return { total: 0, new: 0, contacted: 0, applied: 0, lost: 0 };
  }

  const counts: Record<string, number> = {};
  (data ?? []).forEach((row: Record<string, unknown>) => {
    const s = row.status as string;
    counts[s] = (counts[s] ?? 0) + 1;
  });

  return {
    total: (data ?? []).length,
    new: counts["new"] ?? 0,
    contacted: counts["contacted"] ?? 0,
    applied: counts["applied"] ?? 0,
    lost: counts["lost"] ?? 0,
  };
}

/**
 * Fetch a single inquiry with contact log history.
 */
export async function getInquiryDetail(
  inquiryId: string
): Promise<InquiryDetail | null> {
  const supabase = await createServerClient();

  const { data: inquiry, error } = await supabase
    .from("inquiry")
    .select(
      `
      id, student_first_name, student_last_name, grade_applying,
      guardian_name, guardian_email, guardian_phone, source, notes,
      status, campus_id, created_at, assigned_staff_id,
      campus:campus_id (name),
      assigned_staff:assigned_staff_id (full_name)
    `
    )
    .eq("id", inquiryId)
    .single();

  if (error || !inquiry) {
    console.error("[getInquiryDetail]", error?.message);
    return null;
  }

  // Fetch contact logs
  const { data: logs } = await supabase
    .from("contact_log")
    .select(
      `
      id, channel, notes, created_at,
      created_by:staff_id (full_name)
    `
    )
    .eq("inquiry_id", inquiryId)
    .order("created_at", { ascending: false });

  const row = inquiry as Record<string, unknown>;
  const campus = row.campus as Record<string, string> | null;
  const staff = row.assigned_staff as Record<string, string> | null;

  return {
    id: row.id as string,
    student_first_name: row.student_first_name as string,
    student_last_name: row.student_last_name as string,
    grade_applying: row.grade_applying as string,
    guardian_name: row.guardian_name as string,
    guardian_email: (row.guardian_email as string) ?? null,
    guardian_phone: (row.guardian_phone as string) ?? null,
    source: row.source as string,
    notes: (row.notes as string) ?? null,
    status: row.status as string,
    campus_name: campus?.name ?? null,
    campus_id: (row.campus_id as string) ?? null,
    assigned_staff_name: staff?.full_name ?? null,
    assigned_staff_id: (row.assigned_staff_id as string) ?? null,
    created_at: row.created_at as string,
    contact_logs: (logs ?? []).map((log: Record<string, unknown>) => {
      const createdBy = log.created_by as Record<string, string> | null;
      return {
        id: log.id as string,
        channel: log.channel as string,
        notes: (log.notes as string) ?? null,
        created_by_name: createdBy?.full_name ?? null,
        created_at: log.created_at as string,
      };
    }),
  };
}

/**
 * Fetch recent inquiries for dashboard widget.
 */
export async function getRecentInquiries(
  campusIds?: string[],
  limit: number = 5
): Promise<InquiryRow[]> {
  return getStaffInquiries(campusIds, { limit });
}
