export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireMinRole, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";

interface DemographicRow {
  group: string;
  applied: number;
  verified: number;
  offered: number;
  registered: number;
  yield_pct: number;
}

interface FunnelStage {
  label: string;
  count: number;
  color: string;
}

export default async function EquityDashboardPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireMinRole("enrollment_manager");
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;
  const supabase = await createServerClient();

  // Fetch all applications with student demographics (campus-scoped)
  let appQuery = supabase
    .from("application")
    .select(
      `
      id, status,
      student:student_id (race_ethnicity, primary_language, gender),
      campus:campus_id (name)
    `
    )
    .neq("status", "draft");

  if (scopedCampusIds.length > 0) {
    appQuery = appQuery.in("campus_id", scopedCampusIds);
  }

  const { data: apps } = await appQuery;

  const allApps = (apps ?? []) as Array<Record<string, unknown>>;

  // Compute KPIs
  const totalApplicants = allApps.length;
  const totalOffered = allApps.filter(
    (a) => ["offered", "accepted", "registered"].includes(a.status as string)
  ).length;
  const totalRegistered = allApps.filter(
    (a) => a.status === "registered"
  ).length;
  const waitlistDepth = allApps.filter(
    (a) => a.status === "waitlisted"
  ).length;

  // Build demographic breakdown
  const demographicCounts: Record<string, { applied: number; verified: number; offered: number; registered: number }> = {};

  for (const app of allApps) {
    const student = app.student as Record<string, unknown> | null;
    const ethnicities = (student?.race_ethnicity as string[]) ?? ["Unknown"];

    for (const eth of ethnicities) {
      if (!demographicCounts[eth]) {
        demographicCounts[eth] = { applied: 0, verified: 0, offered: 0, registered: 0 };
      }
      demographicCounts[eth].applied++;
      if (["verified", "lottery_assigned", "offered", "accepted", "registered"].includes(app.status as string)) {
        demographicCounts[eth].verified++;
      }
      if (["offered", "accepted", "registered"].includes(app.status as string)) {
        demographicCounts[eth].offered++;
      }
      if (app.status === "registered") {
        demographicCounts[eth].registered++;
      }
    }
  }

  const demographics: DemographicRow[] = Object.entries(demographicCounts)
    .map(([group, counts]) => ({
      group,
      ...counts,
      yield_pct: counts.offered > 0 ? Math.round((counts.registered / counts.offered) * 100) : 0,
    }))
    .sort((a, b) => b.applied - a.applied);

  // Build enrollment funnel
  const statusCounts: Record<string, number> = {};
  for (const app of allApps) {
    const s = app.status as string;
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  const funnelStages: FunnelStage[] = [
    { label: "Submitted", count: statusCounts["submitted"] ?? 0, color: "bg-blue-400" },
    { label: "Needs Info", count: statusCounts["needs_info"] ?? 0, color: "bg-amber-400" },
    { label: "Verified", count: statusCounts["verified"] ?? 0, color: "bg-green-400" },
    { label: "Offered", count: statusCounts["offered"] ?? 0, color: "bg-rooted-green" },
    { label: "Accepted", count: statusCounts["accepted"] ?? 0, color: "bg-emerald-600" },
    { label: "Registered", count: statusCounts["registered"] ?? 0, color: "bg-rooted-green-dark" },
  ];

  const maxFunnel = Math.max(...funnelStages.map((s) => s.count), 1);

  // Language diversity
  const langCounts: Record<string, number> = {};
  for (const app of allApps) {
    const student = app.student as Record<string, unknown> | null;
    const lang = (student?.primary_language as string) ?? "Unknown";
    langCounts[lang] = (langCounts[lang] ?? 0) + 1;
  }
  const languages = Object.entries(langCounts)
    .map(([lang, count]) => ({ lang, count, pct: Math.round((count / totalApplicants) * 100) || 0 }))
    .sort((a, b) => b.count - a.count);

  // Equity alerts
  const alerts: Array<{ level: "warning" | "info"; message: string }> = [];
  for (const demo of demographics) {
    if (demo.offered > 0 && demo.yield_pct < 75) {
      alerts.push({
        level: "warning",
        message: `${demo.group}: Offer yield is ${demo.yield_pct}% (below 75% target)`,
      });
    }
  }
  if (totalApplicants > 0 && totalOffered / totalApplicants < 0.3) {
    alerts.push({
      level: "info",
      message: `Overall offer rate is ${Math.round((totalOffered / totalApplicants) * 100)}% — consider expanding capacity`,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Equity Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Demographic analysis and equity metrics across the enrollment funnel
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-t-4 border-t-rooted-green">
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Total Applicants
            </p>
            <p className="text-3xl font-bold mt-1">{totalApplicants}</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-blue-500">
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Total Offers
            </p>
            <p className="text-3xl font-bold mt-1">{totalOffered}</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-amber-500">
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Waitlist Depth
            </p>
            <p className="text-3xl font-bold mt-1">{waitlistDepth}</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-emerald-600">
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Registered
            </p>
            <p className="text-3xl font-bold mt-1">{totalRegistered}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enrollment Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Enrollment Funnel
            </CardTitle>
            <CardDescription>Application distribution by stage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {funnelStages.map((stage) => (
              <div key={stage.label} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-20 text-right shrink-0">
                  {stage.label}
                </span>
                <div className="flex-1 h-7 bg-gray-100 rounded-md overflow-hidden relative">
                  <div
                    className={`h-full ${stage.color} rounded-md transition-all`}
                    style={{
                      width: `${(stage.count / maxFunnel) * 100}%`,
                      minWidth: stage.count > 0 ? "24px" : "0",
                    }}
                  />
                  {stage.count > 0 && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-600">
                      {stage.count}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Demographic Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Demographic Breakdown
            </CardTitle>
            <CardDescription>
              Applicant Pool vs. Enrolled Cohort
            </CardDescription>
          </CardHeader>
          <CardContent>
            {demographics.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                No demographic data available
              </p>
            ) : (
              <div className="space-y-2">
                {demographics.map((d) => {
                  const appliedPct = totalApplicants > 0 ? Math.round((d.applied / totalApplicants) * 100) : 0;
                  return (
                    <div
                      key={d.group}
                      className="flex items-center justify-between py-1.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-3 h-3 rounded-full bg-rooted-green shrink-0" />
                        <span className="text-sm text-gray-700 truncate">
                          {d.group}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <span className="text-xs text-gray-500 w-12 text-right">
                          {appliedPct}%
                        </span>
                        <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-rooted-green rounded-full"
                            style={{ width: `${appliedPct}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-900 w-6 text-right">
                          {d.applied}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Funnel Analysis by Demographic
            </CardTitle>
            <CardDescription>
              Track yield through each pipeline stage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 text-xs font-medium text-gray-500">
                      Demographic
                    </th>
                    <th className="text-right py-2 text-xs font-medium text-gray-500">
                      Applied
                    </th>
                    <th className="text-right py-2 text-xs font-medium text-gray-500">
                      Verified
                    </th>
                    <th className="text-right py-2 text-xs font-medium text-gray-500">
                      Offered
                    </th>
                    <th className="text-right py-2 text-xs font-medium text-gray-500">
                      Registered
                    </th>
                    <th className="text-right py-2 text-xs font-medium text-gray-500">
                      Yield
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {demographics.map((d) => (
                    <tr
                      key={d.group}
                      className="border-b border-gray-100 last:border-0"
                    >
                      <td className="py-2 font-medium text-gray-900">
                        {d.group}
                      </td>
                      <td className="py-2 text-right text-gray-600">
                        {d.applied}
                      </td>
                      <td className="py-2 text-right text-gray-600">
                        {d.verified}
                      </td>
                      <td className="py-2 text-right text-gray-600">
                        {d.offered}
                      </td>
                      <td className="py-2 text-right text-gray-600">
                        {d.registered}
                      </td>
                      <td className="py-2 text-right">
                        <Badge
                          variant={
                            d.yield_pct >= 85
                              ? "success"
                              : d.yield_pct >= 70
                              ? "warning"
                              : d.yield_pct > 0
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {d.yield_pct > 0 ? `${d.yield_pct}%` : "—"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Equity Gaps & Alerts + Language Diversity */}
        <div className="space-y-6">
          {/* Equity Alerts */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Equity Gaps & Alerts
              </CardTitle>
              <CardDescription>
                Prioritized warnings to improve enrollment equity
              </CardDescription>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-rooted-green">
                  <span>✅</span>
                  <span>No equity alerts — funnel is balanced</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 p-3 rounded-lg ${
                        alert.level === "warning"
                          ? "bg-amber-50 border border-amber-200"
                          : "bg-blue-50 border border-blue-200"
                      }`}
                    >
                      <span className="text-sm mt-0.5">
                        {alert.level === "warning" ? "⚠️" : "ℹ️"}
                      </span>
                      <p
                        className={`text-sm ${
                          alert.level === "warning"
                            ? "text-amber-800"
                            : "text-blue-800"
                        }`}
                      >
                        {alert.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Language Diversity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Language Diversity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {languages.map((l) => (
                  <div
                    key={l.lang}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-gray-700">{l.lang}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-rooted-green rounded-full"
                          style={{ width: `${l.pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-500 w-10 text-right">
                        {l.count} ({l.pct}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
