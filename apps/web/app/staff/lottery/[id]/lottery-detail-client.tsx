"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LotteryRunDetail, LotteryEntrant } from "@/lib/queries";
import {
  staffRunLotteryPreview,
  staffFinalizeLottery,
  staffArchiveLottery,
  staffSendLotteryOffers,
  staffSimulateLottery,
  staffCompleteLotteryResults,
} from "../actions";
import type { LotterySimulation } from "@/lib/mutations";

/* ─── Status Config ─── */
const statusVariants: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" }> = {
  draft: { label: "Draft", variant: "secondary" },
  preview: { label: "Preview", variant: "warning" },
  official: { label: "Official", variant: "success" },
  archived: { label: "Archived", variant: "default" },
};

const resultVariants: Record<string, { label: string; variant: "success" | "warning" | "secondary" }> = {
  offered: { label: "Offered", variant: "success" },
  waitlisted: { label: "Waitlisted", variant: "warning" },
  pending: { label: "Pending", variant: "secondary" },
};

/* ─── Helpers ─── */
function formatDate(dateStr: string | null) {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-rooted-gray last:border-0">
      <span className="text-sm text-stone">{label}</span>
      <span className="text-sm font-medium text-ink text-right">{value}</span>
    </div>
  );
}

/* ─── Component ─── */
export function StaffLotteryDetailClient({
  run,
  entrants,
  staffUserId,
}: {
  run: LotteryRunDetail | null;
  entrants: LotteryEntrant[];
  staffUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Dialog state
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [sendOffersDialogOpen, setSendOffersDialogOpen] = useState(false);
  const [offerExpiresIn, setOfferExpiresIn] = useState("14");
  const [simulation, setSimulation] = useState<LotterySimulation | null>(null);
  const [completeResultsDialogOpen, setCompleteResultsDialogOpen] = useState(false);

  /* ─── Action Handlers ─── */

  function handleRunPreview() {
    if (!run) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await staffRunLotteryPreview(run.id);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: "Preview generated successfully. Rankings are ready for review." });
        router.refresh();
      }
    });
  }

  function handleSimulate() {
    if (!run) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await staffSimulateLottery(run.id);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
        setSimulation(null);
      } else {
        setSimulation(result.data);
      }
    });
  }

  function handleFinalize() {
    if (!run) return;
    setFinalizeDialogOpen(true);
  }

  function doFinalize() {
    if (!run) return;
    setFinalizeDialogOpen(false);
    setFeedback(null);
    startTransition(async () => {
      const result = await staffFinalizeLottery(run.id, staffUserId);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: "Lottery finalized as official. You can now send offers." });
        router.refresh();
      }
    });
  }

  function handleArchive() {
    if (!run) return;
    setArchiveDialogOpen(true);
  }

  function doArchive() {
    if (!run) return;
    setArchiveDialogOpen(false);
    setFeedback(null);
    startTransition(async () => {
      const result = await staffArchiveLottery(run.id);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: "Lottery run archived." });
        router.refresh();
      }
    });
  }

  function handleSendOffers() {
    if (!run) return;
    setOfferExpiresIn("14");
    setSendOffersDialogOpen(true);
  }

  function doSendOffers() {
    if (!run) return;
    setSendOffersDialogOpen(false);
    setFeedback(null);
    const expiresAt = new Date(Date.now() + parseInt(offerExpiresIn, 10) * 24 * 60 * 60 * 1000).toISOString();
    startTransition(async () => {
      const result = await staffSendLotteryOffers(run.id, expiresAt, staffUserId);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        const count = result.data?.offersCreated ?? 0;
        setFeedback({
          type: "success",
          message: `${count} offer${count !== 1 ? "s" : ""} sent successfully. Families will be notified.`,
        });
        router.refresh();
      }
    });
  }

  function handleCompleteResults() {
    if (!run) return;
    setCompleteResultsDialogOpen(true);
  }

  function doCompleteResults() {
    if (!run) return;
    setCompleteResultsDialogOpen(false);
    setFeedback(null);
    startTransition(async () => {
      const result = await staffCompleteLotteryResults(run.id, staffUserId);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        const count = result.data?.waitlisted ?? 0;
        setFeedback({
          type: "success",
          message: `${count} famil${count === 1 ? "y" : "ies"} waitlisted and notified.`,
        });
        router.refresh();
      }
    });
  }

  function handleActionClick(label: string) {
    switch (label) {
      case "Run Preview":
      case "Re-run Preview":
        handleRunPreview();
        break;
      case "Finalize as Official":
        handleFinalize();
        break;
      case "Send Offers":
        handleSendOffers();
        break;
      case "Waitlist & notify non-selected":
        handleCompleteResults();
        break;
      case "Archive":
        handleArchive();
        break;
    }
  }

  /* ─── Early return for not-found ─── */
  if (!run) {
    return (
      <div className="space-y-6">
        <Link href="/staff/lottery" className="text-sm text-rooted-green hover:underline">
          &larr; Back to Lottery
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-stone">Lottery run not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const s = statusVariants[run.status] ?? statusVariants.draft;
  const overSubscribed = run.applicants > run.seats;
  const offeredCount = entrants.filter((e) => e.result === "offered").length;
  const waitlistedCount = entrants.filter((e) => e.result === "waitlisted").length;

  /* ─── Status-specific action buttons ─── */
  function getActionButtons() {
    switch (run!.status) {
      case "draft":
        return (
          <>
            <Button variant="outline" onClick={handleSimulate} disabled={isPending}>
              {isPending ? "Working..." : "Simulate"}
            </Button>
            <Button onClick={() => handleActionClick("Run Preview")} disabled={isPending}>
              {isPending ? "Running..." : "Run Preview"}
            </Button>
          </>
        );
      case "preview":
        return (
          <>
            <Button variant="outline" onClick={handleSimulate} disabled={isPending}>
              {isPending ? "Working..." : "Simulate"}
            </Button>
            <Button variant="outline" onClick={() => handleActionClick("Re-run Preview")} disabled={isPending}>
              {isPending ? "Running..." : "Re-run Preview"}
            </Button>
            <Button onClick={() => handleActionClick("Finalize as Official")} disabled={isPending}>
              {isPending ? "Finalizing..." : "Finalize as Official"}
            </Button>
          </>
        );
      case "official":
        return (
          <>
            <Button onClick={() => handleActionClick("Send Offers")} disabled={isPending}>
              {isPending ? "Sending..." : "Send Offers"}
            </Button>
            <Button variant="outline" onClick={() => handleActionClick("Waitlist & notify non-selected")} disabled={isPending}>
              {isPending ? "Working..." : "Waitlist & notify non-selected"}
            </Button>
            <Link href={`/staff/lottery/${run!.id}/report`}>
              <Button variant="outline">Print report</Button>
            </Link>
            <Button variant="outline" onClick={() => handleActionClick("Archive")} disabled={isPending}>
              {isPending ? "Archiving..." : "Archive"}
            </Button>
          </>
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link href="/staff/lottery" className="text-sm text-rooted-green hover:underline">
        &larr; Back to Lottery
      </Link>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3 rounded-lg text-sm font-medium ${
            feedback.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Simulation Results — read-only what-if, nothing is written */}
      {simulation && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Simulation — {simulation.total_seats} seats, {simulation.total_entries} applicants
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSimulation(null)}>
                Dismiss
              </Button>
            </div>
            <CardDescription>
              Seat math by priority tier. Read-only — no rankings were generated and no results were saved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Priority Tier</TableHead>
                  <TableHead className="text-right">Applicants</TableHead>
                  <TableHead className="text-right">Would Be Offered</TableHead>
                  <TableHead className="text-right">Would Be Waitlisted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {simulation.tiers.map((tier) => (
                  <TableRow key={tier.tier}>
                    <TableCell className="font-medium">{tier.label}</TableCell>
                    <TableCell className="text-right">{tier.entries}</TableCell>
                    <TableCell className="text-right text-green-700 font-medium">{tier.selected}</TableCell>
                    <TableCell className="text-right text-amber-700 font-medium">{tier.waitlisted}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold">{simulation.total_entries}</TableCell>
                  <TableCell className="text-right font-semibold text-green-700">{simulation.selected_total}</TableCell>
                  <TableCell className="text-right font-semibold text-amber-700">{simulation.waitlisted_total}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink">{run.name}</h1>
            <Badge variant={s.variant}>{s.label}</Badge>
          </div>
          <p className="text-sm text-stone mt-1">
            {run.campus} &middot; {run.grade}
          </p>
        </div>
        <div className="flex gap-2">
          {getActionButtons()}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border-t-4 border-t-rooted-green">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Applicants
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-rooted-green">{run.applicants}</p>
            <p className="text-xs text-stone mt-1">entered in lottery</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Seats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{run.seats}</p>
            <p className="text-xs text-stone mt-1">available capacity</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Offered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{offeredCount}</p>
            <p className="text-xs text-stone mt-1">
              {offeredCount === 0 ? "run lottery first" : "seats offered"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Waitlisted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{waitlistedCount}</p>
            <p className="text-xs text-stone mt-1">
              {waitlistedCount === 0 ? "none" : "waiting for seats"}
            </p>
          </CardContent>
        </Card>
        <Card className={`border-t-4 ${overSubscribed ? "border-t-red-500" : "border-t-stone/30"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Over Capacity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${overSubscribed ? "text-red-600" : "text-stone/50"}`}>
              {overSubscribed ? `+${run.applicants - run.seats}` : "0"}
            </p>
            <p className="text-xs text-stone mt-1">
              {overSubscribed
                ? `${Math.round((run.applicants / run.seats) * 100)}% demand ratio`
                : "within capacity"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lottery Configuration & Run Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run Details</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow label="Run Number" value={run.runNumber > 0 ? `#${run.runNumber}` : "Not yet run"} />
            <DetailRow label="Random Seed" value={run.randomSeed ?? "Not generated"} />
            <DetailRow label="Executed By" value={run.executedBy ?? "N/A"} />
            <DetailRow label="Executed At" value={formatDateTime(run.executedAt)} />
            <DetailRow label="Created" value={formatDate(run.createdAt)} />
            <DetailRow label="Last Updated" value={formatDate(run.updatedAt)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lottery Rules</CardTitle>
            <CardDescription>{run.ruleSet.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <DetailRow label="Sibling Preference" value={run.ruleSet.siblingPreference ? "Enabled" : "Disabled"} />
            {run.ruleSet.priorityTiers.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-stone uppercase tracking-wider mb-2">
                  Priority Tiers
                </p>
                <div className="space-y-1.5">
                  {run.ruleSet.priorityTiers.map((tier, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-rooted-gray text-xs font-semibold text-ink/60">
                        {idx + 1}
                      </span>
                      <span className="text-sm text-ink/70">{tier}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Entrants Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lottery Entrants</CardTitle>
          <CardDescription>
            {entrants.length} entrant{entrants.length !== 1 ? "s" : ""} assigned to this lottery.
            {run.status === "draft"
              ? " Run a preview to generate rankings."
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {entrants.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-stone">
                No entrants assigned to this lottery run yet.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {run.status !== "draft" && <TableHead className="w-16">Rank</TableHead>}
                  <TableHead>Student</TableHead>
                  <TableHead>Guardian</TableHead>
                  <TableHead>Priority Tier</TableHead>
                  {run.status !== "draft" && <TableHead>Random #</TableHead>}
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entrants.map((entrant) => {
                  const r = resultVariants[entrant.result] ?? resultVariants.pending;
                  return (
                    <TableRow key={entrant.id}>
                      {run.status !== "draft" && (
                        <TableCell className="font-mono text-sm font-bold">
                          {entrant.finalRank ?? "\u2014"}
                        </TableCell>
                      )}
                      <TableCell className="font-medium">{entrant.studentName}</TableCell>
                      <TableCell className="text-stone">{entrant.guardianName}</TableCell>
                      <TableCell>
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-rooted-gray text-xs font-semibold text-ink/60">
                          {entrant.priorityTier}
                        </span>
                      </TableCell>
                      {run.status !== "draft" && (
                        <TableCell className="font-mono text-xs text-stone">
                          {entrant.randomNumber?.toFixed(4) ?? "\u2014"}
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge variant={r.variant}>{r.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Footer metadata */}
      <div className="flex gap-6 text-xs text-stone pb-4">
        <span>Lottery ID: {run.id}</span>
        <span>Created: {formatDate(run.createdAt)}</span>
        <span>Updated: {formatDate(run.updatedAt)}</span>
      </div>

      {/* ─── Finalize Confirmation Dialog ─── */}
      <Dialog open={finalizeDialogOpen} onOpenChange={setFinalizeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize Lottery</DialogTitle>
            <DialogDescription>
              This creates an immutable record of results and cannot be undone. Once finalized, you can send enrollment offers.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm space-y-1">
            <p className="font-medium text-ink">{run.name}</p>
            <p className="text-stone">{run.campus} &middot; {run.grade}</p>
            <p className="text-stone">{offeredCount} offered &middot; {waitlistedCount} waitlisted</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizeDialogOpen(false)}>Cancel</Button>
            <Button onClick={doFinalize} className="bg-rooted-green hover:bg-rooted-green/90 text-white">
              Finalize as Official
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Archive Confirmation Dialog ─── */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Lottery Run</DialogTitle>
            <DialogDescription>
              Are you sure you want to archive this lottery run? It will be moved to archived status.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-rooted-gray-light p-3 text-sm space-y-1">
            <p className="font-medium text-ink">{run.name}</p>
            <p className="text-stone">{run.campus} &middot; {run.grade}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={doArchive}>Archive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Complete Results (Waitlist Non-Selected) Dialog ─── */}
      <Dialog open={completeResultsDialogOpen} onOpenChange={setCompleteResultsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Waitlist &amp; Notify Non-Selected Families</DialogTitle>
            <DialogDescription>
              This will place every family who wasn&apos;t selected onto the waitlist in lottery order and
              email/text them their result. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm space-y-1">
            <p className="font-medium text-ink">{run.name}</p>
            <p className="text-stone">{run.campus} &middot; {run.grade}</p>
            <p className="text-stone">{waitlistedCount} not selected</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteResultsDialogOpen(false)}>Cancel</Button>
            <Button onClick={doCompleteResults} className="bg-rooted-green hover:bg-rooted-green/90 text-white">
              Waitlist &amp; Notify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Send Offers Dialog ─── */}
      <Dialog open={sendOffersDialogOpen} onOpenChange={setSendOffersDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Enrollment Offers</DialogTitle>
            <DialogDescription>
              Send seat offers to all {offeredCount} selected student{offeredCount !== 1 ? "s" : ""}. Choose how long families have to respond.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm space-y-1">
              <p className="font-medium text-ink">{run.name}</p>
              <p className="text-stone">{run.campus} &middot; {run.grade}</p>
              <p className="text-emerald-700 font-medium">{offeredCount} offer{offeredCount !== 1 ? "s" : ""} will be sent</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">Response Deadline</label>
              <select
                value={offerExpiresIn}
                onChange={(e) => setOfferExpiresIn(e.target.value)}
                className="w-full px-3 py-2 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
              >
                <option value="7">7 days</option>
                <option value="10">10 days</option>
                <option value="14">14 days</option>
                <option value="21">21 days</option>
                <option value="30">30 days</option>
              </select>
              <p className="text-xs text-stone mt-1">
                Offers will expire on{" "}
                {new Date(Date.now() + parseInt(offerExpiresIn, 10) * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOffersDialogOpen(false)}>Cancel</Button>
            <Button onClick={doSendOffers} className="bg-rooted-green hover:bg-rooted-green/90 text-white">
              Send {offeredCount} Offer{offeredCount !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
