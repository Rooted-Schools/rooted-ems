"use client";

/**
 * ExceptionList — "NEEDS YOUR ATTENTION · N" left column.
 *
 * Extracted from the original Documents tab table. Scope: documents with
 * status "pending" (need an Accept/Reject decision) and "rejected" (shown
 * read-only, with the reason already on file, so a reviewer isn't scrolling
 * a satisfied section to find them). Accept/Reject call the exact same
 * `staffReviewDocument` action the orchestrator already used — same ids,
 * same decision strings ("verified" | "rejected"), same signature.
 *
 * Mismatch flag: the design reference shows an automated
 * "address on document does not match the application" comparison. There is
 * no OCR/extraction pipeline and no stored extracted value for any document
 * field in this schema (`DocumentRow` has no parsed/extracted field) — so we
 * do not fabricate that comparison or hardcode its example strings. Instead
 * we show a neutral, clearly-manual reviewer prompt with no automated claim.
 */
import { prettifyType } from "@/lib/application-helpers";
import { DocumentPreview } from "./document-preview";
import type { DocumentRow } from "@/lib/queries";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00")).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface ExceptionListProps {
  pendingDocs: DocumentRow[];
  rejectedDocs: DocumentRow[];
  isPending: boolean;
  onAccept: (docId: string) => void;
  onReject: (docId: string) => void;
}

export function ExceptionList({ pendingDocs, rejectedDocs, isPending, onAccept, onReject }: ExceptionListProps) {
  const count = pendingDocs.length;

  if (pendingDocs.length === 0 && rejectedDocs.length === 0) {
    return null;
  }

  return (
    <div className="rounded-[12px] border border-line bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-stone">
        Needs your attention · {count}
      </h2>
      <div className="mt-3 space-y-4">
        {pendingDocs.map((doc) => (
          <div key={doc.id} className="rounded-[10px] border border-line p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink truncate">{prettifyType(doc.document_type)}</p>
                <p className="text-xs text-stone mt-0.5">
                  {doc.file_name} · uploaded {formatDate(doc.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => onAccept(doc.id)}
                  className="inline-flex min-h-[36px] items-center justify-center rounded-[6px] bg-deep-green px-3 text-xs font-medium text-white hover:bg-rooted-green-700 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => onReject(doc.id)}
                  className="inline-flex min-h-[36px] items-center justify-center rounded-[6px] border border-line px-3 text-xs font-medium text-ink hover:bg-sunken disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
            <div className="mt-3">
              <DocumentPreview storagePath={doc.storage_path} fileName={doc.file_name} />
            </div>
            {/* Neutral, manual-only affordance — no automated document/application
                comparison (see file header for why). */}
            <p className="mt-2 text-xs text-stone italic">
              Confirm the details on this document match the application before deciding.
            </p>
          </div>
        ))}

        {rejectedDocs.map((doc) => (
          <div key={doc.id} className="rounded-[10px] border border-line bg-red-50/30 p-3">
            <p className="text-sm font-medium text-ink">{prettifyType(doc.document_type)}</p>
            <p className="text-xs text-stone mt-0.5">
              {doc.file_name} · rejected {formatDate(doc.created_at)}
            </p>
            {doc.rejection_reason && (
              <p className="text-xs text-red-700 mt-1">Reason: {doc.rejection_reason}</p>
            )}
            <p className="text-xs text-stone mt-1 italic">Waiting on the family to re-upload.</p>
          </div>
        ))}
      </div>
    </div>
  );
}
