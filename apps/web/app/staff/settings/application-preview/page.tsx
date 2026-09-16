export const runtime = "edge";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireMinRole } from "@/lib/auth/get-session";
import { cn, displayClass } from "@/lib/utils";

/**
 * Read-only reference of what the family enrollment application asks, so staff
 * can review it without a family login. This mirrors the fields collected by
 * app/family/applications/new/new-application-form.tsx. It is a reference view,
 * not the live form; the questions marked "per campus" appear only where a
 * campus's board-adopted lottery policy declares them.
 */

interface Q {
  label: string;
  required?: boolean;
  note?: string;
}
interface Section {
  title: string;
  note?: string;
  questions: Q[];
}

const SECTIONS: Section[] = [
  {
    title: "Campus & grade",
    questions: [
      { label: "Campus", required: true },
      { label: "Grade applying to", required: true },
    ],
  },
  {
    title: "Student",
    questions: [
      { label: "Legal first name", required: true },
      { label: "Middle name" },
      { label: "Legal last name", required: true },
      { label: "Preferred name" },
      { label: "Date of birth" },
      { label: "Gender" },
      { label: "Current grade" },
      { label: "Current school" },
    ],
  },
  {
    title: "Residency (eligibility)",
    questions: [
      {
        label: "Do you reside in the campus's state?",
        required: true,
        note: "State follows the campus (e.g. Washington for RSV). A \"no\" flags the application for staff.",
      },
    ],
  },
  {
    title: "Guardian",
    questions: [
      { label: "First name", required: true },
      { label: "Last name", required: true },
      { label: "Relationship to student", required: true },
      { label: "Email", required: true, note: "Used for the family's login." },
      { label: "Phone", required: true },
      { label: "OK to text enrollment updates (SMS consent)" },
    ],
  },
  {
    title: "Sibling",
    questions: [
      { label: "Has a sibling currently attending / enrolled at this campus", note: "Per campus" },
      { label: "Sibling's name", note: "Shown when the sibling box is checked" },
    ],
  },
  {
    title: "Lottery preferences",
    note: "Shown only where the campus's board-adopted lottery policy declares the weighted tier.",
    questions: [
      { label: "In legal custody of a full-time campus employee (staff preference)", note: "Per campus" },
      { label: "Eligible for free/reduced-price meals (FRL)", note: "Per campus" },
    ],
  },
  {
    title: "Review & consent",
    questions: [
      { label: "Data-sharing consent", required: true },
      { label: "Agree to terms", required: true },
      { label: "Guardian signature (typed name)", required: true },
    ],
  },
];

export default async function ApplicationPreviewPage() {
  await requireMinRole("enrollment_manager");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/staff/settings" className="text-sm text-rooted-green hover:underline">
          &larr; Back to Settings
        </Link>
        <h1 className={cn("mt-2 text-2xl font-bold text-ink", displayClass)}>Application preview</h1>
        <p className="mt-1 text-sm text-stone">
          Everything the enrollment application asks a family, for reference. Questions marked
          &ldquo;per campus&rdquo; appear only where that campus&apos;s board-adopted policy declares
          them.
        </p>
      </div>

      <div className="space-y-4">
        {SECTIONS.map((section) => (
          <section key={section.title} className="rounded-[6px] border border-line bg-white">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">{section.title}</h2>
              {section.note && <p className="mt-0.5 text-xs text-stone">{section.note}</p>}
            </div>
            <ul className="divide-y divide-line">
              {section.questions.map((q) => (
                <li key={q.label} className="flex flex-wrap items-baseline gap-x-2 px-4 py-2.5">
                  <span className="text-sm text-ink">
                    {q.label}
                    {q.required && <span className="ml-0.5 text-red-600">*</span>}
                  </span>
                  {q.note && <span className="text-xs text-stone">— {q.note}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="text-xs text-stone">
        This is a reference of the current application. To change a question, it&apos;s still a code
        change today — a self-serve application editor is the planned next step.
      </p>
    </div>
  );
}
