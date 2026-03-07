export const runtime = "edge";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { createServerClient } from "@rooted-ems/database/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getStaffLotteryRuns, getCampuses } from "@/lib/queries";
import { requireStaffSession, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";
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
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;

  // Fetch lottery runs + data for the creation dialog
  const supabase = await createServerClient();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lottery</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure and run enrollment lotteries when demand exceeds capacity.
          </p>
        </div>
        <NewLotteryRunDialog
          campuses={dialogCampuses}
          gradeLevels={gradeLevels}
          windows={enrollmentWindows}
        />
      </div>

      {runs.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon="🎲"
              title="No lottery runs yet"
              description="Create a lottery run when you have more applicants than available seats for a grade level."
            >
              <NewLotteryRunDialog
                campuses={dialogCampuses}
                gradeLevels={gradeLevels}
                windows={enrollmentWindows}
              />
            </EmptyState>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {runs.map((run) => {
            const s = statusVariants[run.status] ?? statusVariants.draft;
            const overSubscribed = run.total_applicants > run.total_seats;

            return (
              <Link key={run.id} href={`/staff/lottery/${run.id}`}>
                <Card className="hover:border-gray-300 transition-colors cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{run.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {run.campus_name} · {run.grade}
                        </CardDescription>
                      </div>
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-6 text-sm">
                      <div>
                        <span className="text-gray-500">Applicants:</span>{" "}
                        <span className="font-medium">{run.total_applicants}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Seats:</span>{" "}
                        <span className="font-medium">{run.total_seats}</span>
                      </div>
                      {overSubscribed && (
                        <Badge variant="warning">
                          {run.total_applicants - run.total_seats} over capacity
                        </Badge>
                      )}
                      <div className="ml-auto text-gray-400 text-xs">
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
