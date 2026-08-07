export const runtime = "edge";
export const dynamic = "force-dynamic";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth/get-session";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { ReenrollmentActions } from "./reenrollment-actions-client";
import { ReenrollmentIntentPulse } from "./reenrollment-intent-client";
import { getFamilyReenrollmentPulseCandidates } from "@/lib/queries/reenrollment";
import { getLocale } from "@/lib/i18n/get-locale";
import { tx } from "@/lib/i18n/translations";

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
  const locale = await getLocale();
  const t = (key: Parameters<typeof tx>[0]) => tx(key, locale);

  const [offers, pulseCandidates] = await Promise.all([
    getPendingReenrollmentOffers(session.user_id),
    getFamilyReenrollmentPulseCandidates(session.user_id),
  ]);

  const hasNothing = offers.length === 0 && pulseCandidates.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("reenroll.heading")}</h1>
        <p className="text-sm text-stone-text mt-1">{t("reenroll.subtitle")}</p>
      </div>

      {hasNothing && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-stone-text">{t("reenroll.noOffers")}</p>
            <p className="text-xs text-stone-text/70 mt-2">{t("reenroll.contactOffice")}</p>
          </CardContent>
        </Card>
      )}

      {pulseCandidates.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-ink">
              {t("reenroll.pulseSectionHeading")}
            </h2>
            <p className="text-sm text-stone-text">{t("reenroll.pulseSectionSubtitle")}</p>
          </div>
          <div className="space-y-4">
            {pulseCandidates.map((candidate) => (
              <ReenrollmentIntentPulse
                key={candidate.enrollmentId}
                enrollmentId={candidate.enrollmentId}
                studentName={candidate.studentName}
                campusName={candidate.campusName}
                grade={candidate.grade}
                schoolYearName={candidate.schoolYearName}
                initialIntent={candidate.intent}
              />
            ))}
          </div>
        </div>
      )}

      {offers.length > 0 && (
        <div className="space-y-4">
          {pulseCandidates.length > 0 && (
            <h2 className="text-base font-semibold text-ink">{t("reenroll.heading")}</h2>
          )}
          {offers.map((offer) => (
            <Card key={offer.applicationId}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {offer.studentName}
                    </CardTitle>
                    <CardDescription>
                      {offer.campusName} &middot; {t("offers.grade")} {offer.grade}{" "}
                      &middot; {offer.schoolYearName}
                    </CardDescription>
                  </div>
                  <Badge className="bg-rooted-green/10 text-rooted-green border-rooted-green/30">
                    {t("reenroll.offerBadge")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-stone-text mb-4">
                  {t("reenroll.offerBody")
                    .replace("{student}", offer.studentName)
                    .replace("{grade}", offer.grade)
                    .replace("{year}", offer.schoolYearName)}
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
