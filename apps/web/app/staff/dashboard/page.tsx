import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  getStaffDashboardStats,
  getApplicationStats,
  buildPipeline,
  getUpcomingDeadlines,
  getRecentActivity,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function StaffDashboardPage() {
  const [stats, appStats, deadlines, recentActivity] = await Promise.all([
    getStaffDashboardStats(),
    getApplicationStats(),
    getUpcomingDeadlines(),
    getRecentActivity(),
  ]);

  const pipeline = buildPipeline(appStats);
  const pipelineTotal = pipeline.reduce((acc, s) => acc + s.count, 0);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/staff/applications">
            <Button variant="outline" size="sm">View Applications</Button>
          </Link>
          <Link href="/staff/reports">
            <Button variant="outline" size="sm">Reports</Button>
          </Link>
        </div>
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Total Applications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.totalApplications}</p>
            <p className="text-xs text-gray-400 mt-1">2026-27 cycle</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Pending Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">
              {stats.pendingReview}
            </p>
            <p className="text-xs text-gray-400 mt-1">need attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Seats Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">
              {stats.seatsAvailable}
            </p>
            <p className="text-xs text-gray-400 mt-1">across all campuses</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Enrolled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-rooted-green">
              {stats.enrolled}
            </p>
            <p className="text-xs text-gray-400 mt-1">students registered</p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Pipeline bar + Activity ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pipeline */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Enrollment Pipeline</CardTitle>
            <CardDescription>
              Application distribution across all statuses
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stacked bar */}
            <div className="flex h-6 rounded-full overflow-hidden bg-gray-100">
              {pipeline.map((stage) => (
                <div
                  key={stage.label}
                  className={`${stage.color} transition-all`}
                  style={{
                    width: `${(stage.count / pipelineTotal) * 100}%`,
                  }}
                  title={`${stage.label}: ${stage.count}`}
                />
              ))}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {pipeline.map((stage) => (
                <div key={stage.label} className="flex items-center gap-1.5">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${stage.color}`}
                  />
                  <span className="text-xs text-gray-600">
                    {stage.label}{" "}
                    <span className="font-semibold">{stage.count}</span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Deadlines */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming Deadlines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {deadlines.map((dl) => (
              <div
                key={dl.id}
                className="flex items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {dl.title}
                  </p>
                  <p className="text-xs text-gray-500">
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
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ─── Recent Activity ─── */}
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
                className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0"
              >
                <span className="text-lg mt-0.5" aria-hidden="true">
                  {activity.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-700">{activity.text}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
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
