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
import { getLocale } from "@/lib/i18n/get-locale";
import { tx } from "@/lib/i18n/translations";

export const dynamic = "force-dynamic";

export default async function FamilyDashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (key: Parameters<typeof tx>[0]) => tx(key, locale);
  const localeTag = locale === "es" ? "es-US" : "en-US";

  const [apps, notifications, enrollmentWindows, pendingOffers] = await Promise.all([
    getFamilyDashboardApps(user.id),
    getFamilyNotifications(user.id, 5),
    getActiveEnrollmentWindows(),
    getFamilyPendingOffers(user.id),
  ]);

  const hasApps = apps.length > 0;
  const draftApps = apps.filter((a) => a.status === "draft");
  const draftCount = draftApps.length;
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
    t("dashboard.there");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            {t("dashboard.welcomeBack")}, {displayName}
          </h1>
          <p className="text-sm text-stone mt-1">
            {user.email}
          </p>
        </div>
        <Link href="/family/applications/new">
          <Button>{t("dashboard.startNewApplication")}</Button>
        </Link>
      </div>

      {/* ─── Resume: in-progress draft applications ─── */}
      {draftCount > 0 && (
        <Card className="border-2 border-rooted-green/40 bg-rooted-green/5">
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <span className="text-xl mt-0.5">✏️</span>
              <div>
                <CardTitle className="text-base">{t("dashboard.resume.title")}</CardTitle>
                <CardDescription className="mt-0.5">
                  {t("dashboard.resume.subtitle")}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {draftApps.map((app) => {
              const studentName = app.student_name.trim();
              const displayTitle =
                studentName && studentName !== "Unknown Student"
                  ? studentName
                  : t("dashboard.resume.newApp");
              return (
                <div
                  key={app.id}
                  className="flex items-center justify-between gap-3 bg-white border border-rooted-green/20 rounded-lg px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{displayTitle}</p>
                    <p className="text-xs text-stone mt-0.5">
                      {app.campus_name && <>{app.campus_name} &middot; </>}
                      {t("common.updated")}{" "}
                      {new Date(app.updated_at).toLocaleDateString(localeTag, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <Link href={`/family/applications/${app.id}/edit`} className="shrink-0">
                    <Button size="sm">{t("dashboard.resume.continue")}</Button>
                  </Link>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ─── Celebration: registered students ─── */}
      {registeredCount > 0 && (
        <div className="bg-rooted-green/10 border border-rooted-green/30 rounded-lg p-4 flex items-start gap-3">
          <span className="text-xl mt-0.5">🎓</span>
          <div>
            <p className="text-sm font-bold text-ink">
              {t("dashboard.welcomeFamily")}
            </p>
            <p className="text-sm text-ink/60 mt-0.5">
              {registeredCount} {t("dashboard.enrolledStudents")} {t("dashboard.checkOrientation")}
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
                    ? `${t("dashboard.expiresIn")} ${offer.days_remaining === 0 ? t("dashboard.lessThanDay") : `${offer.days_remaining} ${offer.days_remaining === 1 ? t("common.day") : t("common.days")}`} — ${t("dashboard.respondNow")}`
                    : `${t("dashboard.respondWithin")} ${offer.days_remaining} ${t("dashboard.daysToSecure")}`}
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
                  {t("dashboard.respond")}
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
              {t("dashboard.completeReg")}
            </p>
            <p className="text-sm text-ink/60 mt-0.5">
              {t("dashboard.acceptedPre")} {acceptedCount} {t("dashboard.acceptedPost")}
            </p>
          </div>
          <Link href="/family/registration">
            <Button size="sm" variant="outline" className="shrink-0">
              {t("dashboard.goToReg")}
            </Button>
          </Link>
        </div>
      )}


      {/* ─── Our Schools — Clickable logos ─── */}
      <div>
        <h2 className="text-base font-semibold text-ink mb-3">
          {t("dashboard.ourSchools")}
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
              badgeClass: "bg-rooted-green/10 text-rooted-green border-rooted-green/30",
              footerClass: "bg-rooted-green/5 border-t border-rooted-green/20",
              daysClass: "bg-rooted-green text-white",
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
              badgeClass: "bg-amber-50 text-amber-700 border-amber-300",
              footerClass: "bg-amber-50 border-t border-amber-200",
              daysClass: "bg-amber-500 text-white",
            },
            {
              name: "Rooted Schools Cleveland",
              location: "Cleveland, OH",
              logo: "/logos/rooted-cleveland.png",
              shortCode: "RSC",
              containerClass: "h-24 flex items-center justify-center mb-3",
              logoClass: "max-h-24 max-w-full object-contain",
              borderColor: "border-t-blue-600",
              hoverBorder: "hover:border-blue-400/50",
              badgeClass: "bg-blue-50 text-blue-700 border-blue-300",
              footerClass: "bg-blue-50 border-t border-blue-200",
              daysClass: "bg-blue-600 text-white",
            },
          ].map((school) => {
            const campusWindow = enrollmentWindows.find(
              (w) => w.campus_name === school.name
            );
            const isOpen = !!campusWindow;
            const cardContent = (
              <Card className={`transition-shadow border-2 border-t-4 overflow-hidden ${school.borderColor} ${isOpen ? `hover:shadow-md cursor-pointer group ${school.hoverBorder}` : "opacity-75"}`}>
                <CardContent className="py-6 flex flex-col items-center text-center">
                  <div className={school.containerClass}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={school.logo}
                      alt={school.name}
                      className={`${school.logoClass} ${isOpen ? "group-hover:scale-105 transition-transform" : ""}`}
                    />
                  </div>
                  <p className="text-xs text-stone mt-1">{school.location}</p>
                  <Badge variant="outline" className={`mt-2 ${isOpen ? school.badgeClass : ""}`}>
                    {isOpen ? t("dashboard.acceptingApps") : t("dashboard.comingSoon")}
                  </Badge>
                </CardContent>
                {isOpen && campusWindow && (
                  <div className={`${school.footerClass} px-4 py-2.5 flex items-center justify-between`}>
                    <p className="text-xs text-ink/60">
                      {t("dashboard.applyBy")} <span className="font-semibold text-ink">{campusWindow.close_date}</span>
                    </p>
                    {campusWindow.days_remaining != null && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${school.daysClass}`}>
                        {campusWindow.days_remaining}{t("dashboard.daysLeftShort")}
                      </span>
                    )}
                  </div>
                )}
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
            {t("dashboard.yourApplications")}
          </h2>
          <Link
            href="/family/applications"
            className="text-sm text-rooted-green hover:underline"
          >
            {t("dashboard.viewAll")} &rarr;
          </Link>
        </div>

        {!hasApps ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-stone mb-4">
                {t("dashboard.noApplications")}
              </p>
              <Link href="/family/applications/new">
                <Button>{t("dashboard.startNewApplication")}</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {apps.map((app) => {
              const cfg = getStatusConfig(app.status);
              const statusKey = `status.${app.status}` as Parameters<typeof tx>[0];
              const localizedStatus = tx(statusKey, locale);
              const statusLabel = localizedStatus === statusKey ? cfg.label : localizedStatus;
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
                      <Badge variant={cfg.variant}>{statusLabel}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {app.next_step && (
                      <p className="text-sm text-ink/60">{app.next_step}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-stone">
                        {t("common.updated")}{" "}
                        {new Date(app.updated_at).toLocaleDateString(
                          localeTag,
                          { month: "short", day: "numeric", year: "numeric" }
                        )}
                      </span>
                      {app.status === "draft" ? (
                        <Link href={`/family/applications/${app.id}/edit`}>
                          <Button size="sm">{t("common.continue")}</Button>
                        </Link>
                      ) : (
                        <Link href={`/family/applications/${app.id}`}>
                          <Button variant="outline" size="sm">
                            {t("apps.viewDetails")}
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
              {t("dashboard.howItWorks")}
            </CardTitle>
            <CardDescription>
              {t("dashboard.howItWorksDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                {
                  step: 1,
                  title: t("dashboard.step1Title"),
                  desc: t("dashboard.step1Desc"),
                },
                {
                  step: 2,
                  title: t("dashboard.step2Title"),
                  desc: t("dashboard.step2Desc"),
                },
                {
                  step: 3,
                  title: t("dashboard.step3Title"),
                  desc: t("dashboard.step3Desc"),
                },
                {
                  step: 4,
                  title: t("dashboard.step4Title"),
                  desc: t("dashboard.step4Desc"),
                },
                {
                  step: 5,
                  title: t("dashboard.step5Title"),
                  desc: t("dashboard.step5Desc"),
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
                        {isCurrent && <span className="text-[10px] ml-2 text-rooted-green font-bold uppercase">{t("dashboard.current")}</span>}
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
            <CardTitle className="text-base">{t("dashboard.notifications")}</CardTitle>
            <CardDescription>{t("dashboard.notificationsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <p className="text-sm text-stone text-center py-4">
                {t("dashboard.noNotifications")}
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
                        {new Date(n.created_at).toLocaleDateString(localeTag, {
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
