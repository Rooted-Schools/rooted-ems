"use client";

/**
 * DocumentPreview — inline preview (~168px) for a single uploaded document,
 * with rotate / zoom / open-full controls. Reuses the existing
 * `staffGetSignedUrl` server action (unchanged signature) for the URL —
 * never a new tab as the only way to see a document. "Open full" may still
 * open the signed URL in a new tab; that control is allowed by spec.
 *
 * Renders an <img> for image documents and an <iframe> (via the browser's
 * built-in PDF viewer) for anything else (PDF and other document types).
 */
import { useEffect, useState } from "react";
import { staffGetSignedUrl } from "../actions";
import { IconRotateCw, IconZoomIn, IconZoomOut, IconExternalLink } from "@/components/ui/icons";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "svg"]);

function isImageFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

const ZOOM_STEPS = [1, 1.5, 2];

export function DocumentPreview({ storagePath, fileName }: { storagePath: string; fileName: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [zoomIdx, setZoomIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    staffGetSignedUrl(storagePath).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.error || !result.url) {
        setError(result.error ?? "Could not load this file.");
        return;
      }
      setUrl(result.url);
    });
    return () => {
      cancelled = true;
    };
    // storagePath is stable per document; re-run only if it changes.
  }, [storagePath]);

  const isImage = isImageFile(fileName);
  const zoom = ZOOM_STEPS[zoomIdx];

  return (
    <div className="rounded-[8px] border border-line bg-sunken/40">
      <div
        className="flex h-[168px] items-center justify-center overflow-hidden bg-white"
        aria-label={`Preview of ${fileName}`}
      >
        {loading && <span className="text-xs text-stone">Loading preview…</span>}
        {!loading && error && <span className="px-3 text-center text-xs text-stone">{error}</span>}
        {!loading && !error && url && isImage && (
          <img
            src={url}
            alt={fileName}
            className="max-h-full max-w-full object-contain transition-transform duration-150"
            style={{ transform: `rotate(${rotation}deg) scale(${zoom})` }}
          />
        )}
        {!loading && !error && url && !isImage && (
          <iframe
            src={url}
            title={fileName}
            className="h-full w-full border-0 transition-transform duration-150"
            style={{ transform: `rotate(${rotation}deg) scale(${zoom})`, transformOrigin: "center" }}
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-1 border-t border-line px-2 py-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Rotate"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-stone hover:bg-sunken hover:text-ink"
          >
            <IconRotateCw size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoomIdx === 0}
            onClick={() => setZoomIdx((z) => Math.max(0, z - 1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-stone hover:bg-sunken hover:text-ink disabled:opacity-40"
          >
            <IconZoomOut size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoomIdx === ZOOM_STEPS.length - 1}
            onClick={() => setZoomIdx((z) => Math.min(ZOOM_STEPS.length - 1, z + 1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-stone hover:bg-sunken hover:text-ink disabled:opacity-40"
          >
            <IconZoomIn size={16} aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          disabled={!url}
          onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
          className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-xs font-medium text-deep-green hover:underline disabled:opacity-40"
        >
          <IconExternalLink size={14} aria-hidden="true" />
          Open full
        </button>
      </div>
    </div>
  );
}
