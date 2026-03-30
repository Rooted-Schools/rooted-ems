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
  getFamilyPendingOffers,
} from "@/lib/queries";
import { getStatusConfig } from "@/lib/application-helpers";

export const dynamic = "force-dynamic";

export default async function FamilyDashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [apps, notifications, enrollmentWindows, pendingOffers] = await Promise.all([
    getFamilyDashboardApps(user.id),
    getFamilyNotifications(user.id, 5),
    getActiveEnrollmentWindows(),
    getFamilyPendingOffers(user.id),
  ]);

  const hasApps = apps.length > 0;
  const draftCount = apps.filter((a) => a.status === "draft").length;
  const offeredCount = apps.filter((a) => a.status === "offered").length;
  const acceptedCount = apps.filter((a) => a.status === "accepted").length;
  const registeredCount = apps.filter((a) => a.status === "registered").length;

  // Determine farthest stage for dynamic stepper
  const statusOrder = ["draft", "submitted", "needs_info", "verified", "lottery_assigned", "offered", "accepted", "registered"];
  const farthestStatus = apps.reduce((max, a) => {
    const idx = statusOrder.indexOf(a.status);
    return idx > max ? idx : max;
  }, -1);
  const currentStep = farthestStatus <= 1 ? 1 : farthestStatus <= 4 ? 2 : farthestStatus === 5 ? 3 : farthestStatus === 6 ? 4 : farthestStatus >= 7 ? 5 : 0;

  // Derive a friendly name from the user's email or metadata
  const displayName =
    user.user_metadata?.full_name?.split(" ")[0] ??
    user.email?.split("@")[0] ??
    "there";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            Welcome back, {displayName}
          </h1>
          <p className="text-sm text-stone mt-1">
            {user.email}
          </p>
        </div>
        <Link href="/family/applications/new">
          <Button>Start New Application</Button>
        </Link>
      </div>

      {/* ─── Celebration: registered students ─── */}
      {registeredCount > 0 && (
        <div className="bg-rooted-green/10 border border-rooted-green/30 rounded-lg p-4 flex items-start gap-3">
          <span className="text-xl mt-0.5">🎓</span>
          <div>
            <p className="text-sm font-bold text-ink">
              Welcome to the rootedschools family!
            </p>
            <p className="text-sm text-ink/60 mt-0.5">
              {registeredCount} student{registeredCount > 1 ? "s are" : " is"} enrolled and registered. Check your school for orientation details.
            </p>
          </div>
        </div>
      )}

      {/* ─── Urgent: offer pending ─── */}
      {pendingOffers.length > 0 && (
        <div className="space-y-2">
          {pendingOffers.map((offer) => (
            <div
              key={offer.id}
              className={`rounded-lg p-4 flex items-start gap-3 border ${
                offer.is_urgent
                  ? "bg-red-50 border-red-300"
                  : "bg-amber-50 border-amber-300"
              }`}
            >
              <span className="text-xl mt-0.5">{offer.is_urgent ? "⏰" : "🎉"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ink">
                  {offer.student_name} — {offer.campus_name}
                </p>
                <p className="text-sm text-ink/60 mt-0.5">
                  {offer.is_urgent
                    ? `Expires in ${offer.days_remaining === 0 ? "less than 1 day" : `${offer.days_remaining} day${offer.days_remaining === 1 ? "" : "s"}`} — respond now.`
                    : `Respond within ${offer.days_remaining} days to secure your spot.`}
                </p>
              </div>
              <Link href={`/family/offers/${offer.id}`} className="shrink-0">
                <Button
                  size="sm"
                  className={
                    offer.is_urgent
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-rooted-green hover:bg-rooted-green/90 text-white"
                  }
                >
                  Respond
                </Button>
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* ─── Registration reminder ─── */}
      {acceptedCount > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <span className="text-xl mt-0.5">📝</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-ink">
              Complete Registration
            </p>
            <p className="text-sm text-ink/60 mt-0.5">
              You have {acceptedCount} accepted enrollment{acceptedCount > 1 ? "s" : ""}. Complete the registration packet to finalize enrollment.
            </p>
          </div>
          <Link href="/family/registration">
            <Button size="sm" variant="outline" className="shrink-0">
              Go to Registration
            </Button>
          </Link>
        </div>
      )}

      {/* ─── Alert banners: one per open enrollment window ─── */}
      {enrollmentWindows.map((ew) => (
        <div key={ew.campus_name} className="bg-rooted-green/10 border border-rooted-green/30 rounded-lg p-4 flex items-start gap-3">
          <span className="text-xl mt-0.5">📅</span>
          <div>
            <p className="text-sm font-medium text-ink">
              {ew.name} is open
            </p>
            <p className="text-sm text-ink/60 mt-0.5">
              Applications for {ew.campus_name} are being accepted until{" "}
              <span className="font-semibold">{ew.close_date}</span>.{" "}
              {draftCount > 0 && (
                <span className="text-amber-700">
                  You have {draftCount} draft application{draftCount > 1 ? "s" : ""} to complete.
                </span>
              )}
            </p>
          </div>
          {ew.days_remaining != null && (
            <Badge variant="success" className="shrink-0 ml-auto">
              {ew.days_remaining} days left
            </Badge>
          )}
        </div>
      ))}

      {/* ─── Our Schools — Clickable logos ─── */}
      <div>
        <h2 className="text-base font-semibold text-ink mb-3">
          Our Schools
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              name: "Rooted School Vancouver",
              location: "Vancouver, WA",
              logo: "/logos/rooted-vancouver.png",
              shortCode: "RSV",
              containerClass: "h-24 flex items-center justify-center mb-3",
              logoClass: "max-h-24 max-w-full object-contain",
              borderColor: "border-t-rooted-green",
              hoverBorder: "hover:border-rooted-green/50",
              badgeClass: "mt-2 bg-rooted-green/10 text-rooted-green border-rooted-green/30",
            },
            {
              name: "C.R. Neal Academy",
              location: "Columbia, SC",
              logo: "/logos/cr-neal-academy.png",
              shortCode: "CRN",
              containerClass: "h-24 flex items-center justify-center mb-3",
              logoClass: "max-h-24 max-w-full object-contain",
              borderColor: "border-t-amber-600",
              hoverBorder: "hover:border-amber-400/50",
              badgeClass: "mt-2 bg-amber-50 text-amber-700 border-amber-300",
            },
            {
              name: "Rooted Schools Cleveland",
              location: "Cleveland, OH",
              logo: "/logos/rooted-cleveland.png",
              shortCode: "RSC",
              containerClass: "h-36 flex items-center justify-center mb-3",
              logoClass: "w-36 h-36 object-contain",
              borderColor: "border-t-blue-600",
              hoverBorder: "hover:border-blue-400/50",
              badgeClass: "mt-2 bg-blue-50 text-blue-700 border-blue-300",
            },
          ].map((school) => {
            const campusWindow = enrollmentWindows.find(
              (w) => w.campus_name === school.name
            );
            const isOpen = !!campusWindow;
            const cardContent = (
              <Card className={`transition-shadow border-2 border-t-4 ${school.borderColor} ${isOpen ? `hover:shadow-md cursor-pointer group ${school.hoverBorder}` : "opacity-75"}`}>
                <CardContent className="py-6 flex flex-col items-center text-center">
                  <div className={school.containerClass}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={school.logo}
                      alt={school.name}
                      className={`${school.logoClass} ${isOpen ? "group-hover:scale-105 transition-transform" : ""}`}
                    />
                  </div>
                  <p className="text-xs text-stone mt-1">
                    {school.location}
                  </p>
                  {isOpen ? (
                    <Badge variant="outline" className={school.badgeClass}>
                      Accepting Applications
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="mt-2">
                      Coming Soon
                    </Badge>
                  )}
                </CardContent>
              </Card>
            );

            return isOpen ? (
              <Link
                key={school.shortCode}
                href={`/family/applications/new?campus=${school.shortCode}`}
              >
                {cardContent}
              </Link>
            ) : (
              <div key={school.shortCode}>{cardContent}</div>
            );
          })}
        </div>
      </div>

      {/* ─── Application cards ─── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-ink">
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
              <p className="text-stone mb-4">
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
                      <p className="text-sm text-ink/60">{app.next_step}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-stone">
                        Updated{" "}
                        {new Date(app.updated_at).toLocaleDateString(
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
              ].map((s) => {
                const isComplete = hasApps && s.step < currentStep;
                const isCurrent = hasApps && s.step === currentStep;
                return (
                  <div key={s.step} className={`flex gap-3 ${isCurrent ? "bg-rooted-green/5 -mx-2 px-2 py-1.5 rounded-lg" : ""}`}>
                    <div
                      className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold shrink-0 mt-0.5 ${
                        isComplete
                          ? "bg-rooted-green text-white border-2 border-rooted-green"
                          : isCurrent
                            ? "bg-white text-rooted-green border-2 border-rooted-green"
                            : "border border-stone/30 text-stone"
                      }`}
                    >
                      {isComplete ? "✓" : s.step}
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${isCurrent ? "text-rooted-green" : isComplete ? "text-ink/60" : "text-ink"}`}>
                        {s.title}
                        {isCurrent && <span className="text-[10px] ml-2 text-rooted-green font-bold uppercase">Current</span>}
                      </p>
                      <p className="text-xs text-stone mt-0.5">{s.desc}</p>
                    </div>
                  </div>
                );
              })}
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
              <p className="text-sm text-stone text-center py-4">
                No notifications yet.
              </p>
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start gap-3 pb-3 border-b border-rooted-gray last:border-0 last:pb-0"
                  >
                    <div
                      className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                        n.read ? "bg-stone/50" : "bg-rooted-green"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-ink/70">{n.message}</p>
                      <p className="text-xs text-stone mt-0.5">
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
