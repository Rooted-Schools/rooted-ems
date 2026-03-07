"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LotteryRunDetail, LotteryEntrant } from "@/lib/queries";

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
    <div className="flex justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}

function getStatusActions(status: string) {
  switch (status) {
    case "draft":
      return [{ label: "Run Preview", variant: "default" as const }];
    case "preview":
      return [
        { label: "Re-run Preview", variant: "outline" as const },
        { label: "Finalize as Official", variant: "default" as const },
      ];
    case "official":
      return [
        { label: "Send Offers", variant: "default" as const },
        { label: "Archive", variant: "outline" as const },
      ];
    default:
      return [];
  }
}

/* ─── Component ─── */
export function StaffLotteryDetailClient({
  run,
  entrants,
}: {
  run: LotteryRunDetail | null;
  entrants: LotteryEntrant[];
}) {
  if (!run) {
    return (
      <div className="space-y-6">
        <Link href="/staff/lottery" className="text-sm text-rooted-green hover:underline">
          &larr; Back to Lottery
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">Lottery run not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const s = statusVariants[run.status] ?? statusVariants.draft;
  const actions = getStatusActions(run.status);
  const overSubscribed = run.applicants > run.seats;
  const offeredCount = entrants.filter((e) => e.result === "offered").length;
  const waitlistedCount = entrants.filter((e) => e.result === "waitlisted").length;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link href="/staff/lottery" className="text-sm text-rooted-green hover:underline">
        &larr; Back to Lottery
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{run.name}</h1>
            <Badge variant={s.variant}>{s.label}</Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {run.campus} &middot; {run.grade}
          </p>
        </div>
        {actions.length > 0 && (
          <div className="flex gap-2">
            {actions.map((action) => (
              <Button key={action.label} variant={action.variant} disabled>
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Applicants
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{run.applicants}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Seats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{run.seats}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Offered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{offeredCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Waitlisted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{waitlistedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Over Capacity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${overSubscribed ? "text-red-600" : "text-gray-400"}`}>
              {overSubscribed ? `+${run.applicants - run.seats}` : "0"}
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
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Priority Tiers
                </p>
                <div className="space-y-1.5">
                  {run.ruleSet.priorityTiers.map((tier, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                        {idx + 1}
                      </span>
                      <span className="text-sm text-gray-700">{tier}</span>
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
              <p className="text-sm text-gray-500">
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
                      <TableCell className="text-gray-500">{entrant.guardianName}</TableCell>
                      <TableCell>
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                          {entrant.priorityTier}
                        </span>
                      </TableCell>
                      {run.status !== "draft" && (
                        <TableCell className="font-mono text-xs text-gray-500">
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
      <div className="flex gap-6 text-xs text-gray-400 pb-4">
        <span>Lottery ID: {run.id}</span>
        <span>Created: {formatDate(run.createdAt)}</span>
        <span>Updated: {formatDate(run.updatedAt)}</span>
      </div>
    </div>
  );
}
