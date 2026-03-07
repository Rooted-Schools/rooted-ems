"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStatusConfig, getGradeLabel } from "@/lib/application-helpers";
import type { ApplicationDetail } from "@/lib/queries";
import { familyWithdrawApplication, familyAcceptOffer, familyDeclineOffer } from "../actions";

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
      return { title: "Seat Offered", explanation: "Congratulations! A seat has been offered to your student. Please respond before the deadline to accept or decline.", icon: "🎉" };
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
    <div className="flex justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
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

  const statusCfg = getStatusConfig(detail.status);
  const statusExplanation = getStatusExplanation(detail.status);
  const isDraft = detail.status === "draft";
  const isOffered = detail.status === "offered";
  const needsAction = isDraft || detail.status === "needs_info" || isOffered;
  const canWithdraw = WITHDRAWABLE.includes(detail.status);

  function handleAcceptOffer() {
    if (!detail.offer_id) return;
    startTransition(async () => {
      const result = await familyAcceptOffer(detail.offer_id!, detail.guardian_id, detail.id);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: "Offer accepted! Welcome to the rootedschools family." });
        router.refresh();
      }
    });
  }

  function handleDeclineOffer() {
    if (!detail.offer_id) return;
    if (!confirm("Are you sure you want to decline this offer? This cannot be undone.")) return;
    startTransition(async () => {
      const result = await familyDeclineOffer(detail.offer_id!, detail.id);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: "Offer declined." });
        router.refresh();
      }
    });
  }

  function handleWithdraw() {
    if (!confirm("Are you sure you want to withdraw this application? This cannot be undone.")) return;
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
            <h1 className="text-2xl font-bold text-gray-900">{detail.student_name}</h1>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {getGradeLabel(detail.grade)} &middot; {detail.campus_name} &middot; {detail.enrollment_window_name}
          </p>
        </div>
        <div className="flex gap-2">
          {isDraft && (
            <Link href={`/family/applications/${detail.id}/edit`}>
              <Button>Continue Application</Button>
            </Link>
          )}
          {isOffered && detail.offer_id && (
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

      {/* Status explanation card */}
      <Card className={needsAction ? "border-amber-200 bg-amber-50/30" : "border-rooted-green/20 bg-rooted-green/5"}>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden="true">{statusExplanation.icon}</span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{statusExplanation.title}</p>
              <p className="text-sm text-gray-600 mt-0.5">{statusExplanation.explanation}</p>
              {isOffered && detail.offer_expires_at && (
                <p className="text-sm font-medium text-amber-700 mt-1">
                  Respond by: {formatDate(detail.offer_expires_at)}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
              <Button variant="outline" size="sm" disabled>Upload Document</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {detail.documents.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-500">No documents uploaded yet.</p>
              {isDraft && (
                <p className="text-xs text-gray-400 mt-1">
                  Documents can be uploaded after file upload is enabled.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {detail.documents.map((doc) => {
                const dcfg = docStatusConfig[doc.status] ?? docStatusConfig.pending;
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 rounded-md border border-gray-200"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-lg" aria-hidden="true">📄</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {doc.file_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          Uploaded {formatDate(doc.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={dcfg.variant}>{dcfg.label}</Badge>
                      <Button variant="outline" size="sm">View</Button>
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
            <p className="text-center text-gray-500 py-6 text-sm">
              No activity recorded yet.
            </p>
          ) : (
            <div className="relative">
              <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200" />
              <div className="space-y-5">
                {detail.timeline.map((entry, idx) => {
                  const toCfg = getStatusConfig(entry.to_status);
                  return (
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
                        <div className="flex items-center gap-2">
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
                        {entry.reason && (
                          <p className="text-sm text-gray-500 mt-0.5">
                            {entry.reason}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
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
      <div className="flex gap-6 text-xs text-gray-400 pb-4">
        {detail.submitted_at && <span>Submitted: {formatDate(detail.submitted_at)}</span>}
        <span>Last Updated: {formatDate(detail.updated_at)}</span>
        <span>Application ID: {detail.id}</span>
      </div>
    </div>
  );
}
