"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn, displayClass } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { IconPhone, IconInfo, IconX, IconAlertTriangle, IconUsers, IconCalendar, IconClock } from "@/components/ui/icons";
// From the leaf module, NOT the "@/lib/queries" barrel: the barrel re-exports
// server-only queries that reach next/headers, which fails the client build.
import { formatRelativeTime } from "@/lib/queries/utils";
import { textExpiringOffers, sendRegistrationNudges, releaseSeats, markRegistrationContacted } from "./actions";
import { registrationNudgeSubject, registrationNudgeBody, registrationNudgeSms } from "@/lib/nudge-copy";
import type { RegistrationCompletionStats, CallEscalationRow, MeltRiskRow } from "@/lib/queries/melt";
import type { LeaderStripStats } from "@/lib/queries/leads";
import type { NextEventRow } from "@/lib/queries/events";
import type { NextWindowOpen } from "@/lib/queries/dashboard";

/* ------------------------------------------------------------------ */
/*  Types shared with the server component                             */
/* ------------------------------------------------------------------ */

export type RowUrgency = "red" | "amber" | "green" | "stone";

export type RowAction =
  | { kind: "text_offers"; label: string; offerIds: string[]; style: "solid-red" | "solid-amber" }
  | { kind: "navigate"; label: string; href: string; style: "outline" | "solid-green" }
  | { kind: "send_nudges"; label: string; enrollmentIds: string[]; style: "outline" }
  | { kind: "release_seats"; label: string; waitlistPositionIds: string[]; style: "outline" };

export interface ExceptionRow {
  key: "expiring_offers" | "documents_waiting" | "stalled_registrations" | "releasable_seats" | "duplicate_suspects";
  urgency: RowUrgency;
  /** Eyebrow label above the sentence — only present when a real deadline anchors it */
  eyebrow: string | null;
  sentence: string;
  subline?: string;
  actions: RowAction[];
}

export interface SeatProgressGroup {
  grade: string;
  total: number;
  enrolled: number;
  offerOut: number;
  unfilled: number;
}

interface TodayClientProps {
  firstName: string;
  timeOfDay: "morning" | "afternoon" | "evening";
  schoolYearName: string | null;
  rows: ExceptionRow[];
  timeCriticalCount: number;
  seatProgress: SeatProgressGroup[];
  registrationCompletion: RegistrationCompletionStats;
  callEscalationQueue: CallEscalationRow[];
  /** Enrolled families with no PERSONAL contact in 14+ days (playbook MELT_RISK). */
  meltRiskQueue: MeltRiskRow[];
  meltRiskAvailable: boolean;
  callEscalationAvailable: boolean;
  /** True when the user landed here via requireMinRole/requireCMOAccess bouncing them off a page they don't have access to. */
  denied?: boolean;
  /** enrollment_manager+ only — the leader strip is a leadership overview row. */
  showLeaderStrip: boolean;
  leaderStripStats: LeaderStripStats;
  nextEvent: NextEventRow | null;
  nextWindowOpen: NextWindowOpen | null;
}

/* ------------------------------------------------------------------ */
/*  Styling maps                                                       */
/* ------------------------------------------------------------------ */

const BORDER_BY_URGENCY: Record<RowUrgency, string> = {
  red: "border-l-error",
  amber: "border-l-warn",
  green: "border-l-rooted-green",
  stone: "border-l-stone",
};

const EYEBROW_COLOR: Record<RowUrgency, string> = {
  red: "text-error",
  amber: "text-warn-text",
  green: "text-rooted-green-700",
  stone: "text-stone",
};

const ACTION_BUTTON_STYLE: Record<string, string> = {
  "solid-red": "bg-error text-white hover:bg-error/90",
  "solid-amber": "bg-warn text-white hover:bg-warn/90",
  "solid-green": "bg-deep-green text-white hover:bg-rooted-green-700",
  outline: "border border-line bg-white text-ink hover:bg-sunken",
};

function ActionButton({
  children,
  style,
  onClick,
  disabled,
  href,
}: {
  children: React.ReactNode;
  style: string;
  onClick?: () => void;
  disabled?: boolean;
  href?: string;
}) {
  const className = cn(
    "inline-flex min-h-[44px] items-center justify-center rounded-[6px] px-4 text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none",
    displayClass,
    ACTION_BUTTON_STYLE[style]
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/** Every row sentence is written to carry its number first — bold just that lead number. */
function Sentence({ text }: { text: string }) {
  const match = text.match(/^(\d[\d,]*)([\s\S]*)$/);
  if (!match) return <>{text}</>;
  return (
    <>
      <strong className="font-semibold">{match[1]}</strong>
      {match[2]}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Row component                                                      */
/* ------------------------------------------------------------------ */

function ExceptionRowCard({
  row,
  onResolved,
}: {
  row: ExceptionRow;
  onResolved: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleTextOffers(offerIds: string[]) {
    startTransition(async () => {
      const result = await textExpiringOffers(offerIds);
      if (!result.ok) {
        toast({ variant: "error", title: "Could not text families", description: result.error ?? "Please try again." });
        return;
      }
      if (!result.smsConfigured) {
        toast({
          variant: "info",
          title: "Texting isn't connected in this environment",
          description: "Opening the offers list so you can follow up directly.",
        });
        router.push("/staff/offers");
        return;
      }
      toast({
        variant: "success",
        title: `Texted ${result.texted} of ${result.total} famil${result.total === 1 ? "y" : "ies"}`,
        description:
          result.texted < result.total
            ? `${result.total - result.texted} haven't opted into texts — they still got an email.`
            : "Every family also got an email.",
      });
    });
  }

  function handleSendNudges(enrollmentIds: string[]) {
    startTransition(async () => {
      const result = await sendRegistrationNudges(enrollmentIds);
      if (!result.ok) {
        toast({ variant: "error", title: "Could not send nudges", description: result.error ?? "Please try again." });
        return;
      }
      toast({
        variant: "success",
        title: `Nudged ${result.count} famil${result.count === 1 ? "y" : "ies"}`,
        description: "Email and text (where opted in) sent with what's still missing.",
      });
    });
  }

  function handleReleaseSeats(waitlistPositionIds: string[]) {
    startTransition(async () => {
      const result = await releaseSeats(waitlistPositionIds);
      if (!result.ok) {
        toast({ variant: "error", title: "Could not release seats", description: result.error ?? "Please try again." });
        return;
      }
      if (result.releasedCount === 0) {
        toast({ variant: "info", title: "No seats released", description: "Those waitlist positions may have already moved." });
        return;
      }
      toast({
        variant: "success",
        title: `Released ${result.releasedCount} seat${result.releasedCount === 1 ? "" : "s"}`,
        description:
          result.studentNames.length > 0
            ? `Offer${result.studentNames.length === 1 ? "" : "s"} sent to ${result.studentNames.join(", ")}.`
            : undefined,
      });
      onResolved(); // this exception class is now resolved — drop the row
    });
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-4 rounded-[10px] border border-line bg-white p-4 sm:p-[18px] border-l-4",
        BORDER_BY_URGENCY[row.urgency]
      )}
    >
      <div className="min-w-0 flex-1 basis-64">
        {row.eyebrow && (
          <p className={cn("mb-1 font-display text-[11px] font-semibold uppercase tracking-[0.08em]", EYEBROW_COLOR[row.urgency])}>
            {row.eyebrow}
          </p>
        )}
        <p className="text-[15px] leading-snug text-ink">
          <Sentence text={row.sentence} />
        </p>
        {row.subline && <p className="mt-1 text-sm text-stone">{row.subline}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {row.actions.map((action, idx) => {
          if (action.kind === "navigate") {
            return (
              <ActionButton key={idx} style={action.style} href={action.href}>
                {action.label}
              </ActionButton>
            );
          }
          if (action.kind === "text_offers") {
            return (
              <ActionButton key={idx} style={action.style} disabled={isPending} onClick={() => handleTextOffers(action.offerIds)}>
                {isPending ? "Sending…" : action.label}
              </ActionButton>
            );
          }
          if (action.kind === "send_nudges") {
            return (
              <ActionButton key={idx} style={action.style} disabled={isPending} onClick={() => handleSendNudges(action.enrollmentIds)}>
                {isPending ? "Sending…" : action.label}
              </ActionButton>
            );
          }
          if (action.kind === "release_seats") {
            return (
              <ActionButton
                key={idx}
                style={action.style}
                disabled={isPending}
                onClick={() => handleReleaseSeats(action.waitlistPositionIds)}
              >
                {isPending ? "Releasing…" : action.label}
              </ActionButton>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Headline stat strip — registration completion                      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Leader strip — compact single-row overview for enrollment_manager+ */
/* ------------------------------------------------------------------ */

/** Window dates are stored as UTC midnight — format in UTC so a viewer west
 *  of Greenwich never sees the date shift back a day (see
 *  app/(public)/landing-client.tsx formatDate for the same fix). */
function formatUtcDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function daysUntilUtc(iso: string): number {
  const target = new Date(iso);
  const targetUtcMidnight = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  const now = new Date();
  const nowUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((targetUtcMidnight - nowUtcMidnight) / (1000 * 60 * 60 * 24));
}

function LeaderStrip({
  stats,
  nextEvent,
  nextWindowOpen,
}: {
  stats: LeaderStripStats;
  nextEvent: NextEventRow | null;
  nextWindowOpen: NextWindowOpen | null;
}) {
  const daysUntilOpen = nextWindowOpen ? daysUntilUtc(nextWindowOpen.open_date) : null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-white px-3 py-2.5 sm:px-4">
      <span className="inline-flex items-center gap-1.5 text-sm text-ink">
        <IconUsers size={15} className="text-stone" aria-hidden="true" />
        <strong className="font-semibold">{stats.newFamiliesThisWeek}</strong>
        <span className="text-stone">new famil{stats.newFamiliesThisWeek === 1 ? "y" : "ies"} this week</span>
      </span>
      <span className="h-4 w-px bg-line" aria-hidden="true" />
      <span className="inline-flex items-center gap-1.5 text-sm text-ink">
        <IconPhone size={15} className="text-stone" aria-hidden="true" />
        <strong className="font-semibold">{stats.contactsLoggedThisWeek}</strong>
        <span className="text-stone">contact{stats.contactsLoggedThisWeek === 1 ? "" : "s"} logged this week</span>
      </span>
      <span className="h-4 w-px bg-line" aria-hidden="true" />
      <span className="inline-flex items-center gap-1.5 text-sm text-ink">
        <IconCalendar size={15} className="text-stone" aria-hidden="true" />
        {nextEvent ? (
          <span>
            <span className="font-medium">{nextEvent.title}</span>
            <span className="text-stone"> &middot; {formatUtcDate(nextEvent.starts_at)}</span>
          </span>
        ) : (
          <span className="text-stone">No event scheduled</span>
        )}
      </span>
      {daysUntilOpen !== null && (
        <>
          <span className="h-4 w-px bg-line" aria-hidden="true" />
          <span className="inline-flex items-center gap-1.5 text-sm text-ink">
            <IconClock size={15} className="text-stone" aria-hidden="true" />
            <strong className="font-semibold">{Math.max(0, daysUntilOpen)}</strong>
            <span className="text-stone">
              day{Math.max(0, daysUntilOpen) === 1 ? "" : "s"} until applications open
              {nextWindowOpen && nextWindowOpen.campus_name ? ` (${nextWindowOpen.campus_name})` : ""}
            </span>
          </span>
        </>
      )}
    </div>
  );
}

function RegistrationCompletionStrip({ stat }: { stat: RegistrationCompletionStats }) {
  return (
    <div className="rounded-[10px] border border-line bg-white p-4 sm:p-[18px]">
      <p className={cn("text-[11px] font-semibold uppercase tracking-[0.08em] text-stone", displayClass)}>
        Registration completion
      </p>
      {stat.packetsCreated === 0 ? (
        <p className="mt-1 text-[15px] text-ink">No registration packets yet this cycle.</p>
      ) : (
        <p className="mt-1 text-[15px] text-ink">
          <strong className="font-semibold">{stat.completionRate}%</strong> ({stat.packetsComplete} of{" "}
          {stat.packetsCreated})
          {stat.schoolYearName && <span className="text-stone"> &middot; {stat.schoolYearName}</span>}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Call escalation queue — "Needs a phone call"                       */
/* ------------------------------------------------------------------ */

/** Relative "Nudged today / 2 days ago" label from a real timestamp. */
function nudgedAgoLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Nudged today";
  if (days === 1) return "Nudged yesterday";
  return `Nudged ${days} days ago`;
}

function CallQueueRowCard({
  row,
  onContacted,
}: {
  row: CallEscalationRow;
  onContacted: () => void;
}) {
  const { toast } = useToast();
  const [isContacting, startContacting] = useTransition();
  const [isNudging, startNudging] = useTransition();
  // Persistent confirmation: survives past the toast so staff coming back to
  // the tab still see the nudge went out. Seeded from the real timestamp.
  const [nudgedAtIso, setNudgedAtIso] = useState<string | null>(row.last_nudged_at);
  const [showPreview, setShowPreview] = useState(false);

  const nudgedToday =
    nudgedAtIso !== null && Date.now() - new Date(nudgedAtIso).getTime() < 24 * 60 * 60 * 1000;

  function handleMarkContacted() {
    startContacting(async () => {
      const result = await markRegistrationContacted(row.enrollment_id);
      if (!result.ok) {
        toast({ variant: "error", title: "Could not log the call", description: result.error ?? "Please try again." });
        return;
      }
      toast({
        variant: "success",
        title: `Logged a call to ${row.guardian_name}`,
        description: "Noted with your name and removed from the call list for 7 days.",
      });
      onContacted();
    });
  }

  function handleSendNudge() {
    startNudging(async () => {
      const result = await sendRegistrationNudges([row.enrollment_id]);
      if (!result.ok) {
        toast({ variant: "error", title: "Could not send nudge", description: result.error ?? "Please try again." });
        return;
      }
      if (result.count > 0) {
        setNudgedAtIso(new Date().toISOString());
        toast({
          variant: "success",
          title: `Nudge sent to ${row.guardian_name}`,
          description:
            "In-app message and email sent, plus a text if they opted in. It names their exact missing items. They stay on your call list until you log a call.",
        });
      } else {
        toast({
          variant: "info",
          title: "Nothing left to nudge",
          description: "No outstanding items were found for this family.",
        });
      }
    });
  }

  const shown = row.outstanding_item_names.slice(0, 3);
  const more = row.outstanding_item_names.length - shown.length;
  const count = row.outstanding_item_names.length;
  const studentFirstName = row.student_name.split(/\s+/)[0] || undefined;

  return (
    <div className="rounded-[6px] border border-line bg-white p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-[15px] font-medium text-ink">
            {row.student_name}
            {nudgedAtIso && (
              <span className="ml-2 inline-flex items-center rounded-[6px] bg-sunken px-1.5 py-0.5 text-[11px] font-medium text-ink/70">
                {nudgedAgoLabel(nudgedAtIso)}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-stone">
            {row.guardian_name}
            {row.guardian_phone ? (
              <>
                {" "}
                &middot;{" "}
                <a href={`tel:${row.guardian_phone}`} className="text-rooted-green hover:text-deep-green">
                  {row.guardian_phone}
                </a>
              </>
            ) : (
              <> &middot; No phone on file</>
            )}
          </p>
          <p className="mt-1 text-xs text-stone">
            Stalled {row.days_stalled} day{row.days_stalled === 1 ? "" : "s"}
            {count > 0 && (
              <>
                {" "}
                &middot; {count} outstanding: {shown.join(", ")}
                {more > 0 ? `, +${more} more` : ""}
              </>
            )}
            {" "}&middot;{" "}
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="text-rooted-green underline decoration-dotted underline-offset-2 hover:text-deep-green"
            >
              {showPreview ? "Hide nudge message" : "What does the nudge say?"}
            </button>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ActionButton style="outline" disabled={isNudging || nudgedToday} onClick={handleSendNudge}>
            {isNudging ? "Sending…" : nudgedToday ? "Nudged today" : "Send nudge"}
          </ActionButton>
          <ActionButton style="solid-green" disabled={isContacting} onClick={handleMarkContacted}>
            {isContacting ? "Logging…" : "Mark contacted"}
          </ActionButton>
        </div>
      </div>
      {showPreview && (
        <div className="mt-3 rounded-[6px] border border-line bg-sunken/60 p-3 text-xs text-ink/80">
          <p className="font-semibold uppercase tracking-wide text-[10px] text-stone-text">
            What this family receives
          </p>
          <p className="mt-1.5">
            <span className="font-medium">In-app + email:</span>{" "}
            &ldquo;{registrationNudgeSubject(count)}&rdquo; &mdash;{" "}
            {registrationNudgeBody({
              studentName: row.student_name,
              campusName: row.campus_name || "their school",
              missingNames: row.outstanding_item_names,
            })}{" "}
            The email lists the same items with a button to finish registration, in English and Spanish.
          </p>
          <p className="mt-1.5">
            <span className="font-medium">Text (only if they opted in):</span>{" "}
            &ldquo;{registrationNudgeSms({
              studentFirstName,
              campusName: row.campus_name || "their school",
              count,
            }).split("\n")[0]}&rdquo;{" "}
            plus the same line in Spanish.
          </p>
        </div>
      )}
    </div>
  );
}

function CallEscalationSection({
  rows,
  onContacted,
  available,
}: {
  rows: CallEscalationRow[];
  onContacted: (packetId: string) => void;
  available: boolean;
}) {
  if (!available) {
    return (
      <div className="rounded-[10px] border border-line bg-white p-4 sm:p-[18px]">
        <div className="mb-1 flex items-center gap-2">
          <IconPhone size={16} className="text-stone" />
          <h2 className={cn("text-sm font-semibold text-ink", displayClass)}>Needs a phone call</h2>
        </div>
        <p className="text-sm text-stone">Call list activates after database migration 00036 is applied.</p>
      </div>
    );
  }

  if (rows.length === 0) return null;

  return (
    <div className="rounded-[10px] border border-line bg-white p-4 sm:p-[18px]">
      <div className="mb-1 flex items-center gap-2">
        <IconPhone size={16} className="text-stone" />
        <h2 className={cn("text-sm font-semibold text-ink", displayClass)}>Needs a phone call</h2>
      </div>
      <p className="mb-4 text-sm text-stone">
        {rows.length} famil{rows.length === 1 ? "y has" : "ies have"} been stalled a week or more — an automated
        nudge already went out and didn't move them. A call is the next real step.
      </p>
      <div className="space-y-2">
        {rows.map((row) => (
          <CallQueueRowCard key={row.packet_id} row={row} onContacted={() => onContacted(row.packet_id)} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MELT_RISK — playbook PB 24 v2.2                                     */
/* ------------------------------------------------------------------ */

/**
 * The families this surfaces look completely healthy everywhere else in the
 * app: registration complete, every document in, nothing outstanding. That is
 * the whole problem. They said yes months ago and nobody has spoken to them
 * since, and the playbook's answer is that silence past 14 days is itself the
 * exception worth acting on.
 *
 * Shows the automated-email date next to the silence deliberately, because the
 * natural staff reaction is "but we've been emailing them". Four emails and no
 * conversation is the pattern, not the mitigation.
 */
function MeltRiskSection({
  rows,
  available,
}: {
  rows: MeltRiskRow[];
  available: boolean;
}) {
  if (!available) {
    return (
      <div className="rounded-[10px] border border-line bg-white p-4 sm:p-[18px]">
        <div className="mb-1 flex items-center gap-2">
          <IconAlertTriangle size={16} className="text-stone" />
          <h2 className={cn("text-sm font-semibold text-ink", displayClass)}>Summer melt risk</h2>
        </div>
        <p className="text-sm text-stone">
          Melt risk activates after database migration 00041 is applied.
        </p>
      </div>
    );
  }

  if (rows.length === 0) return null;

  const neverContacted = rows.filter((r) => r.days_since_contact === null).length;

  return (
    <div className="rounded-[10px] border border-warn/40 bg-white p-4 sm:p-[18px]">
      <div className="mb-1 flex items-center gap-2">
        <IconAlertTriangle size={16} className="text-warn" />
        <h2 className={cn("text-sm font-semibold text-ink", displayClass)}>Summer melt risk</h2>
      </div>
      <p className="mb-4 text-sm text-stone">
        {rows.length} enrolled famil{rows.length === 1 ? "y has" : "ies have"} had no personal contact in 14+ days
        {neverContacted > 0 && <> ({neverContacted} never contacted at all)</>}. Registration is complete, so nothing
        else in the app will flag them. The playbook standard is weekly personal outreach through the first day of school.
      </p>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.packet_id}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-line bg-sunken/40 px-3 py-2.5"
          >
            <div className="min-w-0">
              <span className="text-sm font-medium text-ink">{row.student_name}</span>
              <span className="text-sm text-stone"> &middot; {row.guardian_name}</span>
              {row.guardian_phone && (
                <a
                  href={`tel:${row.guardian_phone}`}
                  className="ml-2 text-sm text-rooted-green underline underline-offset-2"
                >
                  {row.guardian_phone}
                </a>
              )}
            </div>
            <div className="text-xs text-stone">
              {row.days_since_contact === null
                ? "Never contacted"
                : `${row.days_since_contact} days since contact`}
              {row.last_outreach_at && (
                <> &middot; last automated email {formatRelativeTime(row.last_outreach_at)}</>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Seat progress bars                                                  */
/* ------------------------------------------------------------------ */

function SeatProgressBar({ group }: { group: SeatProgressGroup }) {
  const total = Math.max(1, group.total);
  const enrolledPct = (group.enrolled / total) * 100;
  const offerOutPct = (group.offerOut / total) * 100;
  const unfilledPct = Math.max(0, 100 - enrolledPct - offerOutPct);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink">{group.grade}</span>
        <span className="text-xs text-stone">
          {group.enrolled} of {group.total} &middot; {group.unfilled} open
        </span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-sunken">
        <div className="bg-rooted-green" style={{ width: `${enrolledPct}%` }} title={`Enrolled: ${group.enrolled}`} />
        <div className="bg-warn" style={{ width: `${offerOutPct}%` }} title={`Offer out: ${group.offerOut}`} />
        <div className="bg-sunken" style={{ width: `${unfilledPct}%` }} title={`Unfilled: ${group.unfilled}`} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

export function TodayClient({
  firstName,
  timeOfDay,
  schoolYearName,
  rows: initialRows,
  timeCriticalCount,
  seatProgress,
  registrationCompletion,
  callEscalationQueue: initialCallEscalationQueue,
  callEscalationAvailable,
  meltRiskQueue,
  meltRiskAvailable,
  denied = false,
  showLeaderStrip,
  leaderStripStats,
  nextEvent,
  nextWindowOpen,
}: TodayClientProps) {
  const [rows, setRows] = useState(initialRows);
  const [callQueue, setCallQueue] = useState(initialCallEscalationQueue);
  const [deniedVisible, setDeniedVisible] = useState(denied);

  // The `timeOfDay` prop is computed on the server, whose clock is UTC on
  // Vercel — so it greets by UTC hour, not the viewer's. Recompute from the
  // browser clock after mount (post-hydration to avoid an SSR mismatch); the
  // server value is only ever shown for the first paint.
  const [localTimeOfDay, setLocalTimeOfDay] = useState(timeOfDay);
  useEffect(() => {
    const h = new Date().getHours();
    setLocalTimeOfDay(h < 12 ? "morning" : h < 18 ? "afternoon" : "evening");
  }, []);

  function dropRow(key: ExceptionRow["key"]) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function dropCallQueueRow(packetId: string) {
    setCallQueue((prev) => prev.filter((r) => r.packet_id !== packetId));
  }

  return (
    <div className="space-y-6">
      {/* Slim page header: school year, new-application shortcut, search hint */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs text-stone">
          {schoolYearName && <span className="font-medium text-ink">{schoolYearName}</span>}
          <span className="hidden sm:inline rounded-[6px] border border-line bg-sunken px-2 py-1 text-[11px] text-stone">
            &#8984;K to search
          </span>
        </div>
        <Link
          href="/staff/applications/new"
          className={cn(
            "inline-flex min-h-[44px] items-center justify-center rounded-[6px] bg-deep-green px-4 text-sm font-medium text-white transition-colors hover:bg-rooted-green-700",
            displayClass
          )}
        >
          New application
        </Link>
      </div>

      {/* Denied-access banner — shown after requireMinRole/requireCMOAccess
          bounces the user off a page their role doesn't cover. Quiet and
          dismissible; explains, doesn't scold. */}
      {deniedVisible && (
        <div className="flex items-start gap-2.5 rounded-[6px] border border-line bg-sunken p-3 text-sm text-ink/70">
          <IconInfo size={16} className="shrink-0 mt-0.5 text-stone" aria-hidden="true" />
          <p className="flex-1">
            That page needs manager access. Ask your administrator if you need it.
          </p>
          <button
            type="button"
            onClick={() => setDeniedVisible(false)}
            aria-label="Dismiss"
            className="inline-flex h-9 min-h-[44px] w-9 shrink-0 items-center justify-center rounded-[6px] text-stone hover:bg-white hover:text-ink"
          >
            <IconX size={14} />
          </button>
        </div>
      )}

      {/* Greeting */}
      <div>
        <h1 className={cn("text-2xl font-bold text-ink", displayClass)}>
          Good {localTimeOfDay}, {firstName}.
        </h1>
        <p className="mt-1 text-sm text-stone">
          {rows.length === 0
            ? "Nothing else needs a decision today."
            : `${rows.length} thing${rows.length === 1 ? "" : "s"} need${rows.length === 1 ? "s" : ""} you today.${
                timeCriticalCount > 0
                  ? ` ${timeCriticalCount} ${timeCriticalCount === 1 ? "is" : "are"} time-critical.`
                  : ""
              }`}
        </p>
      </div>

      {/* Leader strip — compact overview row, enrollment_manager+ only */}
      {showLeaderStrip && (
        <LeaderStrip stats={leaderStripStats} nextEvent={nextEvent} nextWindowOpen={nextWindowOpen} />
      )}

      {/* Headline stat strip */}
      <RegistrationCompletionStrip stat={registrationCompletion} />

      {/* Exception rows */}
      {rows.length === 0 ? (
        <div className="rounded-[10px] border border-line bg-white p-8 text-center">
          <p className="text-sm text-ink">Nothing else needs a decision today.</p>
          <Link href="/staff/pipeline" className="mt-2 inline-block text-sm text-rooted-green hover:text-deep-green">
            View Pipeline &rarr;
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <ExceptionRowCard key={row.key} row={row} onResolved={() => dropRow(row.key)} />
          ))}
        </div>
      )}

      {/* Needs a phone call — registration melt escalation */}
      <CallEscalationSection rows={callQueue} onContacted={dropCallQueueRow} available={callEscalationAvailable} />

      {/* Summer melt risk — enrolled families who have gone quiet */}
      <MeltRiskSection rows={meltRiskQueue} available={meltRiskAvailable} />

      {/* Per-grade seat progress */}
      {seatProgress.length > 0 && (
        <div className="rounded-[10px] border border-line bg-white p-4 sm:p-[18px]">
          <h2 className={cn("mb-4 text-sm font-semibold text-ink", displayClass)}>Seats by grade</h2>
          <div className="space-y-4">
            {seatProgress.map((group) => (
              <SeatProgressBar key={group.grade} group={group} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3">
            <span className="flex items-center gap-1.5 text-xs text-stone">
              <span className="h-2 w-2 rounded-full bg-rooted-green" /> Enrolled
            </span>
            <span className="flex items-center gap-1.5 text-xs text-stone">
              <span className="h-2 w-2 rounded-full bg-warn" /> Offer out
            </span>
            <span className="flex items-center gap-1.5 text-xs text-stone">
              <span className="h-2 w-2 rounded-full bg-sunken border border-line" /> Unfilled
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
