export const runtime = "edge";
export const dynamic = "force-dynamic";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth/get-session";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { ReenrollmentActions } from "./reenrollment-actions-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReenrollmentOffer {
  applicationId: string;
  studentName: string;
  campusName: string;
  grade: string;
  schoolYearName: string;
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function getPendingReenrollmentOffers(
  userId: string
): Promise<ReenrollmentOffer[]> {
  const supabase = createServiceRoleClient();

  // Resolve guardian IDs for this user (matches pattern in getFamilyApplications)
  const { data: guardians } = await supabase
    .from("guardian")
    .select("id")
    .eq("user_id", userId);

  if (!guardians || guardians.length === 0) return [];

  const guardianIds = (guardians as Array<{ id: string }>).map((g) => g.id);

  // Find offered applications that originated from a re-enrollment (source = 'reenrollment')
  const { data, error } = await supabase
    .from("application")
    .select(
      `
      id,
      campus_id,
      grade_level_id,
      status,
      student:student_id (first_name, last_name),
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      enrollment_window:enrollment_window_id (school_year:school_year_id (name))
    `
    )
    .in("guardian_id", guardianIds)
    .eq("status", "offered")
    .eq("source", "reenrollment")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[getPendingReenrollmentOffers]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const student = row.student as Record<string, string> | null;
    const campus = row.campus as Record<string, string> | null;
    const gradeLevel = row.grade_level as Record<string, string> | null;
    const enrollmentWindow = row.enrollment_window as Record<string, unknown> | null;
    const schoolYear = enrollmentWindow?.school_year as Record<string, string> | null;

    return {
      applicationId: row.id as string,
      studentName: student
        ? `${student.first_name} ${student.last_name}`
        : "Unknown Student",
      campusName: campus?.name ?? "Unknown School",
      grade: gradeLevel?.grade ?? "",
      schoolYearName: schoolYear?.name ?? "",
    };
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function FamilyReenrollmentPage() {
  const session = await requireSession();
  const offers = await getPendingReenrollmentOffers(session.user_id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Re-enrollment Offers</h1>
        <p className="text-sm text-stone mt-1">
          Review and respond to re-enrollment offers for the upcoming school year.
        </p>
      </div>

      {offers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-stone">
              You have no pending re-enrollment offers at this time.
            </p>
            <p className="text-xs text-stone/70 mt-2">
              If you believe you should see an offer here, please contact your
              school's enrollment office.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {offers.map((offer) => (
            <Card key={offer.applicationId}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {offer.studentName}
                    </CardTitle>
                    <CardDescription>
                      {offer.campusName} &middot; Grade {offer.grade}{" "}
                      &middot; {offer.schoolYearName}
                    </CardDescription>
                  </div>
                  <Badge className="bg-rooted-green/10 text-rooted-green border-rooted-green/30">
                    Offer Pending
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-stone mb-4">
                  Your school has reserved a seat for{" "}
                  <span className="font-medium text-ink">
                    {offer.studentName}
                  </span>{" "}
                  in Grade {offer.grade} for the {offer.schoolYearName} school
                  year. Accept to secure their spot or decline if you will not
                  be returning.
                </p>
                <ReenrollmentActions applicationId={offer.applicationId} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
