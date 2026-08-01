"use client";

/**
 * RequirementList — "CHECKS OUT · N" collapsed satisfied-documents list.
 * Extracted from the original Documents tab table, scoped to
 * status === "verified" rows. Purely presentational — no mutation calls.
 */
import { useState } from "react";
import { IconCheckCircle } from "@/components/ui/icons";
import { prettifyType } from "@/lib/application-helpers";
import type { DocumentRow } from "@/lib/queries";

const INITIAL_VISIBLE = 3;

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00")).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RequirementList({ verifiedDocs }: { verifiedDocs: DocumentRow[] }) {
  const [expanded, setExpanded] = useState(false);

  if (verifiedDocs.length === 0) return null;

  const visible = expanded ? verifiedDocs : verifiedDocs.slice(0, INITIAL_VISIBLE);
  const hiddenCount = verifiedDocs.length - visible.length;

  return (
    <div className="rounded-[12px] border border-line bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-stone">
        Checks out · {verifiedDocs.length}
      </h2>
      <ul className="mt-3 space-y-1.5">
        {visible.map((doc) => (
          <li key={doc.id} className="flex items-center gap-2 text-sm text-ink/80">
            <IconCheckCircle size={14} className="shrink-0 text-rooted-green" aria-hidden="true" />
            <span className="truncate">
              {prettifyType(doc.document_type)} — verified {formatDate(doc.verified_at ?? doc.created_at)}
            </span>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs font-medium text-deep-green hover:underline"
        >
          Show {hiddenCount} more
        </button>
      )}
    </div>
  );
}
