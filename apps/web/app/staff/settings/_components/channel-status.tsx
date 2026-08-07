import { IconMail, IconMessageSquare, IconCheckCircle, IconAlertTriangle } from "@/components/ui/icons";
import { cn, displayClass } from "@/lib/utils";

interface ChannelStatusProps {
  emailConfigured: boolean;
  smsConfigured: boolean;
}

interface Channel {
  name: string;
  provider: string;
  configured: boolean;
  icon: typeof IconMail;
  /** What actually happens to a send while this channel is off. */
  whenOff: string;
}

/**
 * Honest delivery-channel state for the staff who rely on it.
 *
 * The notify fan-out no-ops silently when a provider isn't configured — which
 * is the right behavior for the code and the wrong thing for a person to have
 * to guess at. This says plainly which channels are live, so nobody assumes a
 * family was texted when no text could have left the system.
 *
 * Reads only whether credentials are present. It never renders the values.
 */
export function ChannelStatus({ emailConfigured, smsConfigured }: ChannelStatusProps) {
  const channels: Channel[] = [
    {
      name: "Email",
      provider: "Resend",
      configured: emailConfigured,
      icon: IconMail,
      whenOff: "Emails are skipped. In-app notifications still reach families.",
    },
    {
      name: "Text messages",
      provider: "Twilio",
      configured: smsConfigured,
      icon: IconMessageSquare,
      whenOff: "Texts are skipped. Actions report \"not connected\" rather than a send.",
    },
  ];

  return (
    <section className="rounded-[6px] border border-line bg-white">
      <div className="border-b border-line px-4 py-3">
        <h2 className={cn("text-sm font-semibold uppercase tracking-wide text-ink", displayClass)}>
          Delivery channels
        </h2>
        <p className="mt-1 text-xs text-stone">
          Which notification channels this environment can actually send on.
        </p>
      </div>
      <ul className="divide-y divide-line">
        {channels.map((channel) => {
          const Icon = channel.icon;
          return (
            <li key={channel.name} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <Icon size={18} className="mt-0.5 shrink-0 text-stone" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {channel.name}{" "}
                  <span className="font-normal text-stone">via {channel.provider}</span>
                </p>
                {!channel.configured && (
                  <p className="mt-0.5 text-xs text-stone">{channel.whenOff}</p>
                )}
              </div>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border px-2 py-1 text-xs font-medium",
                  channel.configured
                    ? "border-rooted-green/30 bg-rooted-green/10 text-deep-green"
                    : "border-warn/30 bg-warn/10 text-ink"
                )}
              >
                {channel.configured ? (
                  <IconCheckCircle size={14} aria-hidden />
                ) : (
                  <IconAlertTriangle size={14} aria-hidden />
                )}
                {channel.configured ? "Connected" : "Not connected"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
