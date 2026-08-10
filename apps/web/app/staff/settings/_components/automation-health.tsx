import { IconCheckCircle, IconAlertTriangle, IconClock } from "@/components/ui/icons";
import { cn, displayClass } from "@/lib/utils";
import type { AutomationHealthRow } from "@/lib/queries/automation-health";

interface AutomationHealthProps {
  rows: AutomationHealthRow[];
  overdueJourneySteps: number | null;
}

/**
 * Honest scheduled-automation status for the staff who depend on it.
 *
 * A heartbeat stamp is only proof, never an assumption: no stamp means "No
 * runs recorded yet," not a fabricated time or a quiet green light. Server
 * component only — the data comes from lib/queries/automation-health.ts,
 * which uses the service-role client and must never be imported client-side.
 */

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

interface StatusChip {
  label: string;
  icon: typeof IconCheckCircle;
  className: string;
}

function statusChip(row: AutomationHealthRow): StatusChip {
  const relative = row.stamp ? formatRelativeTime(row.stamp.at) : null;

  switch (row.status) {
    case "ok":
      return {
        label: `Ran ${relative} ago`,
        icon: IconCheckCircle,
        className: "border-rooted-green/30 bg-rooted-green/10 text-deep-green",
      };
    case "overdue":
      return {
        label: `Last ran ${relative} ago — overdue`,
        icon: IconAlertTriangle,
        className: "border-warn/30 bg-warn/10 text-warn-text",
      };
    case "failed":
      return {
        label: `Last run failed (${relative} ago)`,
        icon: IconAlertTriangle,
        className: "border-error/30 bg-error/10 text-error",
      };
    case "unknown":
    default:
      return {
        label: "No runs recorded yet",
        icon: IconClock,
        className: "border-line bg-sunken text-stone-text",
      };
  }
}

export function AutomationHealth({ rows, overdueJourneySteps }: AutomationHealthProps) {
  const needsAttention = rows.filter((row) => row.status === "failed" || row.status === "overdue").length;

  return (
    <section className="rounded-[6px] border border-line bg-white">
      <div className="border-b border-line px-4 py-3">
        <h2 className={cn("text-sm font-semibold uppercase tracking-wide text-ink", displayClass)}>
          Automation health
        </h2>
        <p className="mt-1 text-xs text-stone">
          Whether each scheduled automation is actually running.
        </p>
        {needsAttention > 0 && (
          <p className="mt-2 inline-block rounded-[6px] border border-warn/30 bg-warn/10 px-2 py-1 text-xs font-medium text-warn-text">
            {needsAttention} automations need attention.
          </p>
        )}
      </div>
      <ul className="divide-y divide-line">
        {rows.map((row) => {
          const chip = statusChip(row);
          const Icon = chip.icon;
          const summary = row.stamp?.summary;

          return (
            <li key={row.job.key} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{row.job.label}</p>
                <p className="mt-0.5 text-xs text-stone-text">{row.job.purpose}</p>
                {row.status === "unknown" && (
                  <p className="mt-0.5 text-xs text-stone">
                    Stamps begin recording after the first run following this deploy.
                  </p>
                )}
                {summary && Object.keys(summary).length > 0 && (
                  <p className="mt-0.5 text-xs text-stone">
                    {Object.entries(summary)
                      .map(([key, value]) => `${key} ${value}`)
                      .join(", ")}
                  </p>
                )}
              </div>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border px-2 py-1 text-xs font-medium",
                  chip.className
                )}
              >
                <Icon size={14} aria-hidden />
                {chip.label}
              </span>
            </li>
          );
        })}
      </ul>
      {overdueJourneySteps !== null && overdueJourneySteps > 0 && (
        <p className="border-t border-line px-4 py-3 text-xs font-medium text-warn-text">
          {overdueJourneySteps} journey steps are overdue by more than a day — the journey engine may be stalled.
        </p>
      )}
      {overdueJourneySteps === null && (
        <p className="border-t border-line px-4 py-3 text-xs text-stone">
          Journey backlog could not be checked.
        </p>
      )}
    </section>
  );
}
