"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { GRADE_LABELS } from "@/lib/application-helpers";

const CAMPUSES = [
  { id: "campus-vancouver", name: "Rooted School Vancouver" },
  { id: "campus-columbia", name: "C.R. Neal Academy (Columbia)" },
  { id: "campus-cleveland", name: "Rooted School Cleveland" },
];

/* ───────────── step definitions ───────────── */

const STEPS = [
  { id: "campus", label: "Campus & Grade" },
  { id: "student", label: "Student Info" },
  { id: "guardian", label: "Parent / Guardian" },
  { id: "documents", label: "Documents" },
  { id: "review", label: "Review & Submit" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/* ───────────── form state ───────────── */

interface FormData {
  campusId: string;
  gradeLevel: string;
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  raceEthnicity: string;
  primaryLanguage: string;
  previousSchool: string;
  guardianFirstName: string;
  guardianLastName: string;
  guardianRelationship: string;
  guardianEmail: string;
  guardianPhone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  hasIEP: string;
  specialServices: string;
  agreeTerms: boolean;
}

/* ─── Mock saved draft data keyed by application ID ─── */
const DRAFT_DATA: Record<string, Partial<FormData>> = {
  "app-004": {
    campusId: "campus-vancouver",
    gradeLevel: "7",
    firstName: "Ava",
    middleName: "",
    lastName: "Johnson",
    dateOfBirth: "2014-08-22",
    gender: "female",
    raceEthnicity: "",
    primaryLanguage: "english",
    previousSchool: "",
    guardianFirstName: "Tanya",
    guardianLastName: "Johnson",
    guardianRelationship: "mother",
    guardianEmail: "tanya.johnson@email.com",
    guardianPhone: "(360) 555-0142",
    address: "1234 Elm Street",
    city: "Vancouver",
    state: "WA",
    zip: "98660",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelationship: "",
    hasIEP: "",
    specialServices: "",
    agreeTerms: false,
  },
};

const INITIAL: FormData = {
  campusId: "",
  gradeLevel: "",
  firstName: "",
  middleName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  raceEthnicity: "",
  primaryLanguage: "",
  previousSchool: "",
  guardianFirstName: "",
  guardianLastName: "",
  guardianRelationship: "",
  guardianEmail: "",
  guardianPhone: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelationship: "",
  hasIEP: "",
  specialServices: "",
  agreeTerms: false,
};

/* ─── Mock uploaded documents for draft ─── */
interface DraftDocument {
  name: string;
  fileName: string;
  uploadedAt: string;
  required: boolean;
}

const DRAFT_DOCUMENTS: Record<string, DraftDocument[]> = {
  "app-004": [],
};

/* ───────────── field helper ───────────── */

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

/* ───────────── stepper visual ───────────── */

function StepIndicator({
  steps,
  currentIndex,
}: {
  steps: readonly (typeof STEPS)[number][];
  currentIndex: number;
}) {
  return (
    <nav aria-label="Progress" className="mb-8">
      <ol className="flex items-center gap-2">
        {steps.map((step, i) => {
          const isComplete = i < currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <li key={step.id} className="flex items-center gap-2">
              <div
                className={`
                  flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold shrink-0
                  ${
                    isComplete
                      ? "bg-rooted-green text-white"
                      : isCurrent
                        ? "border-2 border-rooted-green text-rooted-green"
                        : "border border-gray-300 text-gray-400"
                  }
                `}
              >
                {isComplete ? (
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-xs hidden sm:inline ${
                  isCurrent ? "font-semibold text-gray-900" : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
              {i < steps.length - 1 && (
                <div
                  className={`w-6 h-px ${
                    isComplete ? "bg-rooted-green" : "bg-gray-200"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ───────────── page component ───────────── */

export default function EditApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const draftData = DRAFT_DATA[id];

  const [stepIndex, setStepIndex] = React.useState(0);
  const [form, setForm] = React.useState<FormData>({
    ...INITIAL,
    ...(draftData ?? {}),
  });

  const currentStep = STEPS[stepIndex];
  const uploadedDocs = DRAFT_DOCUMENTS[id] ?? [];

  // Not found state
  if (!draftData) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Link
          href="/family/applications"
          className="text-sm text-rooted-green hover:underline"
        >
          &larr; Back to Applications
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">
              Application not found or is no longer editable.
            </p>
            <Link href="/family/applications">
              <Button variant="outline" className="mt-4">
                View My Applications
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  function update(partial: Partial<FormData>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  function next() {
    if (stepIndex < STEPS.length - 1) setStepIndex((i) => i + 1);
  }

  function back() {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }

  function handleSaveDraft() {
    // TODO: call Supabase to save draft
    alert("Draft saved! (Demo mode — no data was saved.)");
  }

  function handleSubmit() {
    // TODO: call Supabase to submit application
    alert(
      "Application submitted successfully! (Demo mode — no data was saved.)"
    );
  }

  const studentName = [form.firstName, form.lastName].filter(Boolean).join(" ") || "Untitled";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          href={`/family/applications/${id}`}
          className="text-sm text-rooted-green hover:underline"
        >
          &larr; Back to Application
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Edit Application — {studentName}
          </h1>
          <Badge variant="secondary">Draft</Badge>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Continue filling out the application. Your progress is saved
          automatically.
        </p>
      </div>

      <StepIndicator steps={STEPS} currentIndex={stepIndex} />

      {/* ───── Step 1: Campus & Grade ───── */}
      {currentStep.id === "campus" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campus & Grade Level</CardTitle>
            <CardDescription>
              Select the campus and grade your child will attend.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Campus" required>
              <Select
                value={form.campusId}
                onChange={(e) => update({ campusId: e.target.value })}
              >
                <option value="">Select a campus...</option>
                {CAMPUSES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Grade Level" required>
              <Select
                value={form.gradeLevel}
                onChange={(e) => update({ gradeLevel: e.target.value })}
              >
                <option value="">Select grade...</option>
                {Object.entries(GRADE_LABELS).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </CardContent>
        </Card>
      )}

      {/* ───── Step 2: Student Info ───── */}
      {currentStep.id === "student" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Student Information</CardTitle>
            <CardDescription>
              Enter your child&apos;s legal name and personal details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="First Name" required>
                <Input
                  value={form.firstName}
                  onChange={(e) => update({ firstName: e.target.value })}
                  placeholder="First"
                />
              </Field>
              <Field label="Middle Name">
                <Input
                  value={form.middleName}
                  onChange={(e) => update({ middleName: e.target.value })}
                  placeholder="Middle"
                />
              </Field>
              <Field label="Last Name" required>
                <Input
                  value={form.lastName}
                  onChange={(e) => update({ lastName: e.target.value })}
                  placeholder="Last"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Date of Birth" required>
                <Input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => update({ dateOfBirth: e.target.value })}
                />
              </Field>
              <Field label="Gender">
                <Select
                  value={form.gender}
                  onChange={(e) => update({ gender: e.target.value })}
                >
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non_binary">Non-binary</option>
                  <option value="prefer_not">Prefer not to say</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Race / Ethnicity">
                <Select
                  value={form.raceEthnicity}
                  onChange={(e) => update({ raceEthnicity: e.target.value })}
                >
                  <option value="">Select...</option>
                  <option value="american_indian">American Indian or Alaska Native</option>
                  <option value="asian">Asian</option>
                  <option value="black">Black or African American</option>
                  <option value="hispanic">Hispanic or Latino</option>
                  <option value="pacific_islander">Native Hawaiian or Pacific Islander</option>
                  <option value="white">White</option>
                  <option value="two_or_more">Two or More Races</option>
                  <option value="prefer_not">Prefer not to say</option>
                </Select>
              </Field>
              <Field label="Primary / Home Language">
                <Select
                  value={form.primaryLanguage}
                  onChange={(e) => update({ primaryLanguage: e.target.value })}
                >
                  <option value="">Select...</option>
                  <option value="english">English</option>
                  <option value="spanish">Spanish</option>
                  <option value="mandarin">Mandarin</option>
                  <option value="arabic">Arabic</option>
                  <option value="vietnamese">Vietnamese</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
            </div>
            <Field label="Previous School">
              <Input
                value={form.previousSchool}
                onChange={(e) => update({ previousSchool: e.target.value })}
                placeholder="Name of previous school attended"
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Does the student have an IEP or 504 plan?">
                <Select
                  value={form.hasIEP}
                  onChange={(e) => update({ hasIEP: e.target.value })}
                >
                  <option value="">Select...</option>
                  <option value="no">No</option>
                  <option value="iep">Yes — IEP</option>
                  <option value="504">Yes — 504 Plan</option>
                </Select>
              </Field>
              {(form.hasIEP === "iep" || form.hasIEP === "504") && (
                <Field label="Special Services Description">
                  <Input
                    value={form.specialServices}
                    onChange={(e) =>
                      update({ specialServices: e.target.value })
                    }
                    placeholder="Briefly describe services"
                  />
                </Field>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ───── Step 3: Guardian ───── */}
      {currentStep.id === "guardian" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Parent / Guardian Information
            </CardTitle>
            <CardDescription>
              Primary contact and address information for the household.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="First Name" required>
                <Input
                  value={form.guardianFirstName}
                  onChange={(e) =>
                    update({ guardianFirstName: e.target.value })
                  }
                  placeholder="First"
                />
              </Field>
              <Field label="Last Name" required>
                <Input
                  value={form.guardianLastName}
                  onChange={(e) =>
                    update({ guardianLastName: e.target.value })
                  }
                  placeholder="Last"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Relationship" required>
                <Select
                  value={form.guardianRelationship}
                  onChange={(e) =>
                    update({ guardianRelationship: e.target.value })
                  }
                >
                  <option value="">Select...</option>
                  <option value="mother">Mother</option>
                  <option value="father">Father</option>
                  <option value="legal_guardian">Legal Guardian</option>
                  <option value="grandparent">Grandparent</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Email" required>
                <Input
                  type="email"
                  value={form.guardianEmail}
                  onChange={(e) =>
                    update({ guardianEmail: e.target.value })
                  }
                  placeholder="email@example.com"
                />
              </Field>
              <Field label="Phone" required>
                <Input
                  type="tel"
                  value={form.guardianPhone}
                  onChange={(e) =>
                    update({ guardianPhone: e.target.value })
                  }
                  placeholder="(555) 555-0100"
                />
              </Field>
            </div>

            <hr className="my-2 border-gray-200" />

            <Field label="Street Address" required>
              <Input
                value={form.address}
                onChange={(e) => update({ address: e.target.value })}
                placeholder="1234 Main St"
              />
            </Field>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="col-span-2">
                <Field label="City" required>
                  <Input
                    value={form.city}
                    onChange={(e) => update({ city: e.target.value })}
                    placeholder="City"
                  />
                </Field>
              </div>
              <Field label="State" required>
                <Input
                  value={form.state}
                  onChange={(e) => update({ state: e.target.value })}
                  placeholder="WA"
                  maxLength={2}
                />
              </Field>
              <Field label="ZIP" required>
                <Input
                  value={form.zip}
                  onChange={(e) => update({ zip: e.target.value })}
                  placeholder="98660"
                  maxLength={10}
                />
              </Field>
            </div>

            <hr className="my-2 border-gray-200" />
            <p className="text-sm font-medium text-gray-700">
              Emergency Contact
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Contact Name" required>
                <Input
                  value={form.emergencyContactName}
                  onChange={(e) =>
                    update({ emergencyContactName: e.target.value })
                  }
                  placeholder="Full name"
                />
              </Field>
              <Field label="Phone" required>
                <Input
                  type="tel"
                  value={form.emergencyContactPhone}
                  onChange={(e) =>
                    update({ emergencyContactPhone: e.target.value })
                  }
                  placeholder="(555) 555-0100"
                />
              </Field>
              <Field label="Relationship" required>
                <Select
                  value={form.emergencyContactRelationship}
                  onChange={(e) =>
                    update({ emergencyContactRelationship: e.target.value })
                  }
                >
                  <option value="">Select...</option>
                  <option value="parent">Parent</option>
                  <option value="grandparent">Grandparent</option>
                  <option value="aunt_uncle">Aunt / Uncle</option>
                  <option value="family_friend">Family Friend</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ───── Step 4: Documents ───── */}
      {currentStep.id === "documents" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Required Documents</CardTitle>
            <CardDescription>
              Upload the following documents for your application. Accepted
              formats: PDF, JPG, PNG (max 10 MB each).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              {
                name: "Birth Certificate or Proof of Age",
                desc: "Birth certificate, passport, or baptismal record",
                required: true,
              },
              {
                name: "Proof of Residency",
                desc: "Utility bill, lease agreement, or mortgage statement",
                required: true,
              },
              {
                name: "Immunization Records",
                desc: "Current immunization record from your healthcare provider",
                required: true,
              },
              {
                name: "Recent Physical Exam",
                desc: "Physical exam within the last 12 months",
                required: false,
              },
              {
                name: "Previous School Records",
                desc: "Report cards or transcripts from prior school",
                required: false,
              },
              {
                name: "IEP / 504 Plan",
                desc: "If applicable, upload current plan documentation",
                required: false,
              },
            ].map((doc) => {
              const uploaded = uploadedDocs.find((d) => d.name === doc.name);
              return (
                <div
                  key={doc.name}
                  className="flex items-start justify-between gap-4 p-3 border border-gray-200 rounded-md"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {doc.name}
                      {doc.required && (
                        <span className="text-red-500 ml-0.5">*</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{doc.desc}</p>
                    {uploaded && (
                      <p className="text-xs text-rooted-green mt-1">
                        ✓ Uploaded: {uploaded.fileName}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0">
                    {uploaded ? "Replace" : "Upload"}
                  </Button>
                </div>
              );
            })}
            <p className="text-xs text-gray-400">
              Documents will be securely stored and only accessible by
              authorized enrollment staff.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ───── Step 5: Review ───── */}
      {currentStep.id === "review" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review & Submit</CardTitle>
            <CardDescription>
              Please review your application details before submitting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-4">
              <ReviewSection title="Campus & Grade">
                <ReviewRow
                  label="Campus"
                  value={
                    CAMPUSES.find((c) => c.id === form.campusId)?.name || "—"
                  }
                />
                <ReviewRow
                  label="Grade"
                  value={
                    form.gradeLevel
                      ? GRADE_LABELS[form.gradeLevel] || form.gradeLevel
                      : "—"
                  }
                />
              </ReviewSection>

              <ReviewSection title="Student">
                <ReviewRow
                  label="Name"
                  value={
                    [form.firstName, form.middleName, form.lastName]
                      .filter(Boolean)
                      .join(" ") || "—"
                  }
                />
                <ReviewRow label="Date of Birth" value={form.dateOfBirth || "—"} />
                <ReviewRow label="Gender" value={form.gender || "—"} />
                <ReviewRow label="Previous School" value={form.previousSchool || "—"} />
              </ReviewSection>

              <ReviewSection title="Parent / Guardian">
                <ReviewRow
                  label="Name"
                  value={
                    [form.guardianFirstName, form.guardianLastName]
                      .filter(Boolean)
                      .join(" ") || "—"
                  }
                />
                <ReviewRow label="Relationship" value={form.guardianRelationship || "—"} />
                <ReviewRow label="Email" value={form.guardianEmail || "—"} />
                <ReviewRow label="Phone" value={form.guardianPhone || "—"} />
                <ReviewRow
                  label="Address"
                  value={
                    [form.address, form.city, form.state, form.zip]
                      .filter(Boolean)
                      .join(", ") || "—"
                  }
                />
              </ReviewSection>

              <ReviewSection title="Emergency Contact">
                <ReviewRow label="Name" value={form.emergencyContactName || "—"} />
                <ReviewRow label="Phone" value={form.emergencyContactPhone || "—"} />
                <ReviewRow label="Relationship" value={form.emergencyContactRelationship || "—"} />
              </ReviewSection>
            </div>

            {/* Completeness warnings */}
            {(!form.emergencyContactName || !form.emergencyContactPhone) && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                <p className="text-sm text-amber-800 font-medium">
                  ⚠️ Incomplete Fields
                </p>
                <p className="text-sm text-amber-700 mt-0.5">
                  Please go back and fill in all required fields before submitting,
                  including emergency contact information.
                </p>
              </div>
            )}

            <hr className="border-gray-200" />

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="agree-terms"
                checked={form.agreeTerms}
                onChange={(e) => update({ agreeTerms: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-rooted-green focus:ring-rooted-green"
              />
              <label
                htmlFor="agree-terms"
                className="text-sm text-gray-600"
              >
                I certify that the information provided in this application is
                accurate and complete to the best of my knowledge. I understand
                that providing false information may result in the
                disqualification of this application.
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ───── Navigation ───── */}
      <div className="flex items-center justify-between pt-2">
        <div>
          {stepIndex > 0 && (
            <Button variant="outline" onClick={back}>
              Back
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {stepIndex < STEPS.length - 1 && (
            <>
              <Button variant="outline" onClick={handleSaveDraft}>
                Save Draft
              </Button>
              <Button onClick={next}>Continue</Button>
            </>
          )}
          {stepIndex === STEPS.length - 1 && (
            <Button onClick={handleSubmit} disabled={!form.agreeTerms}>
              Submit Application
            </Button>
          )}
        </div>
      </div>

      {/* Application ID footer */}
      <div className="text-xs text-gray-400 pb-4">
        Application ID: {id}
      </div>
    </div>
  );
}

/* ─── review helpers ─── */

function ReviewSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-gray-500 w-32 shrink-0">{label}</span>
      <span className="text-gray-900">{value}</span>
    </div>
  );
}
