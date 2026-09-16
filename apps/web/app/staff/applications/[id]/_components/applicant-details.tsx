"use client";

/**
 * ApplicantDetails — read-only summary of the applicant fields the family
 * entered on the application. Staff previously could not see these anywhere
 * in the portal: the review path surfaced the student's name, grade and
 * uploaded documents, but not middle/preferred name, date of birth, gender,
 * the school the student currently attends, or a named enrolled sibling. Those
 * are collected on the family application (see new-application-form.tsx) and
 * stored on `student` / `application_answer`; this panel simply displays them.
 *
 * Strictly read-only: there is no staff-side mutation for editing applicant
 * demographics (that lives on the family edit form), so this renders values
 * only and never a control that would do nothing. Any field can be null on an
 * older application submitted before it was collected — nulls are omitted, and
 * when nothing beyond the header data exists the panel says so rather than
 * rendering an empty card.
 */
import type { ApplicationDetail } from "@/lib/queries";

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  // Date-only value (YYYY-MM-DD) — render in UTC so a birthdate never slips a
  // day from the viewer's timezone.
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Humanize a stored code like "prefer_not_to_say" → "Prefer not to say". */
function humanize(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const spaced = trimmed.replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface Row {
  label: string;
  value: string | null;
}

interface ApplicantDetailsProps {
  detail: ApplicationDetail;
}

export function ApplicantDetails({ detail }: ApplicantDetailsProps) {
  // Full legal name is assembled from the parts the family entered; fall back
  // to the composed student_name (first + last) the header already shows so the
  // panel is never blank even on the oldest records.
  const legalName =
    [detail.student_first_name, detail.student_middle_name, detail.student_last_name]
      .filter(Boolean)
      .join(" ") || null;

  const rows: Row[] = [
    { label: "Legal name", value: legalName },
    { label: "Preferred name", value: detail.student_preferred_name },
    { label: "Date of birth", value: formatDate(detail.student_date_of_birth) },
    { label: "Gender", value: humanize(detail.student_gender) },
    { label: "Current grade", value: detail.current_grade },
    { label: "Current school", value: detail.student_previous_school },
    { label: "Sibling at school", value: detail.sibling_name },
  ].filter((r) => r.value);

  return (
    <div className="rounded-[12px] border border-line bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-stone">Applicant details</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-stone">
          No additional applicant details were captured on this application.
        </p>
      ) : (
        <dl className="mt-2 grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-3 sm:block">
              <dt className="text-stone sm:text-xs sm:uppercase sm:tracking-wide">{r.label}</dt>
              <dd className="text-ink font-medium text-right sm:text-left sm:mt-0.5">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
