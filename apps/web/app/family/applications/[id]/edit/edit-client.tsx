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
  { id: "student", label: "Student Info" },
  { id: "guardian", label: "Guardian & Household" },
  { id: "preferences", label: "Preferences & Services" },
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
  middleName: string;
  lastName: string;
  suffix: string;
  dateOfBirth: string;
  gender: string;
  raceEthnicity: string[];
  primaryLanguage: string;
  homeLanguage: string;
  previousSchool: string;
  previousSchoolPhone: string;
  guardianFirstName: string;
  guardianLastName: string;
  guardianRelationship: string;
  guardianEmail: string;
  guardianPhone: string;
  guardianPhoneSecondary: string;
  guardianEmployer: string;
  guardianSmsConsent: boolean;
  address: string;
  city: string;
  state: string;
  zip: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  incomeBracket: string;
  householdMembersCount: string;
  frlEligible: string;
  mckinneyVento: string;
  militaryConnected: string;
  fosterCare: string;
  hasSiblingEnrolled: string;
  siblingName: string;
  transportationNeeds: string;
  beforeAfterCare: string;
  hasIEP: string;
  has504: string;
  isELL: string;
  isGiftedTalented: string;
  specialServicesNotes: string;
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
    middleName: d.student.middle_name ?? "",
    lastName: d.student.last_name,
    suffix: d.student.suffix ?? "",
    dateOfBirth: d.student.date_of_birth ?? "",
    gender: d.student.gender ?? "",
    raceEthnicity: d.student.race_ethnicity ?? [],
    primaryLanguage: d.student.primary_language ?? "",
    homeLanguage: d.student.home_language ?? "",
    previousSchool: d.student.previous_school_name ?? "",
    previousSchoolPhone: d.student.previous_school_phone ?? "",
    guardianFirstName: d.guardian.first_name,
    guardianLastName: d.guardian.last_name,
    guardianRelationship: d.guardian.relationship,
    guardianEmail: d.guardian.email ?? "",
    guardianPhone: d.guardian.phone ?? "",
    guardianPhoneSecondary: d.guardian.phone_secondary ?? "",
    guardianEmployer: d.guardian.employer ?? "",
    guardianSmsConsent: d.guardian.sms_consent,
    address: d.household.address_line1 ?? "",
    city: d.household.city ?? "",
    state: d.household.state ?? "",
    zip: d.household.zip ?? "",
    emergencyContactName: d.student.emergency_contact_1_name ?? "",
    emergencyContactPhone: d.student.emergency_contact_1_phone ?? "",
    emergencyContactRelationship: d.student.emergency_contact_1_relationship ?? "",
    incomeBracket: d.answers.income_bracket ?? "",
    householdMembersCount: d.answers.household_members_count ?? "",
    frlEligible: d.answers.frl_eligible ?? "",
    mckinneyVento: d.answers.mckinney_vento ?? "",
    militaryConnected: d.answers.military_connected ?? "",
    fosterCare: d.answers.foster_care ?? "",
    hasSiblingEnrolled: d.has_sibling_enrolled ? "yes" : "",
    siblingName: d.answers.sibling_name ?? "",
    transportationNeeds: d.answers.transportation_needs ?? "",
    beforeAfterCare: d.answers.before_after_care ?? "",
    hasIEP: d.student.has_iep ? "yes" : "",
    has504: d.student.has_504 ? "yes" : "",
    isELL: d.answers.ell ?? "",
    isGiftedTalented: d.answers.gifted_talented ?? "",
    specialServicesNotes: d.student.special_services_notes ?? "",
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
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-xs hidden sm:inline ${isCurrent ? "font-semibold text-ink" : "text-stone"}`}>
                {step.label}
              </span>
              {i < steps.length - 1 && (
                <div className={`w-6 h-px ${isComplete ? "bg-rooted-green" : "bg-rooted-gray-dark/30"}`} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ───────────── helpers to build mutation input ───────────── */

function buildUpdateInput(applicationId: string, form: FormData) {
  const answers: Record<string, string | boolean> = {};
  if (form.incomeBracket) answers.income_bracket = form.incomeBracket;
  if (form.householdMembersCount) answers.household_members_count = form.householdMembersCount;
  if (form.frlEligible) answers.frl_eligible = form.frlEligible;
  if (form.mckinneyVento) answers.mckinney_vento = form.mckinneyVento;
  if (form.militaryConnected) answers.military_connected = form.militaryConnected;
  if (form.fosterCare) answers.foster_care = form.fosterCare;
  if (form.transportationNeeds) answers.transportation_needs = form.transportationNeeds;
  if (form.beforeAfterCare) answers.before_after_care = form.beforeAfterCare;
  if (form.isELL) answers.ell = form.isELL;
  if (form.isGiftedTalented) answers.gifted_talented = form.isGiftedTalented;
  if (form.dataSharingConsent) answers.data_sharing_consent = true;
  if (form.signatureName) answers.e_signature_name = form.signatureName;
  answers.e_signature_date = new Date().toISOString().split("T")[0];

  return {
    application_id: applicationId,
    student_first_name: form.firstName,
    student_middle_name: form.middleName || undefined,
    student_last_name: form.lastName,
    student_suffix: form.suffix || undefined,
    student_date_of_birth: form.dateOfBirth || undefined,
    student_gender: form.gender || undefined,
    student_race_ethnicity: form.raceEthnicity.length > 0 ? form.raceEthnicity : undefined,
    student_primary_language: form.primaryLanguage || undefined,
    student_home_language: form.homeLanguage || undefined,
    student_previous_school: form.previousSchool || undefined,
    student_previous_school_phone: form.previousSchoolPhone || undefined,
    student_has_iep: form.hasIEP === "yes",
    student_has_504: form.has504 === "yes",
    student_special_services_notes: form.specialServicesNotes || undefined,
    guardian_first_name: form.guardianFirstName,
    guardian_last_name: form.guardianLastName,
    guardian_relationship: form.guardianRelationship || undefined,
    guardian_email: form.guardianEmail,
    guardian_phone: form.guardianPhone,
    guardian_phone_secondary: form.guardianPhoneSecondary || undefined,
    guardian_employer: form.guardianEmployer || undefined,
    guardian_sms_consent: form.guardianSmsConsent,
    address_line1: form.address || undefined,
    city: form.city || undefined,
    state: form.state || undefined,
    zip: form.zip || undefined,
    emergency_contact_1_name: form.emergencyContactName || undefined,
    emergency_contact_1_phone: form.emergencyContactPhone || undefined,
    emergency_contact_1_relationship: form.emergencyContactRelationship || undefined,
    has_sibling_enrolled: form.hasSiblingEnrolled === "yes",
    sibling_name: form.siblingName || undefined,
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

  const campusWindows = windows.filter(
    (w) => w.campus_id === form.campusId && w.is_open
  );

  const campusGrades = gradeLevels.filter(
    (g) => g.campus_id === form.campusId
  );

  const studentName = [form.firstName, form.lastName].filter(Boolean).join(" ") || "Untitled";

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
    startTransition(async () => {
      const input = buildUpdateInput(draft.id, form);
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
      const input = buildUpdateInput(draft.id, form);
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
    student: !!form.firstName && !!form.lastName && !!form.dateOfBirth,
    guardian: !!form.guardianFirstName && !!form.guardianLastName && !!form.guardianEmail && !!form.guardianPhone,
    preferences: true,
    review: form.agreeTerms && form.dataSharingConsent && !!form.signatureName,
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href={`/family/applications/${draft.id}`} className="text-sm text-rooted-green hover:underline">
          &larr; Back to Application
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold text-ink">Edit Application — {studentName}</h1>
          <Badge variant="secondary">Draft</Badge>
        </div>
        <p className="text-sm text-stone mt-1">Continue filling out the application. Save your progress at any time.</p>
      </div>

      {feedback && (
        <div className={`px-4 py-2 rounded-md text-sm font-medium ${feedback.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {feedback.message}
        </div>
      )}

      <StepIndicator steps={STEPS} currentIndex={stepIndex} />

      {/* ───── Step 1: Campus & Grade ───── */}
      {currentStep.id === "campus" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campus & Grade Level</CardTitle>
            <CardDescription>Select the campus and grade your child will attend.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Campus" required>
              <Select value={form.campusId} onChange={(e) => update({ campusId: e.target.value, gradeLevelId: "", enrollmentWindowId: "" })}>
                <option value="">Select a campus...</option>
                {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            {form.campusId && campusWindows.length === 0 && (
              <p className="text-sm text-amber-600">No enrollment windows are currently open for this campus.</p>
            )}
            {campusWindows.length > 1 && (
              <Field label="Enrollment Window" required>
                <Select value={form.enrollmentWindowId} onChange={(e) => update({ enrollmentWindowId: e.target.value })}>
                  <option value="">Select window...</option>
                  {campusWindows.map((w) => <option key={w.id} value={w.id}>{w.name} (closes {w.close_date})</option>)}
                </Select>
              </Field>
            )}
            <Field label="Grade Level" required>
              <Select value={form.gradeLevelId} onChange={(e) => { const gl = campusGrades.find((g) => g.id === e.target.value); update({ gradeLevelId: e.target.value, gradeLevel: gl?.grade ?? "" }); }}>
                <option value="">Select grade...</option>
                {campusGrades.map((g) => <option key={g.id} value={g.id}>{GRADE_LABELS[g.grade] ?? `Grade ${g.grade}`}</option>)}
                {form.campusId && campusGrades.length === 0 && Object.entries(GRADE_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
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
            <CardDescription>Enter your child&apos;s legal name and personal details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Field label="First Name" required><Input value={form.firstName} onChange={(e) => update({ firstName: e.target.value })} placeholder="First" /></Field>
              <Field label="Middle Name"><Input value={form.middleName} onChange={(e) => update({ middleName: e.target.value })} placeholder="Middle" /></Field>
              <Field label="Last Name" required><Input value={form.lastName} onChange={(e) => update({ lastName: e.target.value })} placeholder="Last" /></Field>
              <Field label="Suffix">
                <Select value={form.suffix} onChange={(e) => update({ suffix: e.target.value })}>
                  <option value="">None</option>
                  <option value="Jr.">Jr.</option><option value="Sr.">Sr.</option>
                  <option value="II">II</option><option value="III">III</option><option value="IV">IV</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Date of Birth" required><Input type="date" value={form.dateOfBirth} onChange={(e) => update({ dateOfBirth: e.target.value })} /></Field>
              <Field label="Gender">
                <Select value={form.gender} onChange={(e) => update({ gender: e.target.value })}>
                  <option value="">Select...</option><option value="male">Male</option><option value="female">Female</option>
                  <option value="non_binary">Non-binary</option><option value="prefer_not">Prefer not to say</option>
                </Select>
              </Field>
            </div>
            <Field label="Race / Ethnicity (select all that apply)">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                {[
                  { value: "american_indian", label: "American Indian or Alaska Native" },
                  { value: "asian", label: "Asian" },
                  { value: "black", label: "Black or African American" },
                  { value: "hispanic", label: "Hispanic or Latino" },
                  { value: "pacific_islander", label: "Native Hawaiian or Pacific Islander" },
                  { value: "white", label: "White" },
                  { value: "two_or_more", label: "Two or More Races" },
                  { value: "prefer_not", label: "Prefer not to say" },
                ].map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm text-ink/70">
                    <input
                      type="checkbox"
                      checked={form.raceEthnicity.includes(opt.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          update({ raceEthnicity: [...form.raceEthnicity, opt.value] });
                        } else {
                          update({ raceEthnicity: form.raceEthnicity.filter((v) => v !== opt.value) });
                        }
                      }}
                      className="h-4 w-4 rounded border-stone/30 text-rooted-green focus:ring-rooted-green"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Primary Language">
                <Select value={form.primaryLanguage} onChange={(e) => update({ primaryLanguage: e.target.value })}>
                  <option value="">Select...</option><option value="english">English</option><option value="spanish">Spanish</option>
                  <option value="mandarin">Mandarin</option><option value="arabic">Arabic</option><option value="vietnamese">Vietnamese</option><option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Home Language">
                <Select value={form.homeLanguage} onChange={(e) => update({ homeLanguage: e.target.value })}>
                  <option value="">Same as primary</option><option value="english">English</option><option value="spanish">Spanish</option>
                  <option value="mandarin">Mandarin</option><option value="arabic">Arabic</option><option value="vietnamese">Vietnamese</option><option value="other">Other</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Previous School"><Input value={form.previousSchool} onChange={(e) => update({ previousSchool: e.target.value })} placeholder="Name of previous school" /></Field>
              <Field label="Previous School Phone"><Input type="tel" value={form.previousSchoolPhone} onChange={(e) => update({ previousSchoolPhone: e.target.value })} placeholder="(555) 555-0100" /></Field>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ───── Step 3: Guardian & Household ───── */}
      {currentStep.id === "guardian" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parent / Guardian & Household</CardTitle>
            <CardDescription>Primary contact, address, and household information.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="First Name" required><Input value={form.guardianFirstName} onChange={(e) => update({ guardianFirstName: e.target.value })} placeholder="First" /></Field>
              <Field label="Last Name" required><Input value={form.guardianLastName} onChange={(e) => update({ guardianLastName: e.target.value })} placeholder="Last" /></Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Relationship" required>
                <Select value={form.guardianRelationship} onChange={(e) => update({ guardianRelationship: e.target.value })}>
                  <option value="">Select...</option><option value="parent">Parent</option><option value="step_parent">Step-Parent</option>
                  <option value="grandparent">Grandparent</option><option value="foster_parent">Foster Parent</option>
                  <option value="legal_guardian">Legal Guardian</option><option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Email" required><Input type="email" value={form.guardianEmail} onChange={(e) => update({ guardianEmail: e.target.value })} placeholder="email@example.com" /></Field>
              <Field label="Phone" required><Input type="tel" value={form.guardianPhone} onChange={(e) => update({ guardianPhone: e.target.value })} placeholder="(555) 555-0100" /></Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Alternate Phone"><Input type="tel" value={form.guardianPhoneSecondary} onChange={(e) => update({ guardianPhoneSecondary: e.target.value })} placeholder="(555) 555-0100" /></Field>
              <Field label="Employer (optional)"><Input value={form.guardianEmployer} onChange={(e) => update({ guardianEmployer: e.target.value })} placeholder="Employer name" /></Field>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="sms-consent-edit" checked={form.guardianSmsConsent} onChange={(e) => update({ guardianSmsConsent: e.target.checked })} className="h-4 w-4 rounded border-stone/30 text-rooted-green focus:ring-rooted-green" />
              <label htmlFor="sms-consent-edit" className="text-sm text-ink/60">I consent to receive SMS/text messages about my child&apos;s enrollment</label>
            </div>
            <hr className="my-2 border-stone/20" />
            <Field label="Street Address" required><Input value={form.address} onChange={(e) => update({ address: e.target.value })} placeholder="1234 Main St" /></Field>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="col-span-2"><Field label="City" required><Input value={form.city} onChange={(e) => update({ city: e.target.value })} placeholder="City" /></Field></div>
              <Field label="State" required><Input value={form.state} onChange={(e) => update({ state: e.target.value })} placeholder="WA" maxLength={2} /></Field>
              <Field label="ZIP" required><Input value={form.zip} onChange={(e) => update({ zip: e.target.value })} placeholder="98660" maxLength={10} /></Field>
            </div>
            <hr className="my-2 border-stone/20" />
            <p className="text-sm font-medium text-ink/70">Emergency Contact</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Contact Name"><Input value={form.emergencyContactName} onChange={(e) => update({ emergencyContactName: e.target.value })} placeholder="Full name" /></Field>
              <Field label="Phone"><Input type="tel" value={form.emergencyContactPhone} onChange={(e) => update({ emergencyContactPhone: e.target.value })} placeholder="(555) 555-0100" /></Field>
              <Field label="Relationship">
                <Select value={form.emergencyContactRelationship} onChange={(e) => update({ emergencyContactRelationship: e.target.value })}>
                  <option value="">Select...</option><option value="parent">Parent</option><option value="grandparent">Grandparent</option>
                  <option value="aunt_uncle">Aunt / Uncle</option><option value="family_friend">Family Friend</option><option value="other">Other</option>
                </Select>
              </Field>
            </div>
            <hr className="my-2 border-stone/20" />
            <p className="text-sm font-medium text-ink/70">Household Information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Household Income Bracket">
                <Select value={form.incomeBracket} onChange={(e) => update({ incomeBracket: e.target.value })}>
                  <option value="">Prefer not to say</option><option value="under_25k">Under $25,000</option><option value="25k_50k">$25,000 - $49,999</option>
                  <option value="50k_75k">$50,000 - $74,999</option><option value="75k_100k">$75,000 - $99,999</option><option value="over_100k">$100,000+</option>
                </Select>
              </Field>
              <Field label="Number of Household Members">
                <Select value={form.householdMembersCount} onChange={(e) => update({ householdMembersCount: e.target.value })}>
                  <option value="">Select...</option><option value="2">2</option><option value="3">3</option><option value="4">4</option>
                  <option value="5">5</option><option value="6">6</option><option value="7+">7 or more</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Free/Reduced Lunch Eligible?">
                <Select value={form.frlEligible} onChange={(e) => update({ frlEligible: e.target.value })}>
                  <option value="">Select...</option><option value="yes">Yes</option><option value="no">No</option><option value="unsure">Unsure</option>
                </Select>
              </Field>
              <Field label="McKinney-Vento (Experiencing Homelessness)?">
                <Select value={form.mckinneyVento} onChange={(e) => update({ mckinneyVento: e.target.value })}>
                  <option value="">Select...</option><option value="yes">Yes</option><option value="no">No</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Military Connected Family?">
                <Select value={form.militaryConnected} onChange={(e) => update({ militaryConnected: e.target.value })}>
                  <option value="">Select...</option><option value="yes">Yes</option><option value="no">No</option>
                </Select>
              </Field>
              <Field label="Foster Care Status?">
                <Select value={form.fosterCare} onChange={(e) => update({ fosterCare: e.target.value })}>
                  <option value="">Select...</option><option value="yes">Yes</option><option value="no">No</option>
                </Select>
              </Field>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ───── Step 4: Preferences & Services ───── */}
      {currentStep.id === "preferences" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preferences & Special Services</CardTitle>
            <CardDescription>Tell us about enrollment preferences and any special services your child may need.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm font-medium text-ink/70">Enrollment Preferences</p>
            <Field label="Does your child have a sibling currently enrolled?">
              <Select value={form.hasSiblingEnrolled} onChange={(e) => update({ hasSiblingEnrolled: e.target.value })}>
                <option value="">Select...</option><option value="yes">Yes</option><option value="no">No</option>
              </Select>
            </Field>
            {form.hasSiblingEnrolled === "yes" && (
              <Field label="Sibling Name"><Input value={form.siblingName} onChange={(e) => update({ siblingName: e.target.value })} placeholder="Full name of enrolled sibling" /></Field>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Transportation Needs?">
                <Select value={form.transportationNeeds} onChange={(e) => update({ transportationNeeds: e.target.value })}>
                  <option value="">Select...</option><option value="yes">Yes — will need transportation</option><option value="no">No — will provide own transportation</option>
                </Select>
              </Field>
              <Field label="Interested in Before/After Care?">
                <Select value={form.beforeAfterCare} onChange={(e) => update({ beforeAfterCare: e.target.value })}>
                  <option value="">Select...</option><option value="before">Before school only</option><option value="after">After school only</option>
                  <option value="both">Both before and after</option><option value="no">No</option>
                </Select>
              </Field>
            </div>
            <hr className="my-2 border-stone/20" />
            <p className="text-sm font-medium text-ink/70">Special Services</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="IEP (Individualized Education Program)?">
                <Select value={form.hasIEP} onChange={(e) => update({ hasIEP: e.target.value })}>
                  <option value="">Select...</option><option value="yes">Yes</option><option value="no">No</option>
                </Select>
              </Field>
              <Field label="504 Plan?">
                <Select value={form.has504} onChange={(e) => update({ has504: e.target.value })}>
                  <option value="">Select...</option><option value="yes">Yes</option><option value="no">No</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="English Language Learner (ELL)?">
                <Select value={form.isELL} onChange={(e) => update({ isELL: e.target.value })}>
                  <option value="">Select...</option><option value="yes">Yes</option><option value="no">No</option>
                </Select>
              </Field>
              <Field label="Gifted / Talented?">
                <Select value={form.isGiftedTalented} onChange={(e) => update({ isGiftedTalented: e.target.value })}>
                  <option value="">Select...</option><option value="yes">Yes</option><option value="no">No</option>
                </Select>
              </Field>
            </div>
            {(form.hasIEP === "yes" || form.has504 === "yes" || form.isELL === "yes" || form.isGiftedTalented === "yes") && (
              <Field label="Special Services Notes"><Input value={form.specialServicesNotes} onChange={(e) => update({ specialServicesNotes: e.target.value })} placeholder="Briefly describe services currently received" /></Field>
            )}
          </CardContent>
        </Card>
      )}

      {/* ───── Step 5: Review & Submit ───── */}
      {currentStep.id === "review" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review & Submit</CardTitle>
            <CardDescription>Please review your application details before submitting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-4">
              <ReviewSection title="Campus & Grade">
                <ReviewRow label="Campus" value={campuses.find((c) => c.id === form.campusId)?.name || "—"} />
                <ReviewRow label="Grade" value={form.gradeLevel ? GRADE_LABELS[form.gradeLevel] || `Grade ${form.gradeLevel}` : "—"} />
              </ReviewSection>
              <ReviewSection title="Student">
                <ReviewRow label="Name" value={[form.firstName, form.middleName, form.lastName, form.suffix].filter(Boolean).join(" ") || "—"} />
                <ReviewRow label="Date of Birth" value={form.dateOfBirth || "—"} />
                <ReviewRow label="Gender" value={form.gender || "—"} />
                <ReviewRow label="Language" value={form.primaryLanguage || "—"} />
                <ReviewRow label="Previous School" value={form.previousSchool || "—"} />
              </ReviewSection>
              <ReviewSection title="Parent / Guardian">
                <ReviewRow label="Name" value={[form.guardianFirstName, form.guardianLastName].filter(Boolean).join(" ") || "—"} />
                <ReviewRow label="Relationship" value={form.guardianRelationship || "—"} />
                <ReviewRow label="Email" value={form.guardianEmail || "—"} />
                <ReviewRow label="Phone" value={form.guardianPhone || "—"} />
                <ReviewRow label="Address" value={[form.address, form.city, form.state, form.zip].filter(Boolean).join(", ") || "—"} />
              </ReviewSection>
              <ReviewSection title="Preferences">
                <ReviewRow label="Sibling Enrolled" value={form.hasSiblingEnrolled === "yes" ? `Yes — ${form.siblingName || "—"}` : "No"} />
                <ReviewRow label="Transportation" value={form.transportationNeeds === "yes" ? "Needs transportation" : "Own transportation"} />
              </ReviewSection>
              <ReviewSection title="Special Services">
                <ReviewRow label="IEP" value={form.hasIEP === "yes" ? "Yes" : "No"} />
                <ReviewRow label="504 Plan" value={form.has504 === "yes" ? "Yes" : "No"} />
                <ReviewRow label="ELL" value={form.isELL === "yes" ? "Yes" : "No"} />
                {form.specialServicesNotes && <ReviewRow label="Notes" value={form.specialServicesNotes} />}
              </ReviewSection>
            </div>
            {/* Document checklist notice */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-800 mb-2">📋 Documents you'll need to upload after submitting</p>
              <p className="text-xs text-amber-700 mb-3">
                Submit your application now — you'll upload these from the{" "}
                <Link href="/family/documents" className="font-medium underline">Documents</Link>{" "}
                page after. Required documents must be on file before enrollment is finalized.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {[
                  { name: "Birth Certificate or Proof of Age", required: true },
                  { name: "Proof of Residency", required: true },
                  { name: "Immunization Records", required: true },
                  { name: "Previous School Records", required: false },
                  { name: "IEP / 504 Plan (if applicable)", required: false },
                  { name: "Custody Documentation (if applicable)", required: false },
                  { name: "McKinney-Vento Documentation (if applicable)", required: false },
                  { name: "Income Verification (if applicable)", required: false },
                  { name: "Parent / Guardian Photo ID", required: false },
                ].map((doc) => (
                  <div key={doc.name} className="flex items-center gap-1.5 text-xs py-0.5">
                    <span className={doc.required ? "text-amber-700" : "text-amber-500"}>
                      {doc.required ? "●" : "○"}
                    </span>
                    <span className={doc.required ? "text-amber-800 font-medium" : "text-amber-700"}>
                      {doc.name}
                      {doc.required && <span className="text-red-500 ml-0.5">*</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <hr className="border-stone/20" />
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <input type="checkbox" id="data-sharing-consent-edit" checked={form.dataSharingConsent} onChange={(e) => update({ dataSharingConsent: e.target.checked })} className="mt-1 h-4 w-4 rounded border-stone/30 text-rooted-green focus:ring-rooted-green" />
                <label htmlFor="data-sharing-consent-edit" className="text-sm text-ink/60">I consent to the sharing of my child&apos;s educational records with <span className="font-bold">rooted</span>schools for the purpose of enrollment processing.</label>
              </div>
              <div className="flex items-start gap-2">
                <input type="checkbox" id="agree-terms-edit" checked={form.agreeTerms} onChange={(e) => update({ agreeTerms: e.target.checked })} className="mt-1 h-4 w-4 rounded border-stone/30 text-rooted-green focus:ring-rooted-green" />
                <label htmlFor="agree-terms-edit" className="text-sm text-ink/60">I certify that the information provided in this application is accurate and complete to the best of my knowledge. I understand that providing false information may result in the disqualification of this application.</label>
              </div>
            </div>
            <hr className="border-stone/20" />
            <p className="text-sm font-medium text-ink/70">Electronic Signature</p>
            <Field label="Type your full legal name to sign" required>
              <Input value={form.signatureName} onChange={(e) => update({ signatureName: e.target.value })} placeholder="Full legal name" />
            </Field>
            <p className="text-xs text-stone">By typing your name above, you are electronically signing this application. Date: {new Date().toLocaleDateString("en-US")}</p>
          </CardContent>
        </Card>
      )}

      {/* ───── Navigation ───── */}
      <div className="flex items-center justify-between pt-2">
        <div>
          {stepIndex > 0 && <Button variant="outline" onClick={back} disabled={isPending}>Back</Button>}
        </div>
        <div className="flex gap-2">
          {stepIndex < STEPS.length - 1 && (
            <>
              <Button variant="outline" onClick={handleSaveDraft} disabled={isPending}>
                {isPending ? "Saving..." : "Save Draft"}
              </Button>
              <Button onClick={next} disabled={!canProceedStep[currentStep.id]}>Continue</Button>
            </>
          )}
          {stepIndex === STEPS.length - 1 && (
            <Button onClick={handleSubmit} disabled={!canProceedStep.review || isPending}>
              {isPending ? "Submitting..." : "Submit Application"}
            </Button>
          )}
        </div>
      </div>
      <div className="text-xs text-stone pb-4">Application ID: {draft.id}</div>
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
