"use client";

import React, { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  staffVerifyRegistrationItem,
  staffSkipRegistrationItem,
  staffCompleteAcademicAudit,
  staffGetSignedUrl,
  staffConfirmPacketComplete,
} from "./actions";
import type { RegistrationPacketDetail } from "@/lib/queries";

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
      return [];  // Family needs to submit registration packet first
    case "registered":
      return [];  // Awaiting staff verification of registration items
    case "placement_review":
      return [];  // Academic audit handled in the dedicated panel below
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

/* ─── Registration item type labels ─── */
const ITEM_TYPE_LABELS: Record<string, string> = {
  emergency_contact: "Emergency Contact",
  medical_info: "Medical Information",
  medication_auth: "Medication Authorization",
  food_allergy_plan: "Food Allergy Plan",
  pickup_auth: "Authorized Pickup",
  home_language_survey: "Home Language Survey",
  transport: "Transportation",
  before_after_care: "Before & After Care",
  frl_app: "Free/Reduced Lunch",
  military_family: "Military Family",
  income_verification: "Income Verification",
  tech_policy: "Technology Policy",
  handbook_ack: "Handbook Acknowledgment",
  discipline_policy: "Discipline Policy",
  media_release: "Media Release",
  field_trip: "Field Trip Authorization",
  internet_safety: "Internet Safety",
  anti_bullying: "Anti-Bullying Policy",
  uniform_policy: "Uniform Policy",
  ferpa_consent: "FERPA Consent",
  immunization_records: "Immunization Records",
  proof_of_residency: "Proof of Residency",
  proof_of_age: "Proof of Age",
  parent_id: "Parent / Guardian ID",
  custody_docs: "Custody Documents",
  student_photo: "Student Photo",
  sports_physical: "Sports Physical",
  previous_school_records: "Previous School Records",
  iep_records: "IEP / Special Education Records",
  "504_plan": "504 Plan",
  mckinney_vento: "McKinney-Vento",
  lthc_form: "Long-Term Health Condition Form",
  sc_health_exam: "SC Health Examination",
  sc_dental_screen: "SC Dental Screening",
  oh_custody_affidavit: "OH Custody Affidavit",
  wa_health_exam: "WA Health Examination",
};

const regItemStatusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "text-amber-700 bg-amber-50 border-amber-200" },
  submitted: { label: "Submitted", color: "text-blue-700 bg-blue-50 border-blue-200" },
  verified: { label: "Verified", color: "text-green-700 bg-green-50 border-green-200" },
};

const packetStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "warning" | "success" | "destructive" }> = {
  pending: { label: "Not Started", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "warning" },
  submitted: { label: "Submitted — Awaiting Review", variant: "default" },
  complete: { label: "Complete", variant: "success" },
};

/* ─── Registration item data display ─── */
// Fields that are internal housekeeping — never shown to staff
const SKIP_KEYS = new Set(["acknowledged", "completed_at", "signature_data_url"]);

function labelFromKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─── View File Button ─── */
function ViewFileButton({ storagePath, fileName }: { storagePath: string; fileName?: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const { url, error } = await staffGetSignedUrl(storagePath);
    setLoading(false);
    if (error || !url) {
      alert("Could not generate file link. The file may have been moved or deleted.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50 transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
      {loading ? "Loading…" : (fileName || "View File")}
    </button>
  );
}

function RegistrationItemDetail({
  data,
  itemType,
}: {
  data: Record<string, unknown>;
  itemType: string;
}) {
  const rows: { label: string; value: React.ReactNode }[] = [];

  // Helper: search an object (recursively) for a string value by key
  function findStr(obj: Record<string, unknown>, key: string): string | null {
    if (key in obj && typeof obj[key] === "string") return obj[key] as string;
    for (const val of Object.values(obj)) {
      if (val && typeof val === "object" && !Array.isArray(val)) {
        const found = findStr(val as Record<string, unknown>, key);
        if (found) return found;
      }
    }
    return null;
  }

  // Helper: renders a single primitive value
  function renderValue(val: unknown, key: string): React.ReactNode {
    if (val === null || val === undefined || val === "") return null;
    if (typeof val === "boolean") return val ? "Yes" : "No";
    if (Array.isArray(val)) {
      const items = val.filter(Boolean);
      return items.length ? items.join(", ") : null;
    }
    if (typeof val === "object") return null; // handled by flattening below
    const str = String(val);
    // ISO datetime → human readable
    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
      return new Date(str).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit",
      });
    }
    return str;
  }

  // Detect e-signature
  const signatureDataUrl = findStr(data, "signature_data_url");
  if (signatureDataUrl) {
    rows.push({
      label: "Signature",
      value: (
        <img
          src={signatureDataUrl}
          alt="Family signature"
          className="max-h-16 border border-stone/20 rounded bg-white"
        />
      ),
    });
  }

  // Detect file upload — storage_path + optional file_name anywhere in data
  const storagePath = findStr(data, "storage_path");
  const fileName = findStr(data, "file_name") ?? undefined;
  if (storagePath) {
    rows.push({
      label: "Uploaded File",
      value: <ViewFileButton storagePath={storagePath} fileName={fileName} />,
    });
  }

  // Flatten remaining keys: skip file fields already handled above
  const FILE_KEYS = new Set(["storage_path", "file_name"]);

  function collect(obj: Record<string, unknown>) {
    for (const [key, val] of Object.entries(obj)) {
      if (SKIP_KEYS.has(key) || FILE_KEYS.has(key)) continue;
      if (val === null || val === undefined || val === "") continue;

      if (typeof val === "object" && !Array.isArray(val)) {
        // Nested object (e.g. form_data) — recurse without adding the parent label
        collect(val as Record<string, unknown>);
      } else {
        const rendered = renderValue(val, key);
        if (rendered !== null) rows.push({ label: labelFromKey(key), value: rendered });
      }
    }
  }

  collect(data);

  if (rows.length === 0) {
    return (
      <p className="text-xs text-stone italic">
        {data.acknowledged ? "Family acknowledged this item." : "No detail submitted."}
      </p>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold text-stone uppercase tracking-wider mb-2">Family Submission</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex gap-2 text-sm py-0.5 border-b border-rooted-gray/60 last:border-0">
            <span className="text-stone min-w-[130px] shrink-0 text-xs pt-0.5">{label}</span>
            <span className="text-ink font-medium break-words">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Component Props ─── */
interface StaffApplicationDetailClientProps {
  detail: ApplicationDetail;
  userId: string;
  registrationPacket: RegistrationPacketDetail | null;
}

// Default offer expiry: 14 days from today
function defaultExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().split("T")[0];
}

export function StaffApplicationDetailClient({ detail, userId, registrationPacket }: StaffApplicationDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") ?? "overview";
  const [isPending, startTransition] = useTransition();
  const [noteText, setNoteText] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [showMoreInfoDialog, setShowMoreInfoDialog] = useState(false);
  const [moreInfoMessage, setMoreInfoMessage] = useState("");
  const [showOfferDialog, setShowOfferDialog] = useState(false);
  const [offerExpiry, setOfferExpiry] = useState(defaultExpiryDate);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [showRejectDocDialog, setShowRejectDocDialog] = useState(false);
  const [rejectDocId, setRejectDocId] = useState<string | null>(null);
  const [rejectDocReason, setRejectDocReason] = useState("");
  // Academic audit form state
  const [auditGrade, setAuditGrade] = useState(detail.grade ?? "");
  const [auditNotes, setAuditNotes] = useState("");
  const [auditSupports, setAuditSupports] = useState<string[]>([]);

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
    if (decision === "rejected") {
      setRejectDocId(docId);
      setRejectDocReason("");
      setShowRejectDocDialog(true);
      return;
    }
    startTransition(async () => {
      const result = await staffReviewDocument(docId, detail.id, "verified");
      if (result.error) {
        showFeedback("error", result.error);
      } else {
        showFeedback("success", "Document verified.");
        router.refresh();
      }
    });
  }

  function confirmRejectDoc() {
    if (!rejectDocId) return;
    setShowRejectDocDialog(false);
    startTransition(async () => {
      const result = await staffReviewDocument(
        rejectDocId,
        detail.id,
        "rejected",
        rejectDocReason.trim() || undefined
      );
      if (result.error) {
        showFeedback("error", result.error);
      } else {
        showFeedback("success", "Document rejected — family will be notified to re-upload.");
        router.refresh();
      }
    });
    setRejectDocId(null);
    setRejectDocReason("");
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
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink">Waiting for Family Response</p>
                {detail.review_notes && (
                  <div className="mt-2 p-2.5 bg-amber-100/60 rounded-md border border-amber-200">
                    <p className="text-xs font-medium text-amber-800 mb-0.5">Message sent to family:</p>
                    <p className="text-xs text-amber-900 italic">&ldquo;{detail.review_notes}&rdquo;</p>
                  </div>
                )}
                <p className="text-xs text-ink/60 mt-2">
                  An in-app notification was sent. The family can view it under <strong>Messages</strong> in their portal. Once they respond or upload documents, mark this application as Verified.
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
      {detail.status === "accepted" && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden="true">📋</span>
              <div>
                <p className="text-sm font-semibold text-ink">Awaiting Registration Packet</p>
                <p className="text-xs text-ink/60 mt-0.5">
                  The family has accepted their offer. They are working on completing their registration packet. Check the Registration tab for progress.
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
              <span className="text-2xl" aria-hidden="true">📬</span>
              <div>
                <p className="text-sm font-semibold text-ink">Registration Packet Submitted — Awaiting Verification</p>
                <p className="text-xs text-ink/60 mt-0.5">
                  The family has submitted all required registration items. Go to the <strong>Registration tab</strong> to verify each item. Once all are verified, the student moves to Placement Review.
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
              <span className="text-2xl" aria-hidden="true">🎓</span>
              <div>
                <p className="text-sm font-semibold text-ink">Pending Academic Audit</p>
                <p className="text-xs text-ink/60 mt-0.5">
                  All registration paperwork has been verified. Complete the Academic Audit in the Registration tab to confirm grade placement and finalize enrollment.
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
              <span className="text-2xl" aria-hidden="true">🌱</span>
              <div>
                <p className="text-sm font-semibold text-ink">Fully Enrolled</p>
                <p className="text-xs text-ink/60 mt-0.5">
                  Academic audit complete. This student is fully enrolled. See the Notes tab for placement details.
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
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">
            Documents
            {detail.documents.some((d) => d.status === "pending") && (
              <span className="ml-1.5 w-2 h-2 rounded-full bg-amber-400 inline-block" />
            )}
          </TabsTrigger>
          {registrationPacket && (
            <TabsTrigger value="registration">
              Registration
              {registrationPacket.packet_status === "submitted" && (
                <span className="ml-1.5 w-2 h-2 rounded-full bg-blue-500 inline-block" />
              )}
            </TabsTrigger>
          )}
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
                <CardTitle className="text-base">Application Details</CardTitle>
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
                              <div>
                                {doc.file_name}
                                {doc.status === "rejected" && doc.rejection_reason && (
                                  <p className="text-xs text-red-600 font-normal mt-0.5">
                                    Reason: {doc.rejection_reason}
                                  </p>
                                )}
                              </div>
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
                                  const { url, error } = await staffGetSignedUrl(doc.storage_path);
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

        {/* ── Registration Tab ── */}
        {registrationPacket && (
          <TabsContent value="registration">
            <div className="space-y-4">
              {/* Packet status banner */}
              {(() => {
                const pCfg = packetStatusConfig[registrationPacket.packet_status] ?? packetStatusConfig.pending;
                const submittedCount = registrationPacket.items.filter((i) => i.status === "submitted" || i.status === "verified").length;
                const verifiedCount = registrationPacket.items.filter((i) => i.status === "verified").length;
                const totalItems = registrationPacket.items.length;
                const pendingOptional = registrationPacket.items.filter((i) => i.status === "pending").length;
                return (
                  <Card>
                    <CardContent className="py-4">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl" aria-hidden="true">
                          {registrationPacket.packet_status === "complete" ? "🎓" :
                           registrationPacket.packet_status === "submitted" ? "📋" :
                           registrationPacket.packet_status === "in_progress" ? "🔄" : "⏳"}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-ink">
                            Registration Packet: <Badge variant={pCfg.variant}>{pCfg.label}</Badge>
                          </p>
                          <p className="text-xs text-stone mt-0.5">
                            {totalItems > 0 ? `${submittedCount} of ${totalItems} items completed · ${verifiedCount} verified` : "No items yet"}
                            {pendingOptional > 0 && ` · ${pendingOptional} optional item${pendingOptional > 1 ? "s" : ""} not submitted (use Skip to waive)`}
                            {registrationPacket.submitted_at && ` · Submitted ${formatDateTime(registrationPacket.submitted_at)}`}
                            {registrationPacket.verified_at && ` · All verified ${formatDateTime(registrationPacket.verified_at)}`}
                          </p>
                        </div>
                      </div>
                      {/* Manual advance button — shown when packet is complete but status hasn't moved */}
                      {registrationPacket.packet_status === "complete" &&
                        ["accepted", "registered"].includes(detail.status) && (
                          <div className="mt-3 pt-3 border-t border-stone/20">
                            <p className="text-xs text-stone mb-2">
                              All items verified. Click below to advance this student to Placement Review (academic audit).
                            </p>
                            <Button
                              size="sm"
                              disabled={isPending}
                              onClick={() => {
                                startTransition(async () => {
                                  const result = await staffConfirmPacketComplete(detail.id);
                                  if (result.error) {
                                    showFeedback("error", result.error);
                                  } else {
                                    showFeedback("success", "Student advanced to Placement Review.");
                                    router.refresh();
                                  }
                                });
                              }}
                            >
                              ✓ Confirm Verification Complete → Move to Placement Review
                            </Button>
                          </div>
                        )}
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Items table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Registration Items</CardTitle>
                  <CardDescription>
                    Click any row to see what the family submitted. Verify submitted items, or Skip optional items the family didn&apos;t complete.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  {registrationPacket.items.length === 0 ? (
                    <p className="text-center text-stone py-8 text-sm">No registration items found.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Family Submitted</TableHead>
                          <TableHead>Verified By</TableHead>
                          <TableHead className="w-36"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {registrationPacket.items.map((item) => {
                          const cfg = regItemStatusConfig[item.status] ?? regItemStatusConfig.pending;
                          const isExpanded = expandedItem === item.id;
                          const hasData = item.data && Object.keys(item.data).length > 0;
                          return (
                            <>
                              <TableRow
                                key={item.id}
                                className={hasData ? "cursor-pointer hover:bg-rooted-gray-light/60" : ""}
                                onClick={() => hasData ? setExpandedItem(isExpanded ? null : item.id) : undefined}
                              >
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-1.5">
                                    {hasData && (
                                      <span className="text-stone text-xs">{isExpanded ? "▼" : "▶"}</span>
                                    )}
                                    {ITEM_TYPE_LABELS[item.item_type] ?? item.item_type.replace(/_/g, " ")}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
                                    {cfg.label}
                                  </span>
                                </TableCell>
                                <TableCell className="text-stone text-sm">
                                  {item.signed_at ? formatDateTime(item.signed_at) : "—"}
                                </TableCell>
                                <TableCell className="text-stone text-sm">
                                  {item.verified_by_name
                                    ? <span className="text-ink/70">{item.verified_by_name}<br /><span className="text-xs text-stone">{formatDateTime(item.verified_at)}</span></span>
                                    : item.verified_at ? formatDateTime(item.verified_at) : "—"}
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <div className="flex gap-1">
                                    {item.status === "submitted" && (
                                      <Button
                                        size="sm"
                                        disabled={isPending}
                                        onClick={() => {
                                          startTransition(async () => {
                                            const result = await staffVerifyRegistrationItem(item.id, detail.id);
                                            if (result.error) showFeedback("error", result.error);
                                            else { showFeedback("success", `${ITEM_TYPE_LABELS[item.item_type] ?? item.item_type} verified`); router.refresh(); }
                                          });
                                        }}
                                      >
                                        Verify
                                      </Button>
                                    )}
                                    {item.status === "pending" && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={isPending}
                                        onClick={() => {
                                          if (!confirm(`Skip "${ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}"? This waives the requirement and marks it as complete.`)) return;
                                          startTransition(async () => {
                                            const result = await staffSkipRegistrationItem(item.id, detail.id);
                                            if (result.error) showFeedback("error", result.error);
                                            else { showFeedback("success", `${ITEM_TYPE_LABELS[item.item_type] ?? item.item_type} skipped`); router.refresh(); }
                                          });
                                        }}
                                      >
                                        Skip
                                      </Button>
                                    )}
                                    {item.status === "verified" && (
                                      <span className="text-xs text-green-600 font-medium">✓ Done</span>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                              {/* Expandable row — shows what the family submitted */}
                              {isExpanded && hasData && (
                                <TableRow key={`${item.id}-expand`} className="bg-rooted-gray-light/40">
                                  <TableCell colSpan={5} className="py-4 px-6">
                                    <RegistrationItemDetail data={item.data} itemType={item.item_type} />
                                  </TableCell>
                                </TableRow>
                              )}
                            </>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Academic Audit Panel — shows when packet is complete and ready for placement */}
              {(detail.status === "placement_review" || detail.status === "enrolled") && (
                <Card className={detail.status === "enrolled" ? "border-green-200 bg-green-50/20" : "border-blue-200 bg-blue-50/20"}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <span className="text-xl" aria-hidden="true">🎓</span>
                      <div>
                        <CardTitle className="text-base">Academic Audit & Placement</CardTitle>
                        <CardDescription>
                          {detail.status === "enrolled"
                            ? "Academic audit is complete. See Notes tab for audit details."
                            : "Registration is verified. Complete the academic audit to confirm enrollment and placement."}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  {detail.status === "placement_review" && (
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-stone uppercase tracking-wider mb-1">
                            Confirmed Grade Level
                          </label>
                          <select
                            value={auditGrade}
                            onChange={(e) => setAuditGrade(e.target.value)}
                            className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                          >
                            {["6","7","8","9","10","11","12"].map((g) => (
                              <option key={g} value={g}>Grade {g}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-stone uppercase tracking-wider mb-1">
                            Academic Supports Identified
                          </label>
                          <div className="space-y-1">
                            {["IEP", "504 Plan", "ELL/ESL", "Reading Intervention", "Math Intervention", "Behavioral Support", "None"].map((s) => (
                              <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={auditSupports.includes(s)}
                                  onChange={(e) => setAuditSupports(prev =>
                                    e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)
                                  )}
                                  className="rounded"
                                />
                                {s}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone uppercase tracking-wider mb-1">
                          Placement Notes
                        </label>
                        <textarea
                          value={auditNotes}
                          onChange={(e) => setAuditNotes(e.target.value)}
                          placeholder="Any relevant academic history, transcript review notes, placement rationale, or concerns to flag for the teaching team..."
                          rows={3}
                          className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50 resize-none"
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button
                          disabled={isPending || !auditGrade}
                          onClick={() => {
                            startTransition(async () => {
                              const session = { email: "Staff" }; // display name placeholder
                              const result = await staffCompleteAcademicAudit(detail.id, detail.campus_id, {
                                confirmedGrade: auditGrade,
                                placementNotes: auditNotes,
                                academicSupports: auditSupports,
                                reviewedBy: detail.campus_name,
                              });
                              if (result.error) showFeedback("error", result.error);
                              else { showFeedback("success", "Academic audit complete — student is now fully enrolled."); router.refresh(); }
                            });
                          }}
                        >
                          Complete Audit & Confirm Enrollment
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>
              )}
            </div>
          </TabsContent>
        )}

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

      {/* Reject document dialog */}
      <Dialog open={showRejectDocDialog} onOpenChange={(open) => {
        setShowRejectDocDialog(open);
        if (!open) { setRejectDocId(null); setRejectDocReason(""); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Document</DialogTitle>
            <DialogDescription>
              Tell the family what needs to be corrected so they can re-upload the right file.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <label className="block text-sm font-medium text-ink/70">
              Reason for rejection <span className="text-stone font-normal">(shown to the family)</span>
            </label>
            <textarea
              value={rejectDocReason}
              onChange={(e) => setRejectDocReason(e.target.value)}
              placeholder="e.g. Document is blurry — please re-scan and upload a clearer copy."
              rows={3}
              className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50 resize-none"
            />
            <p className="text-xs text-stone">
              Optional but strongly recommended — families can only act on specific feedback.
            </p>
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
    </div>
  );
}
