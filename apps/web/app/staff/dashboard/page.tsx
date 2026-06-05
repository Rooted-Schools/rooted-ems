export const runtime = "edge";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import {
  getStaffDashboardStats,
  getApplicationStats,
  buildPipeline,
  getUpcomingDeadlines,
  getRecentActivity,
} from "@/lib/queries";
import { requireStaffSession, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";

export const dynamic = "force-dynamic";

// Work queue counts (campus-scoped)
async function getWorkQueueCounts(campusIds?: string[]) {
  const supabase = createServiceRoleClient();
  let query = supabase
    .from("application")
    .select("status")
    .in("status", [
      "submitted",
      "needs_info",
      "verified",
      "offered",
      "accepted",
    ]);

  if (campusIds && campusIds.length > 0) {
    query = query.in("campus_id", campusIds);
  }

  const { data } = await query;

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const s = (row as Record<string, string>).status;
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return counts;
}

const FLOW_STAGES = [
  { key: "draft", label: "Draft", color: "bg-rooted-gray-dark/30 text-ink/70" },
  { key: "submitted", label: "Submitted", color: "bg-blue-100 text-blue-700" },
  {
    key: "needs_info",
    label: "Needs Info",
    color: "bg-amber-100 text-amber-700",
  },
  {
    key: "verified",
    label: "Verified",
    color: "bg-green-100 text-green-700",
  },
  {
    key: "lottery_assigned",
    label: "Lottery",
    color: "bg-purple-100 text-purple-700",
  },
  {
    key: "offered",
    label: "Offered",
    color: "bg-indigo-100 text-indigo-700",
  },
  {
    key: "accepted",
    label: "Accepted",
    color: "bg-emerald-100 text-emerald-700",
  },
  {
    key: "registered",
    label: "Registered",
    color: "bg-rooted-green/20 text-rooted-green-dark",
  },
];

const QUEUE_ITEMS = [
  {
    key: "submitted",
    label: "New Submissions",
    dotColor: "bg-blue-500",
    href: "/staff/applications?status=submitted",
  },
  {
    key: "needs_info",
    label: "Missing Info",
    dotColor: "bg-amber-500",
    href: "/staff/applications?status=needs_info",
  },
  {
    key: "verified",
    label: "Verified — Ready",
    dotColor: "bg-orange-500",
    href: "/staff/applications?status=verified",
  },
  {
    key: "offered",
    label: "Pending Response",
    dotColor: "bg-red-500",
    href: "/staff/offers",
  },
  {
    key: "accepted",
    label: "Pending Enrollment",
    dotColor: "bg-purple-500",
    href: "/staff/enrollment",
  },
];

export default async function StaffDashboardPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;

  const supabase = createServiceRoleClient();

  const [stats, appStats, deadlines, recentActivity, queueCounts, { data: currentSY }] =
    await Promise.all([
      getStaffDashboardStats(activeCampus),
      getApplicationStats(activeCampus),
      getUpcomingDeadlines(activeCampus),
      getRecentActivity({ campusId: activeCampus }),
      getWorkQueueCounts(scopedCampusIds),
      supabase.from("school_year").select("name").eq("is_current", true).single(),
    ]);

  const pipeline = buildPipeline(appStats);
  const pipelineTotal = pipeline.reduce((acc, s) => acc + s.count, 0);

  const mergedQueueCounts: Record<string, number> = { ...queueCounts };
  const totalQueueItems = Object.values(mergedQueueCounts).reduce(
    (a, b) => a + b,
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/staff/applications">
            <Button variant="outline" size="sm">
              View Applications
            </Button>
          </Link>
          <Link href="/staff/reports">
            <Button variant="outline" size="sm">
              Reports
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/staff/applications" className="no-underline">
          <Card className="border-t-4 border-t-rooted-green hover:shadow-md transition-shadow h-full cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
                Total Applicants
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.totalApplications}</p>
              <p className="text-xs text-stone mt-1">{currentSY?.name ?? "current cycle"}</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/staff/applications?status=submitted" className="no-underline">
          <Card className="border-t-4 border-t-amber-500 hover:shadow-md transition-shadow h-full cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
                Pending Review
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-amber-600">
                {stats.pendingReview}
              </p>
              <p className="text-xs text-stone mt-1">need attention</p>
            </CardContent>
          </Card>
        </Link>
        <Card className="border-t-4 border-t-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Available Seats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">
              {stats.seatsAvailable}
            </p>
            <Link
              href="/staff/seats"
              className="text-xs text-blue-500 hover:underline"
            >
              Manage seats &rarr;
            </Link>
          </CardContent>
        </Card>
        <Link href="/staff/enrollment" className="no-underline">
          <Card className="border-t-4 border-t-emerald-600 hover:shadow-md transition-shadow h-full cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
                Enrolled
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-rooted-green">
                {stats.enrolled}
              </p>
              <p className="text-xs text-stone mt-1">students registered</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Application Flow Diagram */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Application Flow</CardTitle>
          <CardDescription>
            Student progression through the enrollment pipeline
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2">
            {FLOW_STAGES.map((stage, i) => {
              const count =
                pipeline.find(
                  (p) => p.label.toLowerCase().replace(/\s/g, "_") === stage.key
                )?.count ?? 0;
              const href = stage.key === "draft"
                ? "/staff/applications?status=draft"
                : stage.key === "registered"
                ? "/staff/enrollment"
                : `/staff/applications?status=${stage.key}`;
              return (
                <div key={stage.key} className="flex items-center">
                  <Link href={href} className="no-underline">
                    <div
                      className={`px-3 py-2.5 rounded-lg ${stage.color} min-w-[85px] text-center hover:opacity-80 hover:shadow-sm transition-all cursor-pointer`}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide">
                        {stage.label}
                      </p>
                      <p className="text-lg font-bold">{count}</p>
                    </div>
                  </Link>
                  {i < FLOW_STAGES.length - 1 && (
                    <svg
                      className="w-4 h-4 text-stone/50 shrink-0 mx-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Pipeline + Work Queue + Deadlines Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pipeline bar */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Enrollment Pipeline</CardTitle>
            <CardDescription>Distribution across statuses</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex h-6 rounded-full overflow-hidden bg-rooted-gray">
              {pipeline.map((stage) => (
                <div
                  key={stage.label}
                  className={`${stage.color} transition-all`}
                  style={{
                    width: `${
                      pipelineTotal > 0
                        ? (stage.count / pipelineTotal) * 100
                        : 0
                    }%`,
                  }}
                  title={`${stage.label}: ${stage.count}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {pipeline.map((stage) => (
                <div key={stage.label} className="flex items-center gap-1.5">
                  <div
                    className={`w-2 h-2 rounded-full ${stage.color}`}
                  />
                  <span className="text-[10px] text-ink/60">
                    {stage.label}{" "}
                    <span className="font-semibold">{stage.count}</span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Work Queue Widget */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Staff Inbox & Work Queue
              </CardTitle>
              <Badge variant="default">{totalQueueItems}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {QUEUE_ITEMS.map((item) => {
              const count = mergedQueueCounts[item.key] ?? 0;
              return (
                <Link
                  key={item.key}
                  href={item.href ?? "/staff/applications"}
                  className="flex items-center justify-between py-1.5 no-underline hover:bg-rooted-gray-light -mx-2 px-2 rounded-md transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${item.dotColor}`}
                    />
                    <span className="text-sm text-ink/70">{item.label}</span>
                  </div>
                  <span
                    className={`text-sm font-bold ${
                      count > 0 ? "text-ink" : "text-stone/50"
                    }`}
                  >
                    ({count})
                  </span>
                </Link>
              );
            })}
            <Link
              href="/staff/applications"
              className="block text-center text-xs text-rooted-green hover:underline mt-2 no-underline"
            >
              View All Applications &rarr;
            </Link>
          </CardContent>
        </Card>

        {/* Upcoming Deadlines */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming Deadlines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {deadlines.length === 0 ? (
              <p className="text-sm text-stone text-center py-4">
                No upcoming deadlines
              </p>
            ) : (
              deadlines.map((dl) => (
                <div
                  key={dl.id}
                  className="flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {dl.title}
                    </p>
                    <p className="text-xs text-stone">
                      {dl.campus} &middot; {dl.date}
                    </p>
                  </div>
                  <Badge
                    variant={dl.daysLeft <= 14 ? "warning" : "secondary"}
                    className="shrink-0"
                  >
                    {dl.daysLeft}d
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
          <CardDescription>
            Latest actions across the enrollment system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 pb-3 border-b border-rooted-gray last:border-0 last:pb-0"
              >
                <span className="text-lg mt-0.5" aria-hidden="true">
                  {activity.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink/70">{activity.text}</p>
                  <p className="text-xs text-stone mt-0.5">
                    {activity.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
