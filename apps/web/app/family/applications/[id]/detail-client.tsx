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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useRef } from "react";
import { getStatusConfig, getGradeLabel } from "@/lib/application-helpers";
import type { ApplicationDetail } from "@/lib/queries";
import { uploadFile, getSignedUrl, validateFile, formatFileSize } from "@/lib/storage/upload";
import { familyWithdrawApplication, familyAcceptOffer, familyDeclineOffer, familyAcceptDirect, familyDeclineDirect, familySubmitResponse, familyCreateDocumentRecord } from "../actions";

/* ─── Status guide — what happens at each stage ─── */
function getStatusExplanation(status: string): { title: string; explanation: string; icon: string } {
  switch (status) {
    case "draft":
      return { title: "Draft", explanation: "Your application has been started but not yet submitted. Complete all required fields and documents, then submit before the enrollment window closes.", icon: "📝" };
    case "submitted":
      return { title: "Under Review", explanation: "Your application has been received and is being reviewed by our enrollment team. We may contact you if we need any additional information.", icon: "📬" };
    case "needs_info":
      return { title: "Information Needed", explanation: "We need additional information or documents to continue processing your application. Please check your email or upload the requested items.", icon: "⚠️" };
    case "verified":
      return { title: "Verified", explanation: "All information and documents have been verified. Your application will be included in the upcoming enrollment lottery.", icon: "✅" };
    case "lottery_assigned":
      return { title: "In Lottery", explanation: "Your application has been entered into the enrollment lottery. Results will be shared once the lottery is run.", icon: "🎲" };
    case "offered":
      return { title: "Seat Offered!", explanation: "Congratulations! A seat has been offered to your student. Please respond before the deadline below to secure your spot.", icon: "🎉" };
    case "accepted":
      return { title: "Offer Accepted", explanation: "You have accepted the enrollment offer. Complete the registration process to finalize your student's enrollment.", icon: "✅" };
    case "waitlisted":
      return { title: "Waitlisted", explanation: "Your student is on the waitlist. We will notify you if a seat becomes available.", icon: "📋" };
    case "registered":
      return { title: "Registered", explanation: "Your student is fully enrolled and registered. Welcome to the rootedschools family!", icon: "🎓" };
    case "withdrawn":
      return { title: "Withdrawn", explanation: "This application has been withdrawn.", icon: "🚫" };
    default:
      return { title: status, explanation: "", icon: "📄" };
  }
}

const docStatusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" }> = {
  pending: { label: "Pending Review", variant: "warning" },
  verified: { label: "Verified", variant: "success" },
  rejected: { label: "Needs Re-upload", variant: "destructive" },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00")).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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

const WITHDRAWABLE = ["draft", "submitted", "needs_info", "verified", "lottery_assigned", "waitlisted"];

interface FamilyApplicationDetailClientProps {
  detail: ApplicationDetail;
}

export function FamilyApplicationDetailClient({ detail }: FamilyApplicationDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [responseFile, setResponseFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submittingResponse, setSubmittingResponse] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const statusCfg = getStatusConfig(detail.status);
  const statusExplanation = getStatusExplanation(detail.status);
  const isDraft = detail.status === "draft";
  const isOffered = detail.status === "offered";
  const offerExpired = (() => {
    if (!isOffered || !detail.offer_expires_at) return false;
    const exp = new Date(detail.offer_expires_at + (detail.offer_expires_at.includes("T") ? "" : "T23:59:59"));
    return exp.getTime() < Date.now();
  })();
  const needsAction = isDraft || detail.status === "needs_info" || (isOffered && !offerExpired);
  const canWithdraw = WITHDRAWABLE.includes(detail.status);

  async function handleViewDocument(storagePath: string) {
    if (!storagePath) return;
    const { url, error } = await getSignedUrl(storagePath);
    if (error) {
      setFeedback({ type: "error", message: `Could not open document: ${error}` });
      return;
    }
    if (url) window.open(url, "_blank");
  }

  function handleAcceptOffer() {
    startTransition(async () => {
      const result = detail.offer_id
        ? await familyAcceptOffer(detail.offer_id, detail.guardian_id, detail.id)
        : await familyAcceptDirect(detail.id);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        router.push("/family/registration");
      }
    });
  }

  function handleDeclineOffer() {
    setShowDeclineDialog(true);
  }

  function confirmDeclineOffer() {
    setShowDeclineDialog(false);
    startTransition(async () => {
      const result = detail.offer_id
        ? await familyDeclineOffer(detail.offer_id, detail.id)
        : await familyDeclineDirect(detail.id);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: "Offer declined." });
        router.refresh();
      }
    });
  }

  function handleWithdraw() {
    setShowWithdrawDialog(true);
  }

  async function handleSubmitResponse() {
    if (!responseText.trim() && !responseFile) return;
    setSubmittingResponse(true);
    try {
      // Send text response if provided
      if (responseText.trim()) {
        const textResult = await familySubmitResponse(detail.id, responseText.trim());
        if (textResult.error) {
          setFeedback({ type: "error", message: textResult.error });
          return;
        }
      }
      // Upload file if provided
      if (responseFile) {
        const uploadResult = await uploadFile(responseFile, detail.guardian_id);
        if (uploadResult.error) {
          setFeedback({ type: "error", message: uploadResult.error });
          return;
        }
        const docResult = await familyCreateDocumentRecord({
          application_id: detail.id,
          student_id: detail.student_id,
          document_type: "other",
          file_name: uploadResult.fileName,
          file_size: uploadResult.fileSize,
          mime_type: uploadResult.mimeType,
          storage_path: uploadResult.storagePath,
        });
        if (docResult.error) {
          setFeedback({ type: "error", message: docResult.error });
          return;
        }
      }
      setFeedback({ type: "success", message: "Your response has been sent to the enrollment team." });
      setResponseText("");
      setResponseFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } finally {
      setSubmittingResponse(false);
    }
  }

  function confirmWithdraw() {
    setShowWithdrawDialog(false);
    startTransition(async () => {
      const result = await familyWithdrawApplication(detail.id);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: "Application withdrawn successfully." });
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link href="/family/applications" className="text-sm text-rooted-green hover:underline">
        ← Back to My Applications
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
            {getGradeLabel(detail.grade)} &middot; {detail.campus_name} &middot; {detail.enrollment_window_name}
          </p>
        </div>
        <div className="flex gap-2">
          {isDraft && (
            <Link href={`/family/applications/${detail.id}/edit`}>
              <Button>Continue Application</Button>
            </Link>
          )}
          {isOffered && !offerExpired && (
            <>
              <Button disabled={isPending} onClick={handleAcceptOffer}>
                {isPending ? "Accepting..." : "Accept Offer"}
              </Button>
              <Button variant="outline" disabled={isPending} onClick={handleDeclineOffer}>
                {isPending ? "..." : "Decline"}
              </Button>
            </>
          )}
          {canWithdraw && (
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={handleWithdraw}
            >
              {isPending ? "Withdrawing..." : "Withdraw"}
            </Button>
          )}
        </div>
      </div>

      {/* More Info Request — message + inline response form */}
      {detail.status === "needs_info" && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-5 space-y-4">
            {detail.review_notes && (
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden="true">📋</span>
                <div>
                  <p className="text-sm font-semibold text-amber-900">What the enrollment team needs from you</p>
                  <p className="text-sm text-amber-800 mt-1 whitespace-pre-wrap">{detail.review_notes}</p>
                </div>
              </div>
            )}
            <div className="space-y-3 pt-1">
              <p className="text-sm font-medium text-amber-900">Your response</p>
              <textarea
                className="w-full border border-amber-300 rounded-md p-3 text-sm min-h-[100px] resize-none bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="Type your response here… (optional if uploading a file)"
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                disabled={submittingResponse}
              />
              <div>
                <label className="block text-sm font-medium text-amber-900 mb-1">Attach a file (optional)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  disabled={submittingResponse}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f) {
                      const err = validateFile(f);
                      setFileError(err);
                      setResponseFile(err ? null : f);
                    } else {
                      setResponseFile(null);
                      setFileError(null);
                    }
                  }}
                  className="w-full text-sm text-amber-900 file:mr-3 file:px-3 file:py-1 file:rounded file:border-0 file:bg-amber-100 file:text-amber-800 file:font-medium file:cursor-pointer"
                />
                {fileError && <p className="text-xs text-red-600 mt-1">{fileError}</p>}
                {responseFile && !fileError && (
                  <p className="text-xs text-amber-700 mt-1">{responseFile.name} ({formatFileSize(responseFile.size)})</p>
                )}
              </div>
              <Button
                onClick={handleSubmitResponse}
                disabled={submittingResponse || (!responseText.trim() && !responseFile) || !!fileError}
                className="bg-amber-700 hover:bg-amber-800 text-white"
              >
                {submittingResponse ? "Sending…" : "Send Response"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Offer urgency card (special treatment) */}
      {isOffered && detail.offer_expires_at ? (() => {
        const expiresDate = new Date(detail.offer_expires_at + (detail.offer_expires_at.includes("T") ? "" : "T23:59:59"));
        const daysLeft = Math.max(0, Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
        const isUrgent = daysLeft <= 3;
        const isExpired = daysLeft <= 0;
        return (
          <Card className={isUrgent ? "border-red-300 bg-red-50" : "border-amber-200 bg-amber-50/30"}>
            <CardContent className="py-5">
              <div className="flex items-start gap-4">
                <span className="text-3xl" aria-hidden="true">🎉</span>
                <div className="flex-1">
                  <p className="text-base font-bold text-ink">
                    {isExpired ? "Offer Expired" : "You Have a Seat Offer!"}
                  </p>
                  <p className="text-sm text-ink/60 mt-0.5">
                    {isExpired
                      ? "This offer has expired. Please contact the enrollment office if you have questions."
                      : "A seat has been offered to your student. Accept below to secure your spot."}
                  </p>
                  {!isExpired && (
                    <div className={`inline-flex items-center gap-2 mt-2 px-3 py-1.5 rounded-full text-sm font-semibold ${
                      isUrgent
                        ? "bg-red-100 text-red-800"
                        : "bg-amber-100 text-amber-800"
                    }`}>
                      <span aria-hidden="true">{isUrgent ? "⏰" : "📅"}</span>
                      {daysLeft === 1
                        ? "Expires tomorrow!"
                        : daysLeft === 0
                          ? "Expires today!"
                          : `${daysLeft} days to respond`}
                      <span className="text-xs font-normal opacity-70">
                        (by {formatDate(detail.offer_expires_at)})
                      </span>
                    </div>
                  )}
                </div>
                {!isExpired && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button
                      disabled={isPending}
                      onClick={handleAcceptOffer}
                      className="bg-rooted-green hover:bg-rooted-green/90 text-white"
                    >
                      {isPending ? "Accepting..." : "Accept Offer"}
                    </Button>
                    <Button variant="outline" size="sm" disabled={isPending} onClick={handleDeclineOffer}>
                      {isPending ? "..." : "Decline"}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })() : (
        /* Standard status explanation card */
        <Card className={needsAction ? "border-amber-200 bg-amber-50/30" : "border-rooted-green/20 bg-rooted-green/5"}>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden="true">{statusExplanation.icon}</span>
              <div>
                <p className="text-sm font-semibold text-ink">{statusExplanation.title}</p>
                <p className="text-sm text-ink/60 mt-0.5">{statusExplanation.explanation}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Application details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Student Information</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow label="Full Name" value={detail.student_name} />
            <DetailRow label="Campus" value={detail.campus_name} />
            <DetailRow label="Grade" value={getGradeLabel(detail.grade)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact Information</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow label="Guardian" value={detail.guardian_name} />
            <DetailRow label="Email" value={detail.guardian_email ?? "—"} />
            <DetailRow label="Phone" value={detail.guardian_phone ?? "—"} />
          </CardContent>
        </Card>
      </div>

      {/* Documents */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Documents</CardTitle>
              <CardDescription>
                Documents uploaded with this application.
              </CardDescription>
            </div>
            {(isDraft || detail.status === "needs_info") && (
              <Link href="/family/documents">
                <Button variant="outline" size="sm">Upload Document</Button>
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {detail.documents.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-stone">No documents uploaded yet.</p>
              <Link href="/family/documents" className="text-xs text-rooted-green hover:underline mt-1 inline-block">
                Go to Documents page to upload →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {detail.documents.map((doc) => {
                const dcfg = docStatusConfig[doc.status] ?? docStatusConfig.pending;
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 rounded-md border border-stone/20"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-lg" aria-hidden="true">📄</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate">
                          {doc.file_name}
                        </p>
                        <p className="text-xs text-stone">
                          Uploaded {formatDate(doc.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={dcfg.variant}>{dcfg.label}</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDocument(doc.storage_path)}
                        disabled={!doc.storage_path}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Application Timeline</CardTitle>
          <CardDescription>
            Track the progress of this application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {detail.timeline.length === 0 ? (
            <p className="text-center text-stone py-6 text-sm">
              No activity recorded yet.
            </p>
          ) : (
            <div className="relative">
              <div className="absolute left-3 top-2 bottom-2 w-px bg-rooted-gray-dark/30" />
              <div className="space-y-5">
                {detail.timeline.map((entry, idx) => {
                  const toCfg = getStatusConfig(entry.to_status);
                  return (
                    <div key={entry.id} className="relative flex gap-4 pl-0">
                      <div
                        className={`relative z-10 w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center shrink-0 ${
                          idx === 0 ? "bg-rooted-green" : "bg-rooted-gray-dark/30"
                        }`}
                      >
                        <div
                          className={`w-2 h-2 rounded-full ${
                            idx === 0 ? "bg-white" : "bg-stone"
                          }`}
                        />
                      </div>
                      <div className="flex-1 -mt-0.5">
                        <div className="flex items-center gap-2">
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
                        {entry.reason && (
                          <p className="text-sm text-stone mt-0.5">
                            {entry.reason}
                          </p>
                        )}
                        <p className="text-xs text-stone mt-1">
                          {formatDate(entry.created_at)}
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

      {/* Dates footer */}
      <div className="flex gap-6 text-xs text-stone pb-4">
        {detail.submitted_at && <span>Submitted: {formatDate(detail.submitted_at)}</span>}
        <span>Last Updated: {formatDate(detail.updated_at)}</span>
        <span>Application ID: {detail.id}</span>
      </div>

      {/* Decline Offer Dialog */}
      <Dialog open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Seat Offer</DialogTitle>
            <DialogDescription>
              Are you sure you want to decline this seat offer for {detail.student_name}? This action cannot be undone and the seat will be offered to the next student on the waitlist.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeclineDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeclineOffer}
              disabled={isPending}
            >
              {isPending ? "Declining..." : "Decline Offer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw Application Dialog */}
      <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw Application</DialogTitle>
            <DialogDescription>
              Are you sure you want to withdraw {detail.student_name}&apos;s application? This action cannot be undone. You would need to submit a new application to re-apply.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWithdrawDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmWithdraw}
              disabled={isPending}
            >
              {isPending ? "Withdrawing..." : "Withdraw Application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
