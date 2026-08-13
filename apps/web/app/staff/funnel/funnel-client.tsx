"use client";

import Link from "next/link";
import { cn, displayClass } from "@/lib/utils";
import type { EnrollmentFunnel, FunnelStageView } from "@/lib/queries/funnel";
import type { DeclineReasonBreakdown } from "@/lib/queries/decline-reasons";
import type { ChannelRoiResult, ChannelVerdict } from "@/lib/queries/channel-roi";
import type { RagStatus } from "@/lib/playbook-targets";
import type { PaceResult, PaceStatus } from "@/lib/funnel-math";
import { PLAYBOOK_STATUS_CODES, PLAYBOOK_STATUS_META } from "@/lib/playbook-status";

/** Static reference data; safe in a client component (no server imports). */
const statusCodes = PLAYBOOK_STATUS_CODES.map((c) => PLAYBOOK_STATUS_META[c]);

/* ------------------------------------------------------------------ */
/*  Status pill                                                         */
/* ------------------------------------------------------------------ */

/**
 * "Unavailable" is a first-class state, not an error state. A founding campus
 * will legitimately show it on most stages for a full cycle. It reads as grey
 * and neutral rather than red, because "we cannot compute this yet" is not a
 * performance problem and should not be dressed as one.
 */
const STATUS_STYLES: Record<RagStatus, { label: string; className: string }> = {
  green: { label: "On target", className: "bg-rooted-green/10 text-rooted-green border-rooted-green/30" },
  yellow: { label: "Below target", className: "bg-warn/10 text-warn border-warn/30" },
  red: { label: "Red", className: "bg-error/10 text-error border-error/30" },
  unavailable: { label: "Not yet measurable", className: "bg-sunken text-stone border-line" },
};

function StatusPill({ status }: { status: RagStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", s.className)}>
      {s.label}
    </span>
  );
}

const pct = (v: number | null) => (v === null ? null : `${Math.round(v * 1000) / 10}%`);

/* ------------------------------------------------------------------ */
/*  Stage card                                                          */
/* ------------------------------------------------------------------ */

function StageCard({ stage, index }: { stage: FunnelStageView; index: number }) {
  return (
    <div className="relative rounded-[10px] border border-line bg-white p-4 sm:p-[18px]">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-stone">
            Stage {index + 1}
          </div>
          <h2 className={cn("text-base font-semibold text-ink", displayClass)}>{stage.label}</h2>
        </div>
        <StatusPill status={stage.status} />
      </div>

      <div className="mb-3 flex items-baseline gap-3">
        <span className={cn("text-3xl font-semibold text-ink", displayClass)}>
          {stage.count === null ? "—" : stage.count.toLocaleString()}
        </span>
        {stage.conversionRate !== null && (
          <span className="text-sm text-stone">
            {pct(stage.conversionRate)} conversion
            {stage.targetRate !== null && (
              <span className="text-stone/70"> &middot; target {pct(stage.targetRate)}</span>
            )}
          </span>
        )}
      </div>

      <p className="text-sm text-stone">{stage.goal}</p>

      {stage.unavailableReason && (
        <p className="mt-2 border-t border-line pt-2 text-xs text-stone">{stage.unavailableReason}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Funnel-math cards                                                   */
/* ------------------------------------------------------------------ */

const PACE_STYLES: Record<PaceStatus, { label: string; className: string }> = {
  ahead: { label: "At target", className: "text-rooted-green" },
  on_track: { label: "On track", className: "text-ink" },
  behind: { label: "Behind", className: "text-warn" },
  unavailable: { label: "No target set", className: "text-stone" },
};

function PaceCard({
  label,
  target,
  pace,
  footnote,
}: {
  label: string;
  target: number;
  pace: PaceResult;
  footnote?: string;
}) {
  const style = PACE_STYLES[pace.status];
  // Bar is capped at 100% so an over-performing campus does not render a bar
  // that overflows its container, but the numeric value above still shows the
  // real figure.
  const barPct = pace.progress === null ? 0 : Math.min(100, pace.progress * 100);

  return (
    <div className="rounded-lg border border-line bg-sunken/40 p-3">
      <div className="text-xs text-stone">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className={cn("text-2xl font-semibold", displayClass, style.className)}>
          {pace.actual.toLocaleString()}
        </span>
        <span className="text-sm text-stone">of {target.toLocaleString()}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className={cn(
            "h-full rounded-full",
            pace.status === "behind" ? "bg-warn" : "bg-rooted-green"
          )}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <div className="mt-1.5 text-[11px] text-stone">
        {style.label}
        {footnote && <> &middot; {footnote}</>}
      </div>
    </div>
  );
}

function StaticCard({
  label,
  value,
  footnote,
}: {
  label: string;
  value: number;
  footnote?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-sunken/40 p-3">
      <div className="text-xs text-stone">{label}</div>
      <div className={cn("mt-0.5 text-2xl font-semibold text-ink", displayClass)}>
        {value.toLocaleString()}
      </div>
      {footnote && <div className="mt-1.5 text-[11px] text-stone">{footnote}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

const VERDICT_STYLES: Record<ChannelVerdict, { label: string; className: string }> = {
  beating: { label: "Beating benchmark", className: "text-rooted-green" },
  meeting: { label: "At benchmark", className: "text-ink" },
  below: { label: "Below benchmark", className: "text-warn" },
  not_benchmarked: { label: "No playbook benchmark", className: "text-stone" },
  insufficient_data: { label: "Too few leads to judge", className: "text-stone" },
};

export function FunnelClient({
  funnel,
  declines,
  channels,
  campuses,
  activeCampus,
}: {
  funnel: EnrollmentFunnel;
  declines: DeclineReasonBreakdown;
  channels: ChannelRoiResult;
  campuses: { id: string; name: string }[];
  activeCampus: string | null;
}) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={cn("text-xl font-semibold text-ink", displayClass)}>Enrollment funnel</h1>
          <p className="text-sm text-stone">
            The five stages from playbook PB 24 v2.2
            {funnel.schoolYearName && <> &middot; {funnel.schoolYearName}</>}
          </p>
        </div>
        {campuses.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <Link
              href="/staff/funnel"
              className={cn(
                "rounded-[6px] border px-2.5 py-1 text-xs",
                activeCampus === null
                  ? "border-rooted-green bg-rooted-green/10 text-rooted-green"
                  : "border-line text-stone hover:bg-sunken"
              )}
            >
              All campuses
            </Link>
            {campuses.map((c) => (
              <Link
                key={c.id}
                href={`/staff/funnel?campus=${c.id}`}
                className={cn(
                  "rounded-[6px] border px-2.5 py-1 text-xs",
                  activeCampus === c.id
                    ? "border-rooted-green bg-rooted-green/10 text-rooted-green"
                    : "border-line text-stone hover:bg-sunken"
                )}
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Top-of-funnel sufficiency: the number that governs everything downstream */}
      <div className="rounded-[10px] border border-line bg-white p-4 sm:p-[18px]">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className={cn("text-sm font-semibold text-ink", displayClass)}>
              Inquiry volume vs. seats
            </h2>
            <p className="mt-1 text-sm text-stone">
              The playbook wants {funnel.inquiryMultipleTarget}x enrolled capacity in qualified
              inquiries. Everything downstream is capped by this number.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("text-3xl font-semibold text-ink", displayClass)}>
              {funnel.inquiryMultiple === null
                ? "—"
                : `${Math.round(funnel.inquiryMultiple * 10) / 10}x`}
            </span>
            <StatusPill status={funnel.inquiryMultipleStatus} />
          </div>
        </div>
        {funnel.totalSeats === 0 && (
          <p className="mt-2 border-t border-line pt-2 text-xs text-stone">
            No seats are planned for this school year yet, so this cannot be computed. Set capacity
            in Settings and this fills in.
          </p>
        )}
      </div>

      {/* Funnel math: what this campus actually needs at the top of the funnel */}
      <div className="rounded-[10px] border border-line bg-white p-4 sm:p-[18px]">
        <h2 className={cn("mb-1 text-sm font-semibold text-ink", displayClass)}>
          What you need to hit {funnel.math.seatsTarget || "your"} seats
        </h2>
        <p className="mb-4 text-sm text-stone">
          Worked backward from planned capacity through each conversion the funnel has to survive.
        </p>

        {funnel.math.seatsTarget === 0 ? (
          <p className="text-sm text-stone">
            No seats are planned for this school year, so there is nothing to work backward from.
            Set capacity in Settings.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <PaceCard
                label="Inquiries needed"
                target={funnel.math.inquiriesNeeded}
                pace={funnel.pace.inquiries}
                footnote={`3x stretch: ${funnel.math.inquiriesStretch}`}
              />
              <PaceCard
                label="Applications needed"
                target={funnel.math.applicationsNeeded}
                pace={funnel.pace.applications}
              />
              <StaticCard
                label="Accepted offers needed"
                value={funnel.math.acceptedOffersNeeded}
                footnote={`Seats + melt buffer: ${funnel.math.withMeltBuffer}`}
              />
              <StaticCard
                label="Waitlist target"
                value={funnel.math.waitlistTarget}
                footnote="1.5x planned seats"
              />
            </div>

            <p className="mt-3 border-t border-line pt-2 text-xs text-stone">
              Planning ratios: {Math.round(funnel.math.ratios.meltSurvival * 100)}% survive melt,{" "}
              {Math.round(funnel.math.ratios.seatAcceptance * 100)}% accept,{" "}
              {Math.round(funnel.math.ratios.lotteryEfficiency * 100)}% lottery efficiency,{" "}
              {Math.round(funnel.math.ratios.inquiryToApp * 100)}% inquiry-to-application.
              {funnel.usingCustomRatios
                ? " Tuned for this campus."
                : " Playbook defaults; tune per campus as real conversion data accumulates."}
            </p>
            <p className="mt-1 text-xs text-stone">
              Note: the playbook states inquiry-to-application as 40% in s2.2 and 50% in s17. We plan
              at 50%, which is the figure consistent with the 3x stretch target. Worth confirming.
            </p>
          </>
        )}
      </div>

      {/* The five stages */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {funnel.stages.map((stage, i) => (
          <StageCard key={stage.key} stage={stage} index={i} />
        ))}
      </div>

      {/* Seat acceptance sits between Apply and Enroll and is graded separately */}
      <div className="rounded-[10px] border border-line bg-white p-4 sm:p-[18px]">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className={cn("text-sm font-semibold text-ink", displayClass)}>
              Lottery seat acceptance
            </h2>
            <p className="mt-1 text-sm text-stone">
              Share of offers families accepted. Playbook target 80%, red below 70%.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("text-3xl font-semibold text-ink", displayClass)}>
              {pct(funnel.seatAcceptance) ?? "—"}
            </span>
            <StatusPill status={funnel.seatAcceptanceStatus} />
          </div>
        </div>
      </div>

      {/* Channel ROI — the same conversion number, finally with a yardstick */}
      <div className="rounded-[10px] border border-line bg-white p-4 sm:p-[18px]">
        <h2 className={cn("mb-1 text-sm font-semibold text-ink", displayClass)}>
          Where leads come from, and whether it is working
        </h2>
        <p className="mb-4 text-sm text-stone">
          Conversion by source against the playbook&rsquo;s channel benchmarks. Referral converting
          at 12% and digital converting at 12% look the same in a table and mean opposite things.
        </p>
        {channels.rows.length === 0 ? (
          <p className="text-sm text-stone">No leads recorded yet.</p>
        ) : (
          <div className="space-y-1.5">
            {channels.rows.map((row) => {
              const v = VERDICT_STYLES[row.verdict];
              return (
                <div
                  key={row.source}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-line bg-sunken/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="text-sm text-ink">{row.label}</span>
                    <span className="text-sm text-stone">
                      {" "}
                      &middot; {row.leads} lead{row.leads === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="text-ink">
                      {row.conversionRate === null ? "—" : pct(row.conversionRate)}
                    </span>
                    {row.benchmark !== null && (
                      <span className="text-stone">vs {pct(row.benchmark)}</span>
                    )}
                    <span className={cn("text-[11px]", v.className)}>{v.label}</span>
                  </div>
                </div>
              );
            })}
            <p className="pt-1 text-xs text-stone">
              Conversion is withheld below {channels.minLeadsForRate} leads, where the rate says more
              about luck than about the channel. Website, staff entry and other carry no playbook
              benchmark and are shown ungraded rather than judged against a borrowed number.
            </p>
          </div>
        )}
      </div>

      {/* Playbook status codes — the app speaking the document's language */}
      <div className="rounded-[10px] border border-line bg-white p-4 sm:p-[18px]">
        <h2 className={cn("mb-1 text-sm font-semibold text-ink", displayClass)}>
          Playbook status codes
        </h2>
        <p className="mb-4 text-sm text-stone">
          The six codes from PB 24 v2.2, with what triggers each and what the playbook says to do.
          Derived from live records rather than stored separately, so they cannot drift out of sync.
        </p>
        <div className="space-y-1.5">
          {statusCodes.map((meta) => (
            <div
              key={meta.code}
              className={cn(
                "flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border px-3 py-2",
                meta.supported ? "border-line bg-sunken/40" : "border-line bg-white"
              )}
            >
              <code
                className={cn(
                  "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                  meta.supported ? "bg-rooted-green/10 text-rooted-green" : "bg-sunken text-stone"
                )}
              >
                {meta.code}
              </code>
              <span className="text-sm text-ink">{meta.trigger}</span>
              <span className="text-sm text-stone">&rarr; {meta.action}</span>
              {!meta.supported && (
                <span className="w-full text-xs text-stone">{meta.unsupportedReason}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Refusal tracking — the only place the funnel says WHY it leaked */}
      <div className="rounded-[10px] border border-line bg-white p-4 sm:p-[18px]">
        <h2 className={cn("mb-1 text-sm font-semibold text-ink", displayClass)}>
          Why families declined
        </h2>
        {!declines.available ? (
          <p className="text-sm text-stone">
            Refusal tracking activates after database migration 00040 is applied.
          </p>
        ) : declines.totalDeclines === 0 ? (
          <p className="text-sm text-stone">No declines recorded yet.</p>
        ) : (
          <>
            <p className="mb-4 text-sm text-stone">
              {declines.totalDeclines} decline{declines.totalDeclines === 1 ? "" : "s"}
              {declines.notCaptured > 0 && (
                <>
                  {" "}
                  &middot; {declines.notCaptured} with no reason captured, which is a collection gap
                  rather than a finding
                </>
              )}
              .
            </p>
            <div className="space-y-1.5">
              {declines.rows
                .filter((r) => r.count > 0)
                .map((row) => (
                  <div
                    key={row.reason}
                    className="flex items-baseline justify-between gap-4 rounded-lg border border-line bg-sunken/40 px-3 py-2"
                  >
                    <span
                      className={cn(
                        "text-sm",
                        row.reason === "not_captured" ? "text-stone italic" : "text-ink"
                      )}
                    >
                      {row.label}
                    </span>
                    <span className="text-sm text-stone">
                      {row.count}
                      {row.sharePct !== null && <> &middot; {row.sharePct}%</>}
                    </span>
                  </div>
                ))}
            </div>
            {declines.rows.every((r) => r.sharePct === null) && (
              <p className="mt-2 text-xs text-stone">
                Percentages are withheld below 10 declines, where they mislead more than they inform.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
