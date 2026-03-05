import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const dynamic = "force-dynamic";

/* ─── Mock data for the family's view ─── */

const FAMILY_APPS = [
  {
    id: "app-001",
    studentName: "Marcus Johnson",
    grade: "9th Grade",
    campus: "Vancouver WA",
    status: "submitted",
    statusLabel: "Submitted",
    statusVariant: "default" as const,
    updatedAt: "Feb 28, 2026",
    message: "Your application is under review. We will reach out if additional information is needed.",
  },
  {
    id: "app-004",
    studentName: "Ava Johnson",
    grade: "7th Grade",
    campus: "Vancouver WA",
    status: "draft",
    statusLabel: "Draft",
    statusVariant: "secondary" as const,
    updatedAt: "Mar 3, 2026",
    message: "Complete and submit your application before the enrollment window closes on March 31.",
  },
];

const NOTIFICATIONS = [
  {
    id: "n-1",
    text: "Your application for Marcus Johnson (9th Grade) has been received.",
    time: "4 days ago",
    read: true,
  },
  {
    id: "n-2",
    text: "The 2026-27 enrollment window for Vancouver WA is now open!",
    time: "1 week ago",
    read: true,
  },
  {
    id: "n-3",
    text: "Welcome to Rooted EMS! Get started by creating your first application.",
    time: "2 weeks ago",
    read: true,
  },
];

const ENROLLMENT_WINDOW = {
  campus: "Vancouver WA",
  name: "2026-27 Open Enrollment",
  closes: "March 31, 2026",
  daysLeft: 27,
};

export default function FamilyDashboardPage() {
  const hasApps = FAMILY_APPS.length > 0;
  const draftCount = FAMILY_APPS.filter((a) => a.status === "draft").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, Tanya
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Johnson Family &middot; Vancouver WA
          </p>
        </div>
        <Link href="/family/applications/new">
          <Button>Start New Application</Button>
        </Link>
      </div>

      {/* ─── Alert banner: open enrollment ─── */}
      <div className="bg-rooted-green/10 border border-rooted-green/30 rounded-lg p-4 flex items-start gap-3">
        <span className="text-xl mt-0.5">📅</span>
        <div>
          <p className="text-sm font-medium text-gray-900">
            {ENROLLMENT_WINDOW.name} is open
          </p>
          <p className="text-sm text-gray-600 mt-0.5">
            Applications for {ENROLLMENT_WINDOW.campus} are being accepted until{" "}
            <span className="font-semibold">{ENROLLMENT_WINDOW.closes}</span>.{" "}
            {draftCount > 0 && (
              <span className="text-amber-700">
                You have {draftCount} draft application{draftCount > 1 ? "s" : ""} to
                complete.
              </span>
            )}
          </p>
        </div>
        <Badge variant="success" className="shrink-0 ml-auto">
          {ENROLLMENT_WINDOW.daysLeft} days left
        </Badge>
      </div>

      {/* ─── Application cards ─── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">
            Your Applications
          </h2>
          <Link
            href="/family/applications"
            className="text-sm text-rooted-green hover:underline"
          >
            View all &rarr;
          </Link>
        </div>

        {!hasApps ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-gray-400 mb-4">
                You have no applications yet.
              </p>
              <Link href="/family/applications/new">
                <Button>Start New Application</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FAMILY_APPS.map((app) => (
              <Card
                key={app.id}
                className={
                  app.status === "draft"
                    ? "border-amber-200 bg-amber-50/30"
                    : undefined
                }
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {app.studentName}
                      </CardTitle>
                      <CardDescription>
                        {app.grade} &middot; {app.campus}
                      </CardDescription>
                    </div>
                    <Badge variant={app.statusVariant}>{app.statusLabel}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-gray-600">{app.message}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      Updated {app.updatedAt}
                    </span>
                    {app.status === "draft" ? (
                      <Link href={`/family/applications/${app.id}/edit`}>
                        <Button size="sm">Continue</Button>
                      </Link>
                    ) : (
                      <Link href={`/family/applications/${app.id}`}>
                        <Button variant="outline" size="sm">
                          View Details
                        </Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ─── What to expect + Notifications ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Enrollment Steps */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              How Enrollment Works
            </CardTitle>
            <CardDescription>
              Your step-by-step guide through the enrollment process
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                {
                  step: 1,
                  title: "Submit Application",
                  desc: "Fill out the application form with your child's information and required documents.",
                  done: true,
                },
                {
                  step: 2,
                  title: "Application Review",
                  desc: "Our team reviews your application and verifies all submitted documents.",
                  done: false,
                },
                {
                  step: 3,
                  title: "Enrollment Lottery",
                  desc: "If more applications are received than seats available, a fair lottery determines placement.",
                  done: false,
                },
                {
                  step: 4,
                  title: "Offer & Acceptance",
                  desc: "If selected, you'll receive an offer to accept within the specified deadline.",
                  done: false,
                },
                {
                  step: 5,
                  title: "Registration",
                  desc: "Complete final registration to secure your child's enrollment.",
                  done: false,
                },
              ].map((s) => (
                <div key={s.step} className="flex gap-3">
                  <div
                    className={`
                      flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold shrink-0 mt-0.5
                      ${
                        s.done
                          ? "bg-rooted-green text-white"
                          : "border border-gray-300 text-gray-400"
                      }
                    `}
                  >
                    {s.done ? (
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      s.step
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {s.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notifications</CardTitle>
            <CardDescription>Recent updates about your applications</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {NOTIFICATIONS.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0"
                >
                  <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-700">{n.text}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{n.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
