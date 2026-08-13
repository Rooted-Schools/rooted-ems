"use client";

import { useState, useCallback, useMemo, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { IconClipboardList } from "@/components/ui/icons";
import { Pagination } from "@/components/ui/pagination";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { getStatusConfig, getGradeLabel } from "@/lib/application-helpers";
import { buildCsv, downloadCsv } from "@/lib/csv";
import { getAllowedTransitions, type ApplicationStatusValue } from "@rooted-ems/utils";
import { staffBulkChangeStatus, staffBulkSendOffers, type BulkItemResult } from "./bulk-actions";
import type { ApplicationRow, ApplicationStats, CampusRow } from "@/lib/queries";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "submitted", label: "Submitted" },
  { value: "needs_info", label: "Needs Info" },
  { value: "verified", label: "Verified" },
  { value: "offered", label: "Offered" },
  { value: "accepted", label: "Accepted" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "registered", label: "Registered" },
];

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  // Handle both date-only strings ("2025-01-15") and full timestamps ("2025-01-15T18:23:00Z")
  const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Default offer expiry: 14 days from today — same as the single-item offer dialog
function defaultExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().split("T")[0];
}

/**
 * Build a summary toast from per-item bulk results, e.g.
 * "12 offers sent · 2 skipped (already have pending offers)".
 */
function summarizeResults(results: BulkItemResult[], successNoun: string) {
  const okCount = results.filter((r) => r.ok).length;
  const skipped = results.filter((r) => !r.ok);

  const parts = [`${okCount} ${successNoun}`];
  if (skipped.length > 0) parts.push(`${skipped.length} skipped`);
  const title = parts.join(" · ");

  // Group skip reasons so the description stays readable
  const reasonCounts = new Map<string, number>();
  for (const r of skipped) {
    const reason = r.error ?? "unknown error";
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const description =
    skipped.length > 0
      ? [...reasonCounts.entries()]
          .map(([reason, count]) => (count > 1 ? `${count}× ${reason}` : reason))
          .join(" · ")
      : undefined;

  const variant: "success" | "error" | "info" =
    okCount === 0 ? "error" : skipped.length > 0 ? "info" : "success";

  return { title, description, variant };
}

function ApplicationTableRow({
  app,
  selected,
  onToggle,
}: {
  app: ApplicationRow;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const router = useRouter();
  const statusConfig = getStatusConfig(app.status);

  return (
    <TableRow
      className={`cursor-pointer hover:bg-rooted-gray-light ${selected ? "bg-rooted-green/5" : ""}`}
      onClick={() => router.push(`/staff/applications/${app.id}`)}
    >
      <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(app.id)}
          aria-label={`Select application for ${app.student_name}`}
          className="h-4 w-4 rounded border-rooted-gray-dark text-rooted-green focus:ring-rooted-green cursor-pointer"
        />
      </TableCell>
      <TableCell className="font-medium">{app.student_name}</TableCell>
      <TableCell className="text-stone">{app.guardian_name}</TableCell>
      <TableCell>{getGradeLabel(app.grade)}</TableCell>
      <TableCell>{app.campus_name}</TableCell>
      <TableCell>
        <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
      </TableCell>
      <TableCell className="text-stone">
        {formatDate(app.submitted_at)}
      </TableCell>
      <TableCell className="text-stone">
        {formatDate(app.updated_at)}
      </TableCell>
    </TableRow>
  );
}

interface StaffApplicationsClientProps {
  applications: ApplicationRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  stats: ApplicationStats;
  campuses: CampusRow[];
  initialStatus?: string;
  initialSearch?: string;
  initialCampus?: string;
}

export function StaffApplicationsClient({
  applications,
  totalCount,
  page,
  pageSize,
  stats,
  campuses,
  initialStatus = "all",
  initialSearch = "",
  initialCampus = "all",
}: StaffApplicationsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentParams = useSearchParams();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [campusFilter, setCampusFilter] = useState(initialCampus);

  // ── Bulk selection state ──────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTargetStatus, setBulkTargetStatus] = useState("");
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showOfferDialog, setShowOfferDialog] = useState(false);
  const [offerExpiry, setOfferExpiry] = useState(defaultExpiryDate);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const pushFilters = useCallback(
    (overrides: { status?: string; search?: string; campus?: string }) => {
      const params = new URLSearchParams(currentParams.toString());
      const status = overrides.status ?? statusFilter;
      const q = overrides.search ?? search;
      const campus = overrides.campus ?? campusFilter;

      if (status && status !== "all") params.set("status", status);
      else params.delete("status");
      if (q) params.set("search", q);
      else params.delete("search");
      if (campus && campus !== "all") params.set("campus", campus);
      // A deliberate All-campuses pick must write the explicit "all"
      // sentinel: an absent param now falls back to the campus lens
      // (lib/campus-lens.ts), which would silently undo the pick.
      else if (overrides.campus === "all") params.set("campus", "all");
      else params.delete("campus");

      // Any filter change resets pagination — page numbers from the old
      // result set are meaningless against the new one.
      params.delete("page");

      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, currentParams, statusFilter, search, campusFilter]
  );

  // Page navigation: URL is the source of truth (?page=2) so pagination
  // survives refresh and back/forward. Selection is cleared on page change —
  // cross-page selection is intentionally out of scope.
  const goToPage = useCallback(
    (nextPage: number) => {
      setSelectedIds(new Set());
      const params = new URLSearchParams(currentParams.toString());
      if (nextPage > 1) params.set("page", String(nextPage));
      else params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, currentParams]
  );

  // Server already filtered — just display what we got
  const filtered = applications;

  // Selection derived against the currently visible rows only, so rows that
  // scroll out of a changed filter never get acted on invisibly.
  const selectedRows = useMemo(
    () => filtered.filter((app) => selectedIds.has(app.id)),
    [filtered, selectedIds]
  );
  const selectedCount = selectedRows.length;
  const allSelected = filtered.length > 0 && selectedCount === filtered.length;
  const someSelected = selectedCount > 0 && !allSelected;

  // Prune stale ids (rows no longer visible) whenever the result set changes
  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(applications.map((a) => a.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [applications]);

  // Header checkbox indeterminate state
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const visibleIds = filtered.map((a) => a.id);
      const allCurrentlySelected =
        visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      return allCurrentlySelected ? new Set<string>() : new Set(visibleIds);
    });
  }, [filtered]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Valid bulk status targets: union of legal transitions across the
  // selected rows' current statuses (per-item validation still happens
  // server-side — this just keeps the dropdown meaningful).
  const statusTargets = useMemo(() => {
    const targets = new Set<string>();
    for (const row of selectedRows) {
      for (const t of getAllowedTransitions(row.status as ApplicationStatusValue)) {
        targets.add(t);
      }
    }
    return [...targets];
  }, [selectedRows]);

  // ── Bulk action handlers ──────────────────────────────────────────────────

  function confirmBulkStatusChange() {
    const ids = selectedRows.map((r) => r.id);
    const target = bulkTargetStatus;
    setShowStatusDialog(false);
    startTransition(async () => {
      try {
        const results = await staffBulkChangeStatus(ids, target);
        const label = getStatusConfig(target).label;
        toast(summarizeResults(results, `updated to ${label}`));
        if (results.some((r) => r.ok)) {
          clearSelection();
          setBulkTargetStatus("");
          router.refresh();
        }
      } catch {
        toast({ variant: "error", title: "Bulk status change failed", description: "Please try again." });
      }
    });
  }

  function confirmBulkSendOffers() {
    const ids = selectedRows.map((r) => r.id);
    const expiresAt = new Date(offerExpiry + "T23:59:59").toISOString();
    setShowOfferDialog(false);
    startTransition(async () => {
      try {
        const results = await staffBulkSendOffers(ids, expiresAt);
        toast(summarizeResults(results, results.filter((r) => r.ok).length === 1 ? "offer sent" : "offers sent"));
        if (results.some((r) => r.ok)) {
          clearSelection();
          router.refresh();
        }
      } catch {
        toast({ variant: "error", title: "Bulk send offers failed", description: "Please try again." });
      }
    });
  }

  function exportCsv() {
    // Client-side export from already-loaded rows — no server roundtrip
    const header = ["Student", "Guardian", "Grade", "Campus", "Status", "Submitted", "Updated"];
    const rows = selectedRows.map((app) => [
      app.student_name,
      app.guardian_name,
      getGradeLabel(app.grade),
      app.campus_name,
      getStatusConfig(app.status).label,
      formatDate(app.submitted_at),
      formatDate(app.updated_at),
    ]);
    const today = new Date().toISOString().split("T")[0];
    downloadCsv(`applications-${today}.csv`, buildCsv(header, rows));
    toast({
      variant: "success",
      title: `Exported ${rows.length} application${rows.length !== 1 ? "s" : ""} to CSV`,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Applications</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-stone">
            <span className="font-medium">{totalCount.toLocaleString("en-US")}</span> application{totalCount !== 1 ? "s" : ""}
          </span>
          <Link href="/staff/applications/new">
            <Button className="bg-rooted-green hover:bg-rooted-green/90 text-white">
              + Create Application
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-t-4 border-t-info">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Submitted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-info">
              {stats.submitted}
            </p>
            <p className="text-xs text-stone mt-1">awaiting review</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-warn">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Needs Info
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-warn">
              {stats.needs_info}
            </p>
            <p className="text-xs text-stone mt-1">
              {stats.needs_info === 0 ? "none pending" : "action required"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-rooted-green">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Verified
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-rooted-green">
              {stats.verified}
            </p>
            <p className="text-xs text-stone mt-1">ready for lottery</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-rooted-green">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Registered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-rooted-green">
              {stats.registered}
            </p>
            <p className="text-xs text-stone mt-1">fully enrolled</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search by student or guardian name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") pushFilters({ search });
                }}
                onBlur={() => {
                  if (search !== initialSearch) pushFilters({ search });
                }}
              />
            </div>
            {campuses.length > 1 && (
              <Select
                value={campusFilter}
                onChange={(e) => {
                  const v = e.target.value;
                  setCampusFilter(v);
                  pushFilters({ campus: v });
                }}
                className="w-full sm:w-48"
              >
                <option value="all">All Campuses</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status tabs + table */}
      <Tabs defaultValue={initialStatus} onValueChange={(v) => {
        setStatusFilter(v);
        pushFilters({ status: v });
      }}>
        <TabsList>
          {STATUS_TABS.map((tab) => {
            const count =
              tab.value !== "all"
                ? (stats[tab.value as keyof ApplicationStats] as number)
                : undefined;
            return (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
                {tab.value !== "all" && count != null ? (
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-rooted-gray-dark/30 text-[10px] font-semibold">
                    {count}
                  </span>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Filtered results table */}
      <Card>
        <CardContent className="pt-6 px-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<IconClipboardList size={40} />}
              title="No applications found"
              description={
                search || campusFilter !== "all"
                  ? "Try adjusting your search or filters."
                  : "Applications will appear here once families submit them."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all visible applications"
                      className="h-4 w-4 rounded border-rooted-gray-dark text-rooted-green focus:ring-rooted-green cursor-pointer"
                    />
                  </TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Guardian</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((app) => (
                  <ApplicationTableRow
                    key={app.id}
                    app={app}
                    selected={selectedIds.has(app.id)}
                    onToggle={toggleRow}
                  />
                ))}
              </TableBody>
            </Table>
          )}
          <Pagination
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={goToPage}
            itemLabel="applications"
            className="border-t border-rooted-gray px-6 pt-4 mt-4"
          />
        </CardContent>
      </Card>

      {/* Sticky bulk action bar */}
      {selectedCount > 0 && (
        <div className="sticky bottom-4 z-40">
          <div className="mx-auto flex w-fit max-w-full flex-wrap items-center gap-3 rounded-lg border border-rooted-gray bg-white px-4 py-3 shadow-lg">
            <span className="text-sm font-medium text-ink whitespace-nowrap">
              {selectedCount} selected
            </span>
            <span className="hidden h-5 w-px bg-rooted-gray sm:block" aria-hidden="true" />
            <div className="flex items-center gap-2">
              <Select
                value={bulkTargetStatus}
                onChange={(e) => setBulkTargetStatus(e.target.value)}
                disabled={isPending || statusTargets.length === 0}
                className="w-44 text-sm"
                aria-label="Bulk target status"
              >
                <option value="">Change status to…</option>
                {statusTargets.map((s) => (
                  <option key={s} value={s}>
                    {getStatusConfig(s).label}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending || !bulkTargetStatus}
                onClick={() => setShowStatusDialog(true)}
              >
                Apply
              </Button>
            </div>
            <Button
              size="sm"
              className="bg-rooted-green hover:bg-rooted-green/90 text-white"
              disabled={isPending}
              onClick={() => setShowOfferDialog(true)}
            >
              Send Offers
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={exportCsv}>
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={clearSelection}
              aria-label="Clear selection"
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Bulk status change confirmation */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change status of {selectedCount} application{selectedCount !== 1 ? "s" : ""}?</DialogTitle>
            <DialogDescription>
              Selected applications will move to{" "}
              <span className="font-medium text-ink">
                {bulkTargetStatus ? getStatusConfig(bulkTargetStatus).label : ""}
              </span>
              . Applications that cannot legally make this transition will be
              skipped and reported — nothing is forced.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>
              Cancel
            </Button>
            <Button
              className="bg-rooted-green hover:bg-rooted-green/90 text-white"
              disabled={isPending || !bulkTargetStatus}
              onClick={confirmBulkStatusChange}
            >
              {isPending ? "Updating…" : "Change Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk send offers confirmation */}
      <Dialog open={showOfferDialog} onOpenChange={setShowOfferDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send offers to {selectedCount} application{selectedCount !== 1 ? "s" : ""}?</DialogTitle>
            <DialogDescription>
              A seat offer will be created for each selected application and the
              family notified. Applications that are not in an offerable status
              or already have a pending offer will be skipped and reported.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <label htmlFor="bulk-offer-expiry" className="block text-sm font-medium text-ink mb-1">
              Offer expires on
            </label>
            <Input
              id="bulk-offer-expiry"
              type="date"
              value={offerExpiry}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => setOfferExpiry(e.target.value)}
            />
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowOfferDialog(false)}>
              Cancel
            </Button>
            <Button
              className="bg-rooted-green hover:bg-rooted-green/90 text-white"
              disabled={isPending || !offerExpiry}
              onClick={confirmBulkSendOffers}
            >
              {isPending ? "Sending…" : "Send Offers"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
