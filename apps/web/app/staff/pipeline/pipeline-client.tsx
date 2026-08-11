"use client";

import { useState, useCallback, useMemo, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
import { cn, displayClass } from "@/lib/utils";
import { getStatusConfig, getGradeLabel, PIPELINE_STAGES } from "@/lib/application-helpers";
import { buildCsv, downloadCsv } from "@/lib/csv";
import { requestSameDocument, messageSelection, type BulkItemResult } from "./actions";
import type { ApplicationRow, CampusRow } from "@/lib/queries";

export type PipelineRow = ApplicationRow & {
  needsLabel: string;
  causeKey: string | null;
  causeLabel: string | null;
};

interface SavedView {
  id: string;
  name: string;
  stage: string;
  search?: string;
  campus?: string;
  staleDays?: string;
}

/** Presets always shown first, per the Phase 3 design handoff. */
const PRESET_VIEWS: SavedView[] = [
  { id: "preset-my-review-queue", name: "My review queue", stage: "needs_review" },
  { id: "preset-stalled-5-plus", name: "Stalled 5+ days", stage: "registering", staleDays: "5" },
  { id: "preset-lottery-ready", name: "Lottery-ready", stage: "ready_for_lottery" },
];

const SAVED_VIEWS_KEY = "rooted-ems:pipeline-saved-views";

function loadSavedViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_VIEWS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedViews(views: SavedView[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
  } catch {
    // localStorage unavailable (private mode, quota) — saved views just won't persist.
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Days since the application row's last real activity (updated_at) — same
 *  proxy Phase 2 uses for "gone quiet" (registration_packet.updated_at). */
function waitingDays(updatedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)));
}

function summarizeResults(results: BulkItemResult[], successNoun: string) {
  const okCount = results.filter((r) => r.ok).length;
  const skipped = results.filter((r) => !r.ok);
  const parts = [`${okCount} ${successNoun}`];
  if (skipped.length > 0) parts.push(`${skipped.length} skipped`);
  const title = parts.join(" · ");

  const reasonCounts = new Map<string, number>();
  for (const r of skipped) {
    const reason = r.error ?? "unknown error";
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const description =
    skipped.length > 0
      ? [...reasonCounts.entries()].map(([reason, count]) => (count > 1 ? `${count}× ${reason}` : reason)).join(" · ")
      : undefined;

  const variant: "success" | "error" | "info" = okCount === 0 ? "error" : skipped.length > 0 ? "info" : "success";
  return { title, description, variant };
}

/** The bulk bar's "shared cause" — the modal blocking requirement across the
 *  current selection, computed client-side from each row's pre-batched
 *  causeKey/causeLabel (no extra query on every selection change). */
function computeSharedCause(rows: PipelineRow[]): { key: string; label: string } | null {
  const withCause = rows.filter((r) => r.causeKey && r.causeLabel);
  if (withCause.length === 0) return null;

  const counts = new Map<string, { label: string; count: number }>();
  for (const r of withCause) {
    const key = r.causeKey as string;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { label: r.causeLabel as string, count: 1 });
  }

  let best: { key: string; label: string; count: number } | null = null;
  for (const [key, v] of counts) {
    if (!best || v.count > best.count) best = { key, label: v.label, count: v.count };
  }
  if (!best) return null;

  const total = rows.length;
  const text = best.count === total ? `All are ${best.label}` : `${best.count} of ${total} are ${best.label}`;
  return { key: best.key, label: text };
}

const SECONDARY_TABS = [
  { label: "Documents", href: "/staff/documents" },
  { label: "Students", href: "/staff/students" },
  { label: "Registration", href: "/staff/enrollment" },
];

interface PipelineClientProps {
  rows: PipelineRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  stageCounts: Record<string, number>;
  campuses: CampusRow[];
  initialStage: string;
  initialSearch?: string;
  initialCampus?: string;
  initialStaleDays?: string;
}

export function PipelineClient({
  rows,
  totalCount,
  page,
  pageSize,
  stageCounts,
  campuses,
  initialStage,
  initialSearch = "",
  initialCampus = "all",
  initialStaleDays = "",
}: PipelineClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentParams = useSearchParams();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(initialSearch);
  const [campusFilter, setCampusFilter] = useState(initialCampus);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [newViewName, setNewViewName] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // Saved views live in localStorage only — guarded for SSR.
  useEffect(() => {
    setSavedViews(loadSavedViews());
  }, []);

  const pushFilters = useCallback(
    (overrides: { stage?: string; search?: string; campus?: string; staleDays?: string | null }) => {
      const params = new URLSearchParams(currentParams.toString());
      const stage = overrides.stage ?? initialStage;
      const q = overrides.search ?? search;
      const campus = overrides.campus ?? campusFilter;
      const staleDays = overrides.staleDays !== undefined ? overrides.staleDays : currentParams.get("staleDays");

      params.set("stage", stage);
      if (q) params.set("search", q);
      else params.delete("search");
      if (campus && campus !== "all") params.set("campus", campus);
      else params.delete("campus");
      if (staleDays) params.set("staleDays", staleDays);
      else params.delete("staleDays");
      params.delete("page");

      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, currentParams, initialStage, search, campusFilter]
  );

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

  function applyView(view: SavedView) {
    pushFilters({
      stage: view.stage,
      search: view.search ?? "",
      campus: view.campus ?? "all",
      staleDays: view.staleDays ?? null,
    });
  }

  function saveCurrentView() {
    const name = newViewName.trim();
    if (!name) return;
    const view: SavedView = {
      id: `view-${Date.now()}`,
      name,
      stage: initialStage,
      search: search || undefined,
      campus: campusFilter !== "all" ? campusFilter : undefined,
      staleDays: currentParams.get("staleDays") ?? undefined,
    };
    const next = [...savedViews, view];
    setSavedViews(next);
    persistSavedViews(next);
    setNewViewName("");
    setShowSaveInput(false);
  }

  function removeSavedView(id: string) {
    const next = savedViews.filter((v) => v.id !== id);
    setSavedViews(next);
    persistSavedViews(next);
  }

  // Server already filtered by stage/search/campus/staleDays — display as-is.
  const filtered = rows;

  // Phase 4: carry the current (server-paginated) id list into the review
  // page's URL so "review" enters queue mode there. Rows are already capped
  // server-side by pageSize, but we defensively cap again here so a future
  // change to pageSize can never blow up the query string.
  const MAX_QUEUE_IDS = 100;
  const queueIds = useMemo(() => filtered.slice(0, MAX_QUEUE_IDS).map((r) => r.id), [filtered]);
  const queueTruncated = filtered.length > MAX_QUEUE_IDS;

  const reviewHref = useCallback(
    (id: string) => {
      const idx = queueIds.indexOf(id);
      if (idx === -1) return `/staff/applications/${id}`;
      const params = new URLSearchParams();
      params.set("queue", queueIds.join(","));
      params.set("pos", String(idx));
      return `/staff/applications/${id}?${params.toString()}`;
    },
    [queueIds]
  );

  const selectedRows = useMemo(() => filtered.filter((r) => selectedIds.has(r.id)), [filtered, selectedIds]);
  const selectedCount = selectedRows.length;
  const allSelected = filtered.length > 0 && selectedCount === filtered.length;
  const someSelected = selectedCount > 0 && !allSelected;
  const sharedCause = useMemo(() => computeSharedCause(selectedRows), [selectedRows]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(rows.map((r) => r.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someSelected;
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
      const visibleIds = filtered.map((r) => r.id);
      const allCurrentlySelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      return allCurrentlySelected ? new Set<string>() : new Set(visibleIds);
    });
  }, [filtered]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  function exportCsv() {
    const source = selectedCount > 0 ? selectedRows : filtered;
    const header = ["Student", "Grade", "Campus", "Status", "What it needs", "Waiting (days)"];
    const csvRows = source.map((app) => [
      app.student_name,
      getGradeLabel(app.grade),
      app.campus_name,
      getStatusConfig(app.status).label,
      app.needsLabel,
      String(waitingDays(app.updated_at)),
    ]);
    const today = new Date().toISOString().split("T")[0];
    downloadCsv(`pipeline-${initialStage}-${today}.csv`, buildCsv(header, csvRows));
    toast({ variant: "success", title: `Exported ${csvRows.length} application${csvRows.length !== 1 ? "s" : ""} to CSV` });
  }

  function handleRequestSameDocument() {
    if (!sharedCause || !sharedCause.key.startsWith("document:")) return;
    const itemName = selectedRows.find((r) => r.causeKey === sharedCause.key)?.causeLabel?.replace(/^missing /, "") ?? "the requested document";
    const ids = selectedRows.map((r) => r.id);
    startTransition(async () => {
      try {
        const results = await requestSameDocument(ids, itemName);
        const summary = summarizeResults(results, "requested");
        toast(summary);
        if (results.some((r) => r.ok)) {
          clearSelection();
          router.refresh();
        }
      } catch {
        toast({ variant: "error", title: "Could not request the document", description: "Please try again." });
      }
    });
  }

  function handleSendMessage() {
    const ids = selectedRows.map((r) => r.id);
    startTransition(async () => {
      try {
        const result = await messageSelection(ids, messageBody);
        if (!result.ok) {
          toast({ variant: "error", title: "Could not send the message", description: result.error ?? "Please try again." });
          return;
        }
        toast({
          variant: result.notified > 0 ? "success" : "info",
          title: `Messaged ${result.notified} of ${result.total} famil${result.total === 1 ? "y" : "ies"}`,
          description:
            result.notified < result.total
              ? "The rest have no linked family account to notify in-app."
              : "Delivered in-app — families will see it on their dashboard.",
        });
        setShowMessageDialog(false);
        setMessageBody("");
      } catch {
        toast({ variant: "error", title: "Could not send the message", description: "Please try again." });
      }
    });
  }

  const activeStageLabel = PIPELINE_STAGES.find((s) => s.key === initialStage)?.label ?? "Pipeline";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={cn("text-2xl font-bold text-ink", displayClass)}>Pipeline</h1>
          <p className="mt-1 text-sm text-stone">
            Every application in review, grouped by stage from first submission to enrollment.
          </p>
          <p className="mt-0.5 text-sm text-stone">
            <span className="font-medium text-ink">{totalCount.toLocaleString("en-US")}</span> in {activeStageLabel.toLowerCase()}
          </p>
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

      {/* Secondary tabs — Documents / Students / Registration remain reachable
          here until their content is fully absorbed into this shell. */}
      <div className="flex flex-wrap gap-2 border-b border-line pb-3">
        {SECONDARY_TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-[6px] border border-line bg-white px-3 py-1.5 text-xs font-medium text-stone transition-colors hover:bg-sunken hover:text-ink"
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Stage tabs with live, campus-scoped counts. Never clip — wraps. */}
      <div className="flex flex-wrap gap-2">
        {PIPELINE_STAGES.map((stage) => {
          const isActive = stage.key === initialStage;
          return (
            <button
              key={stage.key}
              type="button"
              onClick={() => pushFilters({ stage: stage.key })}
              className={cn(
                "inline-flex min-h-[44px] items-center gap-2 rounded-[6px] border px-3.5 text-sm font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "border-rooted-green/30 bg-rooted-green/10 text-deep-green"
                  : "border-line bg-white text-stone hover:bg-sunken hover:text-ink"
              )}
            >
              {stage.label}
              <span
                className={cn(
                  "inline-flex min-w-[20px] items-center justify-center rounded-[6px] px-1.5 text-[11px] font-semibold",
                  isActive ? "bg-rooted-green/20 text-deep-green" : "bg-sunken text-stone"
                )}
              >
                {stageCounts[stage.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Saved views */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-xs font-semibold uppercase tracking-wide text-stone">Views</span>
        {PRESET_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => applyView(view)}
            className="rounded-[6px] border border-line bg-white px-2.5 py-1 text-xs text-ink hover:bg-sunken"
          >
            {view.name}
          </button>
        ))}
        {savedViews.map((view) => (
          <span key={view.id} className="inline-flex items-center gap-1 rounded-[6px] border border-line bg-white pl-2.5 pr-1 py-1 text-xs text-ink">
            <button type="button" onClick={() => applyView(view)} className="hover:underline">
              {view.name}
            </button>
            <button
              type="button"
              onClick={() => removeSavedView(view.id)}
              aria-label={`Remove saved view ${view.name}`}
              className="ml-1 rounded-[4px] px-1 text-stone hover:bg-sunken hover:text-ink"
            >
              ×
            </button>
          </span>
        ))}
        {showSaveInput ? (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveCurrentView();
                if (e.key === "Escape") setShowSaveInput(false);
              }}
              placeholder="View name"
              className="h-7 w-32 rounded-[6px] border border-line px-2 text-xs focus:outline-none focus:ring-2 focus:ring-rooted-green"
            />
            <button type="button" onClick={saveCurrentView} className="text-xs font-medium text-deep-green hover:underline">
              Save
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setShowSaveInput(true)}
            className="rounded-[6px] border border-dashed border-line px-2.5 py-1 text-xs text-stone hover:bg-sunken hover:text-ink"
          >
            + Save current view
          </button>
        )}
      </div>

      {/* Search + campus filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
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

      {/* Table */}
      {queueTruncated && (
        <p className="text-xs text-stone">
          Review queue capped at the first {MAX_QUEUE_IDS} of {filtered.length} rows in this view — K/J will move within that set.
        </p>
      )}
      <div className="rounded-[10px] border border-line bg-white">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<IconClipboardList size={40} />}
            title="No applications in this stage"
            description={search || campusFilter !== "all" ? "Try adjusting your search or filters." : "Nothing is sitting in this stage right now — applications will land here automatically as they move through review."}
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
                    className="h-4 w-4 rounded border-stone/40 text-rooted-green focus:ring-rooted-green cursor-pointer"
                  />
                </TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>What it needs</TableHead>
                <TableHead>Waiting</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((app) => {
                const days = waitingDays(app.updated_at);
                return (
                  <TableRow
                    key={app.id}
                    className={cn("cursor-pointer", selectedIds.has(app.id) && "bg-rooted-green/5")}
                    onClick={() => router.push(reviewHref(app.id))}
                  >
                    <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(app.id)}
                        onChange={() => toggleRow(app.id)}
                        aria-label={`Select application for ${app.student_name}`}
                        className="h-4 w-4 rounded border-stone/40 text-rooted-green focus:ring-rooted-green cursor-pointer"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{app.student_name}</TableCell>
                    <TableCell>{getGradeLabel(app.grade)}</TableCell>
                    <TableCell className="text-stone">{app.campus_name}</TableCell>
                    <TableCell className="max-w-[280px] truncate" title={app.needsLabel}>
                      {app.needsLabel}
                    </TableCell>
                    <TableCell className={cn("text-stone", days >= 5 && "text-warn-text font-medium")}>
                      {days === 0 ? "Today" : `${days}d`}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={reviewHref(app.id)}
                        className="text-xs font-medium text-deep-green hover:underline whitespace-nowrap"
                      >
                        Review
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <Pagination
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={goToPage}
          itemLabel="applications"
          className="border-t border-line px-6 pt-4 pb-4"
        />
      </div>

      {/* Bulk bar — deep-green, names the shared cause, verb-first actions */}
      {selectedCount > 0 && (
        <div className="sticky bottom-4 z-40">
          <div className="mx-auto flex w-fit max-w-full flex-wrap items-center gap-3 rounded-[10px] bg-deep-green px-4 py-3 text-white shadow-lg">
            <span className="text-sm font-medium whitespace-nowrap">{selectedCount} selected</span>
            <span className="hidden h-5 w-px bg-white/30 sm:block" aria-hidden="true" />
            <span className="text-sm text-white/90">
              {sharedCause ? sharedCause.label : "Mixed — no single shared cause"}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {initialStage === "needs_review" && sharedCause?.key.startsWith("document:") && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleRequestSameDocument}
                  className={cn(
                    "inline-flex min-h-[36px] items-center justify-center rounded-[6px] bg-white px-3.5 text-sm font-medium text-deep-green transition-colors hover:bg-white/90 disabled:opacity-50",
                    displayClass
                  )}
                >
                  {isPending ? "Requesting…" : "Request the same document"}
                </button>
              )}
              <button
                type="button"
                disabled={isPending}
                onClick={() => setShowMessageDialog(true)}
                className="inline-flex min-h-[36px] items-center justify-center rounded-[6px] border border-white/40 px-3.5 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                Message
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={exportCsv}
                className="inline-flex min-h-[36px] items-center justify-center rounded-[6px] border border-white/40 px-3.5 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                Export
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={clearSelection}
                aria-label="Clear selection"
                className="inline-flex min-h-[36px] items-center justify-center rounded-[6px] px-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export with nothing selected — small link near the table for the
          "export the current tab" path, per the spec's "any view" requirement. */}
      {selectedCount === 0 && filtered.length > 0 && (
        <div className="flex justify-end">
          <button type="button" onClick={exportCsv} className="text-xs font-medium text-deep-green hover:underline">
            Export {activeStageLabel.toLowerCase()} to CSV
          </button>
        </div>
      )}

      {/* Message compose dialog */}
      <Dialog open={showMessageDialog} onOpenChange={setShowMessageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Message {selectedCount} famil{selectedCount !== 1 ? "ies" : "y"}</DialogTitle>
            <DialogDescription>
              Sent in-app to each family&apos;s portal immediately. Families with no linked
              account will be skipped and reported — nothing is faked.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            rows={4}
            placeholder="Write your message…"
            className="mt-2 w-full rounded-[6px] border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green"
          />
          <DialogFooter className="mt-4">
            <button
              type="button"
              onClick={() => setShowMessageDialog(false)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-[6px] border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-sunken"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending || !messageBody.trim()}
              onClick={handleSendMessage}
              className="inline-flex min-h-[44px] items-center justify-center rounded-[6px] bg-deep-green px-4 text-sm font-medium text-white hover:bg-rooted-green-700 disabled:opacity-50"
            >
              {isPending ? "Sending…" : "Send"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
