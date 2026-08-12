export const runtime = "edge";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTicket } from "@/components/ui/icons";
import {
  getStaffLotteryRuns,
  getCampuses,
  getAdoptedPolicyForCampus,
  getRunGovernanceBatch,
} from "@/lib/queries";
import { requireMinRole, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";
import { SectionTabs } from "@/components/layout/section-tabs";
import { SEATS_LOTTERY_TABS } from "@/lib/section-tabs";
import { NewLotteryRunDialog } from "./new-lottery-dialog";

const statusVariants: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" }> = {
  draft: { label: "Draft", variant: "secondary" },
  preview: { label: "Preview", variant: "warning" },
  official: { label: "Official", variant: "success" },
  archived: { label: "Archived", variant: "default" },
};

export default async function StaffLotteryPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireMinRole("enrollment_manager");
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;

  // Fetch lottery runs + data for the creation dialog
  const supabase = createServiceRoleClient();
  const [runs, campuses] = await Promise.all([
    getStaffLotteryRuns(scopedCampusIds),
    getCampuses(),
  ]);

  // Fetch grade levels and enrollment windows for accessible campuses
  const [{ data: gradeLevelsRaw }, { data: windowsRaw }] = await Promise.all([
    supabase
      .from("grade_level")
      .select("id, grade, campus_id")
      .in("campus_id", accessibleIds.length > 0 ? accessibleIds : ["__none__"])
      .order("grade"),
    supabase
      .from("enrollment_window")
      .select("id, name, campus_id")
      .in("campus_id", accessibleIds.length > 0 ? accessibleIds : ["__none__"])
      .eq("status", "open")
      .order("open_date", { ascending: false }),
  ]);

  const gradeLevels = (gradeLevelsRaw ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    grade: row.grade as string,
    campus_id: row.campus_id as string,
  }));

  const enrollmentWindows = (windowsRaw ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    campus_id: row.campus_id as string,
  }));

  const dialogCampuses = campuses.map((c) => ({ id: c.id, name: c.name }));

  // Governing policy per campus, so the creation dialog can state which rules
  // a new run will bind to before it is created — or say plainly that there
  // are none.
  const policyLabels = await Promise.all(
    dialogCampuses.map(async (c) => {
      const adopted = await getAdoptedPolicyForCampus(c.id);
      return {
        campus_id: c.id,
        label: adopted
          ? `${adopted.row.name} v${adopted.row.version}${
              adopted.row.adopted_date ? ` (adopted ${adopted.row.adopted_date})` : ""
            }`
          : null,
      };
    })
  );

  const governanceByRun = await getRunGovernanceBatch(runs.map((r) => r.id));

  return (
    <div className="space-y-6">
      <SectionTabs
        tabs={SEATS_LOTTERY_TABS}
        activeHref="/staff/lottery"
        campusParam={searchParams?.campus}
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Lottery</h1>
          <p className="text-sm text-stone mt-1">
            Configure and run enrollment lotteries when demand exceeds capacity.
          </p>
        </div>
        <NewLotteryRunDialog
          campuses={dialogCampuses}
          gradeLevels={gradeLevels}
          windows={enrollmentWindows}
          policyLabels={policyLabels}
        />
      </div>

      {policyLabels.some((p) => p.label === null) && (
        <div className="rounded-[6px] border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn-text">
          {policyLabels.filter((p) => p.label === null).length === policyLabels.length
            ? "No campus you can see has an adopted lottery policy. Official lotteries require one; see the Policy tab."
            : `${policyLabels.filter((p) => p.label === null).length} of these campuses have no adopted lottery policy. Official lotteries there are blocked until a board-adopted policy is in place; see the Policy tab.`}
        </div>
      )}

      {runs.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<IconTicket size={40} />}
              title="No lottery runs yet"
              description="Create a lottery run when you have more applicants than available seats for a grade level."
            >
              <NewLotteryRunDialog
                campuses={dialogCampuses}
                gradeLevels={gradeLevels}
                windows={enrollmentWindows}
                policyLabels={policyLabels}
              />
            </EmptyState>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {runs.map((run) => {
            const s = statusVariants[run.status] ?? statusVariants.draft;
            const overSubscribed = run.total_applicants > run.total_seats;
            const governance = governanceByRun.get(run.id);

            return (
              <Link key={run.id} href={`/staff/lottery/${run.id}`}>
                <Card className="hover:border-stone/30 transition-colors cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{run.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {run.campus_name} · {run.grade}
                        </CardDescription>
                        <p className="mt-1 text-xs text-stone">
                          {governance?.policyLabel
                            ? `Governed by: ${governance.policyLabel}`
                            : "No adopted policy"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {governance?.isRehearsal && (
                          <Badge variant="warning">Test rehearsal</Badge>
                        )}
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-6 text-sm">
                      <div>
                        <span className="text-stone">Applicants:</span>{" "}
                        <span className="font-medium">{run.total_applicants}</span>
                      </div>
                      <div>
                        <span className="text-stone">Seats:</span>{" "}
                        <span className="font-medium">{run.total_seats}</span>
                      </div>
                      {overSubscribed && (
                        <Badge variant="warning">
                          {run.total_applicants - run.total_seats} over capacity
                        </Badge>
                      )}
                      <div className="ml-auto text-stone text-xs">
                        Created {run.created_at}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
