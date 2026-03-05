import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const dynamic = "force-dynamic";

/* ─── Mock summary numbers ─── */
const STATS = {
  totalApplications: 47,
  pendingReview: 12,
  seatsAvailable: 38,
  enrolled: 22,
};

/* ─── Recent activity feed ─── */
const RECENT_ACTIVITY = [
  {
    id: "act-1",
    text: "Marcus Johnson submitted an application for 9th Grade — Vancouver WA",
    time: "2 hours ago",
    icon: "📝",
  },
  {
    id: "act-2",
    text: "Jaylen Williams application flagged as Needs Info — missing immunization records",
    time: "4 hours ago",
    icon: "⚠️",
  },
  {
    id: "act-3",
    text: "Sofia Ramirez application verified and moved to lottery pool",
    time: "1 day ago",
    icon: "✅",
  },
  {
    id: "act-4",
    text: "Devon Thompson accepted offer for 11th Grade — Columbia SC",
    time: "1 day ago",
    icon: "🎉",
  },
  {
    id: "act-5",
    text: "2026-27 Open Enrollment window opened for Vancouver WA",
    time: "3 days ago",
    icon: "📅",
  },
];

/* ─── Pipeline snapshot ─── */
const PIPELINE = [
  { label: "Draft", count: 4, color: "bg-gray-200" },
  { label: "Submitted", count: 12, color: "bg-blue-400" },
  { label: "Needs Info", count: 5, color: "bg-amber-400" },
  { label: "Verified", count: 8, color: "bg-emerald-400" },
  { label: "Offered", count: 6, color: "bg-green-500" },
  { label: "Accepted", count: 4, color: "bg-green-600" },
  { label: "Waitlisted", count: 3, color: "bg-yellow-500" },
  { label: "Registered", count: 5, color: "bg-rooted-green" },
];

const PIPELINE_TOTAL = PIPELINE.reduce((acc, s) => acc + s.count, 0);

/* ─── Upcoming deadlines ─── */
const DEADLINES = [
  {
    id: "dl-1",
    title: "2026-27 Open Enrollment Closes",
    date: "Mar 31, 2026",
    campus: "Vancouver WA",
    daysLeft: 27,
  },
  {
    id: "dl-2",
    title: "Lottery Run — 6th Grade",
    date: "Apr 5, 2026",
    campus: "Columbia SC",
    daysLeft: 32,
  },
  {
    id: "dl-3",
    title: "Offer Response Deadline",
    date: "Apr 15, 2026",
    campus: "All Campuses",
    daysLeft: 42,
  },
];

export default function StaffDashboardPage() {
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
            <p className="text-3xl font-bold">{STATS.totalApplications}</p>
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
              {STATS.pendingReview}
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
              {STATS.seatsAvailable}
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
              {STATS.enrolled}
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
              {PIPELINE.map((stage) => (
                <div
                  key={stage.label}
                  className={`${stage.color} transition-all`}
                  style={{
                    width: `${(stage.count / PIPELINE_TOTAL) * 100}%`,
                  }}
                  title={`${stage.label}: ${stage.count}`}
                />
              ))}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {PIPELINE.map((stage) => (
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
            {DEADLINES.map((dl) => (
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
            {RECENT_ACTIVITY.map((activity) => (
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
