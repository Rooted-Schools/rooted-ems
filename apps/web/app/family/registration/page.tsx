export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import { redirect } from "next/navigation";
import { RegistrationClient } from "./registration-client";

export default async function FamilyRegistrationPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = createServiceRoleClient();

  // Find guardian records for this user
  const { data: guardians } = await db
    .from("guardian")
    .select("id")
    .eq("user_id", user.id);

  if (!guardians || guardians.length === 0) {
    return <RegistrationClient enrollments={[]} />;
  }

  const guardianIds = guardians.map((g: Record<string, string>) => g.id);

  // Find accepted/registered applications for this family
  const { data: acceptedApps } = await db
    .from("application")
    .select(`
      id, status, campus_id, grade_level_id,
      student:student_id (id, first_name, last_name),
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      enrollment_window:enrollment_window_id (school_year_id, school_year:school_year_id (name))
    `)
    .in("guardian_id", guardianIds)
    .in("status", ["accepted", "registered"])
    .order("updated_at", { ascending: false });

  if (!acceptedApps || acceptedApps.length === 0) {
    return <RegistrationClient enrollments={[]} />;
  }

  // For each accepted application, find or create an enrollment record
  const enrollmentData = await Promise.all(
    acceptedApps.map(async (app: Record<string, unknown>) => {
      const student = app.student as Record<string, string> | null;
      const campus = app.campus as Record<string, string> | null;
      const grade = app.grade_level as Record<string, string> | null;
      const enrollmentWindow = app.enrollment_window as Record<string, unknown> | null;
      const schoolYear = enrollmentWindow?.school_year as Record<string, string> | null;
      const schoolYearId = (enrollmentWindow?.school_year_id as string) ?? "";

      // Look for an existing enrollment for this application
      let enrollmentId: string | null = null;
      const { data: existingEnrollment } = await db
        .from("enrollment")
        .select("id, status")
        .eq("application_id", app.id as string)
        .maybeSingle();

      if (existingEnrollment) {
        enrollmentId = existingEnrollment.id;
      } else if (student?.id && schoolYearId) {
        // Create enrollment record on the fly for accepted apps without one
        const { data: newEnrollment } = await db
          .from("enrollment")
          .insert({
            student_id: student.id,
            campus_id: app.campus_id as string,
            grade_level_id: app.grade_level_id as string,
            school_year_id: schoolYearId,
            application_id: app.id as string,
            status: "pending",
            enrolled_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (newEnrollment) {
          enrollmentId = newEnrollment.id;
          // Initialize registration packet
          await db.from("registration_packet").insert({
            enrollment_id: enrollmentId,
            campus_id: app.campus_id as string,
            school_year_id: schoolYearId,
            status: "not_started",
          });
        }
      }

      // Fetch packet and items if we have an enrollment
      let packet = null;
      let items: unknown[] = [];
      let requirements: { item_type: string; name: string; description: string; is_required: boolean; sort_order: number }[] = [];

      if (enrollmentId) {
        const [{ data: packetData }, { data: itemData }] = await Promise.all([
          db
            .from("registration_packet")
            .select("id, status, started_at, submitted_at, verified_at")
            .eq("enrollment_id", enrollmentId)
            .maybeSingle(),
          db
            .from("registration_item")
            .select("id, item_type, status, signed_at, verified_at, data")
            .eq("enrollment_id", enrollmentId)
            .order("item_type"),
        ]);
        packet = packetData ?? null;
        items = itemData ?? [];

        if (schoolYearId && app.campus_id) {
          const { data: reqs } = await db
            .from("packet_requirement")
            .select("item_type, name, description, is_required, sort_order")
            .eq("campus_id", app.campus_id as string)
            .eq("school_year_id", schoolYearId)
            .eq("is_active", true)
            .order("sort_order");
          requirements = (reqs ?? []) as typeof requirements;
        }
      }

      return {
        enrollment_id: enrollmentId ?? (app.id as string),
        student_name: student ? `${student.first_name} ${student.last_name}` : "Unknown",
        campus_name: campus?.name ?? "",
        grade: grade?.grade ?? "",
        school_year: schoolYear?.name ?? "",
        enrollment_status: existingEnrollment?.status ?? "pending",
        packet,
        items,
        requirements,
      };
    })
  );

  return <RegistrationClient enrollments={enrollmentData} />;
}
