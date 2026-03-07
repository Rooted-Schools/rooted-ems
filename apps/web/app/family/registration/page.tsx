export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { requireSession } from "@/lib/auth/get-session";
import { redirect } from "next/navigation";
import { RegistrationClient } from "./registration-client";

export default async function FamilyRegistrationPage() {
  const session = await requireSession();
  const supabase = await createServerClient();

  // Find user's household
  const { data: household } = await supabase
    .from("household")
    .select("id")
    .eq("user_id", session.user_id)
    .single();

  if (!household) {
    redirect("/family/dashboard");
  }

  // Find active enrollments (with accepted/registered applications)
  const { data: enrollments } = await supabase
    .from("enrollment")
    .select(`
      id, status, enrolled_at,
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

      // Fetch requirements for this campus/year
      const campus = enr.campus as Record<string, unknown> | null;
      const schoolYear = enr.school_year as Record<string, unknown> | null;

      let requirements: { item_type: string; name: string; description: string; is_required: boolean; sort_order: number }[] = [];
      if (campus) {
        // Get campus_id from enrollment
        const { data: campusData } = await supabase
          .from("enrollment")
          .select("campus_id, school_year_id")
          .eq("id", enr.id as string)
          .single();

        if (campusData) {
          const { data: reqs } = await supabase
            .from("packet_requirement")
            .select("item_type, name, description, is_required, sort_order")
            .eq("campus_id", campusData.campus_id)
            .eq("school_year_id", campusData.school_year_id)
            .eq("is_active", true)
            .order("sort_order");
          requirements = (reqs ?? []) as { item_type: string; name: string; description: string; is_required: boolean; sort_order: number }[];
        }
      }

      const student = enr.student as Record<string, string> | null;
      const grade = enr.grade_level as Record<string, string> | null;

      return {
        enrollment_id: enr.id as string,
        student_name: student
          ? `${student.first_name} ${student.last_name}`
          : "Unknown",
        campus_name: (campus as Record<string, string> | null)?.name ?? "",
        grade: grade?.grade ?? "",
        school_year: (schoolYear as Record<string, string> | null)?.name ?? "",
        enrollment_status: enr.status as string,
        packet: packet ?? null,
        items: items ?? [],
        requirements,
      };
    })
  );

  return <RegistrationClient enrollments={enrollmentData} />;
}
