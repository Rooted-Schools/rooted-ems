"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getStatusConfig, getGradeLabel } from "@/lib/application-helpers";
import type { ApplicationDetail } from "@/lib/queries";
import {
  changeApplicationStatus,
  staffWithdrawApplication,
  addApplicationNote,
  staffReviewDocument,
} from "./actions";
import { getSignedUrl } from "@/lib/storage/upload";

/* ─── Document status badge ─── */
const docStatusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" }> = {
  pending: { label: "Pending", variant: "warning" },
  verified: { label: "Verified", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
};

/* ─── Helpers ─── */
function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00")).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ─── Detail row helper ─── */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}

/* ─── Status actions based on current status ─── */
function getAvailableActions(status: string): { label: string; variant: "default" | "outline" | "destructive"; targetStatus: string }[] {
  switch (status) {
    case "submitted":
      return [
        { label: "Mark as Verified", variant: "default", targetStatus: "verified" },
        { label: "Request More Info", variant: "outline", targetStatus: "needs_info" },
      ];
    case "needs_info":
      return [
        { label: "Mark as Verified", variant: "default", targetStatus: "verified" },
      ];
    case "verified":
      return [
        { label: "Assign to Lottery", variant: "default", targetStatus: "lottery_assigned" },
      ];
    case "lottery_assigned":
      return [
        { label: "Make Offer", variant: "default", targetStatus: "offered" },
        { label: "Add to Waitlist", variant: "outline", targetStatus: "waitlisted" },
      ];
    case "offered":
      return [
        { label: "Record Acceptance", variant: "default", targetStatus: "accepted" },
        { label: "Record Decline", variant: "outline", targetStatus: "declined" },
      ];
    case "accepted":
      return [
        { label: "Mark as Registered", variant: "default", targetStatus: "registered" },
      ];
    case "waitlisted":
      return [
        { label: "Make Offer", variant: "default", targetStatus: "offered" },
      ];
    default:
      return [];
  }
}

/* ─── Withdrawable statuses ─── */
const WITHDRAWABLE = ["draft", "submitted", "needs_info", "verified", "lottery_assigned", "waitlisted"];

/* ─── Component Props ─── */
interface StaffApplicationDetailClientProps {
  detail: ApplicationDetail;
}

export function StaffApplicationDetailClient({ detail }: StaffApplicationDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [noteText, setNoteText] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const statusCfg = getStatusConfig(detail.status);
  const actions = getAvailableActions(detail.status);
  const verifiedDocs = detail.documents.filter((d) => d.status === "verified").length;
  const totalDocs = detail.documents.length;
  const canWithdraw = WITHDRAWABLE.includes(detail.status);

  function showFeedback(type: "success" | "error", message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }

  function handleStatusChange(targetStatus: string) {
    startTransition(async () => {
      const result = await changeApplicationStatus(detail.id, targetStatus);
      if (result.error) {
        showFeedback("error", result.error);
      } else {
        showFeedback("success", `Status updated to ${getStatusConfig(targetStatus).label}`);
        router.refresh();
      }
    });
  }

  function handleWithdraw() {
    if (!confirm("Are you sure you want to withdraw this application?")) return;
    startTransition(async () => {
      const result = await staffWithdrawApplication(detail.id);
      if (result.error) {
        showFeedback("error", result.error);
      } else {
        showFeedback("success", "Application withdrawn");
        router.refresh();
      }
    });
  }

  function handleAddNote() {
    const content = noteText.trim();
    if (!content) return;
    startTransition(async () => {
      const result = await addApplicationNote(detail.id, detail.campus_id, content);
      if (result.error) {
        showFeedback("error", result.error);
      } else {
        setNoteText("");
        showFeedback("success", "Note added");
        router.refresh();
      }
    });
  }

  function handleDocumentReview(docId: string, decision: "verified" | "rejected") {
    startTransition(async () => {
      const result = await staffReviewDocument(docId, detail.id, decision);
      if (result.error) {
        showFeedback("error", result.error);
      } else {
        showFeedback("success", `Document ${decision}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link href="/staff/applications" className="text-sm text-rooted-green hover:underline">
        ← Back to Applications
      </Link>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            feedback.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{detail.student_name}</h1>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {getGradeLabel(detail.grade)} &middot; {detail.campus_name} &middot; {detail.enrollment_window_name} &middot; ID: {detail.id}
          </p>
        </div>
        <div className="flex gap-2">
          {actions.map((action) => (
            <Button
              key={action.targetStatus}
              variant={action.variant === "default" ? "default" : "outline"}
              size="sm"
              disabled={isPending}
              onClick={() => handleStatusChange(action.targetStatus)}
            >
              {action.label}
            </Button>
          ))}
          {canWithdraw && (
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={handleWithdraw}
            >
              Withdraw
            </Button>
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Submitted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{formatDate(detail.submitted_at)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Last Updated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{formatDate(detail.updated_at)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">
              {verifiedDocs}/{totalDocs} verified
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{detail.notes.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">
            Documents
            {detail.documents.some((d) => d.status === "pending") && (
              <span className="ml-1.5 w-2 h-2 rounded-full bg-amber-400 inline-block" />
            )}
          </TabsTrigger>
          <TabsTrigger value="notes">Notes ({detail.notes.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Student Information</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailRow label="Full Name" value={detail.student_name} />
                <DetailRow label="Grade" value={getGradeLabel(detail.grade)} />
                <DetailRow label="Sibling Enrolled" value={detail.has_sibling_enrolled ? "Yes" : "No"} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Parent / Guardian</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailRow label="Name" value={detail.guardian_name} />
                <DetailRow label="Email" value={detail.guardian_email ?? "—"} />
                <DetailRow label="Phone" value={detail.guardian_phone ?? "—"} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Enrollment Details</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailRow label="Campus" value={detail.campus_name} />
                <DetailRow label="Grade" value={getGradeLabel(detail.grade)} />
                <DetailRow label="Enrollment Window" value={detail.enrollment_window_name} />
                <DetailRow label="Application ID" value={detail.id} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Review</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailRow label="Reviewed By" value={detail.reviewed_by ?? "—"} />
                <DetailRow label="Reviewed At" value={formatDate(detail.reviewed_at)} />
                <DetailRow label="Review Notes" value={detail.review_notes ?? "—"} />
                {detail.tags.length > 0 && (
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {detail.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Documents Tab ── */}
        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Uploaded Documents</CardTitle>
                  <CardDescription>
                    {verifiedDocs} of {totalDocs} documents verified
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm">Request Documents</Button>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {detail.documents.length === 0 ? (
                <p className="text-center text-gray-500 py-8 text-sm">
                  No documents uploaded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.documents.map((doc) => {
                      const dcfg = docStatusConfig[doc.status] ?? docStatusConfig.pending;
                      return (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <span aria-hidden="true">📄</span>
                              {doc.file_name}
                            </div>
                          </TableCell>
                          <TableCell className="text-gray-500 capitalize">
                            {doc.document_type.replace(/_/g, " ")}
                          </TableCell>
                          <TableCell>
                            <Badge variant={dcfg.variant}>{dcfg.label}</Badge>
                          </TableCell>
                          <TableCell className="text-gray-500">
                            {formatDate(doc.created_at)}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!doc.storage_path}
                                onClick={async () => {
                                  if (!doc.storage_path) return;
                                  const { url, error } = await getSignedUrl(doc.storage_path);
                                  if (url) window.open(url, "_blank");
                                  else if (error) setFeedback({ type: "error", message: error });
                                }}
                              >
                                View
                              </Button>
                              {doc.status === "pending" && (
                                <>
                                  <Button
                                    size="sm"
                                    disabled={isPending}
                                    onClick={() => handleDocumentReview(doc.id, "verified")}
                                  >
                                    Verify
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={isPending}
                                    onClick={() => handleDocumentReview(doc.id, "rejected")}
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Notes Tab ── */}
        <TabsContent value="notes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Internal Notes</CardTitle>
              <CardDescription>
                Notes are only visible to staff members.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add note form */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add an internal note..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && noteText.trim()) handleAddNote();
                  }}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent"
                />
                <Button
                  disabled={!noteText.trim() || isPending}
                  onClick={handleAddNote}
                >
                  Add Note
                </Button>
              </div>

              {/* Notes list */}
              {detail.notes.length === 0 ? (
                <p className="text-center text-gray-500 py-6 text-sm">
                  No notes yet. Add one above.
                </p>
              ) : (
                <div className="space-y-3">
                  {detail.notes.map((note) => (
                    <div
                      key={note.id}
                      className="border border-gray-100 rounded-md p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {note.created_by_name}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatDateTime(note.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{note.content}</p>
                      {note.is_internal && (
                        <span className="inline-block mt-1.5 text-[10px] text-gray-400 uppercase tracking-wide">
                          Internal
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── History Tab ── */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status History</CardTitle>
              <CardDescription>
                Complete timeline of status changes for this application.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {detail.timeline.length === 0 ? (
                <p className="text-center text-gray-500 py-6 text-sm">
                  No history recorded yet.
                </p>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />

                  <div className="space-y-6">
                    {detail.timeline.map((entry, idx) => {
                      const toCfg = getStatusConfig(entry.to_status);
                      return (
                        <div key={entry.id} className="relative flex gap-4 pl-1">
                          {/* Timeline dot */}
                          <div
                            className={`relative z-10 w-7 h-7 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-xs shrink-0 ${
                              idx === 0 ? "bg-rooted-green text-white" : "bg-gray-200 text-gray-600"
                            }`}
                          >
                            {idx === 0 ? "●" : (detail.timeline.length - idx)}
                          </div>
                          <div className="flex-1 pb-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {entry.from_status && (
                                <>
                                  <Badge variant="secondary" className="text-xs">
                                    {getStatusConfig(entry.from_status).label}
                                  </Badge>
                                  <span className="text-gray-400 text-xs">→</span>
                                </>
                              )}
                              <Badge variant={toCfg.variant} className="text-xs">
                                {toCfg.label}
                              </Badge>
                            </div>
                            {entry.changed_by_name && (
                              <p className="text-sm text-gray-700 mt-1">
                                by <span className="font-medium">{entry.changed_by_name}</span>
                              </p>
                            )}
                            {entry.reason && (
                              <p className="text-sm text-gray-500 mt-0.5 italic">
                                &ldquo;{entry.reason}&rdquo;
                              </p>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                              {formatDateTime(entry.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
