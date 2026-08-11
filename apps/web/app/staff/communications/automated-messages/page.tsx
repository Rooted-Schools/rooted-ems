export const runtime = "edge";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireStaffSession } from "@/lib/auth/get-session";
import { IconMail, IconPhone, IconBell, IconAlertTriangle } from "@/components/ui/icons";
import {
  AUTOMATED_MESSAGES,
  FUNNEL_STAGE_ORDER,
  type AutomatedMessageEntry,
  type MessageChannel,
} from "@/lib/automated-messages";
import { isWelcomeMessagingEnabled } from "@/lib/messaging-flags";
import { getPausedJourneyCount } from "@/lib/queries/journeys";

/**
 * Read-only catalog of every automated family-facing message the system
 * sends, rendered with sample data. Templates contain no PII, so a plain
 * requireStaffSession() gate (any staff role, any campus) is enough — this
 * page exists precisely so staff of any role can answer "what did the
 * family get?" without paging a developer.
 */
export default async function AutomatedMessagesPage() {
  await requireStaffSession();
  const welcomeMessagingEnabled = await isWelcomeMessagingEnabled();
  const pausedJourneyCount = await getPausedJourneyCount();

  const groups = FUNNEL_STAGE_ORDER.map((stage) => ({
    stage,
    entries: AUTOMATED_MESSAGES.filter((e) => e.funnelStage === stage),
  })).filter((g) => g.entries.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Automated messages</h1>
        <p className="text-sm text-stone mt-1">
          What every automated email and text actually says, so anyone on staff can answer
          &ldquo;what did the family get?&rdquo; without asking engineering.
        </p>
      </div>

      <div className="rounded-[6px] border border-line bg-sunken/60 p-4 text-sm text-ink/80">
        <p>
          Exactly what families receive, rendered with sample data. Sample family: Jordan Rivera.
          These are read-only previews of the real templates &mdash; the same code that sends is
          the code that rendered this page.
        </p>
        <p className="mt-2 text-xs text-stone-text">
          Text messages send only to families who opted in, once texting is connected.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2 text-xs" aria-label="Jump to funnel stage">
        {groups.map(({ stage }) => (
          <a
            key={stage}
            href={`#${slug(stage)}`}
            className="rounded-[6px] border border-line bg-white px-2.5 py-1 text-ink/70 hover:bg-sunken"
          >
            {stage}
          </a>
        ))}
      </nav>

      {groups.map(({ stage, entries }) => (
        <section key={stage} id={slug(stage)} className="space-y-3 scroll-mt-6">
          <h2 className="text-lg font-semibold text-ink">{stage}</h2>
          {stage === "Inquiry & Recruitment" && !welcomeMessagingEnabled && (
            <p className="flex items-center gap-1.5 rounded-[6px] border border-warn/30 bg-warn/10 px-3 py-2 text-xs font-medium text-warn-text">
              <IconAlertTriangle size={14} aria-hidden />
              Welcome messages are currently paused in Settings.
            </p>
          )}
          {stage === "Campaign building blocks" && pausedJourneyCount > 0 && (
            <p className="flex items-center gap-1.5 rounded-[6px] border border-warn/30 bg-warn/10 px-3 py-2 text-xs font-medium text-warn-text">
              <IconAlertTriangle size={14} aria-hidden />
              {pausedJourneyCount} nurture journey{pausedJourneyCount === 1 ? " is" : "s are"} currently paused — no
              sends until resumed.{" "}
              <Link href="/staff/recruitment/journeys" className="underline">
                Manage journeys
              </Link>
            </p>
          )}
          <div className="space-y-3">
            {entries.map((entry) => (
              <MessageCard key={entry.key} entry={entry} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function slug(stage: string): string {
  return stage
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const CHANNEL_CONFIG: Record<MessageChannel, { label: string; icon: React.ReactNode }> = {
  email: { label: "Email", icon: <IconMail size={12} /> },
  sms: { label: "SMS", icon: <IconPhone size={12} /> },
  in_app: { label: "In-app", icon: <IconBell size={12} /> },
};

function ChannelBadge({ channel }: { channel: MessageChannel }) {
  const c = CHANNEL_CONFIG[channel];
  return (
    <span className="inline-flex items-center gap-1 rounded-[6px] bg-sunken px-1.5 py-0.5 text-[11px] font-medium text-ink/70">
      {c.icon}
      {c.label}
    </span>
  );
}

function MessageCard({ entry }: { entry: AutomatedMessageEntry }) {
  const email = entry.channels.includes("email") ? entry.renderEmail?.() : undefined;
  const sms = entry.channels.includes("sms") ? entry.renderSms?.() : undefined;
  const hasInApp = entry.channels.includes("in_app");

  return (
    <div className="rounded-[6px] border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-ink">{entry.label}</p>
          <p className="mt-1 text-xs text-stone-text">{entry.trigger}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {entry.channels.map((ch) => (
            <ChannelBadge key={ch} channel={ch} />
          ))}
        </div>
      </div>

      {email && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone">Email subject</p>
          <p className="mt-0.5 text-sm font-medium text-ink">{email.subject}</p>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-stone">Email body</p>
          <pre className="mt-1 whitespace-pre-wrap rounded-[6px] bg-sunken p-3 font-mono text-[12.5px] leading-relaxed text-ink/80">
            {email.text}
          </pre>
        </div>
      )}

      {sms && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone">Text message</p>
          <pre className="mt-1 whitespace-pre-wrap rounded-[6px] bg-sunken p-3 font-mono text-[12.5px] leading-relaxed text-ink/80">
            {sms}
          </pre>
        </div>
      )}

      {hasInApp && (
        <p className="mt-3 text-xs text-stone">
          Also appears as an in-app notification in the family portal.
        </p>
      )}
    </div>
  );
}
