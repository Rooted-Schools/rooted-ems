"use client";

import { useState } from "react";
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

/* ─── Types ─── */
interface LotteryRunDetail {
  id: string;
  name: string;
  campus: string;
  grade: string;
  schoolYear: string;
  status: "draft" | "preview" | "official" | "archived";
  applicants: number;
  seats: number;
  randomSeed: string | null;
  runNumber: number;
  executedBy: string | null;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ruleSet: {
    name: string;
    siblingPreference: boolean;
    priorityTiers: string[];
  };
}

interface LotteryEntrant {
  id: string;
  applicationId: string;
  studentName: string;
  guardianName: string;
  priorityTier: number;
  priorityLabel: string;
  randomNumber: number | null;
  finalRank: number | null;
  result: "offered" | "waitlisted" | "pending";
  siblingInSchool: boolean;
}

interface LotteryHistoryEntry {
  id: string;
  event: string;
  actor: string;
  date: string;
  detail: string | null;
}

/* ─── Mock Data ─── */
const LOTTERY_DETAIL: Record<string, LotteryRunDetail> = {
  "lot-001": {
    id: "lot-001",
    name: "2026-27 Grade 6 Lottery",
    campus: "Vancouver WA",
    grade: "6th Grade",
    schoolYear: "2026-27",
    status: "draft",
    applicants: 45,
    seats: 30,
    randomSeed: null,
    runNumber: 0,
    executedBy: null,
    executedAt: null,
    createdAt: "2026-03-01",
    updatedAt: "2026-03-01",
    ruleSet: {
      name: "Standard Lottery Rules v1",
      siblingPreference: true,
      priorityTiers: [
        "Tier 1: Returning students",
        "Tier 2: Siblings of current students",
        "Tier 3: In-district residents",
        "Tier 4: Out-of-district applicants",
      ],
    },
  },
  "lot-002": {
    id: "lot-002",
    name: "2026-27 Grade 9 Lottery",
    campus: "Columbia SC",
    grade: "9th Grade",
    schoolYear: "2026-27",
    status: "official",
    applicants: 62,
    seats: 40,
    randomSeed: "a7b3c9d2",
    runNumber: 1,
    executedBy: "Sarah Mitchell",
    executedAt: "2026-02-20T14:30:00Z",
    createdAt: "2026-02-15",
    updatedAt: "2026-02-20",
    ruleSet: {
      name: "Standard Lottery Rules v1",
      siblingPreference: true,
      priorityTiers: [
        "Tier 1: Returning students",
        "Tier 2: Siblings of current students",
        "Tier 3: In-district residents",
        "Tier 4: Out-of-district applicants",
      ],
    },
  },
};

const LOTTERY_ENTRANTS: Record<string, LotteryEntrant[]> = {
  "lot-001": [
    { id: "le-1", applicationId: "app-101", studentName: "Emma Garcia", guardianName: "Maria Garcia", priorityTier: 1, priorityLabel: "Returning", randomNumber: null, finalRank: null, result: "pending", siblingInSchool: false },
    { id: "le-2", applicationId: "app-102", studentName: "Liam Foster", guardianName: "James Foster", priorityTier: 2, priorityLabel: "Sibling", randomNumber: null, finalRank: null, result: "pending", siblingInSchool: true },
    { id: "le-3", applicationId: "app-103", studentName: "Zoe Kim", guardianName: "Soo-Yun Kim", priorityTier: 3, priorityLabel: "In-District", randomNumber: null, finalRank: null, result: "pending", siblingInSchool: false },
    { id: "le-4", applicationId: "app-104", studentName: "Noah Brown", guardianName: "Patricia Brown", priorityTier: 3, priorityLabel: "In-District", randomNumber: null, finalRank: null, result: "pending", siblingInSchool: false },
    { id: "le-5", applicationId: "app-105", studentName: "Mia Davis", guardianName: "Robert Davis", priorityTier: 4, priorityLabel: "Out-of-District", randomNumber: null, finalRank: null, result: "pending", siblingInSchool: false },
  ],
  "lot-002": [
    { id: "le-10", applicationId: "app-201", studentName: "Aiden Clark", guardianName: "Nancy Clark", priorityTier: 1, priorityLabel: "Returning", randomNumber: 0.1234, finalRank: 1, result: "offered", siblingInSchool: false },
    { id: "le-11", applicationId: "app-202", studentName: "Chloe Wright", guardianName: "Thomas Wright", priorityTier: 1, priorityLabel: "Returning", randomNumber: 0.5678, finalRank: 2, result: "offered", siblingInSchool: false },
    { id: "le-12", applicationId: "app-203", studentName: "Ethan Moore", guardianName: "Linda Moore", priorityTier: 2, priorityLabel: "Sibling", randomNumber: 0.2345, finalRank: 3, result: "offered", siblingInSchool: true },
    { id: "le-13", applicationId: "app-204", studentName: "Olivia Hall", guardianName: "David Hall", priorityTier: 3, priorityLabel: "In-District", randomNumber: 0.8901, finalRank: 4, result: "offered", siblingInSchool: false },
    { id: "le-14", applicationId: "app-205", studentName: "Lucas Young", guardianName: "Karen Young", priorityTier: 3, priorityLabel: "In-District", randomNumber: 0.3456, finalRank: 5, result: "offered", siblingInSchool: false },
    { id: "le-15", applicationId: "app-206", studentName: "Ava Mitchell", guardianName: "Sarah Mitchell", priorityTier: 4, priorityLabel: "Out-of-District", randomNumber: 0.7890, finalRank: 41, result: "waitlisted", siblingInSchool: false },
    { id: "le-16", applicationId: "app-207", studentName: "Mason Lee", guardianName: "Jennifer Lee", priorityTier: 4, priorityLabel: "Out-of-District", randomNumber: 0.9012, finalRank: 42, result: "waitlisted", siblingInSchool: false },
  ],
};

const LOTTERY_HISTORY: Record<string, LotteryHistoryEntry[]> = {
  "lot-001": [
    { id: "lh-1", event: "Lottery Run Created", actor: "Sarah Mitchell", date: "2026-03-01T10:00:00Z", detail: "Grade 6 lottery for Vancouver WA 2026-27 enrollment window." },
  ],
  "lot-002": [
    { id: "lh-10", event: "Lottery Run Created", actor: "Sarah Mitchell", date: "2026-02-15T09:00:00Z", detail: "Grade 9 lottery for Columbia SC 2026-27 enrollment window." },
    { id: "lh-11", event: "Preview Run Executed", actor: "Sarah Mitchell", date: "2026-02-18T11:30:00Z", detail: "Preview run completed. 62 applicants ranked. Results available for review." },
    { id: "lh-12", event: "Results Adjusted", actor: "Sarah Mitchell", date: "2026-02-19T09:15:00Z", detail: "Verified sibling preference for 3 applicants." },
    { id: "lh-13", event: "Official Run Executed", actor: "Sarah Mitchell", date: "2026-02-20T14:30:00Z", detail: "Run #1 finalized. 40 offers generated, 22 waitlisted. Seed: a7b3c9d2." },
    { id: "lh-14", event: "Offers Sent", actor: "System", date: "2026-02-20T14:35:00Z", detail: "40 offer emails dispatched to families." },
  ],
};

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
      return [
        { label: "Run Preview", variant: "default" as const },
      ];
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

/* ─── Page Component ─── */
export function StaffLotteryDetailClient({ id }: { id: string }) {
  const [activeTab, setActiveTab] = useState("entrants");

  const run = LOTTERY_DETAIL[id];
  const entrants = LOTTERY_ENTRANTS[id] ?? [];
  const history = LOTTERY_HISTORY[id] ?? [];

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
            {run.campus} &middot; {run.grade} &middot; {run.schoolYear}
          </p>
        </div>
        {actions.length > 0 && (
          <div className="flex gap-2">
            {actions.map((action) => (
              <Button key={action.label} variant={action.variant}>
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
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Entrants + History */}
      <Tabs defaultValue="entrants" onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="entrants">
            Entrants
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-[10px] font-semibold">
              {entrants.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="history">
            History
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-[10px] font-semibold">
              {history.length}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Entrants Tab */}
        <TabsContent value="entrants">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lottery Entrants</CardTitle>
              <CardDescription>
                {run.status === "draft"
                  ? "Applicants assigned to this lottery. Run a preview to generate rankings."
                  : "Ranked applicants with lottery results."}
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
                      <TableHead>Priority</TableHead>
                      {run.status !== "draft" && <TableHead>Random #</TableHead>}
                      <TableHead>Result</TableHead>
                      {run.ruleSet.siblingPreference && <TableHead className="w-20">Sibling</TableHead>}
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
                            <div className="flex items-center gap-1.5">
                              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                                {entrant.priorityTier}
                              </span>
                              <span className="text-sm text-gray-600">{entrant.priorityLabel}</span>
                            </div>
                          </TableCell>
                          {run.status !== "draft" && (
                            <TableCell className="font-mono text-xs text-gray-500">
                              {entrant.randomNumber?.toFixed(4) ?? "\u2014"}
                            </TableCell>
                          )}
                          <TableCell>
                            <Badge variant={r.variant}>{r.label}</Badge>
                          </TableCell>
                          {run.ruleSet.siblingPreference && (
                            <TableCell className="text-center">
                              {entrant.siblingInSchool ? (
                                <span className="text-green-600 text-sm" title="Has sibling in school">Yes</span>
                              ) : (
                                <span className="text-gray-400 text-sm">No</span>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Run History</CardTitle>
              <CardDescription>
                Audit trail of actions taken on this lottery run.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-center text-gray-500 py-6 text-sm">
                  No history recorded yet.
                </p>
              ) : (
                <div className="relative">
                  <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200" />
                  <div className="space-y-5">
                    {[...history].reverse().map((entry, idx) => (
                      <div key={entry.id} className="relative flex gap-4 pl-0">
                        <div
                          className={`relative z-10 w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center shrink-0 ${
                            idx === 0 ? "bg-rooted-green" : "bg-gray-200"
                          }`}
                        >
                          <div
                            className={`w-2 h-2 rounded-full ${
                              idx === 0 ? "bg-white" : "bg-gray-400"
                            }`}
                          />
                        </div>
                        <div className="flex-1 -mt-0.5">
                          <p className="text-sm font-medium text-gray-900">
                            {entry.event}
                          </p>
                          {entry.detail && (
                            <p className="text-sm text-gray-500 mt-0.5">
                              {entry.detail}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {entry.actor} &middot; {formatDateTime(entry.date)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Footer metadata */}
      <div className="flex gap-6 text-xs text-gray-400 pb-4">
        <span>Lottery ID: {run.id}</span>
        <span>Created: {formatDate(run.createdAt)}</span>
        <span>Updated: {formatDate(run.updatedAt)}</span>
      </div>
    </div>
  );
}
