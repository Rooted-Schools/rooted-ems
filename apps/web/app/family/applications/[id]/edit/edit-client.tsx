"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { GRADE_LABELS } from "@/lib/application-helpers";
import type { EnrollmentWindowInfo, CampusRow, DraftApplicationData } from "@/lib/queries";
import { familyUpdateApplication, familySubmitApplication } from "../../actions";
import { useDraftAutosave, SaveIndicator } from "@/components/draft-autosave";

/* ───────────── Props ───────────── */

interface GradeLevel {
  id: string;
  grade: string;
  campus_id: string;
}

interface EditApplicationClientProps {
  draft: DraftApplicationData;
  windows: EnrollmentWindowInfo[];
  campuses: CampusRow[];
  gradeLevels: GradeLevel[];
}

/* ───────────── step definitions ───────────── */

const STEPS = [
  { id: "campus", label: "Campus & Grade" },
  { id: "student", label: "Student & Guardian" },
  { id: "review", label: "Review & Submit" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/* ───────────── form state ───────────── */

interface FormData {
  campusId: string;
  enrollmentWindowId: string;
  gradeLevelId: string;
  gradeLevel: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  guardianFirstName: string;
  guardianLastName: string;
  guardianRelationship: string;
  guardianRelationshipOther: string;
  guardianEmail: string;
  guardianPhone: string;
  hasSibling: boolean;
  dataSharingConsent: boolean;
  agreeTerms: boolean;
  signatureName: string;
}

function draftToFormData(d: DraftApplicationData): FormData {
  return {
    campusId: d.campus_id,
    enrollmentWindowId: d.enrollment_window_id,
    gradeLevelId: d.grade_level_id,
    gradeLevel: d.grade,
    firstName: d.student.first_name,
    lastName: d.student.last_name,
    dateOfBirth: d.student.date_of_birth ?? "",
    gender: d.student.gender ?? "",
    guardianFirstName: d.guardian.first_name,
    guardianLastName: d.guardian.last_name,
    guardianRelationship: d.guardian.relationship,
    guardianRelationshipOther: d.answers.guardian_relationship_other ?? "",
    guardianEmail: d.guardian.email ?? "",
    guardianPhone: d.guardian.phone ?? "",
    hasSibling: d.answers.has_sibling_at_school === "true",
    dataSharingConsent: d.answers.data_sharing_consent === "true",
    agreeTerms: d.answers.agree_terms === "true",
    signatureName: d.answers.e_signature_name ?? "",
  };
}

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
      <label className="block text-sm font-medium text-ink/70 mb-1">
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
                        : "border border-stone/30 text-stone"
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
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-xs hidden sm:inline ${
                  isCurrent ? "font-semibold text-ink" : "text-stone"
                }`}
              >
                {step.label}
              </span>
              {i < steps.length - 1 && (
                <div
                  className={`w-6 h-px ${
                    isComplete ? "bg-rooted-green" : "bg-rooted-gray-dark/30"
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

/* ───────────── build mutation input ───────────── */

function buildUpdateInput(
  applicationId: string,
  form: FormData,
  campusWindows: EnrollmentWindowInfo[]
) {
  const answers: Record<string, string | boolean> = {
    // Persist booleans unconditionally so unchecking is saved too.
    data_sharing_consent: form.dataSharingConsent,
    agree_terms: form.agreeTerms,
    has_sibling_at_school: form.hasSibling,
    e_signature_name: form.signatureName,
    guardian_relationship_other:
      form.guardianRelationship === "other" ? form.guardianRelationshipOther : "",
  };
  if (form.signatureName) {
    answers.e_signature_date = new Date().toISOString().split("T")[0];
  }

  // Persist placement changes only as a complete trio, so the draft never
  // ends up with a campus pointing at another campus's grade level or window.
  const windowId = form.enrollmentWindowId || campusWindows[0]?.id;
  const placement =
    form.campusId && form.gradeLevelId && windowId
      ? {
          campus_id: form.campusId,
          grade_level_id: form.gradeLevelId,
          enrollment_window_id: windowId,
        }
      : {};

  return {
    application_id: applicationId,
    ...placement,
    student_first_name: form.firstName,
    student_last_name: form.lastName,
    student_date_of_birth: form.dateOfBirth || undefined,
    student_gender: form.gender || undefined,
    guardian_first_name: form.guardianFirstName,
    guardian_last_name: form.guardianLastName,
    guardian_relationship: form.guardianRelationship || undefined,
    guardian_email: form.guardianEmail,
    guardian_phone: form.guardianPhone,
    answers,
  };
}

/* ───────────── page component ───────────── */

export function EditApplicationClient({ draft, windows, campuses, gradeLevels }: EditApplicationClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<FormData>(() => draftToFormData(draft));
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const currentStep = STEPS[stepIndex];

  const campusWindows = windows.filter((w) => w.campus_id === form.campusId && w.is_open);
  const campusGrades = gradeLevels.filter((g) => g.campus_id === form.campusId);
  const studentName = [form.firstName, form.lastName].filter(Boolean).join(" ") || "Untitled";

  // Debounced auto-save (~2s after the last change). The server action
  // re-verifies auth + guardian ownership on every save.
  const { status: saveStatus, flush: flushAutosave } = useDraftAutosave({
    enabled: true,
    value: form,
    onSave: (current) => {
      const currentWindows = windows.filter((w) => w.campus_id === current.campusId && w.is_open);
      return familyUpdateApplication(buildUpdateInput(draft.id, current, currentWindows));
    },
  });

  function update(partial: Partial<FormData>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  function next() {
    if (stepIndex < STEPS.length - 1) setStepIndex((i) => i + 1);
    void flushAutosave(); // always persist on step navigation
  }

  function back() {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
    void flushAutosave(); // always persist on step navigation
  }

  function handleSaveDraft() {
    startTransition(async () => {
      const input = buildUpdateInput(draft.id, form, campusWindows);
      const result = await familyUpdateApplication(input);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: "Draft saved!" });
        router.refresh();
      }
    });
  }

  function handleSubmit() {
    startTransition(async () => {
      const input = buildUpdateInput(draft.id, form, campusWindows);
      const updateResult = await familyUpdateApplication(input);
      if (updateResult.error) {
        setFeedback({ type: "error", message: updateResult.error });
        return;
      }

      const submitResult = await familySubmitApplication(draft.id);
      if (submitResult.error) {
        setFeedback({ type: "error", message: submitResult.error });
      } else {
        router.push(`/family/applications/${draft.id}`);
      }
    });
  }

  const canProceedStep: Record<StepId, boolean> = {
    campus: !!form.campusId && !!form.gradeLevelId,
    student:
      !!form.firstName &&
      !!form.lastName &&
      !!form.guardianFirstName &&
      !!form.guardianLastName &&
      !!form.guardianRelationship &&
      !!form.guardianEmail &&
      !!form.guardianPhone,
    review: form.agreeTerms && form.dataSharingConsent && !!form.signatureName,
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          href="/family/applications"
          className="text-sm text-stone hover:text-ink/70 transition-colors"
        >
          &larr; Back to Applications
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold text-ink">{studentName}</h1>
          <Badge variant="secondary">Draft</Badge>
        </div>
        <p className="text-sm text-stone mt-1">
          {campuses.find((c) => c.id === form.campusId)?.name ?? ""}{" "}
          {form.gradeLevel ? `· ${GRADE_LABELS[form.gradeLevel] ?? form.gradeLevel}` : ""}
        </p>
      </div>

      {feedback && (
        <div
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            feedback.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <StepIndicator steps={STEPS} currentIndex={stepIndex} />
        <SaveIndicator status={saveStatus} />
      </div>

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
                onChange={(e) => {
                  update({ campusId: e.target.value, gradeLevelId: "", enrollmentWindowId: "" });
                }}
              >
                <option value="">Select a campus...</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            {form.campusId && campusWindows.length === 0 && (
              <p className="text-sm text-amber-600">
                No enrollment windows are currently open for this campus.
              </p>
            )}
            {campusWindows.length > 1 && (
              <Field label="Enrollment Window" required>
                <Select
                  value={form.enrollmentWindowId}
                  onChange={(e) => update({ enrollmentWindowId: e.target.value })}
                >
                  <option value="">Select window...</option>
                  {campusWindows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} (closes {w.close_date})
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Grade Level" required>
              <Select
                value={form.gradeLevelId}
                onChange={(e) => {
                  const gl = campusGrades.find((g) => g.id === e.target.value);
                  update({ gradeLevelId: e.target.value, gradeLevel: gl?.grade ?? "" });
                }}
              >
                <option value="">Select grade...</option>
                {campusGrades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {GRADE_LABELS[g.grade] ?? `Grade ${g.grade}`}
                  </option>
                ))}
                {form.campusId && campusGrades.length === 0 &&
                  Object.entries(GRADE_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
              </Select>
            </Field>

            {/* Sibling priority question — affects lottery weighting */}
            <div className="flex items-start gap-2.5 pt-1">
              <input
                type="checkbox"
                id="has-sibling"
                checked={form.hasSibling}
                onChange={(e) => update({ hasSibling: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-stone/30 text-rooted-green focus:ring-rooted-green"
              />
              <label htmlFor="has-sibling" className="text-sm text-ink/70">
                This student has a sibling currently attending or enrolled at this campus.
                <span className="block text-xs text-stone mt-0.5">
                  Sibling enrollment may affect lottery priority.
                </span>
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ───── Step 2: Student & Guardian ───── */}
      {currentStep.id === "student" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Student Information</CardTitle>
            <CardDescription>Your student&apos;s legal name and date of birth.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="First Name" required>
                <Input
                  value={form.firstName}
                  onChange={(e) => update({ firstName: e.target.value })}
                  placeholder="First"
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
              <Field label="Date of Birth">
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
          </CardContent>
        </Card>
      )}

      {currentStep.id === "student" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parent / Guardian</CardTitle>
            <CardDescription>Primary contact for this application.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="First Name" required>
                <Input
                  value={form.guardianFirstName}
                  onChange={(e) => update({ guardianFirstName: e.target.value })}
                  placeholder="First"
                />
              </Field>
              <Field label="Last Name" required>
                <Input
                  value={form.guardianLastName}
                  onChange={(e) => update({ guardianLastName: e.target.value })}
                  placeholder="Last"
                />
              </Field>
            </div>
            <Field label="Relationship to Student" required>
              <Select
                value={form.guardianRelationship}
                onChange={(e) => update({ guardianRelationship: e.target.value, guardianRelationshipOther: "" })}
              >
                <option value="">Select...</option>
                <option value="mother">Mother</option>
                <option value="father">Father</option>
                <option value="stepmother">Stepmother</option>
                <option value="stepfather">Stepfather</option>
                <option value="grandparent">Grandparent</option>
                <option value="aunt_uncle">Aunt / Uncle</option>
                <option value="foster_parent">Foster Parent</option>
                <option value="legal_guardian">Legal Guardian</option>
                <option value="other">Other</option>
              </Select>
              {form.guardianRelationship === "other" && (
                <Input
                  className="mt-2"
                  value={form.guardianRelationshipOther}
                  onChange={(e) => update({ guardianRelationshipOther: e.target.value })}
                  placeholder="Please describe your relationship to the student"
                  maxLength={100}
                />
              )}
            </Field>
            <Field label="Email Address" required>
              <Input
                type="email"
                value={form.guardianEmail}
                onChange={(e) => update({ guardianEmail: e.target.value })}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Phone Number" required>
              <Input
                type="tel"
                value={form.guardianPhone}
                onChange={(e) => update({ guardianPhone: e.target.value })}
                placeholder="(555) 555-0100"
              />
            </Field>
            <p className="text-xs text-stone">
              📋 Additional information (address, emergency contacts, demographics, and service
              needs) will be collected during the registration process after an enrollment offer is
              made.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ───── Step 3: Review & Submit ───── */}
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
                  value={campuses.find((c) => c.id === form.campusId)?.name || "—"}
                />
                <ReviewRow
                  label="Grade"
                  value={
                    form.gradeLevel
                      ? GRADE_LABELS[form.gradeLevel] || `Grade ${form.gradeLevel}`
                      : "—"
                  }
                />
                <ReviewRow label="Sibling at campus" value={form.hasSibling ? "Yes" : "No"} />
              </ReviewSection>
              <ReviewSection title="Student">
                <ReviewRow
                  label="Name"
                  value={[form.firstName, form.lastName].filter(Boolean).join(" ") || "—"}
                />
                <ReviewRow label="Date of Birth" value={form.dateOfBirth || "—"} />
                {form.gender && <ReviewRow label="Gender" value={form.gender} />}
              </ReviewSection>
              <ReviewSection title="Parent / Guardian">
                <ReviewRow
                  label="Name"
                  value={
                    [form.guardianFirstName, form.guardianLastName].filter(Boolean).join(" ") || "—"
                  }
                />
                <ReviewRow label="Relationship" value={form.guardianRelationship || "—"} />
                <ReviewRow label="Email" value={form.guardianEmail || "—"} />
                <ReviewRow label="Phone" value={form.guardianPhone || "—"} />
              </ReviewSection>
            </div>

            <hr className="border-stone/20" />

            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="data-sharing-consent"
                  checked={form.dataSharingConsent}
                  onChange={(e) => update({ dataSharingConsent: e.target.checked })}
                  className="mt-1 h-4 w-4 rounded border-stone/30 text-rooted-green focus:ring-rooted-green"
                />
                <label htmlFor="data-sharing-consent" className="text-sm text-ink/60">
                  I consent to the sharing of my child&apos;s educational records with{" "}
                  <span className="font-bold">rooted</span>schools for the purpose of enrollment
                  processing.
                </label>
              </div>
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="agree-terms"
                  checked={form.agreeTerms}
                  onChange={(e) => update({ agreeTerms: e.target.checked })}
                  className="mt-1 h-4 w-4 rounded border-stone/30 text-rooted-green focus:ring-rooted-green"
                />
                <label htmlFor="agree-terms" className="text-sm text-ink/60">
                  I certify that the information provided in this application is accurate and
                  complete to the best of my knowledge. I understand that providing false
                  information may result in the disqualification of this application.
                </label>
              </div>
            </div>

            <hr className="border-stone/20" />
            <p className="text-sm font-medium text-ink/70">Electronic Signature</p>
            <Field label="Type your full legal name to sign" required>
              <Input
                value={form.signatureName}
                onChange={(e) => update({ signatureName: e.target.value })}
                placeholder="Full legal name"
              />
            </Field>
            <p className="text-xs text-stone">
              By typing your name above, you are electronically signing this application. Date:{" "}
              {new Date().toLocaleDateString("en-US")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ───── Navigation ───── */}
      <div className="flex items-center justify-between pt-2">
        <div>
          {stepIndex > 0 && (
            <Button variant="outline" onClick={back} disabled={isPending}>
              Back
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {stepIndex < STEPS.length - 1 && (
            <>
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={isPending || !canProceedStep.campus}
              >
                {isPending ? "Saving..." : "Save Draft"}
              </Button>
              <Button onClick={next} disabled={!canProceedStep[currentStep.id]}>
                Continue
              </Button>
            </>
          )}
          {stepIndex === STEPS.length - 1 && (
            <Button
              onClick={handleSubmit}
              disabled={!canProceedStep.review || isPending}
            >
              {isPending ? "Submitting..." : "Submit Application"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── review helpers ─── */

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-stone uppercase tracking-wider mb-2">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-stone w-32 shrink-0">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}
