export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServiceRoleClient, createServerClient } from "@rooted-ems/database/server";
import { getCampuses, getActiveEnrollmentWindows } from "@/lib/queries";
import { requireStaffSession } from "@/lib/auth/get-session";
import { StaffNewApplicationForm } from "./new-staff-application";

export default async function StaffNewApplicationPage({
  searchParams,
}: {
  searchParams: { lead?: string };
}) {
  const session = await requireStaffSession();

  const supabase = createServiceRoleClient();

  // Fetch all campuses (CMO-level: all campuses, not just assigned)
  const [campuses, windows] = await Promise.all([
    getCampuses(),
    getActiveEnrollmentWindows(),
  ]);

  // Fetch all grade levels
  const { data: gradeLevels } = await supabase
    .from("grade_level")
    .select("id, grade, campus_id")
    .order("grade");

  // Fetch open enrollment windows for new application creation
  const { data: allWindows } = await supabase
    .from("enrollment_window")
    .select("id, name, campus_id, school_year_id, status")
    .eq("status", "open")
    .order("name");

  const grades = (gradeLevels ?? []).map((g: Record<string, unknown>) => ({
    id: g.id as string,
    grade: g.grade as string,
    campus_id: g.campus_id as string,
  }));

  const enrollmentWindows = (allWindows ?? []).map((w: Record<string, unknown>) => ({
    id: w.id as string,
    name: w.name as string,
    campus_id: w.campus_id as string,
    school_year_id: w.school_year_id as string,
    status: w.status as string,
  }));

  // Converting a recruitment lead (?lead=): seed the form so staff verify
  // instead of re-entering. The lead→application stitch happens automatically
  // on submit (matched by guardian email + campus).
  let initial: Record<string, unknown> | undefined;
  if (searchParams?.lead) {
    const rls = await createServerClient(); // user-scoped: campus RLS applies
    const { data: lead } = await rls
      .from("lead")
      .select("campus_id, first_name, last_name, email, phone, sms_consent, student_first_name, entry_grade, zip, preferred_language")
      .eq("id", searchParams.lead)
      .single();
    if (lead) {
      const gradeMatch = grades.find(
        (g) => g.campus_id === lead.campus_id && g.grade === lead.entry_grade
      );
      initial = {
        campusId: lead.campus_id ?? "",
        gradeLevelId: gradeMatch?.id ?? "",
        firstName: lead.student_first_name ?? "",
        guardianFirstName: lead.first_name ?? "",
        guardianLastName: lead.last_name ?? "",
        guardianEmail: lead.email ?? "",
        guardianPhone: lead.phone ?? "",
        guardianSmsConsent: lead.sms_consent === true,
        guardianPreferredLanguage: lead.preferred_language === "es" ? "Spanish" : "English",
        zip: lead.zip ?? "",
      };
    }
  }

  return (
    <StaffNewApplicationForm
      campuses={campuses}
      gradeLevels={grades}
      enrollmentWindows={enrollmentWindows}
      staffUserId={session.user_id}
      initial={initial}
    />
  );
}
