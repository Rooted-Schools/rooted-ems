export const runtime = "edge";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { createServerClient } from "@rooted-ems/database/server";
import { redirect } from "next/navigation";
import {
  getFamilyDashboardApps,
  getFamilyNotifications,
  getActiveEnrollmentWindows,
} from "@/lib/queries";
import { getStatusConfig } from "@/lib/application-helpers";

export const dynamic = "force-dynamic";

export default async function FamilyDashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/family-login");

  const [apps, notifications, enrollmentWindows] = await Promise.all([
    getFamilyDashboardApps(user.id),
    getFamilyNotifications(user.id, 5),
    getActiveEnrollmentWindows(),
  ]);

  const hasApps = apps.length > 0;
  const draftCount = apps.filter((a) => a.status === "draft").length;
  const enrollmentWindow = enrollmentWindows[0] ?? null;

  // Derive a friendly name from the user's email or metadata
  const displayName =
    user.user_metadata?.full_name?.split(" ")[0] ??
    user.email?.split("@")[0] ??
    "there";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {displayName}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {user.email}
          </p>
        </div>
        <Link href="/family/applications/new">
          <Button>Start New Application</Button>
        </Link>
      </div>

      {/* ─── Alert banner: open enrollment ─── */}
      {enrollmentWindow && (
        <div className="bg-rooted-green/10 border border-rooted-green/30 rounded-lg p-4 flex items-start gap-3">
          <span className="text-xl mt-0.5">📅</span>
          <div>
            <p className="text-sm font-medium text-gray-900">
              {enrollmentWindow.name} is open
            </p>
            <p className="text-sm text-gray-600 mt-0.5">
              Applications for {enrollmentWindow.campus_name} are being accepted
              until{" "}
              <span className="font-semibold">
                {new Date(enrollmentWindow.close_date + "T00:00:00").toLocaleDateString(
                  "en-US",
                  { month: "long", day: "numeric", year: "numeric" }
                )}
              </span>
              .{" "}
              {draftCount > 0 && (
                <span className="text-amber-700">
                  You have {draftCount} draft application
                  {draftCount > 1 ? "s" : ""} to complete.
                </span>
              )}
            </p>
          </div>
          {enrollmentWindow.days_remaining != null && (
            <Badge variant="success" className="shrink-0 ml-auto">
              {enrollmentWindow.days_remaining} days left
            </Badge>
          )}
        </div>
      )}

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
            {apps.map((app) => {
              const cfg = getStatusConfig(app.status);
              return (
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
                          {app.student_name}
                        </CardTitle>
                        <CardDescription>
                          {app.grade_label} &middot; {app.campus_name}
                        </CardDescription>
                      </div>
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {app.next_step && (
                      <p className="text-sm text-gray-600">{app.next_step}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">
                        Updated{" "}
                        {new Date(app.updated_at + "T00:00:00").toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric", year: "numeric" }
                        )}
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
              );
            })}
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
                },
                {
                  step: 2,
                  title: "Application Review",
                  desc: "Our team reviews your application and verifies all submitted documents.",
                },
                {
                  step: 3,
                  title: "Enrollment Lottery",
                  desc: "If more applications are received than seats available, a fair lottery determines placement.",
                },
                {
                  step: 4,
                  title: "Offer & Acceptance",
                  desc: "If selected, you'll receive an offer to accept within the specified deadline.",
                },
                {
                  step: 5,
                  title: "Registration",
                  desc: "Complete final registration to secure your child's enrollment.",
                },
              ].map((s) => (
                <div key={s.step} className="flex gap-3">
                  <div
                    className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold shrink-0 mt-0.5 border border-gray-300 text-gray-400"
                  >
                    {s.step}
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
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No notifications yet.
              </p>
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0"
                  >
                    <div
                      className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                        n.read ? "bg-gray-300" : "bg-rooted-green"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700">{n.message}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(n.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
