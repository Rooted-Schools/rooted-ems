import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JourneyTimeline } from "@/components/ui/journey-timeline";
import Link from "next/link";
import { createServerClient } from "@rooted-ems/database/server";
import { redirect } from "next/navigation";
import {
  getFamilyJourneyCards,
  getFamilyNotifications,
  getActiveEnrollmentWindows,
  type FamilyJourneyCard,
} from "@/lib/queries";
import { getStatusConfig } from "@/lib/application-helpers";
import { getLocale } from "@/lib/i18n/get-locale";
import { tx } from "@/lib/i18n/translations";

export const dynamic = "force-dynamic";

/**
 * Maps application status → 0-based position on the 5-step journey
 * (Applied → Verified → Offered → Accepted → Registered).
 * Steps before the index render filled; 5 means the journey is complete.
 * Statuses absent here (waitlisted / declined / expired / withdrawn) are
 * off the happy path and render a status note instead of the stepper.
 */
const JOURNEY_INDEX: Record<string, number> = {
  draft: 0,
  submitted: 1,
  needs_info: 1,
  verified: 2,
  lottery_assigned: 2,
  offered: 2,
  accepted: 4,
  placement_review: 4,
  registered: 5,
  enrolled: 5,
};

export default async function FamilyDashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (key: Parameters<typeof tx>[0]) => tx(key, locale);
  const localeTag = locale === "es" ? "es-US" : "en-US";

  const [cards, notifications, enrollmentWindows] = await Promise.all([
    getFamilyJourneyCards(),
    getFamilyNotifications(user.id, 5),
    getActiveEnrollmentWindows(),
  ]);

  const hasApps = cards.length > 0;

  const journeySteps = [
    t("steps.applied"),
    t("steps.verified"),
    t("steps.offered"),
    t("steps.accepted"),
    t("steps.registered"),
  ];

  const daysLeftText = (d: number) =>
    d === 0
      ? t("offers.expiresToday")
      : d === 1
        ? t("offers.oneDayLeft")
        : `${d} ${t("offers.daysLeftSuffix")}`;

  // ONE next-action per card, derived from status
  const actionFor = (
    card: FamilyJourneyCard
  ): { href: string; label: string; urgent?: boolean; outline?: boolean } | null => {
    switch (card.status) {
      case "draft":
        return {
          href: `/family/applications/${card.id}/edit`,
          label: t("dashboard.resume.continue"),
        };
      case "offered":
        if (card.pending_offer) {
          return {
            href: `/family/offers/${card.pending_offer.id}`,
            label: `${t("card.respondOffer")} — ${daysLeftText(card.pending_offer.days_remaining)}`,
            urgent: card.pending_offer.is_urgent,
          };
        }
        return {
          href: `/family/applications/${card.id}`,
          label: t("apps.viewDetails"),
          outline: true,
        };
      case "accepted":
      case "placement_review":
        return { href: "/family/registration", label: t("dashboard.completeReg") };
      case "registered":
      case "enrolled":
      case "waitlisted": // no family-facing waitlist page exists → no button
      case "declined":
      case "expired":
      case "withdrawn":
        return null;
      default:
        // submitted / needs_info / verified / lottery_assigned
        return {
          href: `/family/applications/${card.id}`,
          label: t("apps.viewDetails"),
          outline: true,
        };
    }
  };

  // Determine farthest stage for the "How Enrollment Works" guide
  const statusOrder = ["draft", "submitted", "needs_info", "verified", "lottery_assigned", "offered", "accepted", "registered"];
  const farthestStatus = cards.reduce((max, a) => {
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

      {/* ─── Per-child journey cards ─── */}
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
              <p className="text-stone mb-1">{t("dashboard.noApplications")}</p>
              <p className="text-sm text-stone mb-4">{t("dashboard.startFirstApp")}</p>
              <Link href="/family/applications/new">
                <Button>{t("dashboard.startNewApplication")}</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {cards.map((card) => {
              const cfg = getStatusConfig(card.status);
              const statusKey = `status.${card.status}` as Parameters<typeof tx>[0];
              const localizedStatus = tx(statusKey, locale);
              const statusLabel = localizedStatus === statusKey ? cfg.label : localizedStatus;

              const journeyIndex = JOURNEY_INDEX[card.status];
              const onJourney = journeyIndex !== undefined;
              const journeyAria =
                journeyIndex !== undefined && journeyIndex >= journeySteps.length
                  ? t("journey.aria.complete")
                  : `${t("journey.aria.step")} ${(journeyIndex ?? 0) + 1} ${t("journey.aria.of")} ${journeySteps.length}: ${journeySteps[journeyIndex ?? 0]}`;

              const isDraft = card.status === "draft";
              const studentTitle = card.student_name || t("dashboard.resume.newApp");
              const subtitle = [
                card.campus_name,
                card.grade ? `${t("offers.grade")} ${card.grade}` : "",
              ]
                .filter(Boolean)
                .join(" · ");
              const action = actionFor(card);

              return (
                <Card
                  key={card.id}
                  className={
                    isDraft
                      ? "border-rooted-green/40 bg-rooted-green/5"
                      : card.registration_complete
                        ? "border-rooted-green/30"
                        : undefined
                  }
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">
                          {studentTitle}
                        </CardTitle>
                        {subtitle && <CardDescription>{subtitle}</CardDescription>}
                      </div>
                      <Badge variant={cfg.variant} className="shrink-0">
                        {statusLabel}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {onJourney ? (
                      <JourneyTimeline
                        steps={journeySteps}
                        currentIndex={journeyIndex}
                        size="sm"
                        ariaLabel={journeyAria}
                      />
                    ) : card.status === "waitlisted" ? (
                      <div className="space-y-1">
                        {card.waitlist_standing && (
                          <p className="text-sm font-semibold text-rooted-green">
                            {t("card.waitlistStanding")
                              .replace("{position}", String(card.waitlist_standing.position))
                              .replace("{total}", String(card.waitlist_standing.total))}
                          </p>
                        )}
                        <p className="text-sm text-ink/60">{t("card.waitlistNote")}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-ink/60">{t("card.closedNote")}</p>
                    )}

                    {card.registration_complete && (
                      <p className="text-sm font-medium text-rooted-green">
                        🎓 {t("card.celebration")}
                      </p>
                    )}
                    {isDraft && (
                      <p className="text-sm text-ink/60">{t("card.draftHint")}</p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-stone">
                        {t("common.updated")}{" "}
                        {new Date(card.updated_at).toLocaleDateString(
                          localeTag,
                          { month: "short", day: "numeric", year: "numeric" }
                        )}
                      </span>
                      {action && (
                        <Link href={action.href} className="shrink-0">
                          <Button
                            size="sm"
                            variant={action.outline ? "outline" : "default"}
                            className={
                              action.urgent
                                ? "bg-red-600 hover:bg-red-700 text-white"
                                : undefined
                            }
                          >
                            {action.label}
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
