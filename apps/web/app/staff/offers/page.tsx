export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { getStaffOffers, getStaffWaitlist, getAdoptedPolicyForCampus } from "@/lib/queries";
import { OffersClient } from "./offers-client";
import { requireMinRole, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";
import { getCampusLensId } from "@/lib/campus-lens";
import { SectionTabs } from "@/components/layout/section-tabs";
import { SEATS_LOTTERY_TABS } from "@/lib/section-tabs";

export default async function StaffOffersPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireMinRole("enrollment_manager");
  const accessibleIds = getAccessibleCampusIds(session);
  const lensCampusId = await getCampusLensId(accessibleIds);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus, lensCampusId);
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;

  const supabase = createServiceRoleClient();

  // Build eligible applicants query with optional campus scope
  let eligibleQuery = supabase
    .from("application")
    .select(`
      id, status,
      student:student_id (first_name, last_name),
      campus:campus_id (id, name),
      grade_level:grade_level_id (id, grade),
      enrollment_window:enrollment_window_id (school_year_id)
    `)
    .in("status", ["verified", "lottery_assigned"])
    .order("submitted_at", { ascending: true });

  // Only apply campus filter if user has restricted access
  if (scopedCampusIds.length > 0) {
    eligibleQuery = eligibleQuery.in("campus_id", scopedCampusIds);
  } else if (accessibleIds.length > 0) {
    eligibleQuery = eligibleQuery.in("campus_id", accessibleIds);
  }
  // If both are empty, user is system admin — no filter needed (show all campuses)

  // Fetch offers, waitlist, and eligible applicants in parallel
  const [{ offers, stats }, waitlistData, { data: eligibleApps }] = await Promise.all([
    getStaffOffers(scopedCampusIds),
    getStaffWaitlist(scopedCampusIds),
    eligibleQuery,
  ]);

  // Transform eligible applicants for the create offer dialog
  const eligibleApplicants = (eligibleApps ?? []).map((app: Record<string, unknown>) => {
    const student = app.student as Record<string, string> | null;
    const campus = app.campus as Record<string, string> | null;
    const grade = app.grade_level as Record<string, string> | null;
    const window = app.enrollment_window as Record<string, string> | null;
    return {
      application_id: app.id as string,
      student_name: student ? `${student.first_name} ${student.last_name}` : "Unknown",
      campus_id: campus?.id ?? "",
      campus_name: campus?.name ?? "",
      grade_level_id: grade?.id ?? "",
      grade: grade?.grade ?? "",
      status: app.status as string,
      school_year_id: window?.school_year_id ?? "",
    };
  });

  // Response windows come from the campus's adopted lottery policy where there
  // is one, so the dialog opens on the number the board actually set rather
  // than on a default someone typed once. Only resolvable when a single campus
  // is in view — with several campuses in scope, their policies may differ and
  // a single number would be a guess.
  let policyAcceptanceDays: number | null = null;
  let policyWaitlistDays: number | null = null;
  if (activeCampus) {
    const adopted = await getAdoptedPolicyForCampus(activeCampus);
    if (adopted) {
      policyAcceptanceDays = adopted.config.acceptanceWindowDays;
      policyWaitlistDays = adopted.config.waitlistOfferWindow.days;
    }
  }

  return (
    <div className="space-y-6">
      <SectionTabs
        tabs={SEATS_LOTTERY_TABS}
        activeHref="/staff/offers"
        campusParam={searchParams?.campus}
      />
      <OffersClient
        offers={offers}
        stats={stats}
        staffUserId={session.user_id}
        eligibleApplicants={eligibleApplicants}
        waitlistEntries={waitlistData.entries}
        waitlistCampusCounts={waitlistData.campusCounts}
        policyAcceptanceDays={policyAcceptanceDays}
        policyWaitlistDays={policyWaitlistDays}
      />
    </div>
  );
}
