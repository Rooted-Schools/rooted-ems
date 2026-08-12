export const runtime = "edge";
export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  getStaffLotteryReport,
  getRunGovernance,
  getRehearsalReportEntrants,
} from "@/lib/queries";
import { governanceLabel, renderPolicyStatements } from "@/lib/lottery-policy";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";
import { logAuditEvent, AuditAction } from "@/lib/audit";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PrintReportButton } from "./print-button";
import { RosterToggle, type RosterRow } from "./roster-toggle";

/* ─── Helpers ─── */

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function BlockedState({ message }: { message: string }) {
  return (
    <div className="space-y-6">
      <Link href="/staff/lottery" className="text-sm text-rooted-green hover:underline">
        &larr; Back to Lottery
      </Link>
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-stone">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function StaffLotteryReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [session, report, governance] = await Promise.all([
    requireStaffSession(),
    getStaffLotteryReport(id),
    getRunGovernance(id),
  ]);

  const { run, tierLabels } = report;
  let entrants = report.entrants;

  if (!run) {
    return <BlockedState message="Lottery run not found." />;
  }

  // Campus access gate — same rule as the sibling lottery detail page family:
  // scoped staff can only see runs for campuses they're assigned to.
  const accessibleCampusIds = getAccessibleCampusIds(session);
  if (accessibleCampusIds.length > 0 && !accessibleCampusIds.includes(run.campusId)) {
    return <BlockedState message="Lottery run not found." />;
  }

  // The report is authorizer evidence built from the immutable snapshot —
  // that snapshot only exists once a run has been finalized to "official".
  //
  // A REHEARSAL is the deliberate exception. It can never reach "official", so
  // it has no snapshot; its report is built from the live entries instead and
  // is stamped TEST REHEARSAL on every surface, so a board observer can watch a
  // full dress rehearsal without anyone mistaking it for the real result.
  const isRehearsal = governance.isRehearsal;

  if (isRehearsal) {
    if (run.status !== "preview") {
      return (
        <BlockedState message="This rehearsal has not been drawn yet. Run the rehearsal to produce a report." />
      );
    }
    entrants = await getRehearsalReportEntrants(id);
  } else if (run.status !== "official") {
    return (
      <BlockedState message="This report is available once the lottery run has been finalized as official." />
    );
  }

  // Best-effort audit log — logAuditEvent never throws, so this can't break
  // the render even if the write fails.
  await logAuditEvent({
    table_name: "lottery_run",
    record_id: run.id,
    action: AuditAction.Export,
    actor_id: session.user_id,
    campus_id: run.campusId,
    metadata: { report: "lottery_run_report", rehearsal: isRehearsal },
  });

  const governedBy = governance.ungoverned
    ? null
    : governanceLabel({
        name: governance.policyName ?? "Adopted policy",
        version: governance.policyVersion ?? 0,
        adopted_date: governance.adoptedDate,
      });

  // A governed run's priority bands come from the policy engine, not from the
  // legacy rule set, so they are labeled from the engine's own band numbering
  // (lib/lottery-draw.ts). Ungoverned runs keep the rule-set labels.
  const GOVERNED_BAND_LABELS = [
    "Sibling of a currently enrolled student",
    "Sibling pulled in by the linked-sibling rule",
    "General weighted pool",
  ];
  const effectiveTierLabels = governance.config ? GOVERNED_BAND_LABELS : tierLabels;

  const labelForTier = (tier: number) =>
    tier < effectiveTierLabels.length ? effectiveTierLabels[tier] : "General pool";

  // Per-tier counts for every configured tier (even ones with zero
  // applicants), plus an overflow "General pool" row only when applicants
  // actually landed outside the configured tiers.
  const statsByTier = new Map<number, { applicants: number; offered: number; waitlisted: number }>();
  for (const e of entrants) {
    const cur = statsByTier.get(e.priorityTier) ?? { applicants: 0, offered: 0, waitlisted: 0 };
    cur.applicants += 1;
    if (e.isSelected) cur.offered += 1;
    else cur.waitlisted += 1;
    statsByTier.set(e.priorityTier, cur);
  }

  const tierRows = effectiveTierLabels.map((label, idx) => ({
    label,
    ...(statsByTier.get(idx) ?? { applicants: 0, offered: 0, waitlisted: 0 }),
  }));

  const generalPool = Array.from(statsByTier.entries())
    .filter(([idx]) => idx >= effectiveTierLabels.length)
    .reduce(
      (acc, [, s]) => ({
        applicants: acc.applicants + s.applicants,
        offered: acc.offered + s.offered,
        waitlisted: acc.waitlisted + s.waitlisted,
      }),
      { applicants: 0, offered: 0, waitlisted: 0 }
    );
  if (generalPool.applicants > 0) {
    tierRows.push({ label: "General pool", ...generalPool });
  }

  const totals = {
    applicants: entrants.length,
    offered: entrants.filter((e) => e.isSelected).length,
    waitlisted: entrants.filter((e) => !e.isSelected).length,
  };

  const roster: RosterRow[] = entrants.map((e) => ({
    finalRank: e.finalRank,
    studentName: e.studentName,
    tierLabel: labelForTier(e.priorityTier),
    randomNumber: e.randomNumber,
    result: e.isSelected ? "Offered" : "Waitlisted",
  }));

  const generatedAt = formatDateTime(new Date().toISOString());

  return (
    <div>
      {/* Print CSS: on screen this is a normal staff page inside the staff
          shell (sidebar + header). When printing, hide everything except
          the .report wrapper — this sidesteps needing to know the exact
          class names of the staff shell's sidebar/header markup. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .report, .report * { visibility: visible; }
          .report { position: absolute; inset: 0; margin: 0; padding: 1.5rem; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between mb-6">
        <Link href={`/staff/lottery/${run.id}`} className="text-sm text-rooted-green hover:underline">
          &larr; Back to lottery
        </Link>
        <PrintReportButton />
      </div>

      <div className="report bg-white text-black max-w-3xl mx-auto space-y-6 p-6 rounded-lg border border-stone/20 print:border-0 print:rounded-none">
        {/* Header */}
        <div className="border-b border-stone/20 pb-4">
          {isRehearsal && (
            <p className="mb-2 border border-black px-2 py-1 text-sm font-bold uppercase tracking-widest">
              Test rehearsal — not an official lottery result
            </p>
          )}
          <h1 className="text-xl font-bold">
            {isRehearsal ? "Lottery Rehearsal Report" : "Lottery Run Report"}
          </h1>
          <p className="text-sm mt-1">
            {run.campusName} &middot; {run.grade} &middot; Run #{run.runNumber} &middot;{" "}
            <span className="uppercase">{isRehearsal ? "test rehearsal" : run.status}</span>
          </p>
          <p className="text-sm mt-1">
            {governedBy ? `Governed by: ${governedBy}` : "No adopted policy"}
          </p>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div className="flex justify-between border-b border-stone/10 py-1">
            <span className="text-stone">Executed by</span>
            <span className="font-medium">{run.executedByName ?? "N/A"}</span>
          </div>
          <div className="flex justify-between border-b border-stone/10 py-1">
            <span className="text-stone">Executed at</span>
            <span className="font-medium">{formatDateTime(run.executedAt)}</span>
          </div>
          <div className="flex justify-between border-b border-stone/10 py-1">
            <span className="text-stone">Finalized at</span>
            <span className="font-medium">{formatDateTime(run.finalizedAt)}</span>
          </div>
          <div className="flex justify-between border-b border-stone/10 py-1">
            <span className="text-stone">Seed fingerprint</span>
            <span className="font-mono font-medium">{run.seedFingerprint ?? "—"}</span>
          </div>
          <div className="flex justify-between border-b border-stone/10 py-1">
            <span className="text-stone">Total applicants</span>
            <span className="font-mono tabular-nums font-medium">{run.totalApplicants}</span>
          </div>
          <div className="flex justify-between border-b border-stone/10 py-1">
            <span className="text-stone">Total seats</span>
            <span className="font-mono tabular-nums font-medium">{run.totalSeats}</span>
          </div>
          <div className="flex justify-between border-b border-stone/10 py-1">
            <span className="text-stone">Governing policy</span>
            <span className="font-medium">{governedBy ?? "None adopted"}</span>
          </div>
        </div>

        {/* What the draw actually did — real counts, written by the draw */}
        {governance.drawSummary && (
          <div className="text-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-2">
              Preferences and Weighting Applied
            </h2>
            <ul className="space-y-1">
              {typeof governance.drawSummary.sibling_auto_placed === "number" && (
                <li>
                  Sibling preference: {String(governance.drawSummary.sibling_auto_placed)} applicants
                  auto-placed before the draw,{" "}
                  {String(governance.drawSummary.sibling_priority_waitlisted ?? 0)} placed on the
                  sibling-priority waitlist.
                </li>
              )}
              {typeof governance.drawSummary.sibling_claimed_unverified === "number" &&
                governance.drawSummary.sibling_claimed_unverified > 0 && (
                  <li>
                    {String(governance.drawSummary.sibling_claimed_unverified)} applicants claimed a
                    sibling that no enrollment record confirmed. Those claims received no preference.
                  </li>
                )}
              {typeof governance.drawSummary.linked_sibling_activated === "number" && (
                <li>
                  {String(governance.drawSummary.linked_sibling_activated)} co-applying siblings were
                  pulled in by the linked-sibling rule after their sibling was drawn.
                </li>
              )}
              {Array.isArray(governance.drawSummary.tier_counts) &&
                (governance.drawSummary.tier_counts as Array<Record<string, unknown>>).map(
                  (tier) => (
                    <li key={String(tier.key)}>
                      {String(tier.label)}: {String(tier.applicants)} applicants at{" "}
                      {String(tier.weight)}:1, contributing {String(tier.entries)} entries.
                      {tier.unsourced === true
                        ? ` The application does not collect ${String(tier.source_field)}, so no applicant could qualify for this weight.`
                        : ""}
                    </li>
                  )
                )}
              {typeof governance.drawSummary.sibling_method === "string" && (
                <li>{String(governance.drawSummary.sibling_method)}</li>
              )}
            </ul>
          </div>
        )}

        {/* The rules this run was held under, in plain English */}
        {governance.config && (
          <div className="text-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-2">
              Governing Policy
            </h2>
            {renderPolicyStatements(governance.config).map((statement) => (
              <div key={statement.heading} className="mb-3">
                <p className="font-medium">{statement.heading}</p>
                <ul className="mt-1 space-y-0.5">
                  {statement.lines.map((line, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* Per-tier results */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-2">Results by Priority Group</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Priority Group</TableHead>
                <TableHead className="text-right">Applicants</TableHead>
                <TableHead className="text-right">Offered</TableHead>
                <TableHead className="text-right">Waitlisted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tierRows.map((tier) => (
                <TableRow key={tier.label}>
                  <TableCell>{tier.label}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{tier.applicants}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{tier.offered}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{tier.waitlisted}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-bold">Totals</TableCell>
                <TableCell className="text-right font-mono tabular-nums font-bold">{totals.applicants}</TableCell>
                <TableCell className="text-right font-mono tabular-nums font-bold">{totals.offered}</TableCell>
                <TableCell className="text-right font-mono tabular-nums font-bold">{totals.waitlisted}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* Methodology */}
        <div className="text-sm leading-relaxed">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-2">Methodology</h2>
          <p>
            Every applicant in this lottery received a random number from a seeded, reproducible
            draw. Seats were filled in priority group order, and within each priority group strictly
            by ascending random number, until every seat was filled. Because the draw is derived
            from the stored random seed shown above, this run can be independently re-executed to
            reproduce this exact result. No manual reordering of applicants is possible at any stage
            of the process.
          </p>
          {isRehearsal && (
            <p className="mt-2 font-bold">
              This was a test rehearsal. No seat was offered, no family was contacted, and no
              application record was changed. The official lottery is always a separate run.
            </p>
          )}
        </div>

        {/* Roster toggle (default off) */}
        <RosterToggle roster={roster} />

        {/* Footer */}
        <div className="border-t border-stone/20 pt-3 text-xs text-stone flex justify-between">
          <span>Generated {generatedAt}</span>
          <span>
            {isRehearsal ? "TEST REHEARSAL — not an official result · " : ""}Rooted Schools &middot;
            confidential
          </span>
        </div>
      </div>
    </div>
  );
}
