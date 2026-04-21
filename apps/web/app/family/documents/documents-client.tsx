"use client";

import { useState, useRef, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
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
import { EmptyState } from "@/components/ui/empty-state";
import { uploadFile, getSignedUrl, formatFileSize, validateFile } from "@/lib/storage/upload";
import { familyCreateDocumentRecord } from "@/app/family/applications/actions";
import { useLocale } from "@/lib/i18n/locale-context";

// ─── Types ──────────────────────────────────────────────

interface DocumentRow {
  id: string;
  document_type: string;
  file_name: string;
  status: string;
  file_size: number | null;
  storage_path: string;
  created_at: string;
  verified_at: string | null;
  application_id: string | null;
  student_name: string;
  rejection_reason: string | null;
}

interface FamilyApp {
  id: string;
  student_name: string;
  student_id: string;
}

interface DocumentsClientProps {
  documents: DocumentRow[];
  applications: FamilyApp[];
  userId: string;
}

// ─── Constants ──────────────────────────────────────────

type DocStatusKey = "pending" | "verified" | "rejected" | "expired";
const docStatusVariant: Record<DocStatusKey, "success" | "warning" | "destructive" | "secondary"> = {
  pending: "warning",
  verified: "success",
  rejected: "destructive",
  expired: "secondary",
};

const documentTypes = [
  // Identity & Enrollment
  { value: "birth_certificate", label: "Birth Certificate / Proof of Age" },
  { value: "proof_of_residency", label: "Proof of Residency" },
  { value: "parent_id", label: "Parent / Guardian ID" },
  { value: "custody_docs", label: "Custody Documentation" },
  // Health & Medical
  { value: "immunization_records", label: "Immunization Records" },
  { value: "health_exam", label: "Health / Physical Examination" },
  { value: "dental_screening", label: "Dental Screening" },
  { value: "medication_auth", label: "Medication Authorization" },
  { value: "food_allergy_plan", label: "Food Allergy / Health Plan" },
  { value: "lthc_form", label: "Long-Term Health Condition Form" },
  { value: "sports_physical", label: "Sports Physical" },
  // Academic & Special Services
  { value: "school_records", label: "Previous School Records / Transcripts" },
  { value: "iep_records", label: "IEP / Special Education Records" },
  { value: "504_plan", label: "504 Plan" },
  { value: "mckinney_vento", label: "McKinney-Vento (Homeless / Transitional)" },
  // Family & Household
  { value: "income_verification", label: "Income Verification (FRL)" },
  { value: "military_family", label: "Military Family Documentation" },
  { value: "student_photo", label: "Student Photo" },
  // Other
  { value: "other", label: "Other" },
];

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDocType(type: string): string {
  const found = documentTypes.find((d) => d.value === type);
  if (found) return found.label;
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Main Component ─────────────────────────────────────

export function DocumentsClient({ documents, applications, userId }: DocumentsClientProps) {
  const { t } = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showUpload, setShowUpload] = useState(false);
  const [prefilledDocType, setPrefilledDocType] = useState<string | undefined>();
  const [prefilledAppId, setPrefilledAppId] = useState<string | undefined>();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Hide rejected docs that have already been superseded by a newer re-upload of the same type
  const visibleDocuments = documents.filter((doc) => {
    if (doc.status !== "rejected") return true;
    return !documents.some(
      (other) =>
        other.id !== doc.id &&
        other.document_type === doc.document_type &&
        other.application_id === doc.application_id &&
        new Date(other.created_at) > new Date(doc.created_at)
    );
  });

  function handleReupload(doc: DocumentRow) {
    setPrefilledDocType(doc.document_type);
    setPrefilledAppId(doc.application_id ?? undefined);
    setShowUpload(true);
  }

  async function handleViewDocument(storagePath: string) {
    if (!storagePath) return;
    const { url, error } = await getSignedUrl(storagePath);
    if (error) {
      setFeedback({ type: "error", message: `Could not open document: ${error}` });
      return;
    }
    if (url) {
      window.open(url, "_blank");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t("nav.documents")}</h1>
          <p className="text-sm text-stone mt-1">
            Uploaded documents for your enrollment applications.
          </p>
        </div>
        <Button
          onClick={() => setShowUpload(true)}
          disabled={applications.length === 0}
        >
          {t("docs.upload")}
        </Button>
      </div>

      {/* Item 8: set timing expectations so families don't think docs are needed right now */}
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-800">
        <span className="shrink-0 mt-0.5">ℹ️</span>
        <span>
          Most required documents are collected during <strong>registration</strong>, after you've
          accepted an enrollment offer. You only need to upload something here if our enrollment
          team has specifically requested it.
        </span>
      </div>

      {/* Document status summary */}
      {visibleDocuments.length > 0 && (() => {
        const pending = visibleDocuments.filter(d => d.status === "pending").length;
        const verified = visibleDocuments.filter(d => d.status === "verified").length;
        const rejected = visibleDocuments.filter(d => d.status === "rejected").length;
        return (
          <div className="flex gap-4">
            {pending > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="text-sm text-ink/60">{pending} {t("docs.status.pending").toLowerCase()}</span>
              </div>
            )}
            {verified > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="text-sm text-ink/60">{verified} {t("common.verified").toLowerCase()}</span>
              </div>
            )}
            {rejected > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="text-sm text-red-600 font-medium">{rejected} {t("docs.status.rejected").toLowerCase()}</span>
              </div>
            )}
          </div>
        );
      })()}

      {feedback && (
        <div
          className={`p-3 rounded-lg text-sm ${
            feedback.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {visibleDocuments.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon="📄"
              title={t("docs.noDocs")}
              description={
                applications.length === 0
                  ? "Start an enrollment application to upload documents."
                  : "Use the Upload Document button to add files to your application."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("docs.yourDocs")}</CardTitle>
            <CardDescription>
              {visibleDocuments.length} document{visibleDocuments.length !== 1 ? "s" : ""} across your applications.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {visibleDocuments.map((doc) => {
                const statusKey = (doc.status in docStatusVariant ? doc.status : "pending") as DocStatusKey;
                const statusVariant = docStatusVariant[statusKey];
                const statusLabel = doc.status === "verified" ? t("common.verified") : doc.status === "rejected" ? t("docs.status.rejected") : doc.status === "expired" ? t("docs.status.expired") : t("docs.status.pending");
                const sizeStr = doc.file_size ? formatFileSize(doc.file_size) : "";
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 rounded-md border border-stone/20"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl shrink-0" aria-hidden="true">
                        📄
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate">
                          {doc.file_name}
                        </p>
                        <p className="text-xs text-stone">
                          {formatDocType(doc.document_type)}
                          {sizeStr && <> &middot; {sizeStr}</>}
                          {" "}&middot; Uploaded {formatDate(doc.created_at)}
                          {" "}&middot; {doc.student_name}
                        </p>
                        {doc.status === "rejected" && doc.rejection_reason && (
                          <p className="text-xs text-red-600 mt-1 font-medium">
                            ⚠️ Reason: {doc.rejection_reason}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={statusVariant}>{statusLabel}</Badge>
                      {doc.status === "rejected" && (
                        <Button
                          size="sm"
                          onClick={() => handleReupload(doc)}
                        >
                          {t("docs.reupload")}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDocument(doc.storage_path)}
                        disabled={!doc.storage_path}
                      >
                        {t("docs.view")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Dialog */}
      <UploadDialog
        open={showUpload}
        onOpenChange={(open) => {
          setShowUpload(open);
          if (!open) {
            setPrefilledDocType(undefined);
            setPrefilledAppId(undefined);
          }
        }}
        applications={applications}
        documents={visibleDocuments}
        userId={userId}
        isPending={isPending}
        initialDocType={prefilledDocType}
        initialAppId={prefilledAppId}
        onUploadComplete={(message) => {
          setFeedback({ type: "success", message });
          startTransition(() => {
            router.refresh();
          });
        }}
        onError={(message) => {
          setFeedback({ type: "error", message });
        }}
      />
    </div>
  );
}

// ─── Upload Dialog ──────────────────────────────────────

function UploadDialog({
  open,
  onOpenChange,
  applications,
  documents,
  userId,
  isPending,
  initialDocType,
  initialAppId,
  onUploadComplete,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applications: FamilyApp[];
  /** All visible documents — used to filter already-uploaded types from the dropdown (item 10) */
  documents: DocumentRow[];
  userId: string;
  isPending: boolean;
  initialDocType?: string;
  initialAppId?: string;
  onUploadComplete: (message: string) => void;
  onError: (message: string) => void;
}) {
  const { t } = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedApp, setSelectedApp] = useState(initialAppId ?? applications[0]?.id ?? "");
  const [docType, setDocType] = useState(initialDocType ?? "birth_certificate");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Item 10: filter out doc types already successfully uploaded for the selected app.
  // "Other" is always available (multiple other docs can exist). Re-upload (initialDocType)
  // is always included even if it's already on file (that's the whole point of re-uploading).
  const availableDocTypes = useMemo(() => {
    const uploadedForApp = new Set(
      documents
        .filter(
          (d) =>
            d.application_id === selectedApp &&
            d.status !== "rejected" &&
            d.status !== "expired"
        )
        .map((d) => d.document_type)
    );
    return documentTypes.filter(
      (dt) =>
        dt.value === "other" ||
        dt.value === initialDocType ||
        !uploadedForApp.has(dt.value)
    );
  }, [documents, selectedApp, initialDocType]);

  // Sync initial values when dialog opens (handles re-upload pre-fill)
  useEffect(() => {
    if (open) {
      setSelectedApp(initialAppId ?? applications[0]?.id ?? "");
      setDocType(initialDocType ?? "birth_certificate");
      setSelectedFile(null);
      setValidationError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open, initialDocType, initialAppId, applications]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const error = validateFile(file);
    if (error) {
      setValidationError(error);
      setSelectedFile(null);
      return;
    }

    setValidationError(null);
    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile || !selectedApp) return;

    const app = applications.find((a) => a.id === selectedApp);
    if (!app) return;

    setUploading(true);

    try {
      // 1. Upload file to Supabase Storage
      const result = await uploadFile(selectedFile, userId);

      if (result.error) {
        onError(result.error);
        setUploading(false);
        return;
      }

      // 2. Create database record
      const dbResult = await familyCreateDocumentRecord({
        application_id: app.id,
        student_id: app.student_id,
        document_type: docType,
        file_name: result.fileName,
        file_size: result.fileSize,
        mime_type: result.mimeType,
        storage_path: result.storagePath,
      });

      if (dbResult.error) {
        onError(dbResult.error);
        setUploading(false);
        return;
      }

      // Success
      onUploadComplete(`"${result.fileName}" uploaded successfully.`);
      onOpenChange(false);

      // Reset form
      setSelectedFile(null);
      setValidationError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      onError("An unexpected error occurred during upload.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initialDocType ? "Re-upload Document" : "Upload Document"}</DialogTitle>
          <DialogDescription>
            {initialDocType
              ? "Upload a new version of this document. The document type has been pre-selected based on the rejected file."
              : "Upload a document for one of your enrollment applications. Accepted formats: PDF, JPEG, PNG. Max 10MB."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Application selector */}
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">
              Application
            </label>
            <select
              value={selectedApp}
              onChange={(e) => setSelectedApp(e.target.value)}
              className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
            >
              {applications.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.student_name}
                </option>
              ))}
            </select>
          </div>

          {/* Document type */}
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">
              Document Type
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
            >
              {availableDocTypes.map((dt) => (
                <option key={dt.value} value={dt.value}>
                  {dt.label}
                </option>
              ))}
            </select>
          </div>

          {/* File input */}
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">
              File
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
              onChange={handleFileSelect}
              className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50 file:mr-3 file:px-3 file:py-1 file:rounded file:border-0 file:bg-rooted-green/10 file:text-rooted-green file:font-medium file:text-sm file:cursor-pointer"
            />
            {validationError && (
              <p className="text-xs text-red-600 mt-1">{validationError}</p>
            )}
            {selectedFile && !validationError && (
              <p className="text-xs text-stone mt-1">
                {selectedFile.name} ({formatFileSize(selectedFile.size)})
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={uploading}
          >
            {t("reg.dialog.cancel")}
          </Button>
          <Button
            onClick={handleUpload}
            disabled={uploading || !selectedFile || !selectedApp || !!validationError}
          >
            {uploading ? t("reg.upload.uploading") : t("docs.upload")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
