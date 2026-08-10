"use client";

/**
 * ContextRail — right rail: household, sibling/priority, timeline (moved
 * verbatim from the original History tab), and internal notes (moved
 * verbatim from the original Notes tab: same `addApplicationNote` call,
 * same state shape).
 *
 * Household honesty note: the design reference shows "phone + SMS opt-in,
 * home language" in this rail. `ApplicationDetail` (apps/web/lib/queries/
 * applications.ts) carries `guardian_phone` but has no SMS-consent flag and
 * no home-language field — those only exist on the family-side draft-editing
 * type (`DraftApplicationData`), not on the staff detail query. We do not
 * fabricate those two fields here; we render only what is real (name, email,
 * phone) and note the gap in the phase report.
 *
 * "Editing lives behind an explicit Edit, off the review path" (per spec):
 * there is no staff-side mutation anywhere in actions.ts for editing
 * guardian/household details, so we do not add a dead "Edit" button that
 * would do nothing. Notes remain fully editable here because adding a note
 * already is a real, existing mutation — that is not the "edit household
 * data" feature the spec means.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconMail } from "@/components/ui/icons";
import { getStatusConfig } from "@/lib/application-helpers";
import type { ApplicationDetail } from "@/lib/queries";

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

interface ContextRailProps {
  detail: ApplicationDetail;
  noteText: string;
  setNoteText: (v: string) => void;
  isPending: boolean;
  onAddNote: () => void;
  onSendEmail: () => void;
}

export function ContextRail({ detail, noteText, setNoteText, isPending, onAddNote, onSendEmail }: ContextRailProps) {
  return (
    <div className="space-y-4">
      {/* Household */}
      <div className="rounded-[12px] border border-line bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-stone">Household</h2>
        <dl className="mt-2 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-stone">Guardian</dt>
            <dd className="text-ink font-medium text-right">{detail.guardian_name}</dd>
          </div>
          {detail.guardian_email && (
            <div className="flex justify-between gap-3">
              <dt className="text-stone">Email</dt>
              <dd className="text-right break-all">
                <a
                  href={`mailto:${detail.guardian_email}`}
                  className="text-rooted-green hover:text-deep-green"
                >
                  {detail.guardian_email}
                </a>
              </dd>
            </div>
          )}
          {detail.guardian_phone && (
            <div className="flex justify-between gap-3">
              <dt className="text-stone">Phone</dt>
              <dd className="text-right">
                <a
                  href={`tel:${detail.guardian_phone}`}
                  className="text-rooted-green hover:text-deep-green"
                >
                  {detail.guardian_phone}
                </a>
              </dd>
            </div>
          )}
        </dl>
        {detail.guardian_email && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 mt-3 w-full rounded-[6px]"
            onClick={onSendEmail}
            disabled={isPending}
          >
            <IconMail size={14} /> Send email
          </Button>
        )}
      </div>

      {/* Application — preserved from the original "Application Details" /
          "Review" cards (enrollment window, full id, tags, reviewed-by) so
          this data isn't lost in the split. */}
      <div className="rounded-[12px] border border-line bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-stone">Application</h2>
        <dl className="mt-2 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-stone">Enrollment window</dt>
            <dd className="text-ink text-right">{detail.enrollment_window_name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-stone">Full ID</dt>
            <dd className="text-ink text-right font-mono text-xs break-all">{detail.id}</dd>
          </div>
          {detail.reviewed_by && (
            <div className="flex justify-between gap-3">
              <dt className="text-stone">Reviewed by</dt>
              <dd className="text-ink text-right">
                {detail.reviewed_by}
                {detail.reviewed_at && <span className="block text-xs text-stone">{formatDateTime(detail.reviewed_at)}</span>}
              </dd>
            </div>
          )}
        </dl>
        {detail.review_notes && (
          <p className="mt-2 rounded-[6px] bg-sunken/60 p-2 text-xs text-ink/70 italic">&ldquo;{detail.review_notes}&rdquo;</p>
        )}
        {detail.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {detail.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Sibling / priority callout — derived from the real has_sibling_enrolled flag only */}
      {detail.has_sibling_enrolled && (
        <div className="rounded-[12px] border border-rooted-green/30 bg-rooted-green/5 p-4">
          <p className="text-sm font-medium text-deep-green">Sibling priority</p>
          <p className="text-xs text-ink/70 mt-0.5">
            This family has a sibling already enrolled, which gives this application priority.
          </p>
        </div>
      )}

      {/* Timeline — moved verbatim from the original History tab (newest first) */}
      <div className="rounded-[12px] border border-line bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-stone">Timeline</h2>
        {detail.timeline.length === 0 ? (
          <p className="text-sm text-stone mt-2">No history recorded yet.</p>
        ) : (
          <div className="relative mt-3">
            <div className="absolute left-3 top-0 bottom-0 w-px bg-rooted-gray-dark/30" />
            <div className="space-y-4">
              {detail.timeline.map((entry, idx) => {
                const toCfg = getStatusConfig(entry.to_status);
                return (
                  <div key={entry.id} className="relative flex gap-3 pl-0.5">
                    <div
                      className={`relative z-10 w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-[10px] shrink-0 ${
                        idx === 0 ? "bg-rooted-green text-white" : "bg-rooted-gray-dark/30 text-ink/60"
                      }`}
                    >
                      {idx === 0 ? "●" : detail.timeline.length - idx}
                    </div>
                    <div className="flex-1 pb-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {entry.from_status && (
                          <>
                            <Badge variant="secondary" className="text-[10px]">
                              {getStatusConfig(entry.from_status).label}
                            </Badge>
                            <span className="text-stone text-xs">→</span>
                          </>
                        )}
                        <Badge variant={toCfg.variant} className="text-[10px]">
                          {toCfg.label}
                        </Badge>
                      </div>
                      {entry.changed_by_name && (
                        <p className="text-xs text-ink/70 mt-1">
                          by <span className="font-medium">{entry.changed_by_name}</span>
                        </p>
                      )}
                      {entry.reason && <p className="text-xs text-stone mt-0.5 italic">&ldquo;{entry.reason}&rdquo;</p>}
                      <p className="text-[11px] text-stone mt-0.5">{formatDateTime(entry.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Internal notes — moved verbatim from the original Notes tab */}
      <div className="rounded-[12px] border border-line bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-stone">Internal notes</h2>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            placeholder="Add an internal note..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && noteText.trim()) onAddNote();
            }}
            className="flex-1 rounded-[6px] border border-stone/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent"
          />
          <Button size="sm" disabled={!noteText.trim() || isPending} onClick={onAddNote} className="rounded-[6px]">
            Add
          </Button>
        </div>
        {detail.notes.length === 0 ? (
          <p className="text-sm text-stone mt-3">No notes yet.</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {detail.notes.map((note) => (
              <div key={note.id} className="rounded-[8px] border border-line p-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium text-ink">{note.created_by_name}</span>
                  <span className="text-[11px] text-stone">{formatDateTime(note.created_at)}</span>
                </div>
                <p className="text-sm text-ink/70">{note.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
