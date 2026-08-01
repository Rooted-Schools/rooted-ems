"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { PendingDocumentRow, DocumentQueueStats } from "@/lib/queries";
import { staffApproveDocument, staffRejectDocument } from "./actions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDocType(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  initialRows: PendingDocumentRow[];
  stats: DocumentQueueStats;
  campusOptions: { id: string; name: string }[];
}

export function DocumentQueueClient({ initialRows, stats, campusOptions }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [campusFilter, setCampusFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  // Approval state
  const [approveTarget, setApproveTarget] = useState<PendingDocumentRow | null>(null);

  // Rejection state
  const [rejectTarget, setRejectTarget] = useState<PendingDocumentRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  // ── Apply campus filter ──────────────────────────────────────────────────
  const filteredRows =
    campusFilter === "all"
      ? rows
      : rows.filter((r) => r.campus_id === campusFilter);

  // ── Approve handler ──────────────────────────────────────────────────────
  const handleApprove = (doc: PendingDocumentRow) => {
    startTransition(async () => {
      const result = await staffApproveDocument(doc.id);
      if (!result.error) {
        setRows((prev) => prev.filter((r) => r.id !== doc.id));
        setApproveTarget(null);
      }
    });
  };

  // ── Reject handler ───────────────────────────────────────────────────────
  const handleReject = () => {
    if (!rejectTarget) return;
    setRejectError(null);

    if (!rejectReason.trim()) {
      setRejectError("Please provide a reason for rejection.");
      return;
    }

    startTransition(async () => {
      const result = await staffRejectDocument(rejectTarget.id, rejectReason.trim(), {
        applicationId: rejectTarget.application_id,
        documentType: rejectTarget.document_type,
        campusId: rejectTarget.campus_id,
      });
      if (result.error) {
        setRejectError(result.error);
      } else {
        setRows((prev) => prev.filter((r) => r.id !== rejectTarget.id));
        setRejectTarget(null);
        setRejectReason("");
      }
    });
  };

  return (
    <>
      {/* ── Stats bar ── */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-ink">{stats.total_pending}</p>
            <p className="text-xs text-stone mt-0.5">Pending Review</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-ink">{stats.total_today}</p>
            <p className="text-xs text-stone mt-0.5">Received Today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className={`text-2xl font-bold ${stats.oldest_pending_days != null && stats.oldest_pending_days > 3 ? "text-amber-600" : "text-ink"}`}>
              {stats.oldest_pending_days != null ? `${stats.oldest_pending_days}d` : "—"}
            </p>
            <p className="text-xs text-stone mt-0.5">Oldest Pending</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Filter bar ── */}
      {campusOptions.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-stone">Filter by campus:</span>
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setCampusFilter("all")}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                campusFilter === "all"
                  ? "bg-rooted-green text-white"
                  : "bg-rooted-gray text-stone hover:bg-rooted-gray/80"
              }`}
            >
              All
            </button>
            {campusOptions.map((c) => (
              <button
                key={c.id}
                onClick={() => setCampusFilter(c.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  campusFilter === c.id
                    ? "bg-rooted-green text-white"
                    : "bg-rooted-gray text-stone hover:bg-rooted-gray/80"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Document queue ── */}
      {filteredRows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-stone">
              {campusFilter === "all"
                ? "No documents pending review."
                : "No pending documents for this campus."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-stone uppercase tracking-wide">
              {filteredRows.length} document{filteredRows.length !== 1 ? "s" : ""} waiting
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-rooted-gray">
              {filteredRows.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-rooted-warm/50 transition-colors"
                >
                  {/* Doc info */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-ink truncate">
                        {doc.student_name}
                      </p>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {formatDocType(doc.document_type)}
                      </Badge>
                    </div>
                    <p className="text-xs text-stone truncate">
                      {doc.guardian_name}
                      {doc.guardian_email ? ` · ${doc.guardian_email}` : ""}
                    </p>
                    <p className="text-xs text-stone/60">
                      {doc.campus_name} · {doc.file_name}
                      {doc.file_size ? ` (${formatBytes(doc.file_size)})` : ""} · uploaded{" "}
                      {daysAgo(doc.created_at)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="bg-rooted-green hover:bg-rooted-green/90 text-white"
                      onClick={() => setApproveTarget(doc)}
                      disabled={isPending}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => {
                        setRejectTarget(doc);
                        setRejectReason("");
                        setRejectError(null);
                      }}
                      disabled={isPending}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Approve confirmation dialog ── */}
      <Dialog open={!!approveTarget} onOpenChange={() => setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Document?</DialogTitle>
            <DialogDescription>
              Approve <strong>{formatDocType(approveTarget?.document_type ?? "")}</strong> for{" "}
              <strong>{approveTarget?.student_name}</strong>? This marks the
              document as verified and notifies the family.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              className="bg-rooted-green hover:bg-rooted-green/90 text-white"
              onClick={() => approveTarget && handleApprove(approveTarget)}
              disabled={isPending}
            >
              {isPending ? "Approving…" : "Approve Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject dialog ── */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={() => {
          setRejectTarget(null);
          setRejectReason("");
          setRejectError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Document</DialogTitle>
            <DialogDescription>
              Reject <strong>{formatDocType(rejectTarget?.document_type ?? "")}</strong> for{" "}
              <strong>{rejectTarget?.student_name}</strong>. The family will be
              notified and asked to re-upload.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium text-ink">
              Reason for rejection <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="e.g. Document is blurry, wrong document type, expired…"
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                setRejectError(null);
              }}
              disabled={isPending}
            />
            {rejectError && (
              <p className="text-xs text-red-600">{rejectError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason("");
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isPending || !rejectReason.trim()}
            >
              {isPending ? "Rejecting…" : "Reject Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
