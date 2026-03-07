/**
 * Client-side file upload utilities for Supabase Storage.
 * Files are stored in the "documents" bucket at: {userId}/{timestamp}_{filename}
 */

import { createBrowserClient } from "@rooted-ems/database";

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

/**
 * Validate a file before upload.
 */
export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `File is too large (${formatFileSize(file.size)}). Maximum size is 10MB.`;
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `File type "${file.type || "unknown"}" is not supported. Please upload a PDF or image file (JPEG, PNG).`;
  }
  return null;
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
      error: validationError,
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
