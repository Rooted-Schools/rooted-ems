/**
 * Client-side file upload utilities for Supabase Storage.
 * Files are stored in the "documents" bucket at: {userId}/{timestamp}_{filename}
 */

import { createBrowserClient } from "@rooted-ems/database";
import { tx, type Locale, type TranslationKey } from "@/lib/i18n/translations";
// Type-only import — erased at build time, so the server-only mutation module
// is never pulled into the client bundle. It keeps the document-record error
// code union in one place (its producer) while the display map lives here,
// where client components can safely import it.
import type { DocumentRecordErrorCode } from "@/lib/mutations/documents";

const BUCKET = "documents";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

/**
 * Stable upload error codes. uploadFile() returns one of these (never the raw
 * Supabase provider message, which is English and leaks storage internals);
 * the raw message is logged to the console for diagnostics only. Display sites
 * map the code to a bilingual toast via UPLOAD_ERROR_TRANSLATION_KEY.
 */
export type UploadErrorCode =
  | "upload_failed"
  | "file_too_large"
  | "unsupported_type"
  | "not_signed_in";

/** Code -> family-facing translation key. Exhaustive by construction (Record
 *  over the union), so a new code cannot be added without a message. */
export const UPLOAD_ERROR_TRANSLATION_KEY: Record<UploadErrorCode, TranslationKey> = {
  upload_failed: "docs.error.uploadFailed",
  file_too_large: "docs.error.fileTooLarge",
  unsupported_type: "docs.error.unsupportedType",
  not_signed_in: "docs.error.notSignedIn",
};

/** Same contract for the createDocumentRecord mutation's stable codes. Lives
 *  here (a client-safe module) so client components can map without importing
 *  the server-only mutation module. */
export const DOCUMENT_RECORD_ERROR_TRANSLATION_KEY: Record<DocumentRecordErrorCode, TranslationKey> = {
  not_signed_in: "docs.error.notSignedIn",
  not_authorized: "docs.error.notAuthorized",
  no_student: "docs.error.noStudent",
  record_failed: "docs.error.recordFailed",
};

export interface UploadResult {
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  /** Stable code (see UploadErrorCode) or null on success. Never raw provider text. */
  error: UploadErrorCode | null;
}

/** Structured validation failure — code + params, no baked-in English string.
 *  Display sites map this to a bilingual message via docs.fileTooLarge /
 *  docs.fileTypeUnsupported (see lib/i18n/translations.ts). */
export type FileValidationError =
  | { code: "too_large"; maxMb: number; actualSize: string }
  | { code: "unsupported_type"; fileType: string };

/**
 * Validate a file before upload. Returns a structured error (code + params)
 * rather than a hardcoded English string — callers translate for display via
 * formatFileValidationError() or their own t() mapping.
 */
export function validateFile(file: File): FileValidationError | null {
  if (file.size > MAX_FILE_SIZE) {
    return { code: "too_large", maxMb: MAX_FILE_SIZE / (1024 * 1024), actualSize: formatFileSize(file.size) };
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { code: "unsupported_type", fileType: file.type || "unknown" };
  }
  return null;
}

/**
 * Render a FileValidationError as a display string. Defaults to English for
 * internal/non-locale-aware callers (e.g. uploadFile() below); UI call sites
 * that have a locale from useLocale() should prefer translating the code
 * themselves with docs.fileTooLarge / docs.fileTypeUnsupported so wording
 * stays consistent with the rest of the page.
 */
export function formatFileValidationError(error: FileValidationError, locale: Locale = "en"): string {
  if (error.code === "too_large") {
    return tx("docs.fileTooLarge", locale)
      .replace("{maxMb}", String(error.maxMb))
      .replace("{size}", error.actualSize);
  }
  return tx("docs.fileTypeUnsupported", locale).replace("{type}", error.fileType);
}

/**
 * Upload a file to Supabase Storage.
 */
export async function uploadFile(
  file: File,
  userId: string
): Promise<UploadResult> {
  const validationError = validateFile(file);
  if (validationError) {
    return {
      storagePath: "",
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      error: validationError.code === "too_large" ? "file_too_large" : "unsupported_type",
    };
  }

  const supabase = createBrowserClient();

  // Create unique filename: userId/timestamp_sanitizedName
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${userId}/${Date.now()}_${sanitizedName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    // Log the raw provider message for diagnostics; never surface it to the
    // family. An auth/permission failure means the session lapsed — a code the
    // family can act on ("sign in again") rather than a generic failure.
    console.error("[uploadFile]", error.message);
    const status = String(
      (error as { statusCode?: string | number; status?: number }).statusCode ??
        (error as { status?: number }).status ??
        ""
    );
    const isAuth = status === "401" || status === "403" || /jwt|unauthor/i.test(error.message);
    return {
      storagePath: "",
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      error: isAuth ? "not_signed_in" : "upload_failed",
    };
  }

  return {
    storagePath,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    error: null,
  };
}

/**
 * Delete a file from Supabase Storage.
 */
export async function deleteFile(storagePath: string): Promise<string | null> {
  const supabase = createBrowserClient();
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  return error ? error.message : null;
}

/**
 * Get a signed URL for downloading a file.
 */
export async function getSignedUrl(
  storagePath: string,
  expiresIn = 3600
): Promise<{ url: string | null; error: string | null }> {
  const supabase = createBrowserClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    // Diagnostics only — the caller shows docs.couldNotOpen, never this text.
    console.error("[getSignedUrl]", error.message);
    return { url: null, error: "signed_url_failed" };
  }

  return { url: data.signedUrl, error: null };
}

/**
 * Format file size in human-readable format.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
