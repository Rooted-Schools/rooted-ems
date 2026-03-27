"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { getStatusConfig, getGradeLabel } from "@/lib/application-helpers";
import type { ApplicationDetail } from "@/lib/queries";
import {
  changeApplicationStatus,
  staffWithdrawApplication,
  addApplicationNote,
  staffReviewDocument,
  staffMakeOffer,
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

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
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
    <div className="flex justify-between py-2 border-b border-rooted-gray last:border-0">
      <span className="text-sm text-stone">{label}</span>
      <span className="text-sm font-medium text-ink text-right">{value}</span>
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
  userId: string;
}

// Default offer expiry: 14 days from today
function defaultExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().split("T")[0];
}

export function StaffApplicationDetailClient({ detail, userId }: StaffApplicationDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [noteText, setNoteText] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [showMoreInfoDialog, setShowMoreInfoDialog] = useState(false);
  const [moreInfoMessage, setMoreInfoMessage] = useState("");
  const [showOfferDialog, setShowOfferDialog] = useState(false);
  const [offerExpiry, setOfferExpiry] = useState(defaultExpiryDate);

  const statusCfg = getStatusConfig(detail.status);
  const actions = getAvailableActions(detail.status);
  const verifiedDocs = detail.documents.filter((d) => d.status === "verified").length;
  const totalDocs = detail.documents.length;
  const canWithdraw = WITHDRAWABLE.includes(detail.status);

  function showFeedback(type: "success" | "error", message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }

  function handleStatusChange(targetStatus: string, reason?: string) {
    if (targetStatus === "needs_info" && reason === undefined) {
      setShowMoreInfoDialog(true);
      return;
    }
    if (targetStatus === "offered") {
      setShowOfferDialog(true);
      return;
    }
    startTransition(async () => {
      const result = await changeApplicationStatus(detail.id, targetStatus, reason);
      if (result.error) {
        showFeedback("error", result.error);
      } else {
        showFeedback("success", `Status updated to ${getStatusConfig(targetStatus).label}`);
        router.refresh();
      }
    });
  }

  function confirmOffer() {
    setShowOfferDialog(false);
    startTransition(async () => {
      const expiresAt = new Date(offerExpiry + "T23:59:59").toISOString();
      const result = await staffMakeOffer(
        detail.id,
        detail.campus_id,
        detail.grade_level_id,
        expiresAt,
        userId
      );
      if (result.error) {
        showFeedback("error", result.error);
      } else {
        showFeedback("success", "Offer sent successfully.");
        router.refresh();
      }
    });
  }

  function confirmMoreInfo() {
    if (!moreInfoMessage.trim()) return;
    setShowMoreInfoDialog(false);
    handleStatusChange("needs_info", moreInfoMessage.trim());
    setMoreInfoMessage("");
  }

  function handleWithdraw() {
    setShowWithdrawDialog(true);
  }

  function confirmWithdraw() {
    setShowWithdrawDialog(false);
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
            <h1 className="text-2xl font-bold text-ink">{detail.student_name}</h1>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          </div>
          <p className="text-sm text-stone mt-1">
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

      {/* Review Guidance Banner */}
      {detail.status === "submitted" && (
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden="true">📋</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">Application Ready for Review</p>
                <p className="text-xs text-ink/60 mt-0.5">
                  Review the student information and uploaded documents below.
                  {totalDocs > 0 && verifiedDocs < totalDocs && (
                    <span className="text-amber-700 font-medium"> {totalDocs - verifiedDocs} document{totalDocs - verifiedDocs > 1 ? "s" : ""} pending verification.</span>
                  )}
                  {totalDocs > 0 && verifiedDocs === totalDocs && (
                    <span className="text-green-700 font-medium"> All documents verified — ready to mark as Verified.</span>
                  )}
                  {totalDocs === 0 && (
                    <span className="text-amber-700 font-medium"> No documents uploaded yet — consider requesting more info.</span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {detail.status === "needs_info" && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden="true">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-ink">Waiting for Family Response</p>
                <p className="text-xs text-ink/60 mt-0.5">
                  Additional information or documents have been requested from the family. Once they respond, review and mark as Verified.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {detail.status === "verified" && (
        <Card className="border-green-200 bg-green-50/30">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden="true">✅</span>
              <div>
                <p className="text-sm font-semibold text-ink">Application Verified</p>
                <p className="text-xs text-ink/60 mt-0.5">
                  This application is verified and ready to be assigned to a lottery run or given a direct offer.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Submitted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{formatDate(detail.submitted_at)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Days in Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">
              {detail.submitted_at
                ? Math.max(0, Math.ceil((Date.now() - new Date(detail.submitted_at).getTime()) / (1000 * 60 * 60 * 24)))
                : "—"}{" "}
              <span className="text-xs text-stone font-normal">days</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">
              <span className={verifiedDocs === totalDocs && totalDocs > 0 ? "text-green-600" : ""}>{verifiedDocs}/{totalDocs}</span>
              <span className="text-xs text-stone font-normal ml-1">verified</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
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
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {detail.documents.length === 0 ? (
                <p className="text-center text-stone py-8 text-sm">
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
                          <TableCell className="text-stone capitalize">
                            {doc.document_type.replace(/_/g, " ")}
                          </TableCell>
                          <TableCell>
                            <Badge variant={dcfg.variant}>{dcfg.label}</Badge>
                          </TableCell>
                          <TableCell className="text-stone">
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
                  className="flex-1 rounded-md border border-stone/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent"
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
                <p className="text-center text-stone py-6 text-sm">
                  No notes yet. Add one above.
                </p>
              ) : (
                <div className="space-y-3">
                  {detail.notes.map((note) => (
                    <div
                      key={note.id}
                      className="border border-rooted-gray rounded-md p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-ink">
                          {note.created_by_name}
                        </span>
                        <span className="text-xs text-stone">
                          {formatDateTime(note.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-ink/70">{note.content}</p>
                      {note.is_internal && (
                        <span className="inline-block mt-1.5 text-[10px] text-stone uppercase tracking-wide">
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
                <p className="text-center text-stone py-6 text-sm">
                  No history recorded yet.
                </p>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-rooted-gray-dark/30" />

                  <div className="space-y-6">
                    {detail.timeline.map((entry, idx) => {
                      const toCfg = getStatusConfig(entry.to_status);
                      return (
                        <div key={entry.id} className="relative flex gap-4 pl-1">
                          {/* Timeline dot */}
                          <div
                            className={`relative z-10 w-7 h-7 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-xs shrink-0 ${
                              idx === 0 ? "bg-rooted-green text-white" : "bg-rooted-gray-dark/30 text-ink/60"
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
                                  <span className="text-stone text-xs">→</span>
                                </>
                              )}
                              <Badge variant={toCfg.variant} className="text-xs">
                                {toCfg.label}
                              </Badge>
                            </div>
                            {entry.changed_by_name && (
                              <p className="text-sm text-ink/70 mt-1">
                                by <span className="font-medium">{entry.changed_by_name}</span>
                              </p>
                            )}
                            {entry.reason && (
                              <p className="text-sm text-stone mt-0.5 italic">
                                &ldquo;{entry.reason}&rdquo;
                              </p>
                            )}
                            <p className="text-xs text-stone mt-1">
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

      {/* Request More Info dialog */}
      <Dialog open={showMoreInfoDialog} onOpenChange={setShowMoreInfoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request More Information</DialogTitle>
            <DialogDescription>
              Describe what you need from the family. They will see this message on their application.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full border border-input rounded-md p-3 text-sm min-h-[120px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="e.g. Please provide a copy of your child's most recent report card and proof of address dated within the last 90 days."
            value={moreInfoMessage}
            onChange={(e) => setMoreInfoMessage(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowMoreInfoDialog(false); setMoreInfoMessage(""); }}>Cancel</Button>
            <Button onClick={confirmMoreInfo} disabled={!moreInfoMessage.trim()}>Send Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Make Offer dialog */}
      <Dialog open={showOfferDialog} onOpenChange={setShowOfferDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make Offer</DialogTitle>
            <DialogDescription>
              Send a seat offer to {detail.student_name}&apos;s family. Set the deadline by which they must respond.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="block text-sm font-medium text-ink/70 mb-1">Offer Expires On</label>
            <input
              type="date"
              value={offerExpiry}
              onChange={(e) => setOfferExpiry(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
            />
            <p className="text-xs text-stone mt-1">Default is 14 days. Family must accept or decline by this date.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOfferDialog(false)}>Cancel</Button>
            <Button onClick={confirmOffer} disabled={!offerExpiry}>Send Offer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw confirmation dialog */}
      <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw Application</DialogTitle>
            <DialogDescription>
              Are you sure you want to withdraw {detail.student_name}&apos;s application?
              This action will remove the student from the enrollment pipeline.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWithdrawDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmWithdraw}>Withdraw Application</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
