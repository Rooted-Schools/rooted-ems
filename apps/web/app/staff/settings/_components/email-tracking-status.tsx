import { IconCheckCircle, IconAlertTriangle, IconInfo } from "@/components/ui/icons";
import { cn, displayClass } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/queries/utils";
import type { EmailTrackingHealth } from "@/lib/queries/email-tracking-health";

interface EmailTrackingStatusProps {
  health: EmailTrackingHealth;
}

function StatusPill({ ok, okLabel, offLabel }: { ok: boolean; okLabel: string; offLabel: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border px-2 py-1 text-xs font-medium",
        ok
          ? "border-rooted-green/30 bg-rooted-green/10 text-deep-green"
          : "border-warn/30 bg-warn/10 text-ink"
      )}
    >
      {ok ? <IconCheckCircle size={14} aria-hidden /> : <IconAlertTriangle size={14} aria-hidden />}
      {ok ? okLabel : offLabel}
    </span>
  );
}

/**
 * A definitive "is email engagement tracking live?" readout, so staff don't
 * have to infer it from a campaign that reads all zeros.
 *
 * Two gates decide whether delivered/opened/clicked numbers can ever be
 * non-zero — the webhook secret being present, and events actually arriving —
 * and both fail silently. This surfaces each one plainly. See
 * getEmailTrackingHealth for the full reasoning.
 */
export function EmailTrackingStatus({ health }: EmailTrackingStatusProps) {
  const eventsArriving =
    health.deliveredCount > 0 || health.openedCount > 0 || health.clickedCount > 0;

  const signals: { label: string; count: number; last: string | null }[] = [
    { label: "Delivered", count: health.deliveredCount, last: health.lastDeliveredAt },
    { label: "Opened", count: health.openedCount, last: health.lastOpenedAt },
    { label: "Clicked", count: health.clickedCount, last: health.lastClickedAt },
  ];

  return (
    <section className="rounded-[6px] border border-line bg-white">
      <div className="border-b border-line px-4 py-3">
        <h2 className={cn("text-sm font-semibold uppercase tracking-wide text-ink", displayClass)}>
          Email delivery tracking
        </h2>
        <p className="mt-1 text-xs text-stone">
          Whether Resend is reporting delivered, opened, and clicked back into the system.
        </p>
      </div>

      <div className="divide-y divide-line">
        {/* Gate 1: the webhook secret. */}
        <div className="flex flex-wrap items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Webhook signing secret</p>
            {!health.webhookSecretConfigured && (
              <p className="mt-0.5 text-xs text-stone">
                RESEND_WEBHOOK_SECRET is not set, so signed events from Resend are rejected and no
                engagement is recorded. Set it in the deployment environment and redeploy.
              </p>
            )}
          </div>
          <StatusPill ok={health.webhookSecretConfigured} okLabel="Configured" offLabel="Missing" />
        </div>

        {/* Gate 2: events actually landing. */}
        <div className="flex flex-wrap items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Events arriving</p>
            {!eventsArriving && (
              <p className="mt-0.5 text-xs text-stone">
                No delivered, opened, or clicked events have been recorded yet. If the secret is
                configured, confirm the endpoint URL and that open/click tracking is enabled in
                Resend.
              </p>
            )}
          </div>
          <StatusPill ok={eventsArriving} okLabel="Receiving" offLabel="None yet" />
        </div>

        {/* Per-signal detail — counts and how recently each last fired. */}
        <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-3">
          {signals.map((s) => (
            <div key={s.label} className="rounded-[6px] border border-line bg-sunken/40 px-3 py-2">
              <p className="text-xs text-stone">{s.label}</p>
              <p className="text-lg font-semibold text-ink">{s.count.toLocaleString()}</p>
              <p className="mt-0.5 text-xs text-stone">
                {s.last ? `last ${formatRelativeTime(s.last)}` : "none yet"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-line px-4 py-3">
        <p className="flex items-start gap-1.5 text-xs text-stone">
          <IconInfo size={14} className="mt-0.5 shrink-0" aria-hidden />
          Delivery and open/click counts feed the per-campaign engagement summary. Both gates above
          must be green before those numbers move off zero.
        </p>
      </div>
    </section>
  );
}
