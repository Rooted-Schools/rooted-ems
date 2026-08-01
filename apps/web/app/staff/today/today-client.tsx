"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { textExpiringOffers, sendRegistrationNudges, releaseSeats } from "./actions";

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
          <p className={cn("mb-1 text-[11px] font-semibold uppercase tracking-[0.08em]", EYEBROW_COLOR[row.urgency])}>
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
}: TodayClientProps) {
  const [rows, setRows] = useState(initialRows);

  function dropRow(key: ExceptionRow["key"]) {
    setRows((prev) => prev.filter((r) => r.key !== key));
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
          className="inline-flex min-h-[44px] items-center justify-center rounded-[6px] bg-deep-green px-4 text-sm font-medium text-white transition-colors hover:bg-rooted-green-700"
        >
          New application
        </Link>
      </div>

      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-ink">
          Good {timeOfDay}, {firstName}.
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

      {/* Per-grade seat progress */}
      {seatProgress.length > 0 && (
        <div className="rounded-[10px] border border-line bg-white p-4 sm:p-[18px]">
          <h2 className="mb-4 text-sm font-semibold text-ink">Seats by grade</h2>
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
