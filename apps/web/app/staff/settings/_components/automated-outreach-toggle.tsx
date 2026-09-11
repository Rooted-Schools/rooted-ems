"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconMail, IconAlertTriangle } from "@/components/ui/icons";
import { cn, displayClass } from "@/lib/utils";
import { staffSetAutomatedOutreach } from "../actions";

interface AutomatedOutreachToggleProps {
  enabled: boolean;
  /** system_admin (network) only — the action enforces this independently. */
  canEdit: boolean;
}

/**
 * Master pause for the automated, cron-driven outreach that emails the whole
 * existing lead list on a schedule: the daily re-engagement nudge
 * (cron/reengage-leads) and the automated nurture journeys (cron/run-journeys).
 *
 * This is the pre-launch "stop emailing everyone" switch. It does NOT touch the
 * instant welcome (its own toggle above), and it does NOT stop staff-created
 * campaigns, which are always deliberate. Pausing changes nothing about lead
 * capture or the pipeline — leads still come in and route; they just get no
 * automatic scheduled follow-up.
 */
export function AutomatedOutreachToggle({ enabled, canEdit }: AutomatedOutreachToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle(next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await staffSetAutomatedOutreach(next);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section className="rounded-[6px] border border-line bg-white">
      <div className="border-b border-line px-4 py-3">
        <h2 className={cn("text-sm font-semibold uppercase tracking-wide text-ink", displayClass)}>
          Automated outreach
        </h2>
        <p className="mt-1 text-xs text-stone">
          Scheduled re-engagement nudges and nurture journeys sent to the existing lead list. Pause
          before launch to stop all automatic emails to leads. Staff-created campaigns are
          unaffected.
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-3 px-4 py-3">
        <IconMail size={18} className="mt-0.5 shrink-0 text-stone" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">Re-engagement &amp; nurture journeys</p>
          {!enabled && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-[6px] border border-warn/30 bg-warn/10 px-2 py-1 text-xs font-medium text-warn-text">
              <IconAlertTriangle size={14} aria-hidden />
              Paused: no automatic emails are being sent to leads
            </p>
          )}
          {error && <p className="mt-1.5 text-xs font-medium text-error">{error}</p>}
          {!canEdit && (
            <p className="mt-1.5 text-xs text-stone">Only a network admin can change this.</p>
          )}
        </div>
        <label
          className={cn(
            "relative inline-flex min-h-[44px] shrink-0 items-center",
            canEdit && !isPending ? "cursor-pointer" : "cursor-not-allowed opacity-60"
          )}
          title={enabled ? "On — pause" : "Paused — resume"}
        >
          <input
            type="checkbox"
            checked={enabled}
            disabled={!canEdit || isPending}
            onChange={(e) => handleToggle(e.target.checked)}
            className="sr-only peer"
            aria-label="Automated outreach"
          />
          <div className="w-9 h-5 bg-rooted-gray-dark/30 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-rooted-green/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone/30 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rooted-green peer-disabled:opacity-50" />
        </label>
      </div>
    </section>
  );
}
