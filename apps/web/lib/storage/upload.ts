/**
 * Client-side file upload utilities for Supabase Storage.
 * Files are stored in the "documents" bucket at: {userId}/{timestamp}_{filename}
 */

import { createBrowserClient } from "@rooted-ems/database";
import { tx, type Locale } from "@/lib/i18n/translations";

const BUCKET = "documents";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

export interface UploadResult {
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  error: string | null;
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
      error: formatFileValidationError(validationError),
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
    return {
      storagePath: "",
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      error: `Upload failed: ${error.message}`,
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
    return { url: null, error: error.message };
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
