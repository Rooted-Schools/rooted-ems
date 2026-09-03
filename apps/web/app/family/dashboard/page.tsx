import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JourneyTimeline } from "@/components/ui/journey-timeline";
import Link from "next/link";
import { createServerClient } from "@rooted-ems/database/server";
import { redirect } from "next/navigation";
import { getFamilyJourneyCards, getRegistrationSummary, type FamilyJourneyCard, type RegistrationSummary } from "@/lib/queries";
import { getFamilyStatusLabel } from "@/lib/application-helpers";
import { getLocale } from "@/lib/i18n/get-locale";
import { tx } from "@/lib/i18n/translations";

export const dynamic = "force-dynamic";

/**
 * Maps application status → 0-based position on the plain-language 4-step
 * "Where {name} is" journey (Applied → Offered a seat → Finish registration →
 * First day). Statuses absent here (waitlisted / declined / expired /
 * withdrawn) are off the happy path and render a status note instead.
 */
/**
 * Statuses where the campus enrollment window's own dates are still the
 * live, relevant fact — before a lottery run has actually assigned this
 * application, so "applications open/close {date}" is honest information,
 * not something superseded by an offer or a placement result.
 */
const WINDOW_CHIP_STATUSES = new Set(["draft", "submitted", "needs_info", "verified"]);

const JOURNEY2_INDEX: Record<string, number> = {
  draft: 0,
  submitted: 0,
  needs_info: 0,
  verified: 0,
  lottery_assigned: 0,
  offered: 1,
  accepted: 2,
  placement_review: 2,
  registered: 3,
  enrolled: 4,
};

/**
 * Sort key for choosing the ONE primary "active child" card the page leads
 * with. Lower = more urgent = more likely to be the thing a parent needs to
 * see first. Everything else on the page stays quiet by comparison.
 */
function priorityRank(card: FamilyJourneyCard): number {
  if (card.pending_offer?.is_urgent) return 0;
  if (card.pending_offer) return 1;
  if (card.status === "draft") return 2;
  if (card.status === "accepted" || card.status === "placement_review") return 3;
  if (card.status === "waitlisted") return 4;
  if (["submitted", "needs_info", "verified", "lottery_assigned"].includes(card.status)) return 5;
  return 6; // registered / enrolled / declined / expired / withdrawn
}

export default async function FamilyDashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (key: Parameters<typeof tx>[0]) => tx(key, locale);
  const localeTag = locale === "es" ? "es-US" : "en-US";

  const cards = await getFamilyJourneyCards();
  const hasApps = cards.length > 0;

  const sortedCards = [...cards].sort((a, b) => {
    const diff = priorityRank(a) - priorityRank(b);
    if (diff !== 0) return diff;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
  const primary = sortedCards[0] as FamilyJourneyCard | undefined;

  // For a registering primary child, load the real outstanding items so the
  // headline and card can name exactly what's left (the app id is RLS-proven
  // above). Registration is where families stall, so this detail is the point.
  const regSummary: RegistrationSummary | null =
    primary && (primary.status === "accepted" || primary.status === "placement_review")
      ? await getRegistrationSummary(primary.id)
      : null;

  const daysLeftText = (d: number) =>
    d === 0
      ? t("offers.expiresToday")
      : d === 1
        ? t("offers.oneDayLeft")
        : `${d} ${t("offers.daysLeftSuffix")}`;

  const longDate = (iso: string) =>
    new Date(iso).toLocaleDateString(localeTag, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });

  const shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString(localeTag, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  // enrollment_window.open_date/close_date are TIMESTAMPTZ stored as UTC
  // midnight — format in UTC so "Oct 26 00:00Z" never renders as Oct 25 for
  // a family west of Greenwich (same fix as app/(public)/landing-client.tsx
  // formatDate).
  const windowDate = (iso: string) =>
    new Intl.DateTimeFormat(localeTag, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(iso));

  /**
   * Real window-derived date note for the "Where {name} is" section — only
   * for the pre-lottery statuses where the window's own dates are still the
   * live fact. Never invents a lottery date: enrollment_window has no such
   * column, so a closed, pre-lottery window simply omits this note.
   */
  const windowDateNote = (card: FamilyJourneyCard): string | null => {
    if (!WINDOW_CHIP_STATUSES.has(card.status) || !card.enrollment_window) return null;
    const now = Date.now();
    const openMs = new Date(card.enrollment_window.open_date).getTime();
    const closeMs = new Date(card.enrollment_window.close_date).getTime();
    if (now < openMs) {
      return t("public.applicationsOpen").replace("{date}", windowDate(card.enrollment_window.open_date));
    }
    if (now <= closeMs) {
      return t("dashboard.window.closesOn").replace("{date}", windowDate(card.enrollment_window.close_date));
    }
    return null; // closed, pre-lottery — no real lottery date exists to show yet
  };

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
      case "waitlisted": // "See what happened" link rendered inline instead of the action row
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

  const nameOf = (card: FamilyJourneyCard) => card.student_name || t("dashboard.resume.newApp");

  // The single task-shaped headline. Degrades where data doesn't exist yet —
  // see the deviation notes in the phase-1a handoff report.
  function headlineFor(card: FamilyJourneyCard): string {
    const name = nameOf(card);
    switch (card.status) {
      case "draft":
        return t("dashboard.headline.finishApplication").replace("{name}", name);
      case "submitted":
      case "needs_info":
      case "verified":
      case "lottery_assigned":
        return t("dashboard.headline.nothingToDo");
      case "offered":
        return card.pending_offer
          ? t("dashboard.headline.respondBy").replace("{date}", longDate(card.pending_offer.expires_at))
          : t("dashboard.headline.checkApplication").replace("{name}", name);
      case "accepted":
      case "placement_review": {
        // "Your turn: N documents" from the real outstanding count; falls back
        // to plain "Finish registration" when the packet has no items left or
        // isn't set up yet.
        const n = regSummary?.outstanding.length ?? 0;
        if (n === 1) return t("dashboard.headline.yourTurnOne");
        if (n > 1) return t("dashboard.headline.yourTurnDocs").replace("{n}", String(n));
        return t("dashboard.headline.finishRegistration");
      }
      case "registered":
      case "enrolled":
        return t("dashboard.headline.enrolled").replace("{name}", name);
      case "waitlisted":
        return card.waitlist_standing
          ? t("dashboard.headline.waitlistPosition")
              .replace("{name}", name)
              .replace("{position}", String(card.waitlist_standing.position))
          : t("dashboard.headline.waitlistGeneric").replace("{name}", name);
      default:
        return t("dashboard.headline.checkApplication").replace("{name}", name);
    }
  }

  function shortNoteFor(card: FamilyJourneyCard): string {
    switch (card.status) {
      case "registered":
      case "enrolled":
        return t("dashboard.otherNote.nothingNeeded");
      case "draft":
        return t("dashboard.otherNote.notStarted");
      case "offered":
        return t("dashboard.otherNote.waitingResponse");
      case "accepted":
      case "placement_review":
        return t("dashboard.otherNote.registering");
      case "waitlisted":
        return t("dashboard.otherNote.waitlisted");
      case "submitted":
      case "needs_info":
      case "verified":
      case "lottery_assigned":
        return t("dashboard.otherNote.inReview");
      default:
        return t("dashboard.otherNote.closed");
    }
  }

  const journey2Steps = [
    t("steps.applied"),
    t("journey2.offeredSeat"),
    t("journey2.finishRegistration"),
    t("journey2.firstDay"),
  ];

  if (!hasApps) {
    return (
      <div className="max-w-xl mx-auto">
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-ink font-medium">{t("dashboard.noApplications")}</p>
            <p className="text-sm text-stone-text">{t("dashboard.startFirstApp")}</p>
            <Link href="/family/applications/new" className="inline-block pt-2">
              <Button>{t("dashboard.startNewApplication")}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const primaryCard = primary as FamilyJourneyCard;
  const primaryName = nameOf(primaryCard);
  const action = actionFor(primaryCard);
  const isPrimaryAsk = !!action && !action.outline;

  const eyebrow = [
    primaryName,
    primaryCard.grade ? `${t("offers.grade")} ${primaryCard.grade}` : "",
    primaryCard.campus_name,
  ]
    .filter(Boolean)
    .join(" · ");

  let reassurance: string | null = null;
  if (isPrimaryAsk) {
    reassurance =
      primaryCard.status === "offered" && primaryCard.pending_offer
        ? t("dashboard.reassurance.withDate")
            .replace("{name}", primaryName)
            .replace("{date}", longDate(primaryCard.pending_offer.expires_at))
        : t("dashboard.reassurance.general");
  }

  const journeyIndex = JOURNEY2_INDEX[primaryCard.status];
  const onJourney = journeyIndex !== undefined;
  const journeyAria =
    journeyIndex !== undefined && journeyIndex >= journey2Steps.length
      ? t("journey.aria.complete")
      : `${t("journey.aria.step")} ${(journeyIndex ?? 0) + 1} ${t("journey.aria.of")} ${journey2Steps.length}: ${journey2Steps[journeyIndex ?? 0]}`;

  // Help line — a plain-text sentence with an inline link, assembled from a
  // translated template so word order stays correct in both languages.
  const helpLinkText = t("dashboard.helpLine.messageLink");
  const helpTemplate = primaryCard.campus_phone
    ? t("dashboard.helpLine.withPhone")
    : t("dashboard.helpLine.noPhone");
  const [helpBefore, helpAfterRaw] = helpTemplate.split("{link}");
  const helpAfter = primaryCard.campus_phone
    ? helpAfterRaw.replace("{phone}", primaryCard.campus_phone)
    : helpAfterRaw;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Quiet top-right entry point for a second application — deliberately
          low-weight so it never competes with the primary card below. */}
      <div className="flex justify-end -mb-4">
        <Link
          href="/family/applications/new"
          className="text-xs font-medium text-stone-text hover:text-rooted-green transition-colors"
        >
          + {t("dashboard.startNewApplication")}
        </Link>
      </div>

      {/* ─── Eyebrow + task headline ─── */}
      <div>
        <p className="font-display text-[11px] uppercase tracking-[0.12em] text-stone-text font-semibold">
          {eyebrow}
        </p>
        <h1 className="font-display text-[27px] md:text-[34px] font-extrabold uppercase tracking-wide text-ink leading-tight mt-1">
          {headlineFor(primaryCard)}
        </h1>
      </div>

      {/* ─── Primary card — the one element that may look like it needs the parent ─── */}
      <Card>
        <CardContent className="p-6 space-y-4">
          {primaryCard.status === "offered" && primaryCard.pending_offer && (
            <p className="text-sm text-ink/70">
              {t("offers.expiresOn")} {longDate(primaryCard.pending_offer.expires_at)} ·{" "}
              <span className={primaryCard.pending_offer.is_urgent ? "font-semibold text-error" : "font-semibold"}>
                {daysLeftText(primaryCard.pending_offer.days_remaining)}
              </span>
            </p>
          )}

          {regSummary && regSummary.outstanding.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-ink">
                {t("dashboard.reg.progress")
                  .replace("{done}", String(regSummary.completed))
                  .replace("{total}", String(regSummary.total))}
              </p>
              <ul className="space-y-2">
                {regSummary.outstanding.map((item) => (
                  <li key={item.name} className="border border-line rounded-lg px-3 py-2.5">
                    <p className="text-sm font-medium text-ink">{item.name}</p>
                    {item.hint && <p className="text-xs text-stone-text mt-0.5">{item.hint}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {action && (
            <Link href={action.href} className="block">
              <Button
                className={`w-full font-display uppercase tracking-[0.08em] ${action.urgent ? "bg-error hover:bg-error/90 text-white" : ""}`}
                variant={action.outline ? "outline" : "default"}
              >
                {action.label}
              </Button>
            </Link>
          )}

          {isPrimaryAsk && (
            <p className="text-xs text-stone-text text-center">{t("dashboard.takesTwoMinutes")}</p>
          )}

          {primaryCard.registration_complete && (
            <p className="text-sm font-medium text-rooted-green">{t("card.celebration")}</p>
          )}

          {reassurance && (
            <div className="bg-rooted-green/5 border-t border-rooted-green/20 -mx-6 -mb-6 px-6 py-3 mt-2">
              <p className="text-sm text-ink/70">{reassurance}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Where {name} is ─── */}
      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">
          {t("dashboard.whereIs").replace("{name}", primaryName)}
        </h2>
        {onJourney ? (
          <div className="space-y-2">
            <JourneyTimeline
              steps={journey2Steps}
              currentIndex={journeyIndex}
              size="md"
              ariaLabel={journeyAria}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-text">
              {primaryCard.submitted_at && (
                <span>{t("dashboard.appliedOn").replace("{date}", shortDate(primaryCard.submitted_at))}</span>
              )}
              {journeyIndex > 0 && (
                <span>{t("dashboard.updatedOn").replace("{date}", shortDate(primaryCard.updated_at))}</span>
              )}
              {windowDateNote(primaryCard) && <span>{windowDateNote(primaryCard)}</span>}
            </div>
            {journeyIndex === 0 && primaryCard.status !== "draft" && (
              <Link
                href="/how-the-lottery-works"
                className="text-xs text-rooted-green hover:underline inline-block"
              >
                {t("lottery.inlineLink")}
              </Link>
            )}
          </div>
        ) : primaryCard.status === "waitlisted" ? (
          <div className="space-y-1">
            {primaryCard.waitlist_standing && (
              <>
                <p className="text-sm font-semibold text-rooted-green">
                  {t("card.waitlistStanding")
                    .replace("{position}", String(primaryCard.waitlist_standing.position))
                    .replace("{total}", String(primaryCard.waitlist_standing.total))}
                </p>
                {/* Only shown when the movement is real (>=2 history rows AND
                    a genuine improvement) — never an inferred prior position. */}
                {primaryCard.waitlist_standing.movedFrom && (
                  <p className="text-xs text-ink/60">
                    {t("card.waitlistMoved")
                      .replace("{from}", String(primaryCard.waitlist_standing.movedFrom.position))
                      .replace("{to}", String(primaryCard.waitlist_standing.position))
                      .replace("{date}", shortDate(primaryCard.waitlist_standing.movedFrom.asOf))}
                  </p>
                )}
              </>
            )}
            <p className="text-sm text-ink/60">{t("card.waitlistNote")}</p>
            <Link
              href={`/family/lottery/${primaryCard.id}`}
              className="text-sm text-rooted-green hover:underline inline-block"
            >
              {t("card.seeLotteryResult")} &rarr;
            </Link>
          </div>
        ) : (
          <p className="text-sm text-ink/60">{t("card.closedNote")}</p>
        )}
      </div>

      {/* ─── Your applications — every application as an equal, clearly-labeled
           card, each individually viewable, so a family with more than one
           child is never unsure which is which or which one they're working
           on. Shown only when there is more than one; a single-child family
           has the guided card above. Includes the primary so the list is the
           complete set, not "the others." ─── */}
      {sortedCards.length > 1 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">{t("dashboard.yourApplications")}</h2>
          <div className="space-y-2">
            {sortedCards.map((card) => {
              const statusLabel = getFamilyStatusLabel(card.status, locale);

              return (
                <div
                  key={card.id}
                  className="flex items-center justify-between gap-3 rounded-[8px] border border-line bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">
                      {nameOf(card)}
                      {card.grade ? ` · ${t("offers.grade")} ${card.grade}` : ""}
                    </p>
                    <p className="text-xs text-ink/60 mt-0.5">
                      {statusLabel} · {shortNoteFor(card)}
                    </p>
                  </div>
                  <Link
                    href={`/family/applications/${card.id}`}
                    className="shrink-0 rounded-[6px] border border-rooted-green/40 px-3 py-1.5 text-xs font-semibold text-rooted-green hover:bg-rooted-green/10"
                  >
                    {t("apps.viewDetails")}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── How enrollment works — collapsed to a single link ─── */}
      <details className="group">
        <summary className="cursor-pointer list-none text-sm font-medium text-rooted-green hover:underline inline-flex items-center gap-1.5">
          {t("dashboard.howItWorks")}
          <svg
            className="w-3.5 h-3.5 transition-transform group-open:rotate-180"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </summary>
        <ol className="mt-3 space-y-2.5 text-sm text-ink/70">
          {[1, 2, 3, 4, 5].map((step) => (
            <li key={step} className="flex gap-2.5">
              <span className="text-stone-text font-semibold shrink-0">{step}.</span>
              <span>
                <span className="text-ink font-medium">
                  {t(`dashboard.step${step}Title` as Parameters<typeof tx>[0])}
                </span>
                {" — "}
                {t(`dashboard.step${step}Desc` as Parameters<typeof tx>[0])}
              </span>
            </li>
          ))}
        </ol>
      </details>

      {/* ─── Help line ─── */}
      <p className="text-sm text-stone-text">
        {helpBefore}
        <Link href="/family/messages" className="text-rooted-green hover:underline">
          {helpLinkText}
        </Link>
        {helpAfter}
      </p>
    </div>
  );
}
