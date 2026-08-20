"use client";

import Link from "next/link";
import Image from "next/image";
import { LocaleProvider, useLocale } from "@/lib/i18n/locale-context";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { HowEnrollmentWorksSection } from "@/components/public/how-enrollment-works";
import { CAMPUS_ACCENT_BY_MATCH_KEY } from "@/lib/campus-identity";
import type { Locale } from "@/lib/i18n/translations";

/* ───────────── props ───────────── */

export interface LandingSchool {
  name: string;
  location: string;
  /** Grade range without the "Grades" prefix, e.g. "9-12" */
  gradesRange: string;
  logo: string;
  matchKey: string;
  isOpen: boolean;
  /** ISO date string — formatted client-side keyed to the active locale */
  closeDate: string | null;
  daysRemaining: number | null;
  campusId: string | null;
  /**
   * ISO date string for the campus's next upcoming enrollment window (real
   * data from the enrollment_window table, any status including draft).
   * Null when the campus has no scheduled window — never a placeholder.
   */
  upcomingOpenDate: string | null;
}

interface LandingClientProps {
  schools: LandingSchool[];
}

/**
 * Campus accent color classes keyed by matchKey. This used to be a local
 * literal; it now reads from lib/campus-identity.ts, the single source of
 * truth shared with the per-campus landing pages, family header, staff
 * sidebar, and transactional email. Kept as a local alias (rather than
 * inlining the import everywhere below) so the diff against the prior
 * version stays readable.
 */
const campusAccent = CAMPUS_ACCENT_BY_MATCH_KEY;

function formatDate(iso: string, locale: Locale): string {
  // Window dates are stored as UTC midnight; format in UTC so "Oct 26
  // 00:00Z" never renders as Oct 25 for a viewer west of Greenwich.
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

/**
 * Public landing page presentation. One LocaleProvider wraps both the
 * language toggle and all content so switching language re-renders the
 * whole page. No initialLocale is passed — the page is ISR-cached, so the
 * provider detects the saved preference client-side after hydration.
 */
export function LandingClient({ schools }: LandingClientProps) {
  return (
    <LocaleProvider>
      <LandingContent schools={schools} />
    </LocaleProvider>
  );
}

function LandingContent({ schools }: LandingClientProps) {
  const { t, locale } = useLocale();
  const anyOpen = schools.some((s) => s.isOpen);

  return (
    <div className="min-h-screen bg-warm-white">
      {/* ─── Header ─── */}
      <header className="bg-white border-b border-rooted-gray">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-y-2">
          <span className="text-2xl tracking-wide">
            <span className="text-rooted-green font-bold">rooted</span><span className="text-ink font-medium">schools</span>
          </span>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <LanguageToggle />
            <Link
              href="/login"
              className="text-sm font-medium text-ink/60 hover:text-ink transition-colors px-3 py-2"
            >
              {t("public.familyLogin")}
            </Link>
            {/* No staff entry point on family-facing pages. Staff access is
                granted by an administrator and reached at /staff-login
                directly, so families are not offered a door that is not
                theirs and cannot mistake it for their own sign-in. */}
          </div>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="bg-gradient-to-b from-rooted-green/5 to-warm-white py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-3xl md:text-5xl text-ink leading-tight">
            {t("public.heroTitlePre")}{" "}
            <span className="text-rooted-green">
              <span className="font-bold">rooted</span>
              <span className="font-normal">school</span>
            </span>
          </h1>
          <p className="mt-4 text-lg text-ink/60 max-w-2xl mx-auto">
            {t("public.heroLede")}{" "}
            {anyOpen ? t("public.heroOpenCta") : t("public.checkBackSoon")}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            {anyOpen ? (
              <Link
                href="/login"
                className="inline-flex items-center justify-center px-6 py-3 text-base font-semibold text-white bg-rooted-green hover:bg-deep-green rounded-lg transition-colors shadow-sm w-full sm:w-auto"
              >
                {t("public.applyNow")}
              </Link>
            ) : null}
            <Link
              href="/inquire"
              className="inline-flex items-center justify-center px-6 py-3 text-base font-semibold text-rooted-green bg-white border-2 border-rooted-green hover:bg-rooted-green/5 rounded-lg transition-colors shadow-sm w-full sm:w-auto"
            >
              {t("public.getInfo")}
            </Link>
          </div>
          <div className="mt-4 flex flex-col items-center gap-1">
            <Link href="/events" className="text-sm font-medium text-rooted-green hover:underline">
              {t("public.seeEvents")} &rarr;
            </Link>
            <Link href="/how-the-lottery-works" className="text-sm font-medium text-rooted-green hover:underline">
              {t("public.howLotteryWorks")} &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Our Schools ─── */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-ink text-center mb-3">
            {t("public.ourSchools")}
          </h2>
          <p className="text-stone-text text-center mb-10 max-w-xl mx-auto">
            <span className="font-bold">rooted</span>schools {t("public.schoolsLede")}{" "}
            {anyOpen ? t("public.clickToApply") : t("public.checkBackSoon")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {schools.map((school) => {
              const accent = campusAccent[school.matchKey];
              return (
                <div
                  key={school.name}
                  className={`group border-2 border-t-4 rounded-xl p-6 flex flex-col items-center text-center transition-all hover:shadow-lg ${
                    accent?.topBorder ?? "border-t-stone"
                  } ${accent?.border ?? "border-rooted-gray"} ${accent?.hoverBorder ?? "hover:border-stone/40"}`}
                >
                  <div className="h-48 flex items-center justify-center mb-4 overflow-hidden">
                    <div className="relative w-48 h-48">
                      <Image
                        src={school.logo}
                        alt={school.name}
                        fill
                        className="object-contain group-hover:scale-105 transition-transform"
                        sizes="192px"
                      />
                    </div>
                  </div>
                  <p className="text-sm text-stone-text">{school.location}</p>
                  <p className="text-xs text-stone-text/70 mt-1">
                    {t("public.grades")} {school.gradesRange}
                  </p>

                  {/* Enrollment Status Badge — campus accent color */}
                  {school.isOpen ? (
                    <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full border ${accent?.badgeBg ?? "bg-rooted-green/10"} ${accent?.badgeBorder ?? "border-rooted-green/30"}`}>
                      <span className={`w-2 h-2 rounded-full animate-pulse ${accent?.dot ?? "bg-rooted-green"}`} />
                      <span className={`text-xs font-semibold ${accent?.badgeText ?? "text-rooted-green"}`}>
                        {t("public.openEnrollment")}
                      </span>
                    </div>
                  ) : school.upcomingOpenDate ? (
                    <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border max-w-full ${accent?.badgeBg ?? "bg-rooted-green/10"} ${accent?.badgeBorder ?? "border-rooted-green/30"}`}>
                      <span className={`w-2 h-2 shrink-0 rounded-full ${accent?.dot ?? "bg-rooted-green"}`} />
                      <span className={`text-xs font-semibold ${accent?.badgeText ?? "text-rooted-green"}`}>
                        {t("public.applicationsOpen").replace("{date}", formatDate(school.upcomingOpenDate, locale))}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rooted-gray border border-rooted-gray-dark">
                      <span className="w-2 h-2 rounded-full bg-stone" />
                      <span className="text-xs font-medium text-stone-text">
                        {t("public.enrollmentClosed")}
                      </span>
                    </div>
                  )}

                  {/* Close date info */}
                  {school.isOpen && school.closeDate && (
                    <p className="text-[11px] text-stone-text mt-1.5">
                      {t("public.closes")} {formatDate(school.closeDate, locale)}
                      {school.daysRemaining !== null && school.daysRemaining <= 14 && (
                        <span className="text-warn-text font-semibold">
                          {" "}({school.daysRemaining}{" "}
                          {school.daysRemaining === 1 ? t("public.dayLeft") : t("public.daysLeft")})
                        </span>
                      )}
                    </p>
                  )}

                  {/* Closed, no scheduled window yet — still an honest state, but not a dead end */}
                  {!school.isOpen && !school.upcomingOpenDate && (
                    <p className="text-[11px] text-stone-text mt-1.5 max-w-[220px]">
                      {t("public.joinInterestListClosed")}
                    </p>
                  )}

                  {/* CTAs */}
                  {school.isOpen && (
                    <div className="mt-4 flex gap-2">
                      <Link
                        href={school.campusId ? `/login?campus=${school.campusId}` : "/login"}
                        className="inline-flex min-h-[44px] items-center justify-center text-sm font-medium text-white bg-rooted-green hover:bg-deep-green px-4 rounded-[6px] transition-colors"
                      >
                        {t("public.applyNow")}
                      </Link>
                    </div>
                  )}
                  {!school.isOpen && (
                    <div className="mt-4 flex gap-2">
                      <Link
                        href={school.campusId ? `/inquire?campus=${school.campusId}` : "/inquire"}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-[6px] border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-sunken transition-colors"
                      >
                        {t("public.joinInterestList")}
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <HowEnrollmentWorksSection />

      {/* ─── Footer ─── */}
      <footer className="py-8 bg-deep-green">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-sm tracking-wide">
            <span className="text-white font-bold">rooted</span><span className="text-white/70 font-medium">schools</span>
          </span>
          <div className="flex items-center gap-6 text-xs text-white/60">
            <Link href="/login" className="hover:text-white transition-colors">
              {t("public.familyPortal")}
            </Link>
            <Link href="/privacy" className="hover:text-white transition-colors">
              {t("public.privacy")}
            </Link>
            <span>
              &copy; {new Date().getFullYear()} <span className="font-bold">rooted</span>schools
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
