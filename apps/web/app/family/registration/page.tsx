export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { redirect } from "next/navigation";
import { RegistrationClient } from "./registration-client";

export default async function FamilyRegistrationPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Find user's household
  const { data: household } = await supabase
    .from("household")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!household) {
    redirect("/family/dashboard");
  }

  // Find active enrollments (with accepted/registered applications)
  const { data: enrollments } = await supabase
    .from("enrollment")
    .select(`
      id, status, enrolled_at, campus_id, school_year_id,
      student:student_id (id, first_name, last_name),
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      school_year:school_year_id (name)
    `)
    .in("status", ["pending", "active"])
    .order("enrolled_at", { ascending: false });

  // Filter enrollments to ones belonging to this household's students
  const { data: householdStudents } = await supabase
    .from("student")
    .select("id")
    .eq("household_id", household.id);

  const studentIds = (householdStudents ?? []).map(
    (s: Record<string, unknown>) => s.id as string
  );

  const familyEnrollments = (enrollments ?? []).filter(
    (e: Record<string, unknown>) => {
      const student = e.student as Record<string, unknown> | null;
      return student && studentIds.includes(student.id as string);
    }
  );

  if (familyEnrollments.length === 0) {
    redirect("/family/dashboard");
  }

  // Fetch registration items and packet requirements for each enrollment
  const enrollmentData = await Promise.all(
    familyEnrollments.map(async (enr: Record<string, unknown>) => {
      const [{ data: items }, { data: packet }] = await Promise.all([
        supabase
          .from("registration_item")
          .select("id, item_type, status, signed_at, verified_at, data")
          .eq("enrollment_id", enr.id as string)
          .order("item_type"),
        supabase
          .from("registration_packet")
          .select("id, status, started_at, submitted_at, verified_at")
          .eq("enrollment_id", enr.id as string)
          .single(),
      ]);

      // Fetch requirements for this campus/year using IDs from the enrollment
      const enrCampusId = enr.campus_id as string;
      const enrSchoolYearId = enr.school_year_id as string;

      let requirements: { item_type: string; name: string; description: string; is_required: boolean; sort_order: number }[] = [];
      if (enrCampusId && enrSchoolYearId) {
        const { data: reqs } = await supabase
          .from("packet_requirement")
          .select("item_type, name, description, is_required, sort_order")
          .eq("campus_id", enrCampusId)
          .eq("school_year_id", enrSchoolYearId)
          .eq("is_active", true)
          .order("sort_order");
        requirements = (reqs ?? []) as { item_type: string; name: string; description: string; is_required: boolean; sort_order: number }[];
      }

      const student = enr.student as Record<string, string> | null;
      const grade = enr.grade_level as Record<string, string> | null;
      const campus = enr.campus as Record<string, string> | null;
      const schoolYear = enr.school_year as Record<string, string> | null;

      return {
        enrollment_id: enr.id as string,
        student_name: student
          ? `${student.first_name} ${student.last_name}`
          : "Unknown",
        campus_name: campus?.name ?? "",
        grade: grade?.grade ?? "",
        school_year: schoolYear?.name ?? "",
        enrollment_status: enr.status as string,
        packet: packet ?? null,
        items: items ?? [],
        requirements,
      };
    })
  );

  return <RegistrationClient enrollments={enrollmentData} />;
}
