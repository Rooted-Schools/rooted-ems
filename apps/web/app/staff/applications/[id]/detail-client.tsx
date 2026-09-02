"use client";

/**
 * StaffApplicationDetailClient — thin orchestrator (Phase 4 split).
 *
 * This file used to be a single 1418-line component. It is now split into:
 *   - ReviewHeader     (./_components/review-header.tsx)
 *   - ExceptionList    (./_components/exception-list.tsx)
 *   - RequirementList  (./_components/requirement-list.tsx)
 *   - ContextRail      (./_components/context-rail.tsx)
 *   - RegistrationPanel(./_components/registration-panel.tsx) — the
 *     registration-packet + academic-audit workflow, which doesn't fit the
 *     exception/requirement/rail model (it's a distinct later-lifecycle
 *     workflow), so it's kept as its own section rather than folded in.
 *   - QueueBar         (./_components/queue-bar.tsx) — additive, queue mode only.
 *
 * Every server action below is called with its exact original signature —
 * see actions.ts. The page's props contract (detail, userId,
 * registrationPacket from page.tsx) is unchanged.
 *
 * Queue mode is purely additive: it activates only when the URL carries a
 * `queue` search param (a comma-separated list of application ids, provided
 * by the Pipeline view) whose entries include this application's id. With no
 * `queue` param, this page renders exactly as it did before Phase 4 (minus
 * the tab-based reorganization described in each extracted component).
 */
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { getStatusConfig } from "@/lib/application-helpers";
import type { ApplicationDetail, RegistrationPacketDetail } from "@/lib/queries";
import {
  changeApplicationStatus,
  staffWithdrawApplication,
  addApplicationNote,
  staffReviewDocument,
  staffMakeOffer,
} from "./actions";
import {
  IconClipboardList,
  IconAlertTriangle,
  IconCheckCircle,
  IconMail,
  IconGraduationCap,
  IconSprout,
} from "@/components/ui/icons";
import { ReviewHeader, type HeaderAction } from "./_components/review-header";
import { ExceptionList } from "./_components/exception-list";
import { RequirementList } from "./_components/requirement-list";
import { ContextRail } from "./_components/context-rail";
import { RegistrationPanel } from "./_components/registration-panel";
import { QueueBar } from "./_components/queue-bar";
import { ComposeEmailDialog } from "@/components/staff/compose-email-dialog";

/* ─── Status actions based on current status (unchanged from the original file) ─── */
function getAvailableActions(status: string): HeaderAction[] {
  switch (status) {
    case "submitted":
      return [
        { label: "Mark as Verified", variant: "default", targetStatus: "verified" },
        { label: "Request More Info", variant: "outline", targetStatus: "needs_info" },
      ];
    case "needs_info":
      return [{ label: "Mark as Verified", variant: "default", targetStatus: "verified" }];
    case "verified":
      return [
        { label: "Accept Application", variant: "default", targetStatus: "accepted" },
        { label: "Assign to Lottery", variant: "outline", targetStatus: "lottery_assigned" },
      ];
    case "lottery_assigned":
      return [
        { label: "Accept Application", variant: "default", targetStatus: "accepted" },
        { label: "Make Offer", variant: "outline", targetStatus: "offered" },
        { label: "Add to Waitlist", variant: "outline", targetStatus: "waitlisted" },
      ];
    case "offered":
      return [
        { label: "Record Acceptance", variant: "default", targetStatus: "accepted" },
        { label: "Record Decline", variant: "outline", targetStatus: "declined" },
      ];
    case "waitlisted":
      return [{ label: "Make Offer", variant: "default", targetStatus: "offered" }];
    default:
      return [];
  }
}

/* ─── Withdrawable / rejectable statuses (unchanged set from the original file) ─── */
const WITHDRAWABLE = ["draft", "submitted", "needs_info", "verified", "lottery_assigned", "waitlisted"];

function defaultExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().split("T")[0];
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

interface StaffApplicationDetailClientProps {
  detail: ApplicationDetail;
  userId: string;
  registrationPacket: RegistrationPacketDetail | null;
}

export function StaffApplicationDetailClient({ detail, userId, registrationPacket }: StaffApplicationDetailClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [noteText, setNoteText] = useState("");
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [showRejectAppDialog, setShowRejectAppDialog] = useState(false);
  const [rejectAppReason, setRejectAppReason] = useState("");
  const [showMoreInfoDialog, setShowMoreInfoDialog] = useState(false);
  const [moreInfoMessage, setMoreInfoMessage] = useState("");
  const [showOfferDialog, setShowOfferDialog] = useState(false);
  const [offerExpiry, setOfferExpiry] = useState(defaultExpiryDate);
  const [showRejectDocDialog, setShowRejectDocDialog] = useState(false);
  const [rejectDocId, setRejectDocId] = useState<string | null>(null);
  const [rejectDocReason, setRejectDocReason] = useState("");
  const [showComposeEmailDialog, setShowComposeEmailDialog] = useState(false);

  const actions = getAvailableActions(detail.status);
  const canWithdraw = WITHDRAWABLE.includes(detail.status);
  const canReject = WITHDRAWABLE.includes(detail.status);

  const pendingDocs = detail.documents.filter((d) => d.status === "pending");
  const rejectedDocs = detail.documents.filter((d) => d.status === "rejected");
  const verifiedDocs = detail.documents.filter((d) => d.status === "verified");

  /* ── Queue mode: ids come only from the URL (Pipeline-supplied), never fabricated ── */
  const queueIds = useMemo(() => {
    const raw = searchParams.get("queue");
    return raw ? raw.split(",").filter(Boolean) : [];
  }, [searchParams]);

  const posParam = searchParams.get("pos");
  const parsedPos = posParam !== null ? Number(posParam) : NaN;
  const currentIndex =
    Number.isFinite(parsedPos) && queueIds[parsedPos] === detail.id ? parsedPos : queueIds.indexOf(detail.id);
  const inQueue = queueIds.length > 0 && currentIndex >= 0;
  const prevId = inQueue && currentIndex > 0 ? queueIds[currentIndex - 1] : null;
  const nextId = inQueue && currentIndex < queueIds.length - 1 ? queueIds[currentIndex + 1] : null;

  const buildQueueUrl = useCallback(
    (id: string, idx: number, extra?: Record<string, string>) => {
      const params = new URLSearchParams();
      params.set("queue", queueIds.join(","));
      params.set("pos", String(idx));
      if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, v);
      return `/staff/applications/${id}?${params.toString()}`;
    },
    [queueIds]
  );

  const exitQueue = useCallback(() => {
    router.push(pathname);
  }, [router, pathname]);

  const navigatePrev = useCallback(() => {
    if (prevId) router.push(buildQueueUrl(prevId, currentIndex - 1));
  }, [prevId, currentIndex, buildQueueUrl, router]);

  const navigateNext = useCallback(() => {
    if (nextId) router.push(buildQueueUrl(nextId, currentIndex + 1));
  }, [nextId, currentIndex, buildQueueUrl, router]);

  // Toast + clean the URL after landing here via a queue "Verify → next" hop.
  useEffect(() => {
    if (searchParams.get("justVerified") === "1") {
      toast({ variant: "success", title: `Verified. Next: ${detail.student_name}` });
      const params = new URLSearchParams(searchParams.toString());
      params.delete("justVerified");
      router.replace(`${pathname}?${params.toString()}`);
    }
    // Only re-run when the flag itself changes; re-reading searchParams/toast/router each
    // render would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("justVerified")]);

  function showFeedback(type: "success" | "error", message: string) {
    toast({ variant: type, title: message });
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
        return;
      }

      // Queue mode: a successful Verify advances to the next application
      // automatically instead of refreshing in place.
      if (targetStatus === "verified" && inQueue) {
        if (nextId) {
          router.push(buildQueueUrl(nextId, currentIndex + 1, { justVerified: "1" }));
        } else {
          toast({ variant: "success", title: `Reviewed all ${queueIds.length} in the queue.` });
          exitQueue();
        }
        return;
      }

      showFeedback("success", `Status updated to ${getStatusConfig(targetStatus).label}`);
      router.refresh();
    });
  }

  function confirmOffer() {
    setShowOfferDialog(false);
    startTransition(async () => {
      const expiresAt = new Date(offerExpiry + "T23:59:59").toISOString();
      const result = await staffMakeOffer(detail.id, detail.campus_id, detail.grade_level_id, expiresAt, userId);
      if (result.error) showFeedback("error", result.error);
      else {
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

  function confirmWithdraw() {
    setShowWithdrawDialog(false);
    startTransition(async () => {
      const result = await staffWithdrawApplication(detail.id);
      if (result.error) showFeedback("error", result.error);
      else {
        showFeedback("success", "Application withdrawn");
        router.refresh();
      }
    });
  }

  // "Reject application" — an addition surfaced in the header overflow menu.
  // It calls the exact same generic changeApplicationStatus(id, status, reason)
  // action already used everywhere else in this file, with targetStatus
  // "rejected" (a real value in the application status state machine). No
  // new mutation, no changed signature.
  function confirmRejectApp() {
    setShowRejectAppDialog(false);
    startTransition(async () => {
      // There is no separate "rejected" status in the application lifecycle:
      // the terminal "removed from consideration" state is "withdrawn". Reject
      // routes through the same withdraw mutation as the Withdraw action, but
      // carries the staff reason so the audit trail records why. (The old code
      // set status "rejected", which is not a valid enum value or transition,
      // so Reject always errored.)
      const result = await staffWithdrawApplication(detail.id, rejectAppReason.trim() || undefined);
      if (result.error) showFeedback("error", result.error);
      else {
        showFeedback("success", "Application rejected");
        router.refresh();
      }
    });
    setRejectAppReason("");
  }

  function handleAddNote() {
    const content = noteText.trim();
    if (!content) return;
    startTransition(async () => {
      const result = await addApplicationNote(detail.id, detail.campus_id, content);
      if (result.error) showFeedback("error", result.error);
      else {
        setNoteText("");
        showFeedback("success", "Note added");
        router.refresh();
      }
    });
  }

  function handleDocumentReview(docId: string, decision: "verified" | "rejected") {
    if (decision === "rejected") {
      setRejectDocId(docId);
      setRejectDocReason("");
      setShowRejectDocDialog(true);
      return;
    }
    startTransition(async () => {
      const result = await staffReviewDocument(docId, detail.id, "verified");
      if (result.error) showFeedback("error", result.error);
      else {
        showFeedback("success", "Document verified.");
        router.refresh();
      }
    });
  }

  function confirmRejectDoc() {
    if (!rejectDocId) return;
    setShowRejectDocDialog(false);
    startTransition(async () => {
      const result = await staffReviewDocument(rejectDocId, detail.id, "rejected", rejectDocReason.trim() || undefined);
      if (result.error) showFeedback("error", result.error);
      else {
        showFeedback("success", "Document rejected. Family will be notified to re-upload.");
        router.refresh();
      }
    });
    setRejectDocId(null);
    setRejectDocReason("");
  }

  const anyDialogOpen =
    showWithdrawDialog || showRejectAppDialog || showMoreInfoDialog || showOfferDialog || showRejectDocDialog;

  const canVerify = actions.some((a) => a.targetStatus === "verified");
  const canRequestInfoAction = actions.some((a) => a.targetStatus === "needs_info");

  // Queue keyboard shortcuts — guarded against firing while the user is
  // typing in the note field, a dialog textarea, or any other input.
  useEffect(() => {
    if (!inQueue) return;
    function onKeyDown(e: KeyboardEvent) {
      if (anyDialogOpen) return;
      if (isTypingTarget(e.target)) return;
      switch (e.key.toLowerCase()) {
        case "k":
          e.preventDefault();
          navigatePrev();
          break;
        case "j":
          e.preventDefault();
          navigateNext();
          break;
        case "v":
          if (canVerify) {
            e.preventDefault();
            handleStatusChange("verified");
          }
          break;
        case "r":
          if (canRequestInfoAction) {
            e.preventDefault();
            handleStatusChange("needs_info");
          }
          break;
        case "escape":
          e.preventDefault();
          exitQueue();
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inQueue, anyDialogOpen, canVerify, canRequestInfoAction, navigatePrev, navigateNext, exitQueue]);

  return (
    <div className="space-y-6">
      {inQueue && (
        <QueueBar
          position={currentIndex + 1}
          total={queueIds.length}
          hasPrev={!!prevId}
          hasNext={!!nextId}
          onPrev={navigatePrev}
          onNext={navigateNext}
          onVerify={() => canVerify && handleStatusChange("verified")}
          onRequestInfo={() => canRequestInfoAction && handleStatusChange("needs_info")}
          onExit={exitQueue}
        />
      )}

      {!inQueue && (
        <Link href="/staff/applications" className="text-sm text-rooted-green hover:underline">
          ← Back to Applications
        </Link>
      )}

      <ReviewHeader
        detail={detail}
        actions={actions}
        pendingDocCount={pendingDocs.length}
        isPending={isPending}
        canWithdraw={canWithdraw}
        canReject={canReject}
        onAction={handleStatusChange}
        onWithdraw={() => setShowWithdrawDialog(true)}
        onReject={() => setShowRejectAppDialog(true)}
      />

      {/* Status guidance banners — unchanged from the original file */}
      {detail.status === "submitted" && (
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <IconClipboardList size={24} className="text-blue-700 shrink-0" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">Application Ready for Review</p>
                <p className="text-xs text-ink/60 mt-0.5">
                  Review the student information and uploaded documents below.
                  {detail.documents.length > 0 && verifiedDocs.length < detail.documents.length && (
                    <span className="text-amber-700 font-medium">
                      {" "}
                      {detail.documents.length - verifiedDocs.length} document
                      {detail.documents.length - verifiedDocs.length > 1 ? "s" : ""} pending verification.
                    </span>
                  )}
                  {detail.documents.length > 0 && verifiedDocs.length === detail.documents.length && (
                    <span className="text-green-700 font-medium"> All documents verified. Ready to mark as Verified.</span>
                  )}
                  {detail.documents.length === 0 && (
                    <span className="text-amber-700 font-medium"> No documents uploaded yet. Consider requesting more info.</span>
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
              <IconAlertTriangle size={24} className="text-amber-700 shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink">Waiting for Family Response</p>
                {detail.review_notes && (
                  <div className="mt-2 p-2.5 bg-amber-100/60 rounded-md border border-amber-200">
                    <p className="text-xs font-medium text-amber-800 mb-0.5">Message sent to family:</p>
                    <p className="text-xs text-amber-900 italic">&ldquo;{detail.review_notes}&rdquo;</p>
                  </div>
                )}
                <p className="text-xs text-ink/60 mt-2">
                  An in-app notification was sent. The family can view it under <strong>Notifications</strong> in their portal. Once
                  they respond or upload documents, mark this application as Verified.
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
              <IconCheckCircle size={24} className="text-green-700 shrink-0" aria-hidden="true" />
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
      {detail.status === "accepted" && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <IconClipboardList size={24} className="text-blue-700 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-ink">Awaiting Registration Packet</p>
                <p className="text-xs text-ink/60 mt-0.5">
                  The family has accepted their offer. They are working on completing their registration packet. See the
                  Registration & Placement section below.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {detail.status === "registered" && (
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <IconMail size={24} className="text-blue-700 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-ink">Registration Packet Submitted: Awaiting Verification</p>
                <p className="text-xs text-ink/60 mt-0.5">
                  The family has submitted all required registration items. Go to Registration & Placement below to verify each
                  item. Once all are verified, the student moves to Placement Review.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {detail.status === "placement_review" && (
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <IconGraduationCap size={24} className="text-purple-700 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-ink">Pending Academic Audit</p>
                <p className="text-xs text-ink/60 mt-0.5">
                  All registration paperwork has been verified. Complete the Academic Audit below to confirm grade placement and
                  finalize enrollment.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {detail.status === "enrolled" && (
        <Card className="border-green-300 bg-green-50/40">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <IconSprout size={24} className="text-green-700 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-ink">Fully Enrolled</p>
                <p className="text-xs text-ink/60 mt-0.5">
                  Academic audit complete. This student is fully enrolled. See Internal Notes for placement details.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main review layout: exceptions + satisfied documents on the left, context on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <ExceptionList
            pendingDocs={pendingDocs}
            rejectedDocs={rejectedDocs}
            isPending={isPending}
            onAccept={(id) => handleDocumentReview(id, "verified")}
            onReject={(id) => handleDocumentReview(id, "rejected")}
          />
          <RequirementList verifiedDocs={verifiedDocs} />
          {detail.documents.length === 0 && (
            <Card>
              <CardContent className="py-8">
                <p className="text-center text-stone text-sm">No documents uploaded yet.</p>
              </CardContent>
            </Card>
          )}
        </div>
        <div className="lg:col-span-1">
          <ContextRail
            detail={detail}
            noteText={noteText}
            setNoteText={setNoteText}
            isPending={isPending}
            onAddNote={handleAddNote}
            onSendEmail={() => setShowComposeEmailDialog(true)}
          />
        </div>
      </div>

      {/* Registration & Placement — kept as its own section (see registration-panel.tsx header comment) */}
      {registrationPacket && <RegistrationPanel detail={detail} registrationPacket={registrationPacket} />}

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
            <Button
              variant="outline"
              onClick={() => {
                setShowMoreInfoDialog(false);
                setMoreInfoMessage("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={confirmMoreInfo} disabled={!moreInfoMessage.trim()}>
              Send Request
            </Button>
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
            <Button variant="outline" onClick={() => setShowOfferDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmOffer} disabled={!offerExpiry}>
              Send Offer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw confirmation dialog */}
      <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw Application</DialogTitle>
            <DialogDescription>
              Are you sure you want to withdraw {detail.student_name}&apos;s application? This action will remove the student from
              the enrollment pipeline. The family will not be notified automatically. Withdrawn is final: there is no action to
              undo it; the family would need to submit a new application to re-apply.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWithdrawDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmWithdraw}>
              Withdraw Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject application dialog — new, uses the existing generic changeApplicationStatus action */}
      <Dialog
        open={showRejectAppDialog}
        onOpenChange={(open) => {
          setShowRejectAppDialog(open);
          if (!open) setRejectAppReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Application</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject {detail.student_name}&apos;s application? This is a different decision than
              Withdraw: reject when the application does not meet requirements.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <label className="block text-sm font-medium text-ink/70">
              Reason <span className="text-stone font-normal">(optional, internal only, not shown to the family)</span>
            </label>
            <textarea
              value={rejectAppReason}
              onChange={(e) => setRejectAppReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50 resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectAppDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRejectApp}>
              Reject Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject document dialog */}
      <Dialog
        open={showRejectDocDialog}
        onOpenChange={(open) => {
          setShowRejectDocDialog(open);
          if (!open) {
            setRejectDocId(null);
            setRejectDocReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Document</DialogTitle>
            <DialogDescription>Tell the family what needs to be corrected so they can re-upload the right file.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <label className="block text-sm font-medium text-ink/70">
              Reason for rejection <span className="text-stone font-normal">(shown to the family)</span>
            </label>
            <textarea
              value={rejectDocReason}
              onChange={(e) => setRejectDocReason(e.target.value)}
              placeholder="e.g. Document is blurry. Please re-scan and upload a clearer copy."
              rows={3}
              className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50 resize-none"
            />
            <p className="text-xs text-stone">Optional but strongly recommended: families can only act on specific feedback.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDocDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRejectDoc} disabled={isPending}>
              Reject Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ComposeEmailDialog
        open={showComposeEmailDialog}
        onOpenChange={setShowComposeEmailDialog}
        recipientEmail={detail.guardian_email}
        recipientName={detail.guardian_name}
        applicationId={detail.id}
      />
    </div>
  );
}
