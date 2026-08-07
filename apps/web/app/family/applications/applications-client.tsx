"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconFileText } from "@/components/ui/icons";
import Link from "next/link";
import { getStatusConfig, getFamilyStatusLabel, getGradeLabel } from "@/lib/application-helpers";
import type { ApplicationRow } from "@/lib/queries";
import { useLocale } from "@/lib/i18n/locale-context";
import type { TranslationKey } from "@/lib/i18n/translations";

/**
 * Statuses with a parent-language one-liner in translations.ts
 * (statusMsg.*). Unknown/future statuses render no message rather than a
 * wrong one.
 */
const STATUS_MSG_KEYS = [
  "draft", "submitted", "needs_info", "verified", "lottery_assigned",
  "offered", "accepted", "waitlisted", "registered", "placement_review",
  "enrolled", "declined", "expired", "withdrawn",
] as const;

function statusMessageKey(status: string): TranslationKey | null {
  return (STATUS_MSG_KEYS as readonly string[]).includes(status)
    ? (`statusMsg.${status}` as TranslationKey)
    : null;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface FamilyApplicationsClientProps {
  applications: ApplicationRow[];
}

export function FamilyApplicationsClient({ applications }: FamilyApplicationsClientProps) {
  const { t, locale } = useLocale();
  const hasApplications = applications.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t("apps.heading")}</h1>
          <p className="text-sm text-stone-text mt-1">
            Track the status of your children&apos;s enrollment applications.
          </p>
        </div>
        {/* Outline, not solid — this competes with a draft's "Continue" button
            or the empty-state's own primary CTA. One solid action per screen. */}
        <Link href="/family/applications/new">
          <Button variant="outline">{t("dashboard.startNewApplication")}</Button>
        </Link>
      </div>

      {!hasApplications ? (
        <EmptyState
          icon={<IconFileText size={40} />}
          title={t("apps.noApplications")}
          description={t("apps.noApplicationsDetail")}
        >
          <Link href="/family/applications/new">
            <Button>{t("apps.startApplication")}</Button>
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => {
            const cfg = getStatusConfig(app.status);
            const statusLabel = getFamilyStatusLabel(app.status, locale);
            const statusMsgKey = statusMessageKey(app.status);
            const statusMessage = statusMsgKey ? t(statusMsgKey) : "";
            const isDraft = app.status === "draft";
            const needsAction =
              app.status === "needs_info" ||
              app.status === "offered" ||
              app.status === "draft";

            return (
              <Card
                key={app.id}
                className={
                  app.status === "offered"
                    ? "border-rooted-green bg-green-50/30 shadow-md"
                    : app.status === "registered"
                      ? "border-green-200 bg-green-50/20"
                      : needsAction
                        ? "border-amber-200 bg-amber-50/30"
                        : undefined
                }
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-base">
                        {app.student_name}
                      </CardTitle>
                      <p className="text-sm text-stone-text">
                        {getGradeLabel(app.grade)} &middot; {app.campus_name}
                      </p>
                    </div>
                    <Badge variant={cfg.variant}>{statusLabel}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {statusMessage && (
                    <p className="text-sm text-ink/60">{statusMessage}</p>
                  )}

                  {needsAction && (
                    <div className="bg-white border border-amber-200 rounded-md p-3">
                      <p className="text-xs font-medium text-amber-800 mb-1">
                        {t("apps.actionNeeded")}
                      </p>
                      <p className="text-sm text-ink/70">
                        {isDraft
                          ? "Complete and submit your application before the enrollment window closes."
                          : app.status === "needs_info"
                            ? "Additional information or documents have been requested."
                            : "Please respond to the enrollment offer before the deadline."}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-rooted-gray">
                    <div className="flex gap-4 text-xs text-stone-text">
                      {app.submitted_at && (
                        <span>{t("apps.submitted")}: {formatDate(app.submitted_at)}</span>
                      )}
                      <span>{t("apps.lastUpdated")}: {formatDate(app.updated_at)}</span>
                    </div>
                    <div className="flex gap-2">
                      {isDraft ? (
                        <Link href={`/family/applications/${app.id}/edit`}>
                          <Button size="sm">{t("apps.continueApp")}</Button>
                        </Link>
                      ) : (
                        <Link href={`/family/applications/${app.id}`}>
                          <Button variant="outline" size="sm">
                            {t("apps.viewDetails")}
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
