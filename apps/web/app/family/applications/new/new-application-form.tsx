"use client";

import * as React from "react";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { GRADE_LABELS } from "@/lib/application-helpers";
import type { EnrollmentWindowInfo, CampusRow, ExistingHouseholdInfo } from "@/lib/queries";
import {
  familyCreateApplication,
  familySubmitApplication,
  familyUpdateApplication,
} from "../actions";
import { useDraftAutosave, SaveIndicator } from "@/components/draft-autosave";
import { useLocale } from "@/lib/i18n/locale-context";
import { type TranslationKey } from "@/lib/i18n/translations";
import { NO_POLICY_QUESTIONS, type PolicyQuestionFlags } from "@/lib/lottery-policy";

/* ───────────── Props ───────────── */

interface GradeLevel {
  id: string;
  grade: string;
  campus_id: string;
}

interface NewApplicationFormProps {
  windows: EnrollmentWindowInfo[];
  campuses: CampusRow[];
  gradeLevels: GradeLevel[];
  /** Pre-selected campus id passed from the dashboard's school card link */
  initialCampusId?: string;
  /**
   * A returning family's existing household + guardian, when one exists.
   * Prefills the guardian step so a second (or later) child's application
   * doesn't re-collect the same contact info — the prefill is editable, and
   * whatever the parent confirms/changes is what createApplication persists
   * back onto the shared guardian record (no duplicate is created).
   */
  existingHousehold?: ExistingHouseholdInfo | null;
  /**
   * Per-campus map of the extra lottery questions that campus's board-adopted
   * policy asks for. Keyed by campus id; a campus that is absent (or whose
   * flags are all false) asks nothing extra. Computed on the server from the
   * ADOPTED policy only.
   */
  policyQuestions?: Record<string, PolicyQuestionFlags>;
}

/** Yes/No answers are stored as the strings the policy matchers accept. */
type YesNo = "yes" | "no";

/* ───────────── step definitions ───────────── */

const STEPS = [
  { id: "campus", labelKey: "appForm.step.campus" },
  { id: "student", labelKey: "appForm.step.student" },
  { id: "review", labelKey: "appForm.step.review" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/* ───────────── form state ───────────── */

interface FormData {
  // Step 1: Campus & Grade
  campusId: string;
  enrollmentWindowId: string;
  gradeLevelId: string;
  gradeLevel: string;
  // Step 2: Student essentials
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  // Step 2: Guardian essentials
  guardianFirstName: string;
  guardianLastName: string;
  guardianRelationship: string;
  /** Free-text clarification when guardianRelationship === "other" */
  guardianRelationshipOther: string;
  guardianEmail: string;
  guardianPhone: string;
  /** TCPA opt-in: OK to text enrollment updates to guardianPhone. */
  smsConsent: boolean;
  // Sibling priority (affects lottery weighting)
  hasSibling: boolean;
  // Policy-driven lottery questions (only asked where the campus's adopted
  // policy declares the matching weighted tier)
  isStaffChild: YesNo;
  isFrlQualifying: YesNo;
  // Step 3: Consent
  dataSharingConsent: boolean;
  agreeTerms: boolean;
  signatureName: string;
}

const INITIAL: FormData = {
  campusId: "",
  enrollmentWindowId: "",
  gradeLevelId: "",
  gradeLevel: "",
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  guardianFirstName: "",
  guardianLastName: "",
  guardianRelationship: "",
  guardianRelationshipOther: "",
  guardianEmail: "",
  guardianPhone: "",
  smsConsent: false,
  hasSibling: false,
  isStaffChild: "no",
  isFrlQualifying: "no",
  dataSharingConsent: false,
  agreeTerms: false,
  signatureName: "",
};

/* ───────────── field helper ───────────── */

function Field({
  label,
  required,
  id,
  children,
}: {
  label: string;
  required?: boolean;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink/70 mb-1">
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
  const { t } = useLocale();
  return (
    <nav aria-label={t("appForm.progress")} className="mb-8">
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
                        : "border border-stone/30 text-stone-text"
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
                  isCurrent ? "font-semibold text-ink" : "text-stone-text"
                }`}
              >
                {t(step.labelKey)}
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

/* ───────────── yes / no question ───────────── */

/**
 * A two-option radio for a policy-driven lottery question. Defaults to No and
 * is always answerable: there is no "prefer not to say" here because the
 * weighted tier reads yes or nothing at all.
 */
function YesNoQuestion({
  name,
  label,
  note,
  value,
  onChange,
}: {
  name: string;
  label: string;
  note?: string;
  value: YesNo;
  onChange: (value: YesNo) => void;
}) {
  const { t } = useLocale();
  return (
    <fieldset className="pt-1">
      <legend className="text-sm font-medium text-ink/70 mb-1">{label}</legend>
      {note && <p className="text-xs text-stone-text mb-2">{note}</p>}
      <div className="flex items-center gap-5">
        {(["yes", "no"] as const).map((option) => (
          <label key={option} htmlFor={`${name}-${option}`} className="flex items-center gap-2 text-sm text-ink/70">
            <input
              type="radio"
              id={`${name}-${option}`}
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="h-4 w-4 border-stone/30 text-rooted-green focus:ring-rooted-green"
            />
            {option === "yes" ? t("common.yes") : t("common.no")}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ───────────── build mutation input ───────────── */

/**
 * The two policy-driven answers, keyed exactly as the weighted tiers read them.
 *
 * A campus that does not ask a question writes "" rather than leaving the key
 * out: a family who picked Vancouver, answered yes, then switched campuses
 * must not carry that answer to a school whose board never adopted the tier.
 */
function policyAnswerValues(form: FormData, flags: PolicyQuestionFlags) {
  return {
    is_staff_child: flags.is_staff_child ? form.isStaffChild : "",
    is_frl_qualifying: flags.is_frl_qualifying ? form.isFrlQualifying : "",
  };
}

/** The questions a campus asks, defaulting to none for an unknown campus. */
function questionFlagsFor(
  policyQuestions: Record<string, PolicyQuestionFlags> | undefined,
  campusId: string
): PolicyQuestionFlags {
  return policyQuestions?.[campusId] ?? NO_POLICY_QUESTIONS;
}

function buildCreateInput(
  form: FormData,
  campusWindows: EnrollmentWindowInfo[],
  flags: PolicyQuestionFlags
) {
  const windowId = form.enrollmentWindowId || campusWindows[0]?.id;
  if (!windowId) return null;

  const answers: Record<string, unknown> = { ...policyAnswerValues(form, flags) };
  if (form.dataSharingConsent) answers.data_sharing_consent = true;
  if (form.signatureName) answers.e_signature_name = form.signatureName;
  answers.e_signature_date = new Date().toISOString().split("T")[0];
  if (form.guardianRelationship === "other" && form.guardianRelationshipOther) {
    answers.guardian_relationship_other = form.guardianRelationshipOther;
  }
  // Sibling priority — stored in answers so the lottery can weight accordingly
  answers.has_sibling_at_school = form.hasSibling;

  return {
    enrollment_window_id: windowId,
    campus_id: form.campusId,
    grade_level_id: form.gradeLevelId,
    student_first_name: form.firstName,
    student_last_name: form.lastName,
    student_date_of_birth: form.dateOfBirth || undefined,
    student_gender: form.gender || undefined,
    guardian_first_name: form.guardianFirstName,
    guardian_last_name: form.guardianLastName,
    guardian_relationship: form.guardianRelationship || "other",
    guardian_email: form.guardianEmail,
    guardian_phone: form.guardianPhone,
    guardian_sms_consent: form.smsConsent,
    source: "website" as const,
    answers,
  };
}

/** Partial-update input for auto-saving an existing draft row. */
function buildAutosaveInput(
  applicationId: string,
  form: FormData,
  campusWindows: EnrollmentWindowInfo[],
  flags: PolicyQuestionFlags
) {
  const answers: Record<string, unknown> = {
    // Persist booleans unconditionally so unchecking is saved too.
    data_sharing_consent: form.dataSharingConsent,
    agree_terms: form.agreeTerms,
    has_sibling_at_school: form.hasSibling,
    e_signature_name: form.signatureName,
    guardian_relationship_other:
      form.guardianRelationship === "other" ? form.guardianRelationshipOther : "",
    ...policyAnswerValues(form, flags),
  };
  if (form.signatureName) {
    answers.e_signature_date = new Date().toISOString().split("T")[0];
  }

  // Persist placement changes (the family went back to step 1 and changed
  // campus/grade) only as a complete trio, so the draft never ends up with a
  // campus pointing at another campus's grade level or enrollment window.
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
    guardian_sms_consent: form.smsConsent,
    answers,
  };
}

/* ───────────── page component ───────────── */

export function NewApplicationForm({
  windows,
  campuses,
  gradeLevels,
  initialCampusId,
  existingHousehold,
  policyQuestions,
}: NewApplicationFormProps) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [stepIndex, setStepIndex] = useState(0);
  const existingGuardian = existingHousehold?.guardian ?? null;
  // Item 9: pre-populate campus if the dashboard passed ?campus=X.
  // A returning family's guardian contact info is prefilled from their
  // existing household so a second child's application doesn't re-collect —
  // and re-duplicate — the same guardian record. Still fully editable.
  const [form, setForm] = useState<FormData>(() => ({
    ...INITIAL,
    campusId: initialCampusId ?? "",
    ...(existingGuardian
      ? {
          guardianFirstName: existingGuardian.first_name,
          guardianLastName: existingGuardian.last_name,
          guardianRelationship: existingGuardian.relationship,
          guardianEmail: existingGuardian.email ?? "",
          guardianPhone: existingGuardian.phone ?? "",
          smsConsent: existingGuardian.sms_consent,
        }
      : {}),
  }));
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  // Server-side draft: created the first time the family completes step 1,
  // then kept up to date by the debounced auto-save below.
  const [draftId, setDraftId] = useState<string | null>(null);
  const creatingDraftRef = useRef(false);

  const currentStep = STEPS[stepIndex];

  const campusWindows = windows.filter((w) => w.campus_id === form.campusId && w.is_open);
  const campusGrades = gradeLevels.filter((g) => g.campus_id === form.campusId);

  // The extra lottery questions follow the selected campus, so they appear and
  // disappear when the family changes their mind on step 1.
  const questionFlags = questionFlagsFor(policyQuestions, form.campusId);
  const showPolicyQuestions = questionFlags.is_staff_child || questionFlags.is_frl_qualifying;

  // Debounced auto-save (~2s after the last change) once the draft row exists.
  // The server action re-verifies auth + guardian ownership on every save.
  const { status: saveStatus, flush: flushAutosave } = useDraftAutosave({
    enabled: !!draftId,
    value: form,
    onSave: async (current) => {
      if (!draftId) return { error: null };
      const currentWindows = windows.filter((w) => w.campus_id === current.campusId && w.is_open);
      return familyUpdateApplication(
        buildAutosaveInput(
          draftId,
          current,
          currentWindows,
          questionFlagsFor(policyQuestions, current.campusId)
        )
      );
    },
  });

  function update(partial: Partial<FormData>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  function next() {
    if (!canProceedStep[currentStep.id]) {
      setShowValidation(true);
      return;
    }
    setShowValidation(false);

    // First time leaving step 1: create the draft row server-side so progress
    // survives a closed browser (and is resumable from any device).
    if (currentStep.id === "campus" && !draftId) {
      if (creatingDraftRef.current) return;
      creatingDraftRef.current = true;
      startTransition(async () => {
        try {
          const input = buildCreateInput(form, campusWindows, questionFlags);
          if (!input) {
            setFeedback({ type: "error", message: t("appForm.noOpenWindow") });
            return;
          }
          const result = await familyCreateApplication(input);
          if (result.error || !result.data) {
            setFeedback({ type: "error", message: result.error ?? t("appForm.createFailed") });
            return;
          }
          setFeedback(null);
          setDraftId(result.data.id);
          setStepIndex(1);
        } finally {
          creatingDraftRef.current = false;
        }
      });
      return;
    }

    if (stepIndex < STEPS.length - 1) setStepIndex((i) => i + 1);
    void flushAutosave(); // always persist on step navigation
  }

  function back() {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
    void flushAutosave(); // always persist on step navigation
  }

  function handleSaveDraft() {
    startTransition(async () => {
      // Draft already exists (created on step 1) — just save the latest values.
      if (draftId) {
        const result = await familyUpdateApplication(buildAutosaveInput(draftId, form, campusWindows, questionFlags));
        if (result.error) {
          setFeedback({ type: "error", message: result.error });
        } else {
          setFeedback({ type: "success", message: t("appForm.draftSaved") });
          router.push("/family/applications");
        }
        return;
      }

      const input = buildCreateInput(form, campusWindows, questionFlags);
      if (!input) {
        setFeedback({ type: "error", message: t("appForm.noOpenWindow") });
        return;
      }

      const result = await familyCreateApplication(input);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else if (result.data?.id) {
        router.push(`/family/applications/${result.data.id}/edit`);
      } else {
        setFeedback({ type: "success", message: t("appForm.draftSaved") });
        router.push("/family/applications");
      }
    });
  }

  function handleSubmit() {
    startTransition(async () => {
      let applicationId = draftId;

      if (applicationId) {
        // Draft exists — persist the final values, then submit it.
        const updateResult = await familyUpdateApplication(
          buildAutosaveInput(applicationId, form, campusWindows, questionFlags)
        );
        if (updateResult.error) {
          setFeedback({ type: "error", message: updateResult.error });
          return;
        }
      } else {
        // Fallback (draft creation failed earlier): create + submit in one go.
        const input = buildCreateInput(form, campusWindows, questionFlags);
        if (!input) {
          setFeedback({ type: "error", message: t("appForm.noOpenWindow") });
          return;
        }
        const createResult = await familyCreateApplication(input);
        if (createResult.error || !createResult.data) {
          setFeedback({ type: "error", message: createResult.error ?? t("appForm.createFailed") });
          return;
        }
        applicationId = createResult.data.id;
      }

      const submitResult = await familySubmitApplication(applicationId);
      if (submitResult.error) {
        setFeedback({ type: "error", message: submitResult.error });
      } else {
        router.push(`/family/applications/${applicationId}`);
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
          className="text-sm text-stone-text hover:text-ink/70 transition-colors"
        >
          &larr; {t("appForm.backToApplications")}
        </Link>
        <h1 className="text-2xl font-bold text-ink mt-2">{t("appForm.title")}</h1>
        <p className="text-sm text-stone-text mt-1">
          {t("appForm.subtitle")}
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
            <CardTitle className="text-base">{t("appForm.campusGradeTitle")}</CardTitle>
            <CardDescription>
              {t("appForm.campusGradeDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {showValidation && !canProceedStep.campus && (
              <div role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3 mb-4">
                {t("appForm.fillRequired")}
              </div>
            )}
            <Field label={t("appForm.campus")} required>
              <Select
                value={form.campusId}
                onChange={(e) => {
                  update({ campusId: e.target.value, gradeLevelId: "", enrollmentWindowId: "" });
                }}
              >
                <option value="">{t("appForm.selectCampus")}</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            {form.campusId && campusWindows.length === 0 && (
              <p className="text-sm text-amber-600">
                {t("appForm.noWindowsOpen")}
              </p>
            )}
            {campusWindows.length > 1 && (
              <Field label={t("appForm.enrollmentWindow")} required>
                <Select
                  value={form.enrollmentWindowId}
                  onChange={(e) => update({ enrollmentWindowId: e.target.value })}
                >
                  <option value="">{t("appForm.selectWindow")}</option>
                  {campusWindows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({t("appForm.closes")} {w.close_date})
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label={t("appForm.gradeLevel")} required id="grade-level">
              <Select
                id="grade-level"
                value={form.gradeLevelId}
                onChange={(e) => {
                  const gl = campusGrades.find((g) => g.id === e.target.value);
                  update({ gradeLevelId: e.target.value, gradeLevel: gl?.grade ?? "" });
                }}
              >
                <option value="">{t("appForm.selectGrade")}</option>
                {campusGrades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {GRADE_LABELS[g.grade] ?? `${t("apps.grade")} ${g.grade}`}
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
                {t("appForm.siblingLabel")}
                <span className="block text-xs text-stone-text mt-0.5">
                  {t("appForm.siblingNote")}
                </span>
              </label>
            </div>

            {/* Policy-driven lottery questions. Rendered only where the
                selected campus's board has ADOPTED a policy declaring the
                matching weighted tier, so they appear and disappear with the
                campus choice above. */}
            {showPolicyQuestions && (
              <div className="space-y-4 border-t border-stone/20 pt-4">
                {questionFlags.is_staff_child && (
                  <YesNoQuestion
                    name="is-staff-child"
                    label={t("appForm.staffChildLabel")}
                    note={t("appForm.staffChildNote")}
                    value={form.isStaffChild}
                    onChange={(v) => update({ isStaffChild: v })}
                  />
                )}
                {questionFlags.is_frl_qualifying && (
                  <YesNoQuestion
                    name="is-frl-qualifying"
                    label={t("appForm.frlLabel")}
                    note={t("appForm.frlNote")}
                    value={form.isFrlQualifying}
                    onChange={(v) => update({ isFrlQualifying: v })}
                  />
                )}
              </div>
            )}

            <Link
              href="/how-the-lottery-works"
              target="_blank"
              className="text-xs text-rooted-green hover:underline inline-block"
            >
              {t("lottery.inlineLink")}
            </Link>
          </CardContent>
        </Card>
      )}

      {/* ───── Step 2: Student & Guardian ───── */}
      {currentStep.id === "student" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("appForm.studentInfoTitle")}</CardTitle>
            <CardDescription>
              {t("appForm.studentInfoDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {showValidation && !canProceedStep.student && (
              <div role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3 mb-4">
                {t("appForm.fillRequired")}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("appForm.firstName")} required id="student-first-name">
                <Input
                  id="student-first-name"
                  value={form.firstName}
                  onChange={(e) => update({ firstName: e.target.value })}
                  placeholder={t("appForm.firstPlaceholder")}
                />
              </Field>
              <Field label={t("appForm.lastName")} required id="student-last-name">
                <Input
                  id="student-last-name"
                  value={form.lastName}
                  onChange={(e) => update({ lastName: e.target.value })}
                  placeholder={t("appForm.lastPlaceholder")}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("appForm.dob")}>
                <Input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => update({ dateOfBirth: e.target.value })}
                />
              </Field>
              <Field label={t("appForm.gender")}>
                <Select
                  value={form.gender}
                  onChange={(e) => update({ gender: e.target.value })}
                >
                  <option value="">{t("common.select")}</option>
                  <option value="male">{t("appForm.gender.male")}</option>
                  <option value="female">{t("appForm.gender.female")}</option>
                  <option value="non_binary">{t("appForm.gender.non_binary")}</option>
                  <option value="prefer_not">{t("appForm.gender.prefer_not")}</option>
                </Select>
              </Field>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep.id === "student" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("appForm.guardianTitle")}</CardTitle>
            <CardDescription>
              {t("appForm.guardianDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {existingGuardian && (
              <div className="bg-rooted-green/5 border border-rooted-green/20 rounded-md px-3 py-2 text-sm text-ink/70">
                {t("appForm.prefillBanner")}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("appForm.firstName")} required id="guardian-first-name">
                <Input
                  id="guardian-first-name"
                  value={form.guardianFirstName}
                  onChange={(e) => update({ guardianFirstName: e.target.value })}
                  placeholder={t("appForm.firstPlaceholder")}
                />
              </Field>
              <Field label={t("appForm.lastName")} required id="guardian-last-name">
                <Input
                  id="guardian-last-name"
                  value={form.guardianLastName}
                  onChange={(e) => update({ guardianLastName: e.target.value })}
                  placeholder={t("appForm.lastPlaceholder")}
                />
              </Field>
            </div>
            <Field label={t("appForm.relationship")} required id="guardian-relationship">
              <Select
                id="guardian-relationship"
                value={form.guardianRelationship}
                onChange={(e) => update({ guardianRelationship: e.target.value, guardianRelationshipOther: "" })}
              >
                <option value="">{t("common.select")}</option>
                <option value="mother">{t("appForm.rel.mother")}</option>
                <option value="father">{t("appForm.rel.father")}</option>
                <option value="stepmother">{t("appForm.rel.stepmother")}</option>
                <option value="stepfather">{t("appForm.rel.stepfather")}</option>
                <option value="grandparent">{t("appForm.rel.grandparent")}</option>
                <option value="aunt_uncle">{t("appForm.rel.aunt_uncle")}</option>
                <option value="foster_parent">{t("appForm.rel.foster_parent")}</option>
                <option value="legal_guardian">{t("appForm.rel.legal_guardian")}</option>
                <option value="other">{t("appForm.rel.other")}</option>
              </Select>
              {/* Item 17: prompt for detail when "Other" is selected */}
              {form.guardianRelationship === "other" && (
                <Input
                  className="mt-2"
                  value={form.guardianRelationshipOther}
                  onChange={(e) => update({ guardianRelationshipOther: e.target.value })}
                  placeholder={t("appForm.relOtherPlaceholder")}
                  maxLength={100}
                />
              )}
            </Field>
            <Field label={t("appForm.email")} required id="guardian-email">
              <Input
                id="guardian-email"
                type="email"
                value={form.guardianEmail}
                onChange={(e) => update({ guardianEmail: e.target.value })}
                placeholder={t("appForm.emailPlaceholder")}
              />
            </Field>
            <Field label={t("appForm.phone")} required id="guardian-phone">
              <Input
                id="guardian-phone"
                type="tel"
                value={form.guardianPhone}
                onChange={(e) => update({ guardianPhone: e.target.value })}
                placeholder="(555) 555-0100"
              />
            </Field>
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="sms-consent"
                checked={form.smsConsent}
                onChange={(e) => update({ smsConsent: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-stone/40 text-rooted-green focus:ring-rooted-green"
              />
              <label htmlFor="sms-consent" className="text-sm text-ink/80">
                {t("appForm.smsConsent")}
                <span className="block text-xs text-stone-text mt-0.5">
                  {t("appForm.smsConsentHint")}
                </span>
              </label>
            </div>
            <p className="text-xs text-stone-text">
              {t("appForm.regNote")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ───── Step 3: Review & Submit ───── */}
      {currentStep.id === "review" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("appForm.step.review")}</CardTitle>
            <CardDescription>
              {t("appForm.reviewDesc")}
            </CardDescription>
            <Link
              href="/how-the-lottery-works"
              target="_blank"
              className="text-xs text-rooted-green hover:underline inline-block"
            >
              {t("lottery.inlineLink")}
            </Link>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-4">
              <ReviewSection title={t("appForm.step.campus")}>
                <ReviewRow label={t("appForm.campus")} value={campuses.find((c) => c.id === form.campusId)?.name || "—"} />
                <ReviewRow label={t("apps.grade")} value={form.gradeLevel ? GRADE_LABELS[form.gradeLevel] || `${t("apps.grade")} ${form.gradeLevel}` : "—"} />
                <ReviewRow label={t("appForm.review.siblingAtCampus")} value={form.hasSibling ? t("common.yes") : t("common.no")} />
                {questionFlags.is_staff_child && (
                  <ReviewRow
                    label={t("appForm.review.staffChild")}
                    value={form.isStaffChild === "yes" ? t("common.yes") : t("common.no")}
                  />
                )}
                {questionFlags.is_frl_qualifying && (
                  <ReviewRow
                    label={t("appForm.review.frl")}
                    value={form.isFrlQualifying === "yes" ? t("common.yes") : t("common.no")}
                  />
                )}
              </ReviewSection>
              <ReviewSection title={t("offers.student")}>
                <ReviewRow label={t("appForm.review.name")} value={[form.firstName, form.lastName].filter(Boolean).join(" ") || "—"} />
                <ReviewRow label={t("appForm.dob")} value={form.dateOfBirth || "—"} />
                {form.gender && <ReviewRow label={t("appForm.gender")} value={t(`appForm.gender.${form.gender}` as TranslationKey)} />}
              </ReviewSection>
              <ReviewSection title={t("appForm.guardianTitle")}>
                <ReviewRow label={t("appForm.review.name")} value={[form.guardianFirstName, form.guardianLastName].filter(Boolean).join(" ") || "—"} />
                <ReviewRow label={t("appForm.review.relationship")} value={form.guardianRelationship ? t(`appForm.rel.${form.guardianRelationship}` as TranslationKey) : "—"} />
                <ReviewRow label={t("appForm.review.email")} value={form.guardianEmail || "—"} />
                <ReviewRow label={t("appForm.review.phone")} value={form.guardianPhone || "—"} />
              </ReviewSection>
            </div>

            <hr className="border-stone/20" />

            <p className="text-sm text-stone-text mb-3">{t("appForm.readSign")}</p>
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
                  {t("appForm.consentPre")}{" "}
                  <span className="font-bold">Rooted Schools</span> {t("appForm.consentPost")}
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
                  {t("appForm.certify")}
                </label>
              </div>
            </div>

            <hr className="border-stone/20" />
            <p className="text-sm font-medium text-ink/70">{t("appForm.eSignature")}</p>
            <Field label={t("appForm.typeFullName")} required>
              <Input
                value={form.signatureName}
                onChange={(e) => update({ signatureName: e.target.value })}
                placeholder={t("appForm.fullNamePlaceholder")}
              />
            </Field>
            <p className="text-xs text-stone-text">
              {t("appForm.eSignNote")}{" "}
              {new Date().toLocaleDateString(locale === "es" ? "es-US" : "en-US")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ───── Navigation ───── */}
      <div className="flex items-center justify-between pt-2">
        <div>
          {stepIndex > 0 && (
            <Button variant="outline" onClick={back} disabled={isPending}>
              {t("common.back")}
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
                {isPending ? t("reg.btn.saving") : t("appForm.saveDraft")}
              </Button>
              <Button onClick={next}>
                {t("common.continue")}
              </Button>
            </>
          )}
          {stepIndex === STEPS.length - 1 && (
            <Button
              onClick={handleSubmit}
              disabled={!canProceedStep.review || isPending}
            >
              {isPending ? t("reg.submitting") : t("appForm.submit")}
            </Button>
          )}
        </div>
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
      <p className="text-xs font-semibold text-stone-text uppercase tracking-wider mb-2">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-stone-text w-32 shrink-0">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}
