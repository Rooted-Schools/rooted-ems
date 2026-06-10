"use client";

import Link from "next/link";
import Image from "next/image";
import { LocaleProvider, useLocale } from "@/lib/i18n/locale-context";
import { LanguageToggle } from "@/components/ui/language-toggle";
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
}

interface LandingClientProps {
  schools: LandingSchool[];
}

/* Campus accent color classes keyed by matchKey */
const campusAccent: Record<string, {
  topBorder: string;
  border: string;
  hoverBorder: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  dot: string;
}> = {
  vancouver: {
    topBorder: "border-t-rooted-green",
    border: "border-rooted-green/30",
    hoverBorder: "hover:border-rooted-green/60",
    badgeBg: "bg-rooted-green/10",
    badgeBorder: "border-rooted-green/30",
    badgeText: "text-rooted-green",
    dot: "bg-rooted-green",
  },
  neal: {
    topBorder: "border-t-amber-500",
    border: "border-amber-300/60",
    hoverBorder: "hover:border-amber-400",
    badgeBg: "bg-amber-50",
    badgeBorder: "border-amber-300",
    badgeText: "text-amber-700",
    dot: "bg-amber-500",
  },
  cleveland: {
    topBorder: "border-t-blue-500",
    border: "border-blue-300/60",
    hoverBorder: "hover:border-blue-400",
    badgeBg: "bg-blue-50",
    badgeBorder: "border-blue-300",
    badgeText: "text-blue-700",
    dot: "bg-blue-500",
  },
};

function formatCloseDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
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

  const steps = [
    { step: 1, title: t("public.step1Title"), desc: t("public.step1Desc") },
    { step: 2, title: t("public.step2Title"), desc: t("public.step2Desc") },
    { step: 3, title: t("public.step3Title"), desc: t("public.step3Desc") },
    { step: 4, title: t("public.step4Title"), desc: t("public.step4Desc") },
    { step: 5, title: t("public.step5Title"), desc: t("public.step5Desc") },
  ];

  return (
    <div className="min-h-screen bg-warm-white">
      {/* ─── Header ─── */}
      <header className="bg-white border-b border-rooted-gray">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-2xl tracking-wide">
            <span className="text-rooted-green font-bold">rooted</span><span className="text-ink font-medium">schools</span>
          </span>
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <Link
              href="/login"
              className="text-sm font-medium text-ink/60 hover:text-ink transition-colors px-3 py-2"
            >
              {t("public.familyLogin")}
            </Link>
            <Link
              href="/staff-login"
              className="text-sm font-medium text-white bg-rooted-green hover:bg-deep-green transition-colors px-4 py-2 rounded-lg"
            >
              {t("public.staffLogin")}
            </Link>
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
          </div>
        </div>
      </section>

      {/* ─── Our Schools ─── */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-ink text-center mb-3">
            {t("public.ourSchools")}
          </h2>
          <p className="text-stone text-center mb-10 max-w-xl mx-auto">
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
                  <p className="text-sm text-stone">{school.location}</p>
                  <p className="text-xs text-stone/70 mt-1">
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
                  ) : (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rooted-gray border border-rooted-gray-dark">
                      <span className="w-2 h-2 rounded-full bg-stone" />
                      <span className="text-xs font-medium text-stone">
                        {t("public.enrollmentClosed")}
                      </span>
                    </div>
                  )}

                  {/* Close date info */}
                  {school.isOpen && school.closeDate && (
                    <p className="text-[11px] text-stone mt-1.5">
                      {t("public.closes")} {formatCloseDate(school.closeDate, locale)}
                      {school.daysRemaining !== null && school.daysRemaining <= 14 && (
                        <span className="text-amber-600 font-semibold">
                          {" "}({school.daysRemaining}{" "}
                          {school.daysRemaining === 1 ? t("public.dayLeft") : t("public.daysLeft")})
                        </span>
                      )}
                    </p>
                  )}

                  {/* CTAs */}
                  {school.isOpen && (
                    <div className="mt-4 flex gap-2">
                      <Link
                        href={school.campusId ? `/login?campus=${school.campusId}` : "/login"}
                        className="inline-flex items-center text-sm font-medium text-white bg-rooted-green hover:bg-deep-green px-4 py-2 rounded-lg transition-colors"
                      >
                        {t("public.applyNow")}
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
      <section className="py-16 bg-rooted-gray-light">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-ink text-center mb-10">
            {t("public.howItWorks")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {steps.map((s) => (
              <div key={s.step} className="text-center">
                <div className="w-10 h-10 rounded-full bg-deep-green text-white flex items-center justify-center text-sm font-bold mx-auto mb-3">
                  {s.step}
                </div>
                <p className="text-sm font-semibold text-ink">
                  {s.title}
                </p>
                <p className="text-xs text-stone mt-1">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

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
            <Link href="/staff-login" className="hover:text-white transition-colors">
              {t("public.staffPortal")}
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
