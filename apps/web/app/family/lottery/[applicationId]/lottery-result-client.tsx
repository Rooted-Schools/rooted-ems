"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import type { LotteryOutcome } from "@/lib/queries";
import { IconCheckCircle, IconClock, IconSearch, IconTicket } from "@/components/ui/icons";

interface Props {
  outcome: LotteryOutcome | null;
}

export function LotteryResultClient({ outcome }: Props) {
  const { t, locale } = useLocale();
  const localeTag = locale === "es" ? "es-US" : "en-US";

  // ── Ownership failed / application not found ──────────────────────────────
  if (!outcome) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-4">
          <div className="flex justify-center text-stone">
            <IconSearch size={40} />
          </div>
          <h1 className="text-xl font-bold text-ink">{t("lotteryResult.notFoundTitle")}</h1>
          <p className="text-sm text-stone max-w-sm mx-auto">
            {t("lotteryResult.notFoundBody")}
          </p>
          <Link href="/family/dashboard">
            <Button variant="outline">{t("common.backToDashboard")}</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // ── Application owned, but the lottery hasn't run yet ──────────────────────
  if (!outcome.hasResult) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-4">
          <div className="flex justify-center text-stone">
            <IconTicket size={40} />
          </div>
          <h1 className="text-xl font-bold text-ink">{t("lotteryResult.noResultYetTitle")}</h1>
          <p className="text-sm text-stone max-w-sm mx-auto">
            {t("lotteryResult.noResultYetBody")}
          </p>
          <Link href="/family/dashboard">
            <Button variant="outline">{t("common.backToDashboard")}</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const {
    studentFirstName: name,
    campusName,
    isSelected,
    gradeLabel,
    totalApplicants,
    totalSeats,
    tierLabel,
    randomNumber,
    seedFingerprint,
    executedAt,
    waitlist,
  } = outcome;

  const runDate = executedAt
    ? new Date(executedAt).toLocaleDateString(localeTag, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const waitlistBadge = waitlist
    ? t("lotteryResult.badgeWaitlisted").replace("{position}", String(waitlist.position))
    : t("lotteryResult.badgeWaitlistedNoNum");

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div
        className={`rounded-xl p-6 text-center space-y-2 border ${
          isSelected
            ? "bg-rooted-green/10 border-rooted-green/30"
            : "bg-amber-50 border-amber-200"
        }`}
      >
        <div className={`flex justify-center ${isSelected ? "text-rooted-green" : "text-amber-600"}`}>
          {isSelected ? <IconCheckCircle size={40} /> : <IconClock size={40} />}
        </div>
        <h1 className="text-2xl font-bold text-ink">
          {name} — <span className="font-normal">{campusName}</span>
        </h1>
        <Badge variant={isSelected ? "success" : "warning"} className="text-sm">
          {isSelected ? t("lotteryResult.badgeOffered") : waitlistBadge}
        </Badge>
      </div>

      {/* ── Stats card ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("lotteryResult.statsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-stone text-xs uppercase tracking-wide mb-0.5">
                {t("lotteryResult.applicantsFor").replace("{grade}", gradeLabel)}
              </p>
              <p className="font-medium text-ink">{totalApplicants}</p>
            </div>
            <div>
              <p className="text-stone text-xs uppercase tracking-wide mb-0.5">
                {t("lotteryResult.seatsAvailable")}
              </p>
              <p className="font-medium text-ink">{totalSeats}</p>
            </div>
            <div>
              <p className="text-stone text-xs uppercase tracking-wide mb-0.5">
                {t("lotteryResult.priorityGroup")}
              </p>
              <p className="font-medium text-ink">{tierLabel}</p>
            </div>
          </div>

          {!isSelected && waitlist && (
            <div className="border-t border-rooted-gray pt-3 space-y-1">
              <p className="text-sm font-semibold text-rooted-green">
                {t("lotteryResult.placeInLine")
                  .replace("{position}", String(waitlist.position))
                  .replace("{total}", String(waitlist.total))}
              </p>
              {/* Real movement only — shown when at least 2 history rows exist
                  AND the position genuinely improved. Never a fabricated
                  "moved from" claim. */}
              {waitlist.movedFrom && (
                <p className="text-xs text-ink/60">
                  {t("lotteryResult.movedFrom")
                    .replace("{from}", String(waitlist.movedFrom.position))
                    .replace("{to}", String(waitlist.position))
                    .replace(
                      "{date}",
                      new Date(waitlist.movedFrom.asOf).toLocaleDateString(localeTag, {
                        month: "long",
                        day: "numeric",
                      })
                    )}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── What happened ── */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <p className="text-sm font-semibold text-ink">{t("lotteryResult.whatHappenedTitle")}</p>
          <div className="space-y-2 text-sm text-ink/70">
            <p>{t("lotteryResult.explainStep1")}</p>
            <p>{t("lotteryResult.explainStep2")}</p>
            <p className="font-medium text-ink">
              {(isSelected
                ? t("lotteryResult.explainOffered")
                : t("lotteryResult.explainWaitlisted")
              ).replace("{name}", name)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── What happens next ── */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <p className="text-sm font-semibold text-ink">{t("lotteryResult.nextTitle")}</p>
          <div className="space-y-2 text-sm text-ink/70">
            {isSelected ? (
              <div className="flex items-start gap-2">
                <IconCheckCircle size={16} className="text-rooted-green mt-0.5 shrink-0" />
                <span>{t("lotteryResult.nextOffered1")}</span>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <IconCheckCircle size={16} className="text-rooted-green mt-0.5 shrink-0" />
                  <span>{t("lotteryResult.nextWaitlisted1")}</span>
                </div>
                <div className="flex items-start gap-2">
                  <IconCheckCircle size={16} className="text-rooted-green mt-0.5 shrink-0" />
                  <span>{t("lotteryResult.nextWaitlisted2").replace("{name}", name)}</span>
                </div>
                <div className="flex items-start gap-2">
                  <IconCheckCircle size={16} className="text-rooted-green mt-0.5 shrink-0" />
                  <span>{t("lotteryResult.nextWaitlisted3")}</span>
                </div>
              </>
            )}
          </div>
          {isSelected && (
            <Link href="/family/offers">
              <Button className="bg-rooted-green hover:bg-rooted-green/90 text-white">
                {t("lotteryResult.nextOfferedCta")}
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>

      {/* ── Verification details (collapsed) ── */}
      <details className="rounded-lg border border-stone/20 bg-white p-4 text-sm">
        <summary className="cursor-pointer font-semibold text-ink">
          {t("lotteryResult.verificationTitle")}
        </summary>
        <div className="mt-3 space-y-2 text-ink/70">
          <p>{t("lotteryResult.verificationNote")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <p className="text-stone text-xs uppercase tracking-wide mb-0.5">
                {t("lotteryResult.runDate")}
              </p>
              <p className="font-medium text-ink">{runDate || "—"}</p>
            </div>
            <div>
              <p className="text-stone text-xs uppercase tracking-wide mb-0.5">
                {t("lotteryResult.verificationId")}
              </p>
              <p className="font-medium text-ink font-mono">{seedFingerprint ?? "—"}</p>
            </div>
            <div>
              <p className="text-stone text-xs uppercase tracking-wide mb-0.5">
                {t("lotteryResult.yourNumber").replace("{name}", name)}
              </p>
              <p className="font-medium text-ink font-mono">
                {randomNumber != null ? randomNumber.toFixed(6) : "—"}
              </p>
            </div>
          </div>
        </div>
      </details>

      <div>
        <Link
          href="/family/dashboard"
          className="text-sm text-rooted-green hover:underline"
        >
          &larr; {t("common.backToDashboard")}
        </Link>
      </div>
    </div>
  );
}
