"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconMessageSquare, IconAlertTriangle } from "@/components/ui/icons";
import { cn, displayClass } from "@/lib/utils";
import { staffSetWelcomeMessages } from "../actions";

interface WelcomeMessagingToggleProps {
  enabled: boolean;
  /** system_admin only — the mutation layer enforces this independently; this
   *  just keeps the control from appearing interactive to a role that would
   *  get a forbidden redirect on submit. */
  canEdit: boolean;
}

/**
 * Owner-facing pause switch for the instant bilingual welcome (email +
 * consented SMS) that fires for every brand-new lead. A sibling section to
 * ChannelStatus rather than a row inside it — ChannelStatus is a read-only,
 * any-role status card reporting what the environment *can* send; this is an
 * admin-gated control that changes what the system *does* send, so it gets
 * its own card and its own audit trail.
 *
 * Pausing never stops lead creation or staff routing — a paused family still
 * lands in the pipeline and the follow-up queue, they just get no automatic
 * first message. See lib/messaging-flags.ts.
 */
export function WelcomeMessagingToggle({ enabled, canEdit }: WelcomeMessagingToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle(next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await staffSetWelcomeMessages(next);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-[6px] border border-line bg-white">
      <div className="border-b border-line px-4 py-3">
        <h2 className={cn("text-sm font-semibold uppercase tracking-wide text-ink", displayClass)}>
          Welcome messages
        </h2>
        <p className="mt-1 text-xs text-stone">
          Instant bilingual welcome to every new inquiry. Pause while teams train; new families
          are still captured and appear in the follow-up queue.
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-3 px-4 py-3">
        <IconMessageSquare size={18} className="mt-0.5 shrink-0 text-stone" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">Public inquiry form &amp; daily sheet sync</p>
          {!enabled && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-[6px] border border-warn/30 bg-warn/10 px-2 py-1 text-xs font-medium text-warn-text">
              <IconAlertTriangle size={14} aria-hidden />
              Paused: new families receive no automatic welcome
            </p>
          )}
          {error && <p className="mt-1.5 text-xs font-medium text-error">{error}</p>}
          {!canEdit && (
            <p className="mt-1.5 text-xs text-stone">Only a system admin can change this.</p>
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
            aria-label="Welcome messages"
          />
          <div className="w-9 h-5 bg-rooted-gray-dark/30 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-rooted-green/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone/30 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rooted-green peer-disabled:opacity-50" />
        </label>
      </div>
    </section>
  );
}
