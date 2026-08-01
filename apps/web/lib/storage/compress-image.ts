/**
 * Client-side image compression for camera-first document capture (UX Phase 5A).
 *
 * Downscales images to a max of ~1600px on the long edge and re-encodes as
 * JPEG at 0.8 quality via <canvas> — pure browser API, no dependency. Runs
 * before `uploadFile()` so the network transfer and storage cost are smaller,
 * not to bypass validation: `validateFile()` in `lib/storage/upload.ts`
 * remains the source of truth for size/type limits either way.
 *
 * PDFs and non-image files pass through unchanged. If compression fails for
 * any reason (decode error, canvas unavailable, SSR) or the "compressed"
 * result isn't actually smaller than the original, the original file is
 * returned untouched so the upload flow can still proceed.
 */

export const COMPRESS_MAX_DIMENSION = 1600;
export const COMPRESS_JPEG_QUALITY = 0.8;

export interface CompressImageResult {
  file: File;
  wasCompressed: boolean;
}

export async function compressImageFile(file: File): Promise<CompressImageResult> {
  // Only raster images are downscaled. SVGs have no fixed pixel dimensions to
  // resize sensibly, and non-images (PDFs) pass through untouched.
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return { file, wasCompressed: false };
  }
  if (typeof document === "undefined" || typeof Image === "undefined") {
    // SSR / non-browser environment — nothing to do here.
    return { file, wasCompressed: false };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read the selected image"));
      el.src = objectUrl;
    });

    const { width, height } = img;
    if (!width || !height) {
      return { file, wasCompressed: false };
    }

    const longEdge = Math.max(width, height);
    if (longEdge <= COMPRESS_MAX_DIMENSION) {
      // Already small enough — don't re-encode and risk a quality loss for
      // no size benefit.
      return { file, wasCompressed: false };
    }

    const scale = COMPRESS_MAX_DIMENSION / longEdge;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { file, wasCompressed: false };
    }
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", COMPRESS_JPEG_QUALITY)
    );
    if (!blob) {
      return { file, wasCompressed: false };
    }

    const baseName = file.name.replace(/\.[^./]+$/, "") || "photo";
    const compressed = new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    if (compressed.size >= file.size) {
      return { file, wasCompressed: false };
    }

    return { file: compressed, wasCompressed: true };
  } catch {
    return { file, wasCompressed: false };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
