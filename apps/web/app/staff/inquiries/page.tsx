export const runtime = "edge";

import { createServerClient } from "@rooted-ems/database/server";
import { getStaffInquiries, getInquiryStats, getCampuses } from "@/lib/queries";
import { InquiriesClient } from "./inquiries-client";
import { requireStaffSession, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";

export const dynamic = "force-dynamic";

export default async function StaffInquiriesPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;

  const supabase = await createServerClient();

  const [inquiries, stats, allCampuses, gradeData, windowData] = await Promise.all([
    getStaffInquiries(scopedCampusIds),
    getInquiryStats(scopedCampusIds),
    getCampuses(),
    supabase.from("grade_level").select("id, grade, campus_id").order("grade"),
    supabase.from("enrollment_window").select("id, name, campus_id, status").eq("status", "open").order("name"),
  ]);

  // Fetch contact logs for all inquiries in one query
  const inquiryIds = inquiries.map((i) => i.id);
  const { data: contactLogs } = inquiryIds.length > 0
    ? await supabase
        .from("contact_log")
        .select(`id, inquiry_id, channel, notes, created_at, created_by:staff_id (full_name)`)
        .in("inquiry_id", inquiryIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  // Group contact logs by inquiry_id
  const logsByInquiry: Record<string, Array<{ id: string; channel: string; notes: string | null; created_by_name: string | null; created_at: string }>> = {};
  for (const log of contactLogs ?? []) {
    const row = log as Record<string, unknown>;
    const inquiryId = row.inquiry_id as string;
    if (!logsByInquiry[inquiryId]) logsByInquiry[inquiryId] = [];
    const createdBy = row.created_by as Record<string, string> | null;
    logsByInquiry[inquiryId].push({
      id: row.id as string,
      channel: row.channel as string,
      notes: (row.notes as string) ?? null,
      created_by_name: createdBy?.full_name ?? null,
      created_at: row.created_at as string,
    });
  }

  const campuses = allCampuses.filter(
    (c) => accessibleIds.length === 0 || accessibleIds.includes(c.id)
  );

  const gradeLevels = (gradeData.data ?? []).map((g: Record<string, unknown>) => ({
    id: g.id as string,
    grade: g.grade as string,
    campus_id: g.campus_id as string,
  }));

  const enrollmentWindows = (windowData.data ?? []).map((w: Record<string, unknown>) => ({
    id: w.id as string,
    name: w.name as string,
    campus_id: w.campus_id as string,
    status: w.status as string,
  }));

  return (
    <InquiriesClient
      inquiries={inquiries}
      stats={stats}
      campuses={campuses}
      gradeLevels={gradeLevels}
      enrollmentWindows={enrollmentWindows}
      contactLogsByInquiry={logsByInquiry}
      staffId={session.user_id}
      staffName={session.email ?? "Staff"}
    />
  );
}
