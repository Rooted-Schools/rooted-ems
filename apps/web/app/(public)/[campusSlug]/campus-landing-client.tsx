"use client";

import Link from "next/link";
import Image from "next/image";
import { LocaleProvider, useLocale } from "@/lib/i18n/locale-context";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { HowEnrollmentWorksSection } from "@/components/public/how-enrollment-works";
import type { CampusIdentity } from "@/lib/campus-identity";
import type { Locale } from "@/lib/i18n/translations";

export interface CampusWindowState {
  isOpen: boolean;
  /** ISO date string — formatted client-side keyed to the active locale */
  closeDate: string | null;
  daysRemaining: number | null;
  /**
   * ISO date string for the campus's next upcoming enrollment window (real
   * data, any status including draft). Null when none is scheduled — never
   * a placeholder.
   */
  upcomingOpenDate: string | null;
  /**
   * Real grade_level rows (e.g. ["6", "9"]) for the school year this window
   * state describes. Can be a strict subset of identity.gradesRange — a
   * campus's eventual full range isn't necessarily what's enrolling this
   * cycle. Empty array (never fabricated) when no rows exist yet.
   */
  openGrades: string[];
}

export interface CampusContactInfo {
  id: string;
  name: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
}

interface CampusLandingClientProps {
  identity: CampusIdentity;
  campus: CampusContactInfo;
  windowState: CampusWindowState;
}

function formatDate(iso: string, locale: Locale): string {
  // Window dates are stored as UTC midnight; format in UTC so the date never
  // shifts a day back for a viewer west of Greenwich.
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

/** Joins grade numbers as "6 and 9" / "6, 9 and 10" / "6 y 9" / "6, 9 y 10". */
function joinGrades(grades: number[], es: boolean): string {
  const and = es ? "y" : "and";
  if (grades.length === 1) return String(grades[0]);
  if (grades.length === 2) return `${grades[0]} ${and} ${grades[1]}`;
  return `${grades.slice(0, -1).join(", ")} ${and} ${grades[grades.length - 1]}`;
}

/**
 * Honest "now enrolling" line built from real grade_level rows — e.g. "Now
 * enrolling entering grades 6 and 9" — never the static full gradesRange.
 * Returns null when there's nothing real to say (never fabricated).
 */
function formatOpenGradesLine(rawGrades: string[], es: boolean): string | null {
  if (rawGrades.length === 0) return null;
  const grades = [...new Set(rawGrades.map(Number))].sort((a, b) => a - b);
  const gradeWord = es
    ? grades.length === 1 ? "el grado de ingreso" : "los grados de ingreso"
    : grades.length === 1 ? "entering grade" : "entering grades";
  return es
    ? `Inscribiendo ahora ${gradeWord} ${joinGrades(grades, true)}`
    : `Now enrolling ${gradeWord} ${joinGrades(grades, false)}`;
}

/**
 * A campus's own, self-contained landing page — the one printed on flyers
 * and QR codes. It carries only this campus's logo, accent color, and real
 * contact info; the network wordmark never appears in the hero. No
 * initialLocale is passed to LocaleProvider — this route is ISR-cached like
 * the network landing page, so locale is detected client-side after
 * hydration (see landing-client.tsx for the same pattern).
 */
export function CampusLandingClient({ identity, campus, windowState }: CampusLandingClientProps) {
  return (
    <LocaleProvider>
      <CampusLandingContent identity={identity} campus={campus} windowState={windowState} />
    </LocaleProvider>
  );
}

function CampusLandingContent({ identity, campus, windowState }: CampusLandingClientProps) {
  const { t, locale } = useLocale();
  const es = locale === "es";
  const { accent } = identity;
  const { isOpen, closeDate, daysRemaining, upcomingOpenDate, openGrades } = windowState;
  const openGradesLine = formatOpenGradesLine(openGrades, es);

  const addressLine2 = [campus.city, [campus.state, campus.zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="min-h-screen bg-warm-white">
      {/* ─── Utility bar — no network wordmark, just the way back in ─── */}
      <header className="bg-white border-b border-line">
        <div className="max-w-4xl mx-auto px-6 py-3 flex flex-wrap items-center justify-end gap-3">
          <LanguageToggle />
          <Link
            href="/login"
            className="text-sm font-medium text-ink/60 hover:text-ink transition-colors px-2 py-2"
          >
            {t("public.familyLogin")}
          </Link>
          {/* Staff sign-in is not advertised on family-facing pages. See the
              note in app/(public)/landing-client.tsx. */}
        </div>
      </header>

      {/* ─── Hero — this campus's identity, full stop ─── */}
      <section className={`bg-gradient-to-b from-white to-warm-white border-t-4 ${accent.topBorder} py-14 md:py-20`}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="relative w-56 h-56 mx-auto mb-6">
            <Image
              src={identity.logoPath}
              alt={campus.name}
              fill
              className="object-contain"
              sizes="224px"
              priority
            />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-ink">{campus.name}</h1>
          <p className="text-sm text-stone-text mt-1">
            {identity.location} &middot; {t("public.grades")} {identity.gradesRange}
          </p>
          {openGradesLine && (
            <p className="text-sm text-stone-text mt-1">{openGradesLine}</p>
          )}
          <p className="mt-4 text-base text-ink/60 max-w-xl mx-auto">{t("public.heroLede")}</p>

          {/* Status badge — same honest states as the network landing page's cards */}
          <div className="mt-6 flex flex-col items-center gap-2">
            {isOpen ? (
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border ${accent.badgeBg} ${accent.badgeBorder}`}>
                <span className={`w-2 h-2 rounded-full animate-pulse ${accent.dot}`} />
                <span className={`text-xs font-semibold ${accent.badgeText}`}>{t("public.openEnrollment")}</span>
              </div>
            ) : upcomingOpenDate ? (
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border ${accent.badgeBg} ${accent.badgeBorder}`}>
                <span className={`w-2 h-2 shrink-0 rounded-full ${accent.dot}`} />
                <span className={`text-xs font-semibold ${accent.badgeText}`}>
                  {t("public.applicationsOpen").replace("{date}", formatDate(upcomingOpenDate, locale))}
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-rooted-gray border border-rooted-gray-dark">
                <span className="w-2 h-2 rounded-full bg-stone" />
                <span className="text-xs font-medium text-stone-text">{t("public.enrollmentClosed")}</span>
              </div>
            )}

            {isOpen && closeDate && (
              <p className="text-xs text-stone-text">
                {t("public.closes")} {formatDate(closeDate, locale)}
                {daysRemaining !== null && daysRemaining <= 14 && (
                  <span className="text-warn-text font-semibold">
                    {" "}({daysRemaining} {daysRemaining === 1 ? t("public.dayLeft") : t("public.daysLeft")})
                  </span>
                )}
              </p>
            )}

            {!isOpen && !upcomingOpenDate && (
              <p className="text-xs text-stone-text max-w-xs">{t("public.joinInterestListClosed")}</p>
            )}
          </div>

          {/* CTA — Apply when open, interest list otherwise */}
          <div className="mt-6">
            {isOpen ? (
              <Link
                href={`/login?campus=${campus.id}`}
                className="inline-flex min-h-[44px] items-center justify-center rounded-[6px] px-6 text-base font-semibold text-white bg-rooted-green hover:bg-deep-green transition-colors shadow-sm"
              >
                {t("public.applyNow")}
              </Link>
            ) : (
              <Link
                href={`/inquire?campus=${campus.id}`}
                className="inline-flex min-h-[44px] items-center justify-center rounded-[6px] border border-line bg-white px-6 text-base font-semibold text-ink hover:bg-sunken transition-colors"
              >
                {t("public.joinInterestList")}
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <HowEnrollmentWorksSection />

      {/* ─── Footer — this campus's real contact info ─── */}
      <footer className="py-10 bg-deep-green">
        <div className="max-w-3xl mx-auto px-6 text-center text-white">
          <p className="text-sm font-semibold uppercase tracking-wide text-white/70">
            {t("public.contact")}
          </p>
          <div className="mt-2 text-sm text-white/90 space-y-1">
            {campus.addressLine1 && (
              <p>
                <span className="sr-only">{t("public.address")}: </span>
                {campus.addressLine1}
                {addressLine2 ? `, ${addressLine2}` : ""}
              </p>
            )}
            {campus.phone && (
              <p>
                <span className="sr-only">{t("public.phoneLabel")}: </span>
                <a href={`tel:${campus.phone}`} className="hover:text-white transition-colors">
                  {campus.phone}
                </a>
              </p>
            )}
            {campus.email && (
              <p>
                <span className="sr-only">{t("public.emailLabel")}: </span>
                <a href={`mailto:${campus.email}`} className="hover:text-white transition-colors">
                  {campus.email}
                </a>
              </p>
            )}
          </div>

          <div className="mt-6 flex items-center justify-center gap-6 text-xs text-white/60">
            <Link href="/login" className="hover:text-white transition-colors">
              {t("public.familyPortal")}
            </Link>
            <span>&copy; {new Date().getFullYear()} {campus.name}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
