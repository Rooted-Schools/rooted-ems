"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { familySetReenrollmentIntent } from "./actions";
import { useLocale } from "@/lib/i18n/locale-context";
import { IconCheckCircle, IconHelpCircle, IconX } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

type Intent = "yes" | "undecided" | "no";

interface ReenrollmentIntentPulseProps {
  enrollmentId: string;
  studentName: string;
  campusName: string;
  grade: string;
  schoolYearName: string;
  initialIntent: Intent | null;
}

/**
 * One-tap "are you returning?" pulse for a currently active enrollment.
 * Three big, single-tap answers — no form, no typing. Families can change
 * their answer anytime before staff send a formal seat offer.
 */
export function ReenrollmentIntentPulse({
  enrollmentId,
  studentName,
  campusName,
  grade,
  schoolYearName,
  initialIntent,
}: ReenrollmentIntentPulseProps) {
  const { t } = useLocale();
  const [intent, setIntent] = React.useState<Intent | null>(initialIntent);
  const [pending, setPending] = React.useState<Intent | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(initialIntent === null);

  async function handleTap(next: Intent) {
    setPending(next);
    setError(null);
    const result = await familySetReenrollmentIntent(enrollmentId, next);
    setPending(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setIntent(next);
    setEditing(false);
  }

  const savedMessage =
    intent === "yes"
      ? t("reenroll.pulseYesSaved").replace("{student}", studentName)
      : intent === "undecided"
        ? t("reenroll.pulseDecidingSaved")
        : intent === "no"
          ? t("reenroll.pulseNoSaved").replace("{student}", studentName)
          : null;

  const savedTone =
    intent === "yes" ? "rooted-green" : intent === "undecided" ? "warn" : "stone";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{studentName}</CardTitle>
        <CardDescription>
          {campusName} &middot; {t("offers.grade")} {grade} &middot; {schoolYearName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        {!editing && savedMessage ? (
          <div
            className={cn(
              "rounded-[6px] border px-4 py-3 flex items-center justify-between gap-3",
              savedTone === "rooted-green" && "bg-rooted-green/10 border-rooted-green/30",
              savedTone === "warn" && "bg-warn/10 border-warn/30",
              savedTone === "stone" && "bg-stone/10 border-stone/20"
            )}
          >
            <p
              className={cn(
                "text-sm font-medium",
                savedTone === "rooted-green" && "text-rooted-green",
                savedTone === "warn" && "text-warn-text",
                savedTone === "stone" && "text-stone"
              )}
            >
              {savedMessage}
            </p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-sm text-ink underline underline-offset-2 shrink-0"
            >
              {t("reenroll.pulseChangeAnswer")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink">
              {t("reenroll.pulseQuestion")
                .replace("{student}", studentName)
                .replace("{year}", schoolYearName)}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => handleTap("yes")}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-[6px] border border-rooted-green/30 bg-rooted-green/10 px-4 py-4 text-sm font-semibold text-rooted-green hover:bg-rooted-green/20 disabled:opacity-50 transition-colors"
              >
                <IconCheckCircle size={18} />
                {pending === "yes"
                  ? t("reenroll.pulseSaving")
                  : t("reenroll.pulseYes").replace("{student}", studentName)}
              </button>
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => handleTap("undecided")}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-[6px] border border-warn/40 bg-warn/10 px-4 py-4 text-sm font-semibold text-warn-text hover:bg-warn/20 disabled:opacity-50 transition-colors"
              >
                <IconHelpCircle size={18} />
                {pending === "undecided" ? t("reenroll.pulseSaving") : t("reenroll.pulseDeciding")}
              </button>
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => handleTap("no")}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-[6px] border border-stone/30 bg-stone/10 px-4 py-4 text-sm font-semibold text-stone hover:bg-stone/20 disabled:opacity-50 transition-colors"
              >
                <IconX size={18} />
                {pending === "no" ? t("reenroll.pulseSaving") : t("reenroll.pulseNo")}
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
