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
import { useToast } from "@/components/ui/toast";
import { IconFileText, IconAlertTriangle, IconInfo, IconX } from "@/components/ui/icons";
import { uploadFile, getSignedUrl, formatFileSize, validateFile, formatFileValidationError } from "@/lib/storage/upload";
import { compressImageFile } from "@/lib/storage/compress-image";
import { familyCreateDocumentRecord } from "@/app/family/applications/actions";
import { useLocale } from "@/lib/i18n/locale-context";
import { type TranslationKey } from "@/lib/i18n/translations";

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
  { value: "birth_certificate", labelKey: "docs.type.birth_certificate" },
  { value: "proof_of_residency", labelKey: "docs.type.proof_of_residency" },
  { value: "parent_id", labelKey: "docs.type.parent_id" },
  { value: "custody_docs", labelKey: "docs.type.custody_docs" },
  // Health & Medical
  { value: "immunization_records", labelKey: "docs.type.immunization_records" },
  { value: "health_exam", labelKey: "docs.type.health_exam" },
  { value: "dental_screening", labelKey: "docs.type.dental_screening" },
  { value: "medication_auth", labelKey: "docs.type.medication_auth" },
  { value: "food_allergy_plan", labelKey: "docs.type.food_allergy_plan" },
  { value: "lthc_form", labelKey: "docs.type.lthc_form" },
  { value: "sports_physical", labelKey: "docs.type.sports_physical" },
  // Academic & Special Services
  { value: "school_records", labelKey: "docs.type.school_records" },
  { value: "iep_records", labelKey: "docs.type.iep_records" },
  { value: "504_plan", labelKey: "docs.type.504_plan" },
  { value: "mckinney_vento", labelKey: "docs.type.mckinney_vento" },
  // Family & Household
  { value: "income_verification", labelKey: "docs.type.income_verification" },
  { value: "military_family", labelKey: "docs.type.military_family" },
  { value: "student_photo", labelKey: "docs.type.student_photo" },
  // Other
  { value: "other", labelKey: "docs.type.other" },
] as const;

function formatDate(dateStr: string, localeTag: string) {
  return new Date(dateStr).toLocaleDateString(localeTag, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDocType(type: string, t: (key: TranslationKey) => string): string {
  const found = documentTypes.find((d) => d.value === type);
  if (found) return t(found.labelKey);
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Main Component ─────────────────────────────────────

export function DocumentsClient({ documents, applications, userId }: DocumentsClientProps) {
  const { t, locale } = useLocale();
  const localeTag = locale === "es" ? "es-US" : "en-US";
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [showUpload, setShowUpload] = useState(false);
  const [prefilledDocType, setPrefilledDocType] = useState<string | undefined>();
  const [prefilledAppId, setPrefilledAppId] = useState<string | undefined>();

  // Hide rejected docs that have already been superseded by a newer re-upload of the same type
  const visibleDocuments = useMemo(() => documents.filter((doc) => {
    if (doc.status !== "rejected") return true;
    return !documents.some(
      (other) =>
        other.id !== doc.id &&
        other.document_type === doc.document_type &&
        other.application_id === doc.application_id &&
        new Date(other.created_at) > new Date(doc.created_at)
    );
  }), [documents]);

  // When a document needs re-upload, that per-row action is the one primary
  // task on the page — the header's generic upload button steps back to
  // outline so there's exactly one solid call-to-action at a time.
  const hasRejectedDoc = useMemo(
    () => visibleDocuments.some((d) => d.status === "rejected"),
    [visibleDocuments]
  );

  // Item 18: group docs by student name for multi-student households
  const studentNames = useMemo(
    () => [...new Set(visibleDocuments.map((d) => d.student_name))].sort(),
    [visibleDocuments]
  );
  const docsByStudent = useMemo(() => {
    const groups: Record<string, DocumentRow[]> = {};
    for (const doc of visibleDocuments) {
      if (!groups[doc.student_name]) groups[doc.student_name] = [];
      groups[doc.student_name].push(doc);
    }
    return groups;
  }, [visibleDocuments]);

  function handleReupload(doc: DocumentRow) {
    setPrefilledDocType(doc.document_type);
    setPrefilledAppId(doc.application_id ?? undefined);
    setShowUpload(true);
  }

  async function handleViewDocument(storagePath: string) {
    if (!storagePath) return;
    const { url, error } = await getSignedUrl(storagePath);
    if (error) {
      toast({ variant: "error", title: t("docs.couldNotOpen"), description: error, dismissLabel: t("common.dismiss") });
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
          <p className="text-sm text-stone-text mt-1">
            {t("docs.subtitle")}
          </p>
        </div>
        <Button
          variant={hasRejectedDoc ? "outline" : "default"}
          onClick={() => setShowUpload(true)}
          disabled={applications.length === 0}
        >
          {t("docs.upload")}
        </Button>
      </div>

      {/* Item 8: set timing expectations so families don't think docs are needed right now */}
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-800">
        <span className="shrink-0 mt-0.5"><IconInfo size={16} /></span>
        <span>
          {t("docs.infoPre")} <strong>{t("docs.infoStrong")}</strong>{t("docs.infoPost")}
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

      {visibleDocuments.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<IconFileText size={40} />}
              title={t("docs.noDocs")}
              description={
                applications.length === 0
                  ? t("docs.emptyNoApps")
                  : t("docs.emptyWithApps")
              }
            />
          </CardContent>
        </Card>
      ) : (
        // Item 18: group docs by student (studentNames / docsByStudent computed above)
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("docs.yourDocs")}</CardTitle>
            <CardDescription>
              {visibleDocuments.length} {t("docs.acrossApps")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {studentNames.map((studentName) => (
                <div key={studentName}>
                  {studentNames.length > 1 && (
                    <p className="text-xs font-semibold text-stone-text uppercase tracking-wide mb-2">
                      {studentName}
                    </p>
                  )}
                  <div className="space-y-3">
                    {docsByStudent[studentName].map((doc) => {
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
                            <span className="shrink-0 text-stone" aria-hidden="true"><IconFileText size={18} /></span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-ink truncate">{doc.file_name}</p>
                              <p className="text-xs text-stone-text">
                                {formatDocType(doc.document_type, t)}
                                {sizeStr && <> &middot; {sizeStr}</>}
                                {" "}&middot; {t("docs.uploadedOn")} {formatDate(doc.created_at, localeTag)}
                                {/* only repeat name inline when not shown as group header */}
                                {studentNames.length === 1 && <> &middot; {doc.student_name}</>}
                              </p>
                              {doc.status === "rejected" && doc.rejection_reason && (
                                <p className="text-xs text-red-600 mt-1 font-medium flex items-center gap-1">
                                  <IconAlertTriangle size={12} />
                                  {t("docs.reason")} {doc.rejection_reason}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={statusVariant}>{statusLabel}</Badge>
                            {doc.status === "rejected" && (
                              <Button size="sm" onClick={() => handleReupload(doc)}>
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
                </div>
              ))}
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
          toast({ variant: "success", title: t("toast.docUploaded"), description: message, dismissLabel: t("common.dismiss") });
          startTransition(() => {
            router.refresh();
          });
        }}
        onError={(message) => {
          toast({ variant: "error", title: t("toast.docUploadFailed"), description: message, dismissLabel: t("common.dismiss") });
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
  const { t, locale } = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedApp, setSelectedApp] = useState(initialAppId ?? applications[0]?.id ?? "");
  const [docType, setDocType] = useState(initialDocType ?? "birth_certificate");
  // Item 3 (Phase 5A): multiple images can be selected/captured for a single
  // requirement — each becomes its own document under that requirement.
  const [selectedFiles, setSelectedFiles] = useState<{ file: File; wasCompressed: boolean }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Item 10: filter out doc types already successfully uploaded for the selected app.
  // "Other" is always available (multiple other docs can exist). Re-upload (initialDocType)
  // is always included even if it's already on file (that's the whole point of re-uploading).
  // Also include docs where application_id is null (unscoped / globally uploaded docs).
  const availableDocTypes = useMemo(() => {
    const uploadedForApp = new Set(
      documents
        .filter(
          (d) =>
            (d.application_id === selectedApp || !d.application_id) &&
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

  // If the currently selected doc type was filtered out, reset to the first available option
  useEffect(() => {
    if (open && availableDocTypes.length > 0 && !availableDocTypes.find((dt) => dt.value === docType)) {
      setDocType(availableDocTypes[0].value);
    }
  }, [availableDocTypes, open]);

  // Sync initial values when dialog opens (handles re-upload pre-fill)
  useEffect(() => {
    if (open) {
      setSelectedApp(initialAppId ?? applications[0]?.id ?? "");
      setDocType(initialDocType ?? "birth_certificate");
      setSelectedFiles([]);
      setValidationError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open, initialDocType, initialAppId, applications]);

  // Camera-first capture (Phase 5A): compress each selected/captured image
  // client-side before validating, then append to the running selection so
  // a family can capture page 1, then page 2, etc. for a single requirement.
  // The input's value is cleared immediately so re-triggering the same
  // camera control fires another change event.
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (files.length === 0) return;

    setCompressing(true);
    setValidationError(null);
    try {
      const processed: { file: File; wasCompressed: boolean }[] = [];
      const errors: string[] = [];
      for (const original of files) {
        const { file: maybeCompressed, wasCompressed } = await compressImageFile(original);
        const error = validateFile(maybeCompressed);
        if (error) {
          errors.push(`${original.name}: ${formatFileValidationError(error, locale)}`);
          continue;
        }
        processed.push({ file: maybeCompressed, wasCompressed });
      }
      if (processed.length > 0) {
        setSelectedFiles((prev) => [...prev, ...processed]);
      }
      if (errors.length > 0) setValidationError(errors.join(" "));
    } finally {
      setCompressing(false);
    }
  }

  function removeSelectedFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUpload() {
    if (selectedFiles.length === 0 || !selectedApp) return;

    const app = applications.find((a) => a.id === selectedApp);
    if (!app) return;

    setUploading(true);

    try {
      // Each selected/captured image (or the single PDF) uploads as its own
      // document record under the same requirement/application.
      let successCount = 0;
      let lastSuccessName = "";
      const failures: string[] = [];

      for (const { file } of selectedFiles) {
        const result = await uploadFile(file, userId);
        if (result.error) {
          failures.push(`${file.name}: ${result.error}`);
          continue;
        }

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
          failures.push(`${file.name}: ${dbResult.error}`);
          continue;
        }

        successCount++;
        lastSuccessName = result.fileName;
      }

      if (successCount > 0) {
        onUploadComplete(
          successCount === 1
            ? `"${lastSuccessName}" ${t("docs.uploadSuccess")}`
            : `${successCount} ${t("docs.filesUploaded")}`
        );
        onOpenChange(false);
        setSelectedFiles([]);
        setValidationError(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }

      if (failures.length > 0) {
        onError(failures.join(" "));
      }
    } catch (err) {
      onError(t("docs.uploadUnexpected"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{initialDocType ? t("docs.reuploadTitle") : t("docs.upload")}</DialogTitle>
          <DialogDescription>
            {initialDocType
              ? t("docs.reuploadDesc")
              : t("docs.uploadDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Application selector */}
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">
              {t("docs.application")}
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
              {t("docs.docType")}
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
            >
              {availableDocTypes.map((dt) => (
                <option key={dt.value} value={dt.value}>
                  {t(dt.labelKey)}
                </option>
              ))}
            </select>
          </div>

          {/* File input — camera-first on phones: capture="environment" opens
              the rear camera directly; desktop still shows the normal picker.
              `multiple` + append-on-select supports capturing several pages
              for one requirement (re-trigger this control for page 2, etc). */}
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">
              {t("docs.file")}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              multiple
              disabled={compressing}
              onChange={handleFileSelect}
              className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50 file:mr-3 file:px-3 file:py-1 file:rounded file:border-0 file:bg-rooted-green/10 file:text-rooted-green file:font-medium file:text-sm file:cursor-pointer disabled:opacity-60"
            />
            <p className="flex items-start gap-1 text-xs text-stone-text mt-1.5">
              <IconInfo size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
              <span>{t("docs.captureHint")}</span>
            </p>
            {compressing && (
              <p className="text-xs text-stone-text mt-1">{t("common.loading")}</p>
            )}
            {validationError && (
              <p className="text-xs text-red-600 mt-1">{validationError}</p>
            )}
            {selectedFiles.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <p className="text-xs font-medium text-ink/70">
                  {t("docs.filesSelectedLabel").replace("{n}", String(selectedFiles.length))}
                </p>
                <ul className="space-y-1.5">
                  {selectedFiles.map((sf, idx) => (
                    <li
                      key={`${sf.file.name}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-md border border-stone/20 pl-2.5 pr-1 py-1 text-xs"
                    >
                      <span className="min-w-0 truncate text-ink">
                        {sf.file.name} ({formatFileSize(sf.file.size)}
                        {sf.wasCompressed ? ` · ${t("docs.compressed")}` : ""})
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSelectedFile(idx)}
                        aria-label={`${t("docs.removeFile")} ${sf.file.name}`}
                        className="inline-flex h-9 min-h-[44px] w-9 shrink-0 items-center justify-center rounded-[6px] text-stone hover:bg-rooted-gray-light hover:text-red-600"
                      >
                        <IconX size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
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
            disabled={uploading || compressing || selectedFiles.length === 0 || !selectedApp}
          >
            {uploading ? t("reg.upload.uploading") : t("docs.upload")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
