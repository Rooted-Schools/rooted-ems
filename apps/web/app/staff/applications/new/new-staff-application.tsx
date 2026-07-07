"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { GRADE_LABELS } from "@/lib/application-helpers";
import type { CampusRow } from "@/lib/queries";
import { staffCreateApplicationAction, staffFastTrackEnrollAction } from "./actions";

/* ─── Types ─── */

interface GradeLevel {
  id: string;
  grade: string;
  campus_id: string;
}

interface EnrollmentWindow {
  id: string;
  name: string;
  campus_id: string;
  school_year_id: string;
  status: string;
}

interface StaffNewApplicationFormProps {
  campuses: CampusRow[];
  gradeLevels: GradeLevel[];
  enrollmentWindows: EnrollmentWindow[];
  staffUserId: string;
  /** Seed values (e.g. converting a recruitment lead via ?lead=). */
  initial?: Partial<FormData>;
}

/* ─── Form State ─── */

interface FormData {
  campusId: string;
  enrollmentWindowId: string;
  gradeLevelId: string;
  // Student
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  raceEthnicity: string[];
  primaryLanguage: string;
  previousSchool: string;
  hasIEP: boolean;
  has504: boolean;
  specialServicesNotes: string;
  // Guardian
  guardianFirstName: string;
  guardianLastName: string;
  guardianRelationship: string;
  guardianEmail: string;
  guardianPhone: string;
  guardianPhoneSecondary: string;
  guardianPreferredLanguage: string;
  guardianSmsConsent: boolean;
  // Household
  address: string;
  city: string;
  state: string;
  zip: string;
  // Emergency
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  // Meta
  hasSiblingEnrolled: boolean;
  siblingName: string;
}

const initialFormData: FormData = {
  campusId: "",
  enrollmentWindowId: "",
  gradeLevelId: "",
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  raceEthnicity: [],
  primaryLanguage: "English",
  previousSchool: "",
  hasIEP: false,
  has504: false,
  specialServicesNotes: "",
  guardianFirstName: "",
  guardianLastName: "",
  guardianRelationship: "parent",
  guardianEmail: "",
  guardianPhone: "",
  guardianPhoneSecondary: "",
  guardianPreferredLanguage: "English",
  guardianSmsConsent: false,
  address: "",
  city: "",
  state: "",
  zip: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelationship: "",
  hasSiblingEnrolled: false,
  siblingName: "",
};

/* ─── Component ─── */

export function StaffNewApplicationForm({
  campuses,
  gradeLevels,
  enrollmentWindows,
  staffUserId,
  initial,
}: StaffNewApplicationFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormData>({ ...initialFormData, ...initial });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Derived data
  const campusGrades = gradeLevels.filter((g) => g.campus_id === form.campusId);
  const campusWindows = enrollmentWindows.filter((w) => w.campus_id === form.campusId);

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    if (key === "campusId") {
      // Reset dependent fields when campus changes
      setForm((prev) => ({
        ...prev,
        campusId: value as string,
        gradeLevelId: "",
        enrollmentWindowId: "",
      }));
    } else {
      setForm((prev) => ({ ...prev, [key]: value }));
    }
  }

  function buildInput() {
    return {
      enrollment_window_id: form.enrollmentWindowId,
      campus_id: form.campusId,
      grade_level_id: form.gradeLevelId,
      student_first_name: form.firstName,
      student_last_name: form.lastName,
      student_date_of_birth: form.dateOfBirth || undefined,
      student_gender: form.gender || undefined,
      student_race_ethnicity: form.raceEthnicity.length > 0 ? form.raceEthnicity : undefined,
      student_primary_language: form.primaryLanguage || undefined,
      student_previous_school: form.previousSchool || undefined,
      student_has_iep: form.hasIEP,
      student_has_504: form.has504,
      student_special_services_notes: form.specialServicesNotes || undefined,
      guardian_first_name: form.guardianFirstName,
      guardian_last_name: form.guardianLastName,
      guardian_relationship: form.guardianRelationship,
      guardian_email: form.guardianEmail,
      guardian_phone: form.guardianPhone,
      guardian_phone_secondary: form.guardianPhoneSecondary || undefined,
      guardian_preferred_language: form.guardianPreferredLanguage || undefined,
      guardian_sms_consent: form.guardianSmsConsent,
      address_line1: form.address || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      zip: form.zip || undefined,
      emergency_contact_1_name: form.emergencyContactName || undefined,
      emergency_contact_1_phone: form.emergencyContactPhone || undefined,
      emergency_contact_1_relationship: form.emergencyContactRelationship || undefined,
      has_sibling_enrolled: form.hasSiblingEnrolled,
      sibling_name: form.siblingName || undefined,
      source: "staff_entry",
      created_by_staff: staffUserId,
    };
  }

  const isValid =
    form.campusId &&
    form.enrollmentWindowId &&
    form.gradeLevelId &&
    form.firstName &&
    form.lastName &&
    form.guardianFirstName &&
    form.guardianLastName &&
    form.guardianPhone;

  async function handleSubmitApplication() {
    if (!isValid) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    const result = await staffCreateApplicationAction(buildInput());

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setSuccess("Application created and submitted.");
      setTimeout(() => router.push(`/staff/applications/${result.data?.id}`), 1000);
    }
  }

  const [showFastTrackConfirm, setShowFastTrackConfirm] = useState(false);

  async function handleFastTrackEnroll() {
    if (!isValid) return;
    if (!showFastTrackConfirm) {
      setShowFastTrackConfirm(true);
      return;
    }
    setShowFastTrackConfirm(false);
    setLoading(true);
    setError(null);
    setSuccess(null);

    const result = await staffFastTrackEnrollAction(buildInput());

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setSuccess(
        `${form.firstName} ${form.lastName} has been enrolled! Application and registration packet created.`
      );
      setTimeout(
        () => router.push(`/staff/applications/${result.data?.application_id}`),
        1500
      );
    }
  }

  const selectedCampus = campuses.find((c) => c.id === form.campusId);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            Create Application
          </h1>
          <p className="text-sm text-stone mt-1">
            Apply on behalf of a family without internet access.
          </p>
        </div>
        <Link href="/staff/applications">
          <Button variant="outline">Cancel</Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Campus & Grade Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campus & Grade</CardTitle>
          <CardDescription>
            Select the campus and grade level for this application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Campus *
              </label>
              <Select
                value={form.campusId}
                onChange={(e) => updateField("campusId", e.target.value)}
              >
                <option value="">Select campus...</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Enrollment Window *
              </label>
              <Select
                value={form.enrollmentWindowId}
                onChange={(e) => updateField("enrollmentWindowId", e.target.value)}
                disabled={!form.campusId}
              >
                <option value="">Select window...</option>
                {campusWindows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.status})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Grade Level *
              </label>
              <Select
                value={form.gradeLevelId}
                onChange={(e) => updateField("gradeLevelId", e.target.value)}
                disabled={!form.campusId}
              >
                <option value="">Select grade...</option>
                {campusGrades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {GRADE_LABELS[g.grade] ?? `Grade ${g.grade}`}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {selectedCampus && (
            <div className="flex items-center gap-2">
              <Badge variant="outline">{selectedCampus.name}</Badge>
              <span className="text-xs text-stone">
                {selectedCampus.region_name}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Student Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Student Information</CardTitle>
          <CardDescription>
            Basic information about the student being enrolled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                First Name *
              </label>
              <Input
                value={form.firstName}
                onChange={(e) => updateField("firstName", e.target.value)}
                placeholder="Student first name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Last Name *
              </label>
              <Input
                value={form.lastName}
                onChange={(e) => updateField("lastName", e.target.value)}
                placeholder="Student last name"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Date of Birth
              </label>
              <Input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => updateField("dateOfBirth", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Gender
              </label>
              <Select
                value={form.gender}
                onChange={(e) => updateField("gender", e.target.value)}
              >
                <option value="">Select...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non_binary">Non-binary</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Primary Language
              </label>
              <Select
                value={form.primaryLanguage}
                onChange={(e) => updateField("primaryLanguage", e.target.value)}
              >
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="Arabic">Arabic</option>
                <option value="Somali">Somali</option>
                <option value="Other">Other</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">
              Previous School
            </label>
            <Input
              value={form.previousSchool}
              onChange={(e) => updateField("previousSchool", e.target.value)}
              placeholder="Name of previous school"
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.hasIEP}
                onChange={(e) => updateField("hasIEP", e.target.checked)}
                className="rounded border-stone/30"
              />
              Has IEP
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.has504}
                onChange={(e) => updateField("has504", e.target.checked)}
                className="rounded border-stone/30"
              />
              Has 504 Plan
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.hasSiblingEnrolled}
                onChange={(e) =>
                  updateField("hasSiblingEnrolled", e.target.checked)
                }
                className="rounded border-stone/30"
              />
              Sibling enrolled
            </label>
          </div>
          {form.hasSiblingEnrolled && (
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Sibling Name
              </label>
              <Input
                value={form.siblingName}
                onChange={(e) => updateField("siblingName", e.target.value)}
                placeholder="Name of enrolled sibling"
              />
            </div>
          )}
          {(form.hasIEP || form.has504) && (
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Special Services Notes
              </label>
              <textarea
                value={form.specialServicesNotes}
                onChange={(e) =>
                  updateField("specialServicesNotes", e.target.value)
                }
                placeholder="Any relevant notes about special services..."
                rows={2}
                className="w-full px-3 py-2 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Guardian & Household */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Parent / Guardian Information
          </CardTitle>
          <CardDescription>
            Contact information for the primary guardian.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Guardian First Name *
              </label>
              <Input
                value={form.guardianFirstName}
                onChange={(e) =>
                  updateField("guardianFirstName", e.target.value)
                }
                placeholder="First name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Guardian Last Name *
              </label>
              <Input
                value={form.guardianLastName}
                onChange={(e) =>
                  updateField("guardianLastName", e.target.value)
                }
                placeholder="Last name"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Relationship
              </label>
              <Select
                value={form.guardianRelationship}
                onChange={(e) =>
                  updateField("guardianRelationship", e.target.value)
                }
              >
                <option value="parent">Parent</option>
                <option value="grandparent">Grandparent</option>
                <option value="legal_guardian">Legal Guardian</option>
                <option value="foster_parent">Foster Parent</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Phone *
              </label>
              <Input
                type="tel"
                value={form.guardianPhone}
                onChange={(e) => updateField("guardianPhone", e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Email
              </label>
              <Input
                type="email"
                value={form.guardianEmail}
                onChange={(e) => updateField("guardianEmail", e.target.value)}
                placeholder="email@example.com"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.guardianSmsConsent}
                onChange={(e) =>
                  updateField("guardianSmsConsent", e.target.checked)
                }
                className="rounded border-stone/30"
              />
              Guardian consents to SMS messages
            </label>
          </div>

          {/* Address */}
          <div className="border-t border-rooted-gray pt-4 mt-4">
            <p className="text-sm font-medium text-ink/70 mb-3">
              Home Address
            </p>
            <div className="space-y-3">
              <Input
                value={form.address}
                onChange={(e) => updateField("address", e.target.value)}
                placeholder="Street address"
              />
              <div className="grid grid-cols-3 gap-3">
                <Input
                  value={form.city}
                  onChange={(e) => updateField("city", e.target.value)}
                  placeholder="City"
                />
                <Input
                  value={form.state}
                  onChange={(e) => updateField("state", e.target.value)}
                  placeholder="State"
                  maxLength={2}
                />
                <Input
                  value={form.zip}
                  onChange={(e) => updateField("zip", e.target.value)}
                  placeholder="ZIP"
                  maxLength={10}
                />
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="border-t border-rooted-gray pt-4 mt-4">
            <p className="text-sm font-medium text-ink/70 mb-3">
              Emergency Contact
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input
                value={form.emergencyContactName}
                onChange={(e) =>
                  updateField("emergencyContactName", e.target.value)
                }
                placeholder="Contact name"
              />
              <Input
                type="tel"
                value={form.emergencyContactPhone}
                onChange={(e) =>
                  updateField("emergencyContactPhone", e.target.value)
                }
                placeholder="Phone number"
              />
              <Input
                value={form.emergencyContactRelationship}
                onChange={(e) =>
                  updateField("emergencyContactRelationship", e.target.value)
                }
                placeholder="Relationship"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Card className="border-2 border-rooted-green/20">
        <CardContent className="py-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleSubmitApplication}
              disabled={!isValid || loading}
              variant="outline"
              className="flex-1"
            >
              {loading ? "Creating..." : "Submit Application"}
            </Button>
            {showFastTrackConfirm ? (
              <Button
                onClick={handleFastTrackEnroll}
                disabled={!isValid || loading}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              >
                {loading ? "Enrolling..." : "Confirm — Bypass Lottery & Enroll"}
              </Button>
            ) : (
              <Button
                onClick={handleFastTrackEnroll}
                disabled={!isValid || loading}
                className="flex-1 bg-rooted-green hover:bg-rooted-green/90 text-white"
              >
                Apply & Enroll Now
              </Button>
            )}
          </div>
          {showFastTrackConfirm && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
              <p className="text-sm text-amber-800 font-medium">
                This will permanently bypass the lottery process and enroll {form.firstName || "this student"} immediately.
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Click &quot;Confirm&quot; to proceed or{" "}
                <button
                  type="button"
                  onClick={() => setShowFastTrackConfirm(false)}
                  className="underline hover:no-underline"
                >
                  cancel
                </button>
                .
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <p className="text-xs text-stone text-center">
              Creates application and enters normal review pipeline.
            </p>
            <p className="text-xs text-stone text-center">
              Skips lottery/offer and enrolls immediately. Use when seats are
              available.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
